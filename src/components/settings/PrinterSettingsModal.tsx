/**
 * PrinterSettingsModal.tsx
 *
 * Dual-mode printer configuration that adapts automatically to the runtime:
 *
 *   Electron desktop  — OS printer discovery via window.electronAPI.getPrinters()
 *     Kitchen Station:   dropdown → saves to printer_kitchen_device_name
 *     Reception Station: dropdown → saves to printer_reception_device_name
 *     Test prints use window.electronAPI.printSilent() — zero dialogs.
 *
 *   Browser (WebUSB hub) — unchanged from Phase 5
 *     Kitchen Station:   Pair USB button + raw ESC/POS test
 *     Reception Station: Pair USB button + raw ESC/POS test
 *
 *   Both modes share:
 *     C. Kitchen Buzzer Alarm toggle
 *     D. Auto-Print Hub toggle (hub device only)
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Cable,
  ChevronDown,
  Power,
  Printer,
  RefreshCw,
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
import { browserPrintKOT, browserPrintBOT } from '@/utils/browserPrint';
import { Ticket } from '@/types/pos';
import type { ElectronPrinterInfo } from '@/types/electron';

// ── Helpers ────────────────────────────────────────────────────────────────────

const inElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;

const KITCHEN_DEVICE_KEY   = 'printer_kitchen_device_name';
const RECEPTION_DEVICE_KEY = 'printer_reception_device_name';

function loadDeviceName(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}

function saveDeviceName(key: string, name: string): void {
  try { localStorage.setItem(key, name); } catch { /* ok */ }
}

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

function StatusBadge({ configured, label }: { configured: boolean; label: string }) {
  return configured ? (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950 border border-emerald-500 text-emerald-400 text-xs font-black uppercase tracking-wider">
      <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
      {label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/60 border border-amber-500/40 text-amber-400 text-xs font-black uppercase tracking-wider">
      <span className="w-2 h-2 rounded-full bg-amber-400" />
      Select a Printer
    </span>
  );
}

// ── Electron station card ─────────────────────────────────────────────────────

interface ElectronStationCardProps {
  title: string;
  subtitle: string;
  printers: ElectronPrinterInfo[];
  loadingPrinters: boolean;
  selectedPrinter: string;
  onSelect: (name: string) => void;
  testing: boolean;
  onTest: () => void;
  testLabel: string;
  onRefresh: () => void;
}

function ElectronStationCard({
  title, subtitle,
  printers, loadingPrinters,
  selectedPrinter, onSelect,
  testing, onTest, testLabel,
  onRefresh,
}: ElectronStationCardProps) {
  const [open, setOpen] = useState(false);
  const configured = selectedPrinter.length > 0;

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
        <StatusBadge
          configured={configured}
          label={configured ? `Configured: ${selectedPrinter}` : 'Select a Printer'}
        />
      </div>

      {/* Printer dropdown */}
      <div className="flex flex-col gap-2.5 p-4 rounded-2xl bg-[#181B26] border border-white/10">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-black text-white flex items-center gap-1.5">
            <Printer size={13} className="text-amber-400" />
            Windows Printer
          </p>
          <button
            onClick={onRefresh}
            disabled={loadingPrinters}
            className="flex items-center gap-1 text-xs font-bold text-zinc-400 hover:text-amber-400 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={11} className={loadingPrinters ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#0E1018] border border-white/15 text-sm font-bold text-white hover:border-amber-500/40 transition-colors"
          >
            <span className={selectedPrinter ? 'text-white' : 'text-zinc-500'}>
              {selectedPrinter || (loadingPrinters ? 'Loading printers…' : 'Select a Windows printer…')}
            </span>
            <ChevronDown size={14} className={`text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[#13151F] border border-white/20 rounded-xl shadow-2xl overflow-hidden">
              {printers.length === 0 ? (
                <div className="px-4 py-3 text-xs text-zinc-400 font-bold">
                  {loadingPrinters ? 'Fetching printer list…' : 'No printers found. Install a Windows printer driver and click Refresh.'}
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto">
                  {printers.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => { onSelect(p.name); setOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm font-bold transition-colors flex items-center justify-between gap-2 ${
                        p.name === selectedPrinter
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'text-white hover:bg-white/5'
                      }`}
                    >
                      <span>{p.name}</span>
                      <span className="flex items-center gap-2 flex-shrink-0">
                        {p.isDefault && (
                          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                            Default
                          </span>
                        )}
                        {p.name === selectedPrinter && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-xs font-bold text-zinc-500 mt-0.5">
          Must match the printer name exactly as shown in Windows Settings → Printers &amp; scanners.
        </p>
      </div>

      {/* Test button */}
      <button
        onClick={onTest}
        disabled={testing || !configured}
        className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all disabled:opacity-40"
      >
        {testing ? 'Sending test print…' : testLabel}
      </button>
    </div>
  );
}

// ── WebUSB station card ────────────────────────────────────────────────────────

interface USBStationCardProps {
  title: string;
  subtitle: string;
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

function USBStationCard({
  title, subtitle,
  connected, printerName,
  pairing, testing,
  buzzer, onBuzzerToggle,
  onPair, onTest, testLabel,
}: USBStationCardProps) {
  const usbBadge = connected ? (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950 border border-emerald-500 text-emerald-400 text-xs font-black uppercase tracking-wider">
      <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
      {printerName ?? 'USB Printer'} — Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 text-xs font-black uppercase tracking-wider">
      <span className="w-2 h-2 rounded-full bg-slate-500" />
      Not Paired
    </span>
  );

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
        {usbBadge}
      </div>

      {/* WebUSB not supported warning */}
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
          {pairing ? 'Pairing…' : `Pair ${title.split(' ')[0]} USB`}
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
          <button onClick={onBuzzerToggle} className="flex-shrink-0 transition-all active:scale-95">
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

// ── Main settings section ──────────────────────────────────────────────────────

const PrinterSettingsSection = () => {
  const settings       = usePOSStore((s) => s.settings);
  const updateSettings = usePOSStore((s) => s.updateSettings);

  // ── Shared state ──────────────────────────────────────────────────────────

  const [kitchenBuzzer, setKitchenBuzzer] = useState(settings.kitchenPrinterBuzzer ?? false);
  const [autoPrint,     setAutoPrint]     = useState(
    () => localStorage.getItem('pos_is_print_hub') === 'true',
  );

  // ── Electron state ────────────────────────────────────────────────────────

  const [osPrinters,       setOsPrinters]       = useState<ElectronPrinterInfo[]>([]);
  const [loadingPrinters,  setLoadingPrinters]  = useState(false);
  const [kitchenDevice,    setKitchenDevice]    = useState(() => loadDeviceName(KITCHEN_DEVICE_KEY));
  const [receptionDevice,  setReceptionDevice]  = useState(() => loadDeviceName(RECEPTION_DEVICE_KEY));
  const [testingElectron,  setTestingElectron]  = useState<'kot' | 'bot' | null>(null);
  const [autoLaunch,       setAutoLaunch]       = useState(false);

  const fetchPrinters = useCallback(async () => {
    if (!inElectron || !window.electronAPI?.getPrinters) return;
    setLoadingPrinters(true);
    try {
      const list = await window.electronAPI.getPrinters();
      setOsPrinters(list);
    } catch (err) {
      console.warn('[PrinterSettings] getPrinters failed:', err);
      toast.error('Could not fetch printer list from Windows');
    } finally {
      setLoadingPrinters(false);
    }
  }, []);

  // ── WebUSB state ──────────────────────────────────────────────────────────

  const [kitchenConnected,   setKitchenConnected]   = useState(() => getUSBConnectionStatus('kitchen'));
  const [kitchenName,        setKitchenName]         = useState<string | null>(() => getUSBPrinterName('kitchen'));
  const [receptionConnected, setReceptionConnected] = useState(() => getUSBConnectionStatus('reception'));
  const [receptionName,      setReceptionName]       = useState<string | null>(() => getUSBPrinterName('reception'));
  const [pairingSlot,        setPairingSlot]         = useState<'kitchen' | 'reception' | null>(null);
  const [testingUSB,         setTestingUSB]          = useState<'kot' | 'bot' | null>(null);

  // ── Mount ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (inElectron) {
      void fetchPrinters();
      void window.electronAPI?.getAutoStart?.().then((v) => setAutoLaunch(Boolean(v)));
    } else {
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
    }
  }, [fetchPrinters]);

  // ── Electron handlers ─────────────────────────────────────────────────────

  const handleSelectKitchen = (name: string) => {
    setKitchenDevice(name);
    saveDeviceName(KITCHEN_DEVICE_KEY, name);
  };

  const handleSelectReception = (name: string) => {
    setReceptionDevice(name);
    saveDeviceName(RECEPTION_DEVICE_KEY, name);
  };

  const handleElectronTestKOT = async () => {
    setTestingElectron('kot');
    try {
      const ticket = makeTestTicket('KOT');
      const ok = await browserPrintKOT(
        { cafeName: settings.cafeName, ticket, pax: 2 },
        kitchenDevice || undefined,
      );
      if (ok) toast.success(`Test KOT sent to "${kitchenDevice || 'default printer'}"`);
      else toast.error('Test print failed — check the selected printer and try again');
    } finally {
      setTestingElectron(null);
    }
  };

  const handleElectronTestBOT = async () => {
    setTestingElectron('bot');
    try {
      const ticket = makeTestTicket('BOT');
      const ok = await browserPrintBOT(
        { cafeName: settings.cafeName, ticket, pax: 2 },
        receptionDevice || undefined,
      );
      if (ok) toast.success(`Test BOT sent to "${receptionDevice || 'default printer'}"`);
      else toast.error('Test print failed — check the selected printer and try again');
    } finally {
      setTestingElectron(null);
    }
  };

  // ── WebUSB handlers ───────────────────────────────────────────────────────

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

  const handleUSBTestKOT = async () => {
    setTestingUSB('kot');
    try {
      const ticket = makeTestTicket('KOT');
      const buffer = buildKOT({ cafeName: settings.cafeName, ticket, pax: 2, buzzer: kitchenBuzzer });
      const ok = await sendRawToUSB(buffer, 'kitchen');
      if (ok) toast.success('Test KOT sent to Kitchen USB printer');
      else toast.error('Kitchen USB printer not connected — pair it first');
    } finally {
      setTestingUSB(null);
    }
  };

  const handleUSBTestBOT = async () => {
    setTestingUSB('bot');
    try {
      const ticket = makeTestTicket('BOT');
      const buffer = buildBOT({ cafeName: settings.cafeName, ticket, pax: 2 });
      const ok = await sendRawToUSB(buffer, 'reception');
      if (ok) toast.success('Test BOT / Receipt sent to Reception USB printer');
      else toast.error('Reception USB printer not connected — pair it first');
    } finally {
      setTestingUSB(null);
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const saveAll = () => {
    // Persist Electron device names
    if (inElectron) {
      saveDeviceName(KITCHEN_DEVICE_KEY,   kitchenDevice);
      saveDeviceName(RECEPTION_DEVICE_KEY, receptionDevice);
    }
    // setPrintHubEnabled persists AND notifies this tab's usePrintQueue immediately.
    setPrintHubEnabled(autoPrint);
    updateSettings({ kitchenPrinterBuzzer: kitchenBuzzer });
    toast.success('Printer settings saved');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {inElectron ? (
        <>
          {/* ── A. Kitchen Station — Electron ───────────────────────────── */}
          <ElectronStationCard
            title="Kitchen Station"
            subtitle="KOT tickets — Windows native silent print"
            printers={osPrinters}
            loadingPrinters={loadingPrinters}
            selectedPrinter={kitchenDevice}
            onSelect={handleSelectKitchen}
            testing={testingElectron === 'kot'}
            onTest={handleElectronTestKOT}
            testLabel="Test Print KOT"
            onRefresh={fetchPrinters}
          />

          {/* ── B. Reception / Bar Station — Electron ───────────────────── */}
          <ElectronStationCard
            title="Reception / Bar Station"
            subtitle="BOT tickets, pre-bills &amp; receipts — Windows native silent print"
            printers={osPrinters}
            loadingPrinters={loadingPrinters}
            selectedPrinter={receptionDevice}
            onSelect={handleSelectReception}
            testing={testingElectron === 'bot'}
            onTest={handleElectronTestBOT}
            testLabel="Test Print BOT / Receipt"
            onRefresh={fetchPrinters}
          />
        </>
      ) : (
        <>
          {/* ── A. Kitchen Station — WebUSB ──────────────────────────────── */}
          <USBStationCard
            title="Kitchen Station"
            subtitle="Pantum PD-80BW — KOT tickets"
            connected={kitchenConnected}
            printerName={kitchenName}
            pairing={pairingSlot === 'kitchen'}
            testing={testingUSB === 'kot'}
            buzzer={kitchenBuzzer}
            onBuzzerToggle={() => setKitchenBuzzer((v) => !v)}
            onPair={handlePairKitchen}
            onTest={handleUSBTestKOT}
            testLabel="Test Print KOT"
          />

          {/* ── B. Reception / Bar Station — WebUSB ─────────────────────── */}
          <USBStationCard
            title="Reception / Bar Station"
            subtitle="Pantum PD-80BW — BOT tickets, pre-bills & receipts"
            connected={receptionConnected}
            printerName={receptionName}
            pairing={pairingSlot === 'reception'}
            testing={testingUSB === 'bot'}
            onPair={handlePairReception}
            onTest={handleUSBTestBOT}
            testLabel="Test Print BOT / Receipt"
          />
        </>
      )}

      {/* ── Kitchen Buzzer (shared) ──────────────────────────────────────── */}
      {inElectron && (
        <div className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-white flex items-center gap-1.5">
                <Zap size={13} className="text-amber-400" /> Kitchen Buzzer Alarm
              </p>
              <p className="text-xs font-bold text-zinc-400 mt-0.5">
                Sound the printer bell when a new KOT arrives (if supported by the driver)
              </p>
            </div>
            <button
              onClick={() => setKitchenBuzzer((v) => !v)}
              className="flex-shrink-0 transition-all active:scale-95"
            >
              {kitchenBuzzer
                ? <ToggleRight size={36} className="text-amber-400" />
                : <ToggleLeft  size={36} className="text-zinc-500"  />}
            </button>
          </div>
        </div>
      )}

      {/* ── D. Auto-Launch on Windows Boot (Electron only) ──────────────── */}
      {inElectron && (
        <div className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-white flex items-center gap-1.5">
                <Power size={13} className="text-sky-400" /> Auto-Launch on Windows Boot
              </p>
              <p className="text-xs font-bold text-zinc-400 mt-0.5">
                Start the POS automatically when this Windows PC powers on
              </p>
            </div>
            <button
              onClick={async () => {
                const next = !autoLaunch;
                const confirmed = await window.electronAPI?.setAutoStart?.(next);
                setAutoLaunch(typeof confirmed === 'boolean' ? confirmed : next);
                toast.success(next ? 'Auto-launch enabled' : 'Auto-launch disabled');
              }}
              className="flex-shrink-0 transition-all active:scale-95"
            >
              {autoLaunch
                ? <ToggleRight size={36} className="text-sky-400" />
                : <ToggleLeft  size={36} className="text-zinc-500" />}
            </button>
          </div>
        </div>
      )}

      {/* ── E. Auto-Print Hub (shared) ───────────────────────────────────── */}
      <div className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl flex flex-col gap-5">
        <div>
          <h3 className="text-base font-black text-white tracking-wide">Auto-Print Hub</h3>
          <p className="text-xs font-bold text-zinc-400 mt-1">
            Enable only on the cashier desktop. This device will silently listen for
            new KOT / BOT tickets from every terminal and dispatch them to the printers automatically.
          </p>
        </div>

        <div className="flex items-center justify-between p-4 rounded-2xl bg-[#181B26] border border-white/10">
          <div>
            <p className="text-sm font-black text-white">
              Enable Silent Auto-Print on this Desktop
            </p>
            <p className="text-xs font-bold text-zinc-400 mt-0.5">
              {inElectron
                ? 'Listens for waiter orders in real-time and silently prints via Windows native printing.'
                : 'Listens for waiter orders in real-time and silently prints via USB ESC/POS.'}
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

      {/* ── Save button ───────────────────────────────────────────────────── */}
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
