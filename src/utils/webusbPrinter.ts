/**
 * webusbPrinter.ts
 *
 * Native WebUSB driver for direct-cable thermal printers (Pantum PD-80BW and
 * other ESC/POS-compatible printers).  Uses the browser's navigator.usb API —
 * zero installs, no OS driver required for raw bulk transfers.
 *
 * Pairing is a one-time user gesture (pairUSBPrinter). After that,
 * autoReconnectUSB() silently re-attaches to the already-authorised device on
 * every app mount without any prompt.
 *
 * All failures resolve silently (return false / null). This module NEVER
 * opens a dialog, alert, or window.print() fallback.
 */

// ── Minimal WebUSB type declarations (lib.dom may not include them) ──────────

interface USBEndpoint {
  endpointNumber: number;
  direction: 'in' | 'out';
  type: 'bulk' | 'interrupt' | 'isochronous';
}

interface USBAlternateInterface {
  alternateSetting: number;
  interfaceClass: number;
  endpoints: USBEndpoint[];
}

interface USBInterface {
  interfaceNumber: number;
  alternates: USBAlternateInterface[];
  claimed: boolean;
}

interface USBConfiguration {
  configurationValue: number;
  interfaces: USBInterface[];
}

interface USBDevice {
  productName?: string;
  manufacturerName?: string;
  opened: boolean;
  configuration: USBConfiguration | null;
  configurations: USBConfiguration[];
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<{ status: string; bytesWritten: number }>;
}

interface USBNavigator {
  getDevices(): Promise<USBDevice[]>;
  requestDevice(options: { filters: Array<Record<string, number>> }): Promise<USBDevice>;
  addEventListener?(type: 'connect' | 'disconnect', listener: (e: { device: USBDevice }) => void): void;
}

function getUSB(): USBNavigator | null {
  const nav = navigator as Navigator & { usb?: USBNavigator };
  return nav.usb ?? null;
}

// ── Module state — one active claimed device per browser session ─────────────

let activeDevice: USBDevice | null = null;
let activeOutEndpoint: number | null = null;

/** True when the browser supports WebUSB at all (Chrome/Edge over HTTPS). */
export function isWebUSBSupported(): boolean {
  return getUSB() !== null;
}

/**
 * Open the device, select a configuration, claim the printer interface and
 * locate its bulk OUT endpoint. Returns true on success.
 */
async function claimDevice(device: USBDevice): Promise<boolean> {
  try {
    if (!device.opened) await device.open();
    if (!device.configuration) {
      await device.selectConfiguration(device.configurations[0]?.configurationValue ?? 1);
    }
    const config = device.configuration;
    if (!config) return false;

    // Prefer the printer class (7); otherwise take the first interface that
    // exposes a bulk OUT endpoint (some printers report vendor-specific class).
    let chosenInterface: number | null = null;
    let chosenEndpoint: number | null = null;

    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        const out = alt.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk');
        if (!out) continue;
        if (alt.interfaceClass === 7 || chosenInterface === null) {
          chosenInterface = iface.interfaceNumber;
          chosenEndpoint = out.endpointNumber;
        }
        if (alt.interfaceClass === 7) break;
      }
    }

    if (chosenInterface === null || chosenEndpoint === null) return false;

    await device.claimInterface(chosenInterface);
    activeDevice = device;
    activeOutEndpoint = chosenEndpoint;
    return true;
  } catch (err) {
    console.warn('[webusb] Failed to claim printer interface:', err);
    return false;
  }
}

/**
 * On app mount: silently re-attach to an already-paired printer without any
 * browser prompt. Safe to call multiple times.
 */
export async function autoReconnectUSB(): Promise<boolean> {
  const usb = getUSB();
  if (!usb) return false;
  if (getUSBConnectionStatus()) return true;

  try {
    const devices = await usb.getDevices();
    for (const device of devices) {
      if (await claimDevice(device)) {
        console.info(`[webusb] Auto-reconnected to ${device.productName ?? 'USB printer'}`);
        return true;
      }
    }
  } catch (err) {
    console.warn('[webusb] autoReconnectUSB failed:', err);
  }
  return false;
}

/**
 * User-gesture pairing: opens the browser's device selector, then claims the
 * chosen printer. Returns the product name on success, null on cancel/failure.
 */
export async function pairUSBPrinter(): Promise<string | null> {
  const usb = getUSB();
  if (!usb) return null;

  try {
    // Empty filters — show every connected USB device so any ESC/POS printer
    // (Pantum, Epson, generic) can be selected.
    const device = await usb.requestDevice({ filters: [] });
    if (await claimDevice(device)) {
      return device.productName ?? 'USB Printer';
    }
    return null;
  } catch {
    // User dismissed the picker or permission denied — silent.
    return null;
  }
}

/** True when a printer is claimed and ready for raw writes. */
export function getUSBConnectionStatus(): boolean {
  return activeDevice !== null && activeDevice.opened && activeOutEndpoint !== null;
}

/** Product name of the active printer, if any. */
export function getUSBPrinterName(): string | null {
  return activeDevice?.productName ?? (activeDevice ? 'USB Printer' : null);
}

/**
 * Send raw ESC/POS bytes to the claimed printer's bulk OUT endpoint.
 * Silent on failure — resolves false, never throws or opens a dialog.
 */
export async function sendRawToUSB(buffer: Uint8Array): Promise<boolean> {
  if (!getUSBConnectionStatus() || !activeDevice || activeOutEndpoint === null) {
    return false;
  }
  try {
    const result = await activeDevice.transferOut(activeOutEndpoint, buffer as BufferSource);
    return result.status === 'ok';
  } catch (err) {
    console.warn('[webusb] transferOut failed:', err);
    // Device likely unplugged — drop the stale handle so status reports false.
    activeDevice = null;
    activeOutEndpoint = null;
    return false;
  }
}

// Keep status accurate when the cable is unplugged.
getUSB()?.addEventListener?.('disconnect', (e) => {
  if (e.device === activeDevice) {
    activeDevice = null;
    activeOutEndpoint = null;
    console.info('[webusb] Printer disconnected');
  }
});
