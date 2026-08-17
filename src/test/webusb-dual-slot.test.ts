/**
 * Dual-slot WebUSB regression tests.
 *
 * Covers the failure modes specific to running TWO identical Pantum PD-80BW
 * printers (same vendorId/productId) on one hub device:
 *   1. Slot-preserving reconnect via serialNumber — kitchen and reception must
 *      each re-attach to the exact physical unit they were paired with.
 *   2. Concurrent reconnects must not race to claim the same device.
 *   3. A serial-less identity must not steal a unit reserved (by serial) for
 *      the other station.
 *   4. Same-tab auto-print hub toggle must notify the current tab immediately.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Fake USB device / navigator.usb harness ──────────────────────────────────

interface FakeDeviceOptions {
  serialNumber?: string;
  productName?: string;
}

function makeFakeDevice(opts: FakeDeviceOptions = {}) {
  const device = {
    vendorId: 0x0483, // identical for both units — same printer model
    productId: 0x5720,
    productName: opts.productName ?? 'PD-80BW',
    serialNumber: opts.serialNumber,
    opened: false,
    configuration: null as any,
    configurations: [] as any[],
    open: vi.fn(async () => {
      device.opened = true;
    }),
    close: vi.fn(async () => {
      device.opened = false;
    }),
    selectConfiguration: vi.fn(async (value: number) => {
      device.configuration = device.configurations.find(
        (c: any) => c.configurationValue === value,
      ) ?? null;
    }),
    claimInterface: vi.fn(async (n: number) => {
      const iface = device.configuration?.interfaces.find((i: any) => i.interfaceNumber === n);
      if (iface) iface.claimed = true;
    }),
    releaseInterface: vi.fn(async () => {}),
    transferOut: vi.fn(async (_ep: number, data: BufferSource) => ({
      status: 'ok',
      bytesWritten: (data as Uint8Array).byteLength,
    })),
  };
  const config = {
    configurationValue: 1,
    interfaces: [
      {
        interfaceNumber: 0,
        claimed: false,
        alternates: [
          {
            alternateSetting: 0,
            interfaceClass: 7, // USB printer class
            endpoints: [{ endpointNumber: 1, direction: 'out', type: 'bulk' }],
          },
        ],
      },
    ],
  };
  device.configurations = [config];
  return device;
}

function installFakeUSB(devices: any[], opts: { getDevicesDelayMs?: number } = {}) {
  const usb = {
    getDevices: vi.fn(async () => {
      if (opts.getDevicesDelayMs) {
        await new Promise((r) => setTimeout(r, opts.getDevicesDelayMs));
      }
      return devices;
    }),
    requestDevice: vi.fn(),
    addEventListener: vi.fn(),
  };
  Object.defineProperty(navigator, 'usb', { value: usb, configurable: true });
  return usb;
}

/** Fresh module instance per test — webusbPrinter keeps module-level slot state. */
async function loadPrinterModule() {
  vi.resetModules();
  return import('@/utils/webusbPrinter');
}

beforeEach(() => {
  localStorage.clear();
});

// ── Serial-based slot preservation ───────────────────────────────────────────

describe('dual same-model printer reconnect', () => {
  it('re-attaches each slot to the exact unit recorded by serial number', async () => {
    const kitchenUnit = makeFakeDevice({ serialNumber: 'SN-KITCHEN' });
    const receptionUnit = makeFakeDevice({ serialNumber: 'SN-RECEPTION' });
    // Order in getDevices() deliberately reversed vs pairing order
    installFakeUSB([receptionUnit, kitchenUnit]);

    localStorage.setItem(
      'printer_kitchen_usb',
      JSON.stringify({ vendorId: 0x0483, productId: 0x5720, serialNumber: 'SN-KITCHEN' }),
    );
    localStorage.setItem(
      'printer_reception_usb',
      JSON.stringify({ vendorId: 0x0483, productId: 0x5720, serialNumber: 'SN-RECEPTION' }),
    );

    const { autoReconnectUSB, sendRawToUSB } = await loadPrinterModule();

    const [kOk, rOk] = await Promise.all([
      autoReconnectUSB('kitchen'),
      autoReconnectUSB('reception'),
    ]);
    expect(kOk).toBe(true);
    expect(rOk).toBe(true);

    // Verify writes land on the correct physical unit
    await sendRawToUSB(new Uint8Array([1]), 'kitchen');
    await sendRawToUSB(new Uint8Array([2]), 'reception');
    expect(kitchenUnit.transferOut).toHaveBeenCalledTimes(1);
    expect(receptionUnit.transferOut).toHaveBeenCalledTimes(1);
  });

  it('does not let concurrent reconnects claim the same device', async () => {
    // Only ONE unit present, both slots try to reconnect simultaneously.
    const onlyUnit = makeFakeDevice({ serialNumber: undefined });
    installFakeUSB([onlyUnit], { getDevicesDelayMs: 5 });

    // Legacy identities without serials — both match the single device.
    localStorage.setItem(
      'printer_kitchen_usb',
      JSON.stringify({ vendorId: 0x0483, productId: 0x5720, serialNumber: null }),
    );
    localStorage.setItem(
      'printer_reception_usb',
      JSON.stringify({ vendorId: 0x0483, productId: 0x5720, serialNumber: null }),
    );

    const { autoReconnectUSB, getUSBConnectionStatus } = await loadPrinterModule();

    const [kOk, rOk] = await Promise.all([
      autoReconnectUSB('kitchen'),
      autoReconnectUSB('reception'),
    ]);

    // Exactly one slot wins; the other must NOT share the same claimed device.
    expect([kOk, rOk].filter(Boolean)).toHaveLength(1);
    expect(getUSBConnectionStatus('kitchen') && getUSBConnectionStatus('reception')).toBe(false);
    expect(onlyUnit.claimInterface).toHaveBeenCalledTimes(1);
  });

  it('never gives a serial-reserved unit to a slot with a serial-less identity', async () => {
    const receptionUnit = makeFakeDevice({ serialNumber: 'SN-RECEPTION' });
    installFakeUSB([receptionUnit]);

    // Kitchen has a legacy identity without a serial; reception's identity
    // records this exact unit. Kitchen must not steal it.
    localStorage.setItem(
      'printer_kitchen_usb',
      JSON.stringify({ vendorId: 0x0483, productId: 0x5720, serialNumber: null }),
    );
    localStorage.setItem(
      'printer_reception_usb',
      JSON.stringify({ vendorId: 0x0483, productId: 0x5720, serialNumber: 'SN-RECEPTION' }),
    );

    const { autoReconnectUSB } = await loadPrinterModule();

    const kitchenResult = await autoReconnectUSB('kitchen');
    expect(kitchenResult).toBe(false);

    const receptionResult = await autoReconnectUSB('reception');
    expect(receptionResult).toBe(true);
  });

  it('re-pairing a unit to the opposite station displaces the old slot fully, and reconnect after reload lands on the new station only', async () => {
    const unit = makeFakeDevice({ serialNumber: 'SN-SHARED' });
    const usb = installFakeUSB([unit]);

    // The unit is currently paired to KITCHEN (persisted identity + claimed).
    localStorage.setItem(
      'printer_kitchen_usb',
      JSON.stringify({ vendorId: 0x0483, productId: 0x5720, serialNumber: 'SN-SHARED' }),
    );

    let mod = await loadPrinterModule();
    expect(await mod.autoReconnectUSB('kitchen')).toBe(true);

    // User explicitly re-pairs the SAME unit to RECEPTION.
    usb.requestDevice.mockResolvedValue(unit);
    const name = await mod.pairUSBPrinter('reception');
    expect(name).toBe('PD-80BW');

    // Kitchen's persisted identity must be cleared — otherwise both slots
    // would reserve the same serial and deadlock every future reconnect.
    expect(localStorage.getItem('printer_kitchen_usb')).toBeNull();
    const receptionIdentity = JSON.parse(localStorage.getItem('printer_reception_usb')!);
    expect(receptionIdentity.serialNumber).toBe('SN-SHARED');
    expect(mod.getUSBConnectionStatus('kitchen')).toBe(false);
    expect(mod.getUSBConnectionStatus('reception')).toBe(true);

    // Simulate a page reload: fresh module state, same persisted identities.
    mod = await loadPrinterModule();
    const [kOk, rOk] = await Promise.all([
      mod.autoReconnectUSB('kitchen'),
      mod.autoReconnectUSB('reception'),
    ]);
    expect(kOk).toBe(false); // kitchen was displaced — no identity, no claim
    expect(rOk).toBe(true);  // reception reattaches to the moved unit

    await mod.sendRawToUSB(new Uint8Array([9]), 'reception');
    expect(unit.transferOut).toHaveBeenCalled();
  });

  it('does not reconnect a slot that was never paired', async () => {
    const unit = makeFakeDevice({ serialNumber: 'SN-ANY' });
    installFakeUSB([unit]);
    // No identities in localStorage at all.
    const { autoReconnectUSB } = await loadPrinterModule();
    expect(await autoReconnectUSB('kitchen')).toBe(false);
    expect(unit.claimInterface).not.toHaveBeenCalled();
  });
});

// ── Same-tab hub toggle reactivity ───────────────────────────────────────────

describe('setPrintHubEnabled', () => {
  it('persists the flag and dispatches the same-tab event synchronously', async () => {
    vi.resetModules();
    const { setPrintHubEnabled, PRINT_HUB_EVENT } = await import('@/hooks/usePrintQueue');

    const seen: boolean[] = [];
    const listener = () => seen.push(localStorage.getItem('pos_is_print_hub') === 'true');
    window.addEventListener(PRINT_HUB_EVENT, listener);

    setPrintHubEnabled(true);
    expect(localStorage.getItem('pos_is_print_hub')).toBe('true');
    expect(seen).toEqual([true]);

    setPrintHubEnabled(false);
    expect(localStorage.getItem('pos_is_print_hub')).toBe('false');
    expect(seen).toEqual([true, false]);

    window.removeEventListener(PRINT_HUB_EVENT, listener);
  });
});
