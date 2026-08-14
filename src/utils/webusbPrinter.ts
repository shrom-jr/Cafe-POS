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
  releaseInterface?(interfaceNumber: number): Promise<void>;
  selectAlternateInterface?(interfaceNumber: number, alternateSetting: number): Promise<void>;
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

interface BulkOutCandidate {
  configurationValue: number;
  interfaceNumber: number;
  alternateSetting: number;
  endpointNumber: number;
  interfaceClass: number;
}

function getBulkOutCandidates(config: USBConfiguration): BulkOutCandidate[] {
  return config.interfaces
    .flatMap((iface) =>
      iface.alternates.flatMap((alt) =>
        alt.endpoints
          .filter((endpoint) => endpoint.direction === 'out' && endpoint.type === 'bulk')
          .map((endpoint) => ({
            configurationValue: config.configurationValue,
            interfaceNumber: iface.interfaceNumber,
            alternateSetting: alt.alternateSetting,
            endpointNumber: endpoint.endpointNumber,
            interfaceClass: alt.interfaceClass,
          })),
      ),
    )
    // USB printer class is 7. Vendor-specific printers are retained as
    // fallbacks because several ESC/POS devices do not advertise class 7.
    .sort((a, b) => {
      const classScore = Number(b.interfaceClass === 7) - Number(a.interfaceClass === 7);
      if (classScore !== 0) return classScore;
      return a.alternateSetting - b.alternateSetting;
    });
}

async function releaseInterfaceQuietly(device: USBDevice, interfaceNumber: number): Promise<void> {
  try {
    await device.releaseInterface?.(interfaceNumber);
  } catch {
    // The browser may already have released it while changing configuration.
  }
}

/**
 * Open the device, scan every configuration and every alternate setting, then
 * claim the first usable interface with a bulk OUT endpoint.
 *
 * Windows printers commonly expose a non-zero interface number or put their
 * printer endpoint behind an alternate setting. Never assume interface 0,
 * configuration 1, or alternate setting 0. A failed candidate is isolated so
 * the next configuration/interface can still be tried.
 */
async function claimDevice(device: USBDevice): Promise<boolean> {
  if (!device.opened) {
    try {
      await device.open();
    } catch {
      return false;
    }
  }

  const configurations = device.configurations ?? [];
  if (configurations.length === 0) return false;

  for (const configuration of configurations) {
    try {
      if (device.configuration?.configurationValue !== configuration.configurationValue) {
        await device.selectConfiguration(configuration.configurationValue);
      }
    } catch {
      // A configuration may be unavailable while Windows is transitioning the
      // device. Continue scanning the remaining configurations.
      continue;
    }

    const selectedConfiguration = device.configuration;
    if (!selectedConfiguration) continue;

    const candidates = getBulkOutCandidates(selectedConfiguration);
    for (const candidate of candidates) {
      const iface = selectedConfiguration.interfaces.find(
        (item) => item.interfaceNumber === candidate.interfaceNumber,
      );
      if (!iface) continue;

      let claimedHere = false;
      try {
        if (!iface.claimed) {
          await device.claimInterface(candidate.interfaceNumber);
          claimedHere = true;
        }

        // The endpoint descriptor belongs to this alternate setting. It is
        // not usable until that setting is selected after claiming the iface.
        if (candidate.alternateSetting !== 0) {
          if (!device.selectAlternateInterface) {
            if (claimedHere) await releaseInterfaceQuietly(device, candidate.interfaceNumber);
            continue;
          }
          await device.selectAlternateInterface(
            candidate.interfaceNumber,
            candidate.alternateSetting,
          );
        }

        activeDevice = device;
        activeOutEndpoint = candidate.endpointNumber;
        return true;
      } catch {
        // claimInterface/selectAlternateInterface can reject for an occupied
        // interface. Do not let that abort discovery of the next candidate.
        if (claimedHere) {
          await releaseInterfaceQuietly(device, candidate.interfaceNumber);
        }
      }
    }
  }

  return false;
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
