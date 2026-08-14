/**
 * PrinterSettingsModal.tsx
 *
 * Dual-mode hardware printer configuration for the 80mm thermal print pipeline:
 *   • Kitchen Printer   — WebUSB (direct cable) OR Wi-Fi/Network IP + buzzer
 *   • Reception Printer — WebUSB (direct cable) OR Wi-Fi/Network IP
 *   • Auto-Print Hub    — enable the background auto-print listener on THIS device
 *
 * Test Print buttons dispatch through the same silent ESC/POS pipeline as real
 * tickets — WebUSB or network per configured mode. There is NO window.print()
 * or browser dialog fallback anywhere in this pipeline.
 *
 * Settings persist through usePOSStore.updateSettings which already syncs to
 * Firebase, so every terminal sees the same printer addresses, while the
 * auto-print toggle and USB pairing are device-local (cashier desktop).
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Cable, Printer, Save, ToggleLeft, ToggleRight, Usb, Wifi, Zap } from 'lucide-react';
import { usePOSStore } from '@/store/usePOSStore';
import { buildKOT, buildBOT, dispatchEscpos } from '@/utils/escpos';
import {
  autoReconnectUSB,
  pairUSBPrinter,
  getUSBConnectionStatus,
  getUSBPrinterName,
  isWebUSBSupported,
} from '@/utils/webusbPrinter';
import { Settings, Ticket } from '@/types/pos';

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 h-11 transition-colors';

type ConnMode = 'webusb' | 'network';

function makeTestTicket(ticketType: 'KOT' | 'BOT'): Ticket {
  return {
    id: 'test-ticket',
    orderId: 'test-order',
    tableId: 'test-table',
    tableName: 'TEST',
    ticketType,
    ticketNumber: 1,
    items: [
      { id: 't1', name: ticketType === 'KOT' ? 'Test Momo (Steam)' : 'Test Cold Drink', quantity: 1 },
      { id: 't2', name: ticketType === 'KOT' ? 'Test Sekuwa' : 'Test Beer 650ml', quantity: 2 },
    ],
    serverName: 'Printer Test',
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
}

/** Shared connection-mode toggle + conditional fields for one printer. */
function ConnectionModePanel({
  mode,
  onModeChange,
  ip,
  onIpChange,
  port,
  onPortChange,
  usbConnected,
  usbName,
  onPair,
  pairing,
  ipPlaceholder,
}: {
  mode: ConnMode;
  onModeChange: (m: ConnMode) => void;
  ip: string;
  onIpChange: (v: string) => void;
  port: string;
  onPortChange: (v: string) => void;
  usbConnected: boolean;
  usbName: string | null;
  onPair: () => void;
  pairing: boolean;
  ipPlaceholder: string;
}) {
  return (
    <>
      <div>
        <label className="text-xs font-medium text-slate-200 block mb-1.5">Connection Mode</label>
        <div className="flex gap-2">
          {([
            { id: 'webusb' as const, label: 'WebUSB (Direct Cable)', icon: Cable },
            { id: 'network' as const, label: 'Wi-Fi / Network IP', icon: Wifi },
          ]).map((m) => (
            <button
              key={m.id}
              onClick={() => onModeChange(m.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                mode === m.id
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                  : 'border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.05]'
              }`}
            >
              <m.icon size={13} />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'webusb' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-secondary/50 border border-white/[0.06]">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  usbConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]' : 'bg-slate-500'
                }`}
              />
              <p className="text-sm font-medium text-foreground">
                {usbConnected ? `${usbName ?? 'USB Printer'} Connected` : 'Not Paired'}
              </p>
            </div>
            <button
              onClick={onPair}
              disabled={pairing || !isWebUSBSupported()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600/20 border border-blue-500/35 text-blue-300 text-xs font-bold transition-all active:scale-95 hover:bg-blue-600/30 disabled:opacity-40"
            >
              <Usb size={13} />
              {pairing ? 'Pairing…' : 'Pair USB Printer'}
            </button>
          </div>
          {!isWebUSBSupported() && (
            <p className="text-[11px] text-amber-400/80 font-medium">
              WebUSB is not supported in this browser. Use Chrome or Edge over HTTPS, or switch to Wi-Fi / Network IP mode.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-200 block mb-1.5">Wi-Fi IP Address</label>
            <input
              value={ip}
              onChange={(e) => onIpChange(e.target.value)}
              placeholder={ipPlaceholder}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-200 block mb-1.5">Port</label>
            <input
              value={port}
              onChange={(e) => onPortChange(e.target.value)}
              type="number"
              placeholder="9100"
              className={inputCls}
            />
          </div>
        </div>
      )}
    </>
  );
}

const PrinterSettingsSection = () => {
  const settings = usePOSStore((s) => s.settings);
  const updateSettings = usePOSStore((s) => s.updateSettings);

  const [kitchenMode, setKitchenMode] = useState<ConnMode>(
    settings.kitchenPrinterMode === 'webusb' ? 'webusb' : 'network',
  );
  const [kitchenIp, setKitchenIp] = useState(settings.kitchenPrinterIp ?? '');
  const [kitchenPort, setKitchenPort] = useState(String(settings.kitchenPrinterPort ?? 9100));
  const [kitchenBuzzer, setKitchenBuzzer] = useState(settings.kitchenPrinterBuzzer ?? false);
  const [receptionMode, setReceptionMode] = useState<ConnMode>(
    settings.receptionPrinterMode === 'network' ? 'network' : 'webusb',
  );
  const [receptionIp, setReceptionIp] = useState(settings.receptionPrinterIp ?? '');
  const [receptionPort, setReceptionPort] = useState(String(settings.receptionPrinterPort ?? 9100));
  const [autoPrint, setAutoPrint] = useState(
    () => localStorage.getItem('pos_is_print_hub') === 'true',
  );
  const [testing, setTesting] = useState<'kot' | 'bot' | null>(null);
  const [pairing, setPairing] = useState(false);
  const [usbConnected, setUsbConnected] = useState(getUSBConnectionStatus());
  const [usbName, setUsbName] = useState<string | null>(getUSBPrinterName());

  // Silently re-attach an already-paired USB printer when this panel opens.
  useEffect(() => {
    let cancelled = false;
    void autoReconnectUSB().then(() => {
      if (cancelled) return;
      setUsbConnected(getUSBConnectionStatus());
      setUsbName(getUSBPrinterName());
    });
    return () => { cancelled = true; };
  }, []);

  const handlePair = async () => {
    setPairing(true);
    try {
      const name = await pairUSBPrinter();
      setUsbConnected(getUSBConnectionStatus());
      setUsbName(getUSBPrinterName());
      if (name) {
        toast.success(`Paired with ${name}`);
      } else {
        toast.error('No printer paired — selection cancelled or interface unavailable');
      }
    } finally {
      setPairing(false);
    }
  };

  /** Draft settings reflecting the current (possibly unsaved) form values. */
  const draftSettings = (): Settings => ({
    ...settings,
    kitchenPrinterMode: kitchenMode,
    kitchenPrinterIp: kitchenIp.trim() || undefined,
    kitchenPrinterPort: Number(kitchenPort) || 9100,
    kitchenPrinterBuzzer: kitchenBuzzer,
    receptionPrinterMode: receptionMode,
    receptionPrinterIp: receptionIp.trim() || undefined,
    receptionPrinterPort: Number(receptionPort) || 9100,
  });

  const saveAll = () => {
    // autoPrint is device-local — written only to localStorage, never to Firebase.
    localStorage.setItem('pos_is_print_hub', autoPrint ? 'true' : 'false');
    updateSettings({
      kitchenPrinterMode: kitchenMode,
      kitchenPrinterIp: kitchenIp.trim() || undefined,
      kitchenPrinterPort: Number(kitchenPort) || 9100,
      kitchenPrinterBuzzer: kitchenBuzzer,
      receptionPrinterMode: receptionMode,
      receptionPrinterIp: receptionIp.trim() || undefined,
      receptionPrinterPort: Number(receptionPort) || 9100,
    });
    toast.success('Printer settings saved');
  };

  const handleTestKOT = async () => {
    setTesting('kot');
    try {
      const ticket = makeTestTicket('KOT');
      const buffer = buildKOT({
        cafeName: settings.cafeName,
        ticket,
        pax: 2,
        buzzer: kitchenBuzzer,
      });
      const ok = await dispatchEscpos(buffer, draftSettings(), 'kitchen');
      if (ok) {
        toast.success('Test KOT sent to kitchen printer');
      } else {
        toast.error(
          kitchenMode === 'webusb'
            ? 'USB printer not connected — pair it first'
            : 'Kitchen printer unreachable — check IP/port',
        );
      }
    } finally {
      setTesting(null);
    }
  };

  const handleTestReception = async () => {
    setTesting('bot');
    try {
      const ticket = makeTestTicket('BOT');
      const buffer = buildBOT({ cafeName: settings.cafeName, ticket, pax: 2 });
      const ok = await dispatchEscpos(buffer, draftSettings(), 'reception');
      if (ok) {
        toast.success('Test ticket sent to reception printer');
      } else {
        toast.error(
          receptionMode === 'webusb'
            ? 'USB printer not connected — pair it first'
            : 'Reception printer unreachable — check IP/port',
        );
      }
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Kitchen Printer ─────────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Printer size={16} className="text-accent" />
          <div>
            <h3 className="font-semibold text-foreground">Kitchen Printer (KOT)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pantum PD-80BW or any 80mm ESC/POS printer — USB cable or Wi-Fi
            </p>
          </div>
        </div>

        <ConnectionModePanel
          mode={kitchenMode}
          onModeChange={setKitchenMode}
          ip={kitchenIp}
          onIpChange={setKitchenIp}
          port={kitchenPort}
          onPortChange={setKitchenPort}
          usbConnected={usbConnected}
          usbName={usbName}
          onPair={handlePair}
          pairing={pairing}
          ipPlaceholder="192.168.1.200"
        />

        <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-white/[0.06]">
          <div>
            <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Zap size={14} className="text-amber-400" /> Kitchen Buzzer Alarm
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Sound the printer bell when a new KOT arrives</p>
          </div>
          <button onClick={() => setKitchenBuzzer((v) => !v)} className="flex-shrink-0 transition-all active:scale-95">
            {kitchenBuzzer
              ? <ToggleRight size={36} className="text-accent" />
              : <ToggleLeft size={36} className="text-muted-foreground" />}
          </button>
        </div>
        <button
          onClick={handleTestKOT}
          disabled={testing !== null}
          className="w-full py-2.5 rounded-xl bg-secondary border border-border text-sm font-semibold text-foreground transition-all active:scale-[0.98] hover:bg-secondary/70 disabled:opacity-50"
        >
          {testing === 'kot' ? 'Sending test…' : 'Test Print KOT'}
        </button>
      </div>

      {/* ── Reception / Bar Printer ─────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Printer size={16} className="text-accent" />
          <div>
            <h3 className="font-semibold text-foreground">Reception / Bar Printer (BOT &amp; Receipts)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Prints BOT tickets, pre-bills and tax invoices</p>
          </div>
        </div>

        <ConnectionModePanel
          mode={receptionMode}
          onModeChange={setReceptionMode}
          ip={receptionIp}
          onIpChange={setReceptionIp}
          port={receptionPort}
          onPortChange={setReceptionPort}
          usbConnected={usbConnected}
          usbName={usbName}
          onPair={handlePair}
          pairing={pairing}
          ipPlaceholder="192.168.1.201"
        />

        <button
          onClick={handleTestReception}
          disabled={testing !== null}
          className="w-full py-2.5 rounded-xl bg-secondary border border-border text-sm font-semibold text-foreground transition-all active:scale-[0.98] hover:bg-secondary/70 disabled:opacity-50"
        >
          {testing === 'bot' ? 'Sending test…' : 'Test Print Receipt / BOT'}
        </button>
      </div>

      {/* ── Auto-Print Hub ──────────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">Auto-Print Hub</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Turn this ON only at the cashier desktop. That device will watch for new
            KOT/BOT tickets from every terminal and dispatch them to the printers automatically.
          </p>
        </div>
        <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-white/[0.06]">
          <div>
            <p className="text-sm font-medium text-foreground">Enable Auto-Print Listener on this device</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pending tickets are printed once, then marked as printed for all devices
            </p>
          </div>
          <button onClick={() => setAutoPrint((v) => !v)} className="flex-shrink-0 transition-all active:scale-95">
            {autoPrint
              ? <ToggleRight size={36} className="text-accent" />
              : <ToggleLeft size={36} className="text-muted-foreground" />}
          </button>
        </div>
      </div>

      <button
        onClick={saveAll}
        className="w-full py-3.5 rounded-2xl bg-accent text-accent-foreground font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] hover:brightness-110 shadow-[0_4px_16px_-4px_rgba(59,130,246,0.4)]"
      >
        <Save size={16} /> Save Printer Settings
      </button>
    </div>
  );
};

export default PrinterSettingsSection;
