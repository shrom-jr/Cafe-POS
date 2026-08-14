/**
 * PrinterSettingsModal.tsx
 *
 * Hardware printer configuration for the 80mm thermal print pipeline:
 *   • Kitchen Printer  — Wi-Fi IP + port + buzzer toggle + Test Print KOT
 *   • Reception Printer — connection mode (Browser / USB / Network) + Test Print
 *   • Auto-Print Hub    — enable the background auto-print listener on THIS device
 *
 * Settings persist through usePOSStore.updateSettings which already syncs to
 * Firebase, so every terminal sees the same printer addresses while the
 * auto-print toggle is intended to be switched ON only at the cashier desktop.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Printer, Save, ToggleLeft, ToggleRight, Zap } from 'lucide-react';
import { usePOSStore } from '@/store/usePOSStore';
import { buildKOT, buildBOT, sendToNetworkPrinter } from '@/utils/escpos';
import { firePrintJob } from '@/utils/printEngine';
import { Ticket } from '@/types/pos';

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 h-11 transition-colors';

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

const PrinterSettingsSection = () => {
  const settings = usePOSStore((s) => s.settings);
  const updateSettings = usePOSStore((s) => s.updateSettings);

  const [kitchenIp, setKitchenIp] = useState(settings.kitchenPrinterIp ?? '');
  const [kitchenPort, setKitchenPort] = useState(String(settings.kitchenPrinterPort ?? 9100));
  const [kitchenBuzzer, setKitchenBuzzer] = useState(settings.kitchenPrinterBuzzer ?? false);
  const [receptionMode, setReceptionMode] = useState<'browser' | 'usb' | 'network'>(
    settings.receptionPrinterMode ?? 'browser',
  );
  const [receptionIp, setReceptionIp] = useState(settings.receptionPrinterIp ?? '');
  const [receptionPort, setReceptionPort] = useState(String(settings.receptionPrinterPort ?? 9100));
  const [autoPrint, setAutoPrint] = useState(settings.autoPrintEnabled ?? false);
  const [testing, setTesting] = useState<'kot' | 'bot' | null>(null);

  const saveAll = () => {
    updateSettings({
      kitchenPrinterIp: kitchenIp.trim() || undefined,
      kitchenPrinterPort: Number(kitchenPort) || 9100,
      kitchenPrinterBuzzer: kitchenBuzzer,
      receptionPrinterMode: receptionMode,
      receptionPrinterIp: receptionIp.trim() || undefined,
      receptionPrinterPort: Number(receptionPort) || 9100,
      autoPrintEnabled: autoPrint,
    });
    toast.success('Printer settings saved');
  };

  const handleTestKOT = async () => {
    setTesting('kot');
    const ticket = makeTestTicket('KOT');
    try {
      if (kitchenIp.trim()) {
        const buffer = buildKOT({
          cafeName: settings.cafeName,
          ticket,
          pax: 2,
          buzzer: kitchenBuzzer,
        });
        const result = await sendToNetworkPrinter(buffer, kitchenIp.trim(), Number(kitchenPort) || 9100);
        if (result === 'ok') {
          toast.success('Test KOT sent to kitchen printer');
        } else {
          toast.error('Kitchen printer unreachable — check IP/port. Printed via browser instead.');
          fireBrowserKOT(ticket);
        }
      } else {
        fireBrowserKOT(ticket);
        toast.info('No kitchen IP set — printed via browser dialog');
      }
    } finally {
      setTesting(null);
    }
  };

  const fireBrowserKOT = (ticket: Ticket) => {
    firePrintJob({
      type: 'KITCHEN_KOT',
      data: {
        cafeName: settings.cafeName,
        tableNumber: ticket.tableName,
        pax: 2,
        kotNumber: ticket.ticketNumber,
        timestamp: Date.now(),
        items: ticket.items.map((i) => ({ name: i.name, quantity: i.quantity })),
        serverName: ticket.serverName,
      },
    });
  };

  const handleTestReception = async () => {
    setTesting('bot');
    const ticket = makeTestTicket('BOT');
    try {
      if (receptionMode === 'network' && receptionIp.trim()) {
        const buffer = buildBOT({ cafeName: settings.cafeName, ticket, pax: 2 });
        const result = await sendToNetworkPrinter(buffer, receptionIp.trim(), Number(receptionPort) || 9100);
        if (result === 'ok') {
          toast.success('Test BOT sent to reception printer');
        } else {
          toast.error('Reception printer unreachable — check IP/port. Printed via browser instead.');
          fireBrowserBOT(ticket);
        }
      } else {
        // Browser / USB mode both use the OS print dialog (USB printers appear
        // as system printers when installed with their driver).
        fireBrowserBOT(ticket);
        toast.info('Printed via browser print dialog');
      }
    } finally {
      setTesting(null);
    }
  };

  const fireBrowserBOT = (ticket: Ticket) => {
    // Reuse the KOT browser layout with a BAR heading via the print engine.
    firePrintJob({
      type: 'KITCHEN_KOT',
      data: {
        cafeName: `${settings.cafeName} — BAR/BOT`,
        tableNumber: ticket.tableName,
        pax: 2,
        kotNumber: ticket.ticketNumber,
        timestamp: Date.now(),
        items: ticket.items.map((i) => ({ name: i.name, quantity: i.quantity })),
        serverName: ticket.serverName,
      },
    });
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
              Pantum PD-80BW or any 80mm ESC/POS printer on Wi-Fi
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-200 block mb-1.5">Wi-Fi IP Address</label>
            <input
              value={kitchenIp}
              onChange={(e) => setKitchenIp(e.target.value)}
              placeholder="192.168.1.200"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-200 block mb-1.5">Port</label>
            <input
              value={kitchenPort}
              onChange={(e) => setKitchenPort(e.target.value)}
              type="number"
              placeholder="9100"
              className={inputCls}
            />
          </div>
        </div>
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
        <div>
          <label className="text-xs font-medium text-slate-200 block mb-1.5">Connection Mode</label>
          <div className="flex gap-2">
            {([
              { id: 'browser', label: 'Browser' },
              { id: 'usb', label: 'Local USB' },
              { id: 'network', label: 'Network IP' },
            ] as { id: 'browser' | 'usb' | 'network'; label: string }[]).map((m) => (
              <button
                key={m.id}
                onClick={() => setReceptionMode(m.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                  receptionMode === m.id
                    ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                    : 'border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.05]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {receptionMode === 'network' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-200 block mb-1.5">IP Address</label>
              <input
                value={receptionIp}
                onChange={(e) => setReceptionIp(e.target.value)}
                placeholder="192.168.1.201"
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-200 block mb-1.5">Port</label>
              <input
                value={receptionPort}
                onChange={(e) => setReceptionPort(e.target.value)}
                type="number"
                placeholder="9100"
                className={inputCls}
              />
            </div>
          </div>
        )}
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
