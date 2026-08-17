/**
 * webusbPrinter.ts
 *
 * Dual-slot WebUSB driver for direct-cable thermal printers.
 * Manages two independent USB device slots:
 *   'kitchen'   — Pantum PD-80BW for KOT tickets
 *   'reception' — Pantum PD-80BW for BOT tickets, pre-bills and invoices
 *
 * Each slot pairs independently, persists its device identity (vendorId +
 * productId) to localStorage, and auto-reconnects on next app load without
 * any browser prompt.
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
  vendorId: number;
  productId: number;
  productName?: string;
  manufacturerName?: string;
  serialNumber?: string;
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

// ── Printer slot type ─────────────────────────────────────────────────────────

export type PrinterSlot = 'kitchen' | 'reception';

interface SlotState {
  device: USBDevice;
  outEndpoint: number;
}

// ── Module state — one slot map per browser session ───────────────────────────

const slots = new Map<PrinterSlot, SlotState>();

/** localStorage keys that persist paired device identity across page loads. */
const STORAGE_KEYS: Record<PrinterSlot, string> = {
  kitchen:   'printer_kitchen_usb',
  reception: 'printer_reception_usb',
};

// ── Persisted device identity helpers ────────────────────────────────────────

interface DeviceIdentity {
  vendorId: number;
  productId: number;
  /**
   * Stable per-unit identifier. Two same-model printers share vendorId and
   * productId, so the serial number is the only way to tell them apart across
   * page loads. `null` means the unit did not expose one.
   */
  serialNumber: string | null;
}

function saveDeviceIdentity(slot: PrinterSlot, device: USBDevice): void {
  try {
    const identity: DeviceIdentity = {
      vendorId: device.vendorId,
      productId: device.productId,
      serialNumber: device.serialNumber ?? null,
    };
    localStorage.setItem(STORAGE_KEYS[slot], JSON.stringify(identity));
  } catch {
    // localStorage unavailable — ignore
  }
}

function loadDeviceIdentity(slot: PrinterSlot): DeviceIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[slot]);
    if (!raw) return null;
    return JSON.parse(raw) as DeviceIdentity;
  } catch {
    return null;
  }
}

/**
 * Strict identity match. When a serial number was recorded at pairing time,
 * only the device with that exact serial qualifies — a same-model unit with a
 * different (or missing) serial is rejected rather than silently substituted.
 * Identities recorded without a serial fall back to vendor/product matching.
 */
function matchesIdentity(device: USBDevice, identity: DeviceIdentity): boolean {
  if (device.vendorId !== identity.vendorId || device.productId !== identity.productId) {
    return false;
  }
  if (identity.serialNumber) {
    return device.serialNumber === identity.serialNumber;
  }
  return true;
}

/** True when the device is currently claimed by any slot in this session. */
function isDeviceClaimed(device: USBDevice): boolean {
  for (const state of slots.values()) {
    if (state.device === device) return true;
  }
  return false;
}

/**
 * True when a device is reserved for a DIFFERENT slot by its persisted serial
 * identity. Prevents a serial-less reconnect from stealing a unit that
 * verifiably belongs to the other station.
 */
function isReservedForOtherSlot(device: USBDevice, slot: PrinterSlot): boolean {
  if (!device.serialNumber) return false;
  for (const other of Object.keys(STORAGE_KEYS) as PrinterSlot[]) {
    if (other === slot) continue;
    const otherIdentity = loadDeviceIdentity(other);
    if (otherIdentity?.serialNumber && otherIdentity.serialNumber === device.serialNumber) {
      return true;
    }
  }
  return false;
}

// ── Reconnect serialization ──────────────────────────────────────────────────
//
// Kitchen and reception reconnects are often fired together (Promise.all).
// Running them concurrently would let both observe the same unclaimed device
// and race to claim it. A module-level promise chain makes every reconnect
// atomic: each one sees the slot assignments left by the previous one.

let reconnectChain: Promise<unknown> = Promise.resolve();

function withReconnectLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = reconnectChain.then(fn, fn);
  reconnectChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// ── True when the browser supports WebUSB at all (Chrome/Edge over HTTPS) ─────

export function isWebUSBSupported(): boolean {
  return getUSB() !== null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

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
          .filter((ep) => ep.direction === 'out' && ep.type === 'bulk')
          .map((ep) => ({
            configurationValue: config.configurationValue,
            interfaceNumber: iface.interfaceNumber,
            alternateSetting: alt.alternateSetting,
            endpointNumber: ep.endpointNumber,
            interfaceClass: alt.interfaceClass,
          })),
      ),
    )
    // USB printer class is 7. Vendor-specific printers are retained as fallbacks.
    .sort((a, b) => {
      const classScore = Number(b.interfaceClass === 7) - Number(a.interfaceClass === 7);
      return classScore !== 0 ? classScore : a.alternateSetting - b.alternateSetting;
    });
}

async function releaseInterfaceQuietly(device: USBDevice, interfaceNumber: number): Promise<void> {
  try {
    await device.releaseInterface?.(interfaceNumber);
  } catch {
    // May already be released during configuration transitions.
  }
}

/**
 * Open the device, scan every configuration and alternate setting, then
 * claim the first usable interface with a bulk OUT endpoint.
 * Returns the endpoint number on success, null on failure.
 */
async function claimDevice(device: USBDevice): Promise<number | null> {
  if (!device.opened) {
    try {
      await device.open();
    } catch {
      return null;
    }
  }

  const configurations = device.configurations ?? [];
  if (configurations.length === 0) return null;

  for (const configuration of configurations) {
    try {
      if (device.configuration?.configurationValue !== configuration.configurationValue) {
        await device.selectConfiguration(configuration.configurationValue);
      }
    } catch {
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

        return candidate.endpointNumber;
      } catch {
        if (claimedHere) {
          await releaseInterfaceQuietly(device, candidate.interfaceNumber);
        }
      }
    }
  }

  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** True when a printer is claimed and ready for raw writes on the given slot. */
export function getUSBConnectionStatus(slot: PrinterSlot): boolean {
  const s = slots.get(slot);
  return s !== undefined && s.device.opened;
}

/** Product name of the printer on the given slot, if any. */
export function getUSBPrinterName(slot: PrinterSlot): string | null {
  const s = slots.get(slot);
  if (!s) return null;
  return s.device.productName ?? 'USB Printer';
}

/**
 * On app mount: silently re-attach to a previously paired printer for the
 * given slot, using the persisted vendorId + productId to filter candidates.
 * Safe to call multiple times; returns immediately if already connected.
 */
export function autoReconnectUSB(slot: PrinterSlot): Promise<boolean> {
  // Serialized: concurrent kitchen/reception reconnects run one at a time so
  // they can never race to claim the same physical device.
  return withReconnectLock(async () => {
    const usb = getUSB();
    if (!usb) return false;
    if (getUSBConnectionStatus(slot)) return true;

    const identity = loadDeviceIdentity(slot);
    if (!identity) return false; // never paired on this slot — nothing to reattach

    try {
      const devices = await usb.getDevices();
      for (const device of devices) {
        if (!matchesIdentity(device, identity)) continue;
        // Never claim a device already held by another slot in this session,
        // or one whose serial number is persisted for the other station.
        if (isDeviceClaimed(device)) continue;
        if (isReservedForOtherSlot(device, slot)) continue;

        const endpointNumber = await claimDevice(device);
        if (endpointNumber !== null) {
          slots.set(slot, { device, outEndpoint: endpointNumber });
          saveDeviceIdentity(slot, device);
          console.info(`[webusb:${slot}] Auto-reconnected to ${device.productName ?? 'USB printer'}`);
          return true;
        }
      }
    } catch (err) {
      console.warn(`[webusb:${slot}] autoReconnectUSB failed:`, err);
    }
    return false;
  });
}

/**
 * User-gesture pairing: opens the browser's device selector, claims the
 * chosen printer, and assigns it to the given slot. Returns the product name
 * on success, null on cancel / failure.
 */
export async function pairUSBPrinter(slot: PrinterSlot): Promise<string | null> {
  const usb = getUSB();
  if (!usb) return null;

  try {
    const device = await usb.requestDevice({ filters: [] });

    // An explicit pairing gesture wins: if the chosen device is currently held
    // by — or persistently reserved for — the other station, fully displace it
    // there (in-memory slot AND stored identity). Leaving the old identity
    // behind would make BOTH slots claim the same serial, deadlocking every
    // future reconnect ("reserved for the other slot" on both sides).
    for (const otherSlot of Object.keys(STORAGE_KEYS) as PrinterSlot[]) {
      if (otherSlot === slot) continue;

      const otherState = slots.get(otherSlot);
      if (otherState && otherState.device === device) {
        slots.delete(otherSlot);
        console.info(`[webusb:${otherSlot}] Released — device re-paired to ${slot}`);
      }

      const otherIdentity = loadDeviceIdentity(otherSlot);
      if (otherIdentity && matchesIdentity(device, otherIdentity)) {
        try {
          localStorage.removeItem(STORAGE_KEYS[otherSlot]);
        } catch {
          // localStorage unavailable — ignore
        }
        console.info(`[webusb:${otherSlot}] Stored identity cleared — device re-paired to ${slot}`);
      }
    }

    const endpointNumber = await claimDevice(device);
    if (endpointNumber !== null) {
      slots.set(slot, { device, outEndpoint: endpointNumber });
      saveDeviceIdentity(slot, device);
      const name = device.productName ?? 'USB Printer';
      console.info(`[webusb:${slot}] Paired with ${name}`);
      return name;
    }
    return null;
  } catch {
    // User dismissed the picker or permission denied — silent.
    return null;
  }
}

/**
 * Send raw ESC/POS bytes to the claimed printer on the given slot.
 * Silent on failure — resolves false, never throws or opens a dialog.
 */
export async function sendRawToUSB(buffer: Uint8Array, slot: PrinterSlot): Promise<boolean> {
  const s = slots.get(slot);
  if (!s || !s.device.opened) {
    console.warn(`[webusb:${slot}] No device connected — job skipped silently.`);
    return false;
  }
  try {
    const result = await s.device.transferOut(s.outEndpoint, buffer as BufferSource);
    return result.status === 'ok';
  } catch (err) {
    console.warn(`[webusb:${slot}] transferOut failed:`, err);
    // Device likely unplugged — drop the stale handle so status reports false.
    slots.delete(slot);
    return false;
  }
}

// Keep slot status accurate when a cable is unplugged.
getUSB()?.addEventListener?.('disconnect', (e) => {
  for (const [slot, state] of slots.entries()) {
    if (state.device === e.device) {
      slots.delete(slot);
      console.info(`[webusb:${slot}] Printer disconnected`);
    }
  }
});
