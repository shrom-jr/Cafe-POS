/**
 * PrinterSettingsModal.tsx
 *
 * Three-mode hardware printer configuration for the 80mm thermal pipeline:
 *
 *   Kitchen Printer    — WebUSB (direct cable) | Wi-Fi / Network IP
 *   Reception Printer  — WebUSB (direct cable) | Wi-Fi / Network IP | System / Browser Print
 *   Auto-Print Hub     — device-local background listener toggle
 *
 * "System / Browser Print" uses the OS print dialog (window.print via hidden
 * iframe) styled for 80mm thermal paper — works immediately with any printer
 * Windows already recognises (e.g. Pantum PD-80BW) without ESC/POS pairing
 * or interface claiming.
 *
 * Test Print buttons dispatch through the same path as real jobs so the test
 * faithfully mirrors production behaviour.
 *
 * Settings that must reach every terminal (IP addresses, modes) are written to
 * Firebase via updateSettings. The auto-print toggle and USB pairing are
 * device-local (localStorage only).
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Cable,
  Monitor,
  Printer,
  Save,
  ToggleLeft,
  ToggleRight,
  Usb,
  Wifi,
  Zap,
} from 'lucide-react';
import { usePOSStore } from '@/store/usePOSStore';
import { buildKOT, buildBOT, dispatchEscpos } from '@/utils/escpos';
import {
  autoReconnectUSB,
  pairUSBPrinter,
  getUSBConnectionStatus,
  getUSBPrinterName,
  isWebUSBSupported,
} from '@/utils/webusbPrinter';
import { browserPrintKOT, browserPrintBOT } from '@/utils/browserPrint';
import { Settings, Ticket } from '@/types/pos';

// ── Shared style ──────────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 h-11 transition-colors';

// ── Types ─────────────────────────────────────────────────────────────────────

type KitchenMode   = 'webusb' | 'network' | 'system';
type ReceptionMode = 'webusb' | 'network' | 'system';

// ── Test-ticket factory ───────────────────────────────────────────────────────

function makeTestTicket(ticketType: 'KOT' | 'BOT'): Ticket {
  return {
    id: 'test-ticket',
    orderId: 'test-order',
    tableId: 'test-table',
    tableName: 'TEST',
    ticketType,
    ticketNumber: 1,
    items: [
      { id: 't1', name: ticketType === 'KOT' ? 'Test Momo (Steam)' : 'Test Cold Drink',  quantity: 1 },
      { id: 't2', name: ticketType === 'KOT' ? 'Test Sekuwa'        : 'Test Beer 650ml', quantity: 2 },
    ],
    serverName: 'Printer Test',
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
}

// ── Kitchen connection panel (WebUSB | Network | System) ─────────────────────

function KitchenConnectionPanel({
  mode, onModeChange,
  ip, onIpChange,
  port, onPortChange,
  usbConnected, usbName,
  onPair, pairing,
}: {
  mode: KitchenMode;
  onModeChange: (m: KitchenMode) => void;
  ip: string;     onIpChange: (v: string) => void;
  port: string;   onPortChange: (v: string) => void;
  usbConnected: boolean;
  usbName: string | null;
  onPair: () => void;
  pairing: boolean;
}) {
  const MODES: { id: KitchenMode; label: string; Icon: typeof Cable }[] = [
    { id: 'webusb',  label: 'WebUSB (Direct Cable)',   Icon: Cable   },
    { id: 'network', label: 'Wi-Fi / Network IP',      Icon: Wifi    },
    { id: 'system',  label: 'System / Browser Print',  Icon: Monitor },
  ];

  return (
    <>
      <ModeToggle modes={MODES} active={mode} onChange={onModeChange} />

      {mode === 'webusb'  && <USBPanel usbConnected={usbConnected} usbName={usbName} onPair={onPair} pairing={pairing} />}
      {mode === 'network' && <NetworkPanel ip={ip} onIpChange={onIpChange} port={port} onPortChange={onPortChange} placeholder="192.168.1.200" />}
      {mode === 'system'  && <KitchenSystemPrintPanel />}
    </>
  );
}

// ── Reception connection panel (WebUSB | Network | System) ───────────────────

function ReceptionConnectionPanel({
  mode, onModeChange,
  ip, onIpChange,
  port, onPortChange,
  usbConnected, usbName,
  onPair, pairing,
}: {
  mode: ReceptionMode;
  onModeChange: (m: ReceptionMode) => void;
  ip: string;     onIpChange: (v: string) => void;
  port: string;   onPortChange: (v: string) => void;
  usbConnected: boolean;
  usbName: string | null;
  onPair: () => void;
  pairing: boolean;
}) {
  const MODES: { id: ReceptionMode; label: string; Icon: typeof Cable }[] = [
    { id: 'webusb',  label: 'WebUSB (Direct Cable)',      Icon: Cable    },
    { id: 'network', label: 'Wi-Fi / Network IP',         Icon: Wifi     },
    { id: 'system',  label: 'System / Browser Print',     Icon: Monitor  },
  ];

  return (
    <>
      <ModeToggle modes={MODES} active={mode} onChange={onModeChange} />

      {mode === 'webusb'  && <USBPanel usbConnected={usbConnected} usbName={usbName} onPair={onPair} pairing={pairing} />}
      {mode === 'network' && <NetworkPanel ip={ip} onIpChange={onIpChange} port={port} onPortChange={onPortChange} placeholder="192.168.1.201" />}
      {mode === 'system'  && <SystemPrintPanel />}
    </>
  );
}

// ── Sub-panels ────────────────────────────────────────────────────────────────

function ModeToggle<T extends string>({
  modes, active, onChange,
}: {
  modes: { id: T; label: string; Icon: typeof Cable }[];
  active: T;
  onChange: (m: T) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-200 block mb-1.5">Connection Mode</label>
      <div className="flex flex-wrap gap-2">
        {modes.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`flex-1 min-w-[8rem] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
              active === id
                ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                : 'border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.05]'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function USBPanel({
  usbConnected, usbName, onPair, pairing,
}: {
  usbConnected: boolean;
  usbName: string | null;
  onPair: () => void;
  pairing: boolean;
}) {
  return (
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
  );
}

function NetworkPanel({
  ip, onIpChange, port, onPortChange, placeholder,
}: {
  ip: string; onIpChange: (v: string) => void;
  port: string; onPortChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-xs font-medium text-slate-200 block mb-1.5">Wi-Fi IP Address</label>
        <input
          value={ip}
          onChange={(e) => onIpChange(e.target.value)}
          placeholder={placeholder}
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
  );
}

function KitchenSystemPrintPanel() {
  return (
    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-1.5">
      <div className="flex items-center gap-2">
        <Monitor size={14} className="text-emerald-400 flex-shrink-0" />
        <p className="text-sm font-semibold text-emerald-300">System / Browser Print active</p>
      </div>
      <p className="text-[11.5px] text-slate-300 leading-relaxed">
        KOT tickets open the OS print dialog styled for an 80mm thermal roll.
        No USB pairing or IP address needed — Windows routes the job to whichever printer
        is set as default (or to a printer named <b>Kitchen Printer</b> when running in the
        desktop app).
      </p>
      <p className="text-[11px] text-slate-400">
        Tip: In Chrome, set <b>Destination → your kitchen printer</b> and enable <b>Save as default</b>
        to skip the dialog on every print. In the desktop app, name your Windows printer
        <b> Kitchen Printer</b> to route silently without a dialog.
      </p>
    </div>
  );
}

function SystemPrintPanel() {
  return (
    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-1.5">
      <div className="flex items-center gap-2">
        <Monitor size={14} className="text-emerald-400 flex-shrink-0" />
        <p className="text-sm font-semibold text-emerald-300">System / Browser Print active</p>
      </div>
      <p className="text-[11.5px] text-slate-300 leading-relaxed">
        Receipts and BOT tickets open the OS print dialog styled for an 80mm thermal roll.
        No USB pairing or IP address needed — Windows routes the job to whichever printer
        is set as default (e.g. Pantum PD-80BW).
      </p>
      <p className="text-[11px] text-slate-400">
        Tip: In Chrome, set <b>Destination → PD-80BW</b> and enable <b>Save as default</b>
        to skip the dialog on every print.
      </p>
    </div>
  );
}

// ── Main settings section ─────────────────────────────────────────────────────

const PrinterSettingsSection = () => {
  const settings     = usePOSStore((s) => s.settings);
  const updateSettings = usePOSStore((s) => s.updateSettings);

  // Kitchen state
  const [kitchenMode, setKitchenMode] = useState<KitchenMode>(() => {
    const m = settings.kitchenPrinterMode;
    if (m === 'webusb') return 'webusb';
    if (m === 'system') return 'system';
    return 'network';
  });
  const [kitchenIp,     setKitchenIp]     = useState(settings.kitchenPrinterIp ?? '');
  const [kitchenPort,   setKitchenPort]   = useState(String(settings.kitchenPrinterPort ?? 9100));
  const [kitchenBuzzer, setKitchenBuzzer] = useState(settings.kitchenPrinterBuzzer ?? false);

  // Reception state
  const [receptionMode, setReceptionMode] = useState<ReceptionMode>(() => {
    const m = settings.receptionPrinterMode;
    if (m === 'system')  return 'system';
    if (m === 'network') return 'network';
    return 'webusb'; // 'webusb' | 'usb' | 'browser' | undefined
  });
  const [receptionIp,   setReceptionIp]   = useState(settings.receptionPrinterIp ?? '');
  const [receptionPort, setReceptionPort] = useState(String(settings.receptionPrinterPort ?? 9100));

  // Hub & USB state
  const [autoPrint, setAutoPrint] = useState(
    () => localStorage.getItem('pos_is_print_hub') === 'true',
  );
  const [testing,      setTesting]      = useState<'kot' | 'bot' | null>(null);
  const [pairing,      setPairing]      = useState(false);
  const [usbConnected, setUsbConnected] = useState(getUSBConnectionStatus());
  const [usbName,      setUsbName]      = useState<string | null>(getUSBPrinterName());

  // Silently reconnect a previously paired USB printer when this panel opens.
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

  /** Draft settings reflecting unsaved form values — used for test prints. */
  const draftSettings = (): Settings => ({
    ...settings,
    kitchenPrinterMode:  kitchenMode,
    kitchenPrinterIp:    kitchenIp.trim() || undefined,
    kitchenPrinterPort:  Number(kitchenPort) || 9100,
    kitchenPrinterBuzzer: kitchenBuzzer,
    receptionPrinterMode: receptionMode,
    receptionPrinterIp:   receptionIp.trim() || undefined,
    receptionPrinterPort: Number(receptionPort) || 9100,
  });

  const saveAll = () => {
    localStorage.setItem('pos_is_print_hub', autoPrint ? 'true' : 'false');
    updateSettings({
      kitchenPrinterMode:  kitchenMode,
      kitchenPrinterIp:    kitchenIp.trim() || undefined,
      kitchenPrinterPort:  Number(kitchenPort) || 9100,
      kitchenPrinterBuzzer: kitchenBuzzer,
      receptionPrinterMode: receptionMode,
      receptionPrinterIp:   receptionIp.trim() || undefined,
      receptionPrinterPort: Number(receptionPort) || 9100,
    });
    toast.success('Printer settings saved');
  };

  // ── Test handlers ──────────────────────────────────────────────────────────

  const handleTestKOT = async () => {
    setTesting('kot');
    try {
      const ticket = makeTestTicket('KOT');

      if (kitchenMode === 'system') {
        // System mode: render HTML and route through OS print dialog (or Electron silent print).
        const ok = await browserPrintKOT({ cafeName: settings.cafeName, ticket, pax: 2, buzzer: kitchenBuzzer });
        if (!ok) toast.error('Browser print failed — check browser permissions');
        else toast.success('Test KOT opened in print dialog');
        return;
      }

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

      if (receptionMode === 'system') {
        // System mode: render HTML receipt and open the OS print dialog.
        const ok = await browserPrintBOT({ cafeName: settings.cafeName, ticket, pax: 2 });
        if (!ok) toast.error('Browser print failed — check browser permissions');
        else toast.success('Test receipt opened in print dialog');
        return;
      }

      const buffer = buildBOT({ cafeName: settings.cafeName, ticket, pax: 2 });
      const ok = await dispatchEscpos(buffer, draftSettings(), 'reception');
      if (ok) {
        toast.success('Test receipt / BOT sent to reception printer');
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Kitchen Printer ──────────────────────────────────────────────── */}
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

        <KitchenConnectionPanel
          mode={kitchenMode}   onModeChange={setKitchenMode}
          ip={kitchenIp}       onIpChange={setKitchenIp}
          port={kitchenPort}   onPortChange={setKitchenPort}
          usbConnected={usbConnected} usbName={usbName}
          onPair={handlePair}  pairing={pairing}
        />

        <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-white/[0.06]">
          <div>
            <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Zap size={14} className="text-amber-400" /> Kitchen Buzzer Alarm
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sound the printer bell when a new KOT arrives
            </p>
          </div>
          <button onClick={() => setKitchenBuzzer((v) => !v)} className="flex-shrink-0 transition-all active:scale-95">
            {kitchenBuzzer
              ? <ToggleRight size={36} className="text-accent" />
              : <ToggleLeft  size={36} className="text-muted-foreground" />}
          </button>
        </div>

        <button
          onClick={handleTestKOT}
          disabled={testing !== null}
          className="w-full py-2.5 rounded-xl bg-secondary border border-border text-sm font-semibold text-foreground transition-all active:scale-[0.98] hover:bg-secondary/70 disabled:opacity-50"
        >
          {testing === 'kot'
            ? 'Sending test…'
            : kitchenMode === 'system'
              ? 'Test Print KOT (Browser Dialog)'
              : 'Test Print KOT'}
        </button>
      </div>

      {/* ── Reception / Bar Printer ───────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Printer size={16} className="text-accent" />
          <div>
            <h3 className="font-semibold text-foreground">
              Reception / Bar Printer (BOT &amp; Receipts)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Prints BOT tickets, pre-bills and tax invoices
            </p>
          </div>
        </div>

        <ReceptionConnectionPanel
          mode={receptionMode}   onModeChange={setReceptionMode}
          ip={receptionIp}       onIpChange={setReceptionIp}
          port={receptionPort}   onPortChange={setReceptionPort}
          usbConnected={usbConnected} usbName={usbName}
          onPair={handlePair}    pairing={pairing}
        />

        <button
          onClick={handleTestReception}
          disabled={testing !== null}
          className="w-full py-2.5 rounded-xl bg-secondary border border-border text-sm font-semibold text-foreground transition-all active:scale-[0.98] hover:bg-secondary/70 disabled:opacity-50"
        >
          {testing === 'bot'
            ? 'Sending test…'
            : receptionMode === 'system'
              ? 'Test Print (Browser Dialog)'
              : 'Test Print Receipt / BOT'}
        </button>
      </div>

      {/* ── Auto-Print Hub ────────────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">Auto-Print Hub</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Turn this ON only at the cashier desktop. That device will watch for new KOT/BOT
            tickets from every terminal and dispatch them to the printers automatically.
          </p>
        </div>
        <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-white/[0.06]">
          <div>
            <p className="text-sm font-medium text-foreground">
              Enable Auto-Print Listener on this device
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pending tickets are printed once, then marked as printed for all devices
            </p>
          </div>
          <button onClick={() => setAutoPrint((v) => !v)} className="flex-shrink-0 transition-all active:scale-95">
            {autoPrint
              ? <ToggleRight size={36} className="text-accent" />
              : <ToggleLeft  size={36} className="text-muted-foreground" />}
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
