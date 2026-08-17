/**
 * PrinterSettingsModal.tsx
 *
 * Clean dual-USB printer configuration for the 80mm thermal pipeline.
 * Three Carbon-Dark cards:
 *
 *   A. Kitchen Station (KOT Printer - Pantum PD-80BW)
 *      Pair Kitchen USB Printer / Test Print KOT
 *
 *   B. Reception / Bar Station (BOT & Receipts - Pantum PD-80BW)
 *      Pair Reception USB Printer / Test Print BOT / Receipt
 *
 *   C. Auto-Print Hub (Desktop Background Listener)
 *      Toggle + live pulse — enable on the cashier desktop only.
 *
 * Pairing stores device identity to localStorage under:
 *   printer_kitchen_usb / printer_reception_usb
 *
 * Test prints send raw ESC/POS bytes directly to the USB endpoint — zero
 * browser dialogs, zero window.print() calls.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Cable,
  Printer,
  Save,
  ToggleLeft,
  ToggleRight,
  Usb,
  Zap,
} from 'lucide-react';
import { usePOSStore } from '@/store/usePOSStore';
import { setPrintHubEnabled } from '@/hooks/usePrintQueue';
import { buildKOT, buildBOT } from '@/utils/escpos';
import {
  autoReconnectUSB,
  pairUSBPrinter,
  getUSBConnectionStatus,
  getUSBPrinterName,
  isWebUSBSupported,
  sendRawToUSB,
} from '@/utils/webusbPrinter';
import { Ticket } from '@/types/pos';

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
      { id: 't1', name: ticketType === 'KOT' ? 'Test Momo (Steam)'  : 'Test Cold Drink',  quantity: 1 },
      { id: 't2', name: ticketType === 'KOT' ? 'Test Sekuwa'        : 'Test Beer 650ml', quantity: 2 },
    ],
    serverName: 'Printer Test',
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
}

// ── Shared status badge ───────────────────────────────────────────────────────

function StatusBadge({ connected, name }: { connected: boolean; name: string | null }) {
  return connected ? (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950 border border-emerald-500 text-emerald-400 text-xs font-black uppercase tracking-wider">
      <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
      {name ?? 'USB Printer'} — Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 text-xs font-black uppercase tracking-wider">
      <span className="w-2 h-2 rounded-full bg-slate-500" />
      Not Paired
    </span>
  );
}

// ── Printer station card ──────────────────────────────────────────────────────

interface StationCardProps {
  title: string;
  subtitle: string;
  slot: 'kitchen' | 'reception';
  connected: boolean;
  printerName: string | null;
  pairing: boolean;
  testing: boolean;
  buzzer?: boolean;
  onBuzzerToggle?: () => void;
  onPair: () => void;
  onTest: () => void;
  testLabel: string;
}

function StationCard({
  title, subtitle, slot,
  connected, printerName,
  pairing, testing,
  buzzer, onBuzzerToggle,
  onPair, onTest, testLabel,
}: StationCardProps) {
  void slot; // used by parent, declared for clarity
  return (
    <div className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Printer size={16} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-black text-white tracking-wide">{title}</h3>
            <p className="text-xs font-bold text-zinc-400 mt-0.5">{subtitle}</p>
          </div>
        </div>
        <StatusBadge connected={connected} name={printerName} />
      </div>

      {/* USB not supported warning */}
      {!isWebUSBSupported() && (
        <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
          <p className="text-xs font-bold text-amber-300">
            WebUSB requires Chrome or Edge over HTTPS. Please open the app in a supported browser.
          </p>
        </div>
      )}

      {/* Pair button */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-[#181B26] border border-white/10">
        <div>
          <p className="text-sm font-black text-white flex items-center gap-1.5">
            <Cable size={13} className="text-amber-400" />
            USB Cable Connection
          </p>
          <p className="text-xs text-zinc-400 font-bold mt-0.5">
            Plug in the Pantum PD-80BW then click Pair
          </p>
        </div>
        <button
          onClick={onPair}
          disabled={pairing || !isWebUSBSupported()}
          className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-40"
        >
          <Usb size={13} />
          {pairing ? 'Pairing…' : `Pair ${title.split(' ')[0]} USB Printer`}
        </button>
      </div>

      {/* Buzzer toggle — kitchen only */}
      {onBuzzerToggle !== undefined && (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-[#181B26] border border-white/10">
          <div>
            <p className="text-sm font-black text-white flex items-center gap-1.5">
              <Zap size={13} className="text-amber-400" /> Kitchen Buzzer Alarm
            </p>
            <p className="text-xs font-bold text-zinc-400 mt-0.5">
              Sound the printer bell when a new KOT arrives
            </p>
          </div>
          <button
            onClick={onBuzzerToggle}
            className="flex-shrink-0 transition-all active:scale-95"
          >
            {buzzer
              ? <ToggleRight size={36} className="text-amber-400" />
              : <ToggleLeft  size={36} className="text-zinc-500"  />}
          </button>
        </div>
      )}

      {/* Test print button */}
      <button
        onClick={onTest}
        disabled={testing || !connected}
        className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all disabled:opacity-40"
      >
        {testing ? 'Sending test…' : testLabel}
      </button>
    </div>
  );
}

// ── Main settings section ─────────────────────────────────────────────────────

const PrinterSettingsSection = () => {
  const settings      = usePOSStore((s) => s.settings);
  const updateSettings = usePOSStore((s) => s.updateSettings);

  // Buzzer preference (kitchen only)
  const [kitchenBuzzer, setKitchenBuzzer] = useState(settings.kitchenPrinterBuzzer ?? false);

  // Auto-print hub toggle (device-local, localStorage)
  const [autoPrint, setAutoPrint] = useState(
    () => localStorage.getItem('pos_is_print_hub') === 'true',
  );

  // Per-slot USB state
  const [kitchenConnected,   setKitchenConnected]   = useState(() => getUSBConnectionStatus('kitchen'));
  const [kitchenName,        setKitchenName]         = useState<string | null>(() => getUSBPrinterName('kitchen'));
  const [receptionConnected, setReceptionConnected] = useState(() => getUSBConnectionStatus('reception'));
  const [receptionName,      setReceptionName]       = useState<string | null>(() => getUSBPrinterName('reception'));

  const [pairingSlot, setPairingSlot] = useState<'kitchen' | 'reception' | null>(null);
  const [testing,     setTesting]     = useState<'kot' | 'bot' | null>(null);

  // On mount: silently reconnect both printers
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      autoReconnectUSB('kitchen'),
      autoReconnectUSB('reception'),
    ]).then(() => {
      if (cancelled) return;
      setKitchenConnected(getUSBConnectionStatus('kitchen'));
      setKitchenName(getUSBPrinterName('kitchen'));
      setReceptionConnected(getUSBConnectionStatus('reception'));
      setReceptionName(getUSBPrinterName('reception'));
    });
    return () => { cancelled = true; };
  }, []);

  // ── Pair handlers ───────────────────────────────────────────────────────────

  const handlePairKitchen = async () => {
    setPairingSlot('kitchen');
    try {
      const name = await pairUSBPrinter('kitchen');
      setKitchenConnected(getUSBConnectionStatus('kitchen'));
      setKitchenName(getUSBPrinterName('kitchen'));
      if (name) toast.success(`Kitchen printer paired: ${name}`);
      else toast.error('Pairing cancelled or interface unavailable');
    } finally {
      setPairingSlot(null);
    }
  };

  const handlePairReception = async () => {
    setPairingSlot('reception');
    try {
      const name = await pairUSBPrinter('reception');
      setReceptionConnected(getUSBConnectionStatus('reception'));
      setReceptionName(getUSBPrinterName('reception'));
      if (name) toast.success(`Reception printer paired: ${name}`);
      else toast.error('Pairing cancelled or interface unavailable');
    } finally {
      setPairingSlot(null);
    }
  };

  // ── Test handlers ───────────────────────────────────────────────────────────

  const handleTestKOT = async () => {
    setTesting('kot');
    try {
      const ticket = makeTestTicket('KOT');
      const buffer = buildKOT({ cafeName: settings.cafeName, ticket, pax: 2, buzzer: kitchenBuzzer });
      const ok = await sendRawToUSB(buffer, 'kitchen');
      if (ok) toast.success('Test KOT sent to Kitchen USB printer');
      else toast.error('Kitchen USB printer not connected — pair it first');
    } finally {
      setTesting(null);
    }
  };

  const handleTestBOT = async () => {
    setTesting('bot');
    try {
      const ticket = makeTestTicket('BOT');
      const buffer = buildBOT({ cafeName: settings.cafeName, ticket, pax: 2 });
      const ok = await sendRawToUSB(buffer, 'reception');
      if (ok) toast.success('Test BOT / Receipt sent to Reception USB printer');
      else toast.error('Reception USB printer not connected — pair it first');
    } finally {
      setTesting(null);
    }
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const saveAll = () => {
    // setPrintHubEnabled persists AND notifies this tab's usePrintQueue
    // immediately — writing localStorage directly would require a reload.
    setPrintHubEnabled(autoPrint);
    updateSettings({ kitchenPrinterBuzzer: kitchenBuzzer });
    toast.success('Printer settings saved');
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── A. Kitchen Station ───────────────────────────────────────────── */}
      <StationCard
        title="Kitchen Station"
        subtitle="Pantum PD-80BW — KOT tickets"
        slot="kitchen"
        connected={kitchenConnected}
        printerName={kitchenName}
        pairing={pairingSlot === 'kitchen'}
        testing={testing === 'kot'}
        buzzer={kitchenBuzzer}
        onBuzzerToggle={() => setKitchenBuzzer((v) => !v)}
        onPair={handlePairKitchen}
        onTest={handleTestKOT}
        testLabel="Test Print KOT"
      />

      {/* ── B. Reception / Bar Station ───────────────────────────────────── */}
      <StationCard
        title="Reception / Bar Station"
        subtitle="Pantum PD-80BW — BOT tickets, pre-bills &amp; receipts"
        slot="reception"
        connected={receptionConnected}
        printerName={receptionName}
        pairing={pairingSlot === 'reception'}
        testing={testing === 'bot'}
        onPair={handlePairReception}
        onTest={handleTestBOT}
        testLabel="Test Print BOT / Receipt"
      />

      {/* ── C. Auto-Print Hub ────────────────────────────────────────────── */}
      <div className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl flex flex-col gap-5">
        <div>
          <h3 className="text-base font-black text-white tracking-wide">Auto-Print Hub</h3>
          <p className="text-xs font-bold text-zinc-400 mt-1">
            Enable only on the cashier desktop. This device will silently listen for
            new KOT / BOT tickets from every terminal and dispatch them to the USB printers.
          </p>
        </div>

        <div className="flex items-center justify-between p-4 rounded-2xl bg-[#181B26] border border-white/10">
          <div>
            <p className="text-sm font-black text-white">
              Enable Silent Auto-Print on this Desktop
            </p>
            <p className="text-xs font-bold text-zinc-400 mt-0.5">
              Listens for mobile waiter orders in real-time and silently prints KOT to
              the Kitchen USB and BOT to the Reception USB.
            </p>
          </div>
          <button
            onClick={() => setAutoPrint((v) => !v)}
            className="flex-shrink-0 transition-all active:scale-95"
          >
            {autoPrint
              ? <ToggleRight size={36} className="text-amber-400" />
              : <ToggleLeft  size={36} className="text-zinc-500"  />}
          </button>
        </div>

        {/* Live pulse when active */}
        {autoPrint && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-950/60 border border-emerald-500/30">
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
            </span>
            <p className="text-xs font-black text-emerald-400 uppercase tracking-wider">
              Auto-Print Queue Listener Active
            </p>
          </div>
        )}
      </div>

      {/* ── Save button ──────────────────────────────────────────────────── */}
      <button
        onClick={saveAll}
        className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2"
      >
        <Save size={15} />
        Save Printer Settings
      </button>
    </div>
  );
};

export default PrinterSettingsSection;
