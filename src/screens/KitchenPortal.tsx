import { useState } from 'react';
import { format } from 'date-fns';
import AppLayout from '@/components/ui/AppLayout';
import { Plus, Trash2, ChefHat, DollarSign, Layers } from 'lucide-react';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

interface ExpenseEntry {
  id: string;
  date: string;
  itemName: string;
  quantity: string;
  totalCost: number;
}

interface PrepEntry {
  id: string;
  date: string;
  meatItem: string;
  rawReceived: string;
  preppedBatches: string;
  remainingClosingStock: string;
}

// ── LocalStorage helpers ─────────────────────────────────────────────────────

const EXPENSE_KEY = 'kitchen_daily_expenses';
const PREP_KEY    = 'kitchen_prep_tracker';

function loadExpenses(): ExpenseEntry[] {
  try { return JSON.parse(localStorage.getItem(EXPENSE_KEY) || '[]'); }
  catch { return []; }
}
function saveExpenses(data: ExpenseEntry[]) {
  localStorage.setItem(EXPENSE_KEY, JSON.stringify(data));
}
function loadPrep(): PrepEntry[] {
  try { return JSON.parse(localStorage.getItem(PREP_KEY) || '[]'); }
  catch { return []; }
}
function savePrep(data: PrepEntry[]) {
  localStorage.setItem(PREP_KEY, JSON.stringify(data));
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2.5 rounded-xl text-sm text-white/90 placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40 transition-colors h-11'
  + ' bg-white/5 border border-white/10';

const CARD_STYLE: React.CSSProperties = {
  background: 'linear-gradient(160deg, #0f1929 0%, #0b1220 100%)',
  border: '1px solid rgba(249,115,22,0.18)',
  borderRadius: '1rem',
  padding: '1.25rem',
};

const today = () => format(new Date(), 'yyyy-MM-dd');

// ── Daily Expenses Tab ────────────────────────────────────────────────────────

const DailyExpensesTab = () => {
  const [entries, setEntries] = useState<ExpenseEntry[]>(loadExpenses);
  const [itemName,  setItemName]  = useState('');
  const [quantity,  setQuantity]  = useState('');
  const [totalCost, setTotalCost] = useState('');

  const handleAdd = () => {
    if (!itemName.trim())       return toast.error('Item name is required');
    if (!quantity.trim())       return toast.error('Quantity is required');
    const cost = parseFloat(totalCost);
    if (isNaN(cost) || cost < 0) return toast.error('Enter a valid total cost');

    const entry: ExpenseEntry = {
      id: crypto.randomUUID(),
      date: today(),
      itemName: itemName.trim(),
      quantity: quantity.trim(),
      totalCost: cost,
    };
    const updated = [entry, ...entries];
    setEntries(updated);
    saveExpenses(updated);
    setItemName(''); setQuantity(''); setTotalCost('');
    toast.success('Expense recorded');
  };

  const handleDelete = (id: string) => {
    const updated = entries.filter((e) => e.id !== id);
    setEntries(updated);
    saveExpenses(updated);
  };

  const todayEntries  = entries.filter((e) => e.date === today());
  const todayTotal    = todayEntries.reduce((s, e) => s + e.totalCost, 0);

  return (
    <div className="space-y-5">
      {/* Input form */}
      <div style={CARD_STYLE}>
        <h3 className="text-sm font-semibold text-orange-400/90 mb-4 flex items-center gap-2">
          <DollarSign size={15} /> Add Expense Entry
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Item Name</label>
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. Cooking Oil"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Quantity</label>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 2 kg"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Total Cost (Rs.)</label>
            <input
              value={totalCost}
              onChange={(e) => setTotalCost(e.target.value)}
              placeholder="e.g. 450"
              type="number"
              min="0"
              className={inputCls}
            />
          </div>
        </div>
        <button
          onClick={handleAdd}
          className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 hover:brightness-110"
          style={{ background: 'rgba(249,115,22,0.2)', border: '1px solid rgba(249,115,22,0.35)', color: '#fb923c' }}
        >
          <Plus size={15} /> Add Entry
        </button>
      </div>

      {/* Today's summary */}
      {todayEntries.length > 0 && (
        <div
          className="flex items-center justify-between px-4 py-3 rounded-xl"
          style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' }}
        >
          <span className="text-sm text-white/60">Today's total expenses</span>
          <span className="text-sm font-bold text-orange-400">
            Rs. {todayTotal.toLocaleString()}
          </span>
        </div>
      )}

      {/* Entries list */}
      {entries.length === 0 ? (
        <div className="text-center py-16 text-white/25 text-sm">No expenses recorded yet.</div>
      ) : (
        <div style={CARD_STYLE} className="overflow-hidden">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">All Entries</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="text-left py-2 pr-4 text-xs font-medium text-white/40">Date</th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-white/40">Item</th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-white/40">Qty</th>
                  <th className="text-right py-2 pr-4 text-xs font-medium text-white/40">Cost</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-white/5 last:border-0">
                    <td className="py-2.5 pr-4 text-white/40 text-xs whitespace-nowrap">{e.date}</td>
                    <td className="py-2.5 pr-4 text-white/80 font-medium">{e.itemName}</td>
                    <td className="py-2.5 pr-4 text-white/55">{e.quantity}</td>
                    <td className="py-2.5 pr-4 text-right font-semibold text-orange-400/90">
                      Rs. {e.totalCost.toLocaleString()}
                    </td>
                    <td className="py-2.5">
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="p-1.5 rounded-lg text-white/20 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Prep & Batch Tracker Tab ──────────────────────────────────────────────────

const PrepTrackerTab = () => {
  const [entries, setEntries] = useState<PrepEntry[]>(loadPrep);
  const [meatItem,              setMeatItem]              = useState('');
  const [rawReceived,           setRawReceived]           = useState('');
  const [preppedBatches,        setPreppedBatches]        = useState('');
  const [remainingClosingStock, setRemainingClosingStock] = useState('');

  const handleAdd = () => {
    if (!meatItem.trim())    return toast.error('Meat item is required');
    if (!rawReceived.trim()) return toast.error('Raw received amount is required');

    const entry: PrepEntry = {
      id: crypto.randomUUID(),
      date: today(),
      meatItem: meatItem.trim(),
      rawReceived: rawReceived.trim(),
      preppedBatches: preppedBatches.trim(),
      remainingClosingStock: remainingClosingStock.trim(),
    };
    const updated = [entry, ...entries];
    setEntries(updated);
    savePrep(updated);
    setMeatItem(''); setRawReceived(''); setPreppedBatches(''); setRemainingClosingStock('');
    toast.success('Prep entry recorded');
  };

  const handleDelete = (id: string) => {
    const updated = entries.filter((e) => e.id !== id);
    setEntries(updated);
    savePrep(updated);
  };

  return (
    <div className="space-y-5">
      {/* Input form */}
      <div style={CARD_STYLE}>
        <h3 className="text-sm font-semibold text-orange-400/90 mb-4 flex items-center gap-2">
          <Layers size={15} /> Add Prep Entry
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Meat Item</label>
            <input
              value={meatItem}
              onChange={(e) => setMeatItem(e.target.value)}
              placeholder="e.g. Chicken Breast"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Raw Received</label>
            <input
              value={rawReceived}
              onChange={(e) => setRawReceived(e.target.value)}
              placeholder="e.g. 5 kg"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Prepped Batches</label>
            <input
              value={preppedBatches}
              onChange={(e) => setPreppedBatches(e.target.value)}
              placeholder="e.g. 3 batches / 4.5 kg"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Remaining / Closing Stock</label>
            <input
              value={remainingClosingStock}
              onChange={(e) => setRemainingClosingStock(e.target.value)}
              placeholder="e.g. 0.5 kg"
              className={inputCls}
            />
          </div>
        </div>
        <button
          onClick={handleAdd}
          className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 hover:brightness-110"
          style={{ background: 'rgba(249,115,22,0.2)', border: '1px solid rgba(249,115,22,0.35)', color: '#fb923c' }}
        >
          <Plus size={15} /> Add Entry
        </button>
      </div>

      {/* Entries list */}
      {entries.length === 0 ? (
        <div className="text-center py-16 text-white/25 text-sm">No prep entries recorded yet.</div>
      ) : (
        <div style={CARD_STYLE} className="overflow-hidden">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">All Entries</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="text-left py-2 pr-4 text-xs font-medium text-white/40">Date</th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-white/40">Meat Item</th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-white/40">Raw Received</th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-white/40">Prepped</th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-white/40">Closing Stock</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-white/5 last:border-0">
                    <td className="py-2.5 pr-4 text-white/40 text-xs whitespace-nowrap">{e.date}</td>
                    <td className="py-2.5 pr-4 text-white/80 font-medium">{e.meatItem}</td>
                    <td className="py-2.5 pr-4 text-white/55">{e.rawReceived || '—'}</td>
                    <td className="py-2.5 pr-4 text-white/55">{e.preppedBatches || '—'}</td>
                    <td className="py-2.5 pr-4 text-white/55">{e.remainingClosingStock || '—'}</td>
                    <td className="py-2.5">
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="p-1.5 rounded-lg text-white/20 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Kitchen Portal ────────────────────────────────────────────────────────────

type KitchenTab = 'expenses' | 'prep';

const TAB_BTN_BASE =
  'px-5 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 flex items-center gap-2';

const KitchenPortal = () => {
  const [activeTab, setActiveTab] = useState<KitchenTab>('expenses');

  return (
    <AppLayout title="Kitchen Portal">
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">

        {/* Portal header */}
        <div className="flex items-center gap-3">
          <div
            className="p-2.5 rounded-xl"
            style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)' }}
          >
            <ChefHat size={20} className="text-orange-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white/90">Kitchen Portal</h1>
            <p className="text-xs text-white/40">{format(new Date(), 'EEEE, dd MMM yyyy')}</p>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('expenses')}
            className={TAB_BTN_BASE}
            style={activeTab === 'expenses' ? {
              background: 'rgba(249,115,22,0.2)',
              border: '1px solid rgba(249,115,22,0.35)',
              color: '#fb923c',
            } : {
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.45)',
            }}
          >
            <DollarSign size={14} /> Daily Expenses
          </button>
          <button
            onClick={() => setActiveTab('prep')}
            className={TAB_BTN_BASE}
            style={activeTab === 'prep' ? {
              background: 'rgba(249,115,22,0.2)',
              border: '1px solid rgba(249,115,22,0.35)',
              color: '#fb923c',
            } : {
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.45)',
            }}
          >
            <Layers size={14} /> Prep &amp; Batch Tracker
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'expenses' && <DailyExpensesTab />}
        {activeTab === 'prep'     && <PrepTrackerTab />}

      </div>
    </AppLayout>
  );
};

export default KitchenPortal;
