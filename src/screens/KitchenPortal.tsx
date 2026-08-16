import { useState } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import AppLayout from '@/components/ui/AppLayout';
import { Plus, ChefHat, DollarSign, Flame, AlertTriangle, Trash2, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { useKitchenPurchasesStore } from '@/store/useKitchenPurchasesStore';
import { useMeatTrackerStore } from '@/store/useMeatTrackerStore';
import type { MeatEntry, MeatAction } from '@/store/useMeatTrackerStore';

// ── Types ────────────────────────────────────────────────────────────────────

type PurchaseCategory = 'Meats' | 'Groceries & Supplies' | 'Custom';

interface PurchaseEntry {
  id: string;
  date: string;              // yyyy-MM-dd
  time: string;              // HH:mm
  itemName: string;
  category: PurchaseCategory;
  quantity: string;          // formatted: "5 kg", "2 L"
  rate: number;
  totalCost: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MEAT_ITEMS        = ['Chicken', 'Mutton', 'Pork', 'Fish'] as const;
const GROCERY_ITEMS     = ['Cooking Oil', 'Salt', 'Rice', 'Vegetables', 'Spices', 'Gas Cylinder'] as const;
const UNIT_OPTIONS      = ['kg', 'L', 'pcs', 'packets', 'bags', 'custom'] as const;
const MEAT_UNIT_OPTIONS = ['kg', 'pcs', 'skewers', 'custom'] as const;
const CUSTOM_SENTINEL   = '__custom__';
const CUSTOM_UNIT       = 'custom';

/** Infer category from item name when the stored category field is missing (legacy entries). */
const inferCategory = (itemName: string): PurchaseCategory =>
  (MEAT_ITEMS as readonly string[]).some((m) => norm(m) === norm(itemName))
    ? 'Meats'
    : 'Groceries & Supplies';


// ── Pure helpers ──────────────────────────────────────────────────────────────

const todayStr     = () => format(new Date(), 'yyyy-MM-dd');
const yesterdayStr = () => format(subDays(new Date(), 1), 'yyyy-MM-dd');
const timeStr      = () => format(new Date(), 'HH:mm');

/** Format a yyyy-MM-dd string for display: "July 29, 2026" */
const fmtDisplayDate = (d: string) => format(parseISO(d), 'MMMM d, yyyy');

/** Extract leading numeric value: "5 kg" → 5 */
const parseQty = (s: string): number => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };

/** Strip leading number to get unit: "5 kg" → "kg" */
const extractUnit = (s: string): string => s.replace(/^[\d.]+\s*/, '').trim();

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Meat pool = DEFAULT_MEATS + any items from today's purchases that are
 * in the Meats category (case-insensitive dedup).
 */
const buildMeatPool = (purchases: PurchaseEntry[]): string[] => {
  const today = todayStr();
  const seen  = new Set(MEAT_ITEMS.map(norm));
  const pool  = [...MEAT_ITEMS] as string[];

  for (const p of purchases) {
    if (p.date === today && p.category === 'Meats') {
      const key = norm(p.itemName);
      if (!seen.has(key)) { pool.push(p.itemName.trim()); seen.add(key); }
    }
  }
  return pool;
};

interface MeatBalance {
  rawPurchased: number;
  totalMarinated: number;
  readyForGrill: number;
  totalKeema: number;
  unit: string;
}

/** All-time cumulative balance for one meat item (ignores date — carries across midnight) */
const calcBalance = (
  item: string,
  purchases: PurchaseEntry[],
  meatEntries: MeatEntry[],
): MeatBalance => {
  const allPurchases = purchases.filter((p) => norm(p.itemName) === norm(item));
  const rawPurchased = allPurchases.reduce((s, p) => s + parseQty(p.quantity), 0);
  const unit         = allPurchases[0] ? extractUnit(allPurchases[0].quantity) : 'kg';

  const allMeat        = meatEntries.filter((e) => norm(e.meatItem) === norm(item));
  const totalMarinated = allMeat.filter((e) => e.action === 'Marinated')
    .reduce((s, e) => s + parseQty(e.quantity), 0);
  const totalMinced    = allMeat.filter((e) => e.action === 'Minced (Keema)')
    .reduce((s, e) => s + parseQty(e.quantity), 0);
  const totalSentToGrill = allMeat.filter((e) => e.action === 'Sent to Grill')
    .reduce((s, e) => s + parseQty(e.quantity), 0);

  return {
    rawPurchased,
    totalMarinated,
    readyForGrill: totalMarinated - totalSentToGrill,
    totalKeema: totalMinced,
    unit,
  };
};

// ── Shared styles ─────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: '#13151F',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '1rem',
  padding: '1.5rem',
  boxShadow: '0 12px 30px rgba(0,0,0,0.24)',
};

const inputCls =
  'w-full bg-[#181B26] border-2 border-white/20 focus:border-amber-400 text-white font-bold rounded-xl px-4 py-3 text-sm placeholder:text-zinc-500 outline-none transition-all';

const selectCls =
  'w-full bg-[#181B26] border-2 border-white/20 focus:border-amber-400 text-white font-bold rounded-xl px-4 py-3 text-sm outline-none transition-all appearance-none cursor-pointer';

const TH = 'text-left py-3.5 pr-3 text-xs font-black uppercase tracking-wider text-zinc-300 whitespace-nowrap';
const TD = 'py-3.5 pr-3 text-sm';

const Chevron = () => (
  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/30">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  </div>
);

const ACTION_BADGE: Record<MeatAction, React.CSSProperties> = {
  'Marinated':      { background: 'rgba(249,115,22,0.18)', border: '1px solid rgba(249,115,22,0.4)',  color: '#fb923c' },
  'Minced (Keema)': { background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.4)', color: '#a78bfa' },
  'Sent to Grill':  { background: 'rgba(34,197,94,0.15)',  border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80' },
};
// ── Balance Cards ─────────────────────────────────────────────────────────────

const BalanceCards = ({ bal }: { bal: MeatBalance }) => {
  const u    = bal.unit || 'kg';
  const fmt2 = (n: number) => +n.toFixed(2);

  const cards: {
    label: string;
    value: number;
    containerClass: string;
    labelClass: string;
    valueClass: string;
  }[] = [
    {
      label: 'Total Raw Purchased',
      value: fmt2(bal.rawPurchased),
      containerClass: 'p-5 rounded-2xl bg-[#13151F] border border-amber-500/40 shadow-lg shadow-amber-500/5',
      labelClass: 'text-amber-300',
      valueClass: 'text-amber-400',
    },
    {
      label: 'Total Marinated',
      value: fmt2(bal.totalMarinated),
      containerClass: 'p-5 rounded-2xl bg-[#13151F] border border-sky-500/40 shadow-lg shadow-sky-500/5',
      labelClass: 'text-sky-300',
      valueClass: 'text-sky-400',
    },
    {
      label: 'Ready for Grill',
      value: fmt2(bal.readyForGrill),
      containerClass: 'p-5 rounded-2xl bg-[#13151F] border border-emerald-500/40 shadow-lg shadow-emerald-500/5',
      labelClass: 'text-emerald-300',
      valueClass: 'text-emerald-400',
    },
    {
      label: 'Total Keema Stock',
      value: fmt2(bal.totalKeema),
      containerClass: 'p-5 rounded-2xl bg-[#13151F] border border-purple-500/40 shadow-lg shadow-purple-500/5',
      labelClass: 'text-purple-300',
      valueClass: 'text-purple-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((c) => (
        <div key={c.label} className={c.containerClass}>
          <p className={`text-[11px] font-black uppercase tracking-wider ${c.labelClass}`}>{c.label}</p>
          <p className={`text-3xl font-black mt-1 ${c.valueClass}`}>
            {c.value}<span className="text-xs font-black text-zinc-300 ml-1">{u}</span>
          </p>
        </div>
      ))}
    </div>
  );
};

// ── Date Filter Bar ───────────────────────────────────────────────────────────

const DateFilterBar = ({ viewDate, onChange }: { viewDate: string; onChange: (d: string) => void }) => {
  const today     = todayStr();
  const yesterday = yesterdayStr();
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => onChange(today)}
        className={viewDate === today
          ? 'px-4 py-1.5 rounded-xl bg-white/15 border border-white/30 text-white text-xs font-black transition-all active:scale-95'
          : 'px-4 py-1.5 rounded-xl bg-white/5 border border-white/10 text-zinc-300 hover:text-white text-xs font-bold transition-all active:scale-95'}
      >
        Today
      </button>
      <button
        onClick={() => onChange(yesterday)}
        className={viewDate === yesterday
          ? 'px-4 py-1.5 rounded-xl bg-white/15 border border-white/30 text-white text-xs font-black transition-all active:scale-95'
          : 'px-4 py-1.5 rounded-xl bg-white/5 border border-white/10 text-zinc-300 hover:text-white text-xs font-bold transition-all active:scale-95'}
      >
        Yesterday
      </button>
      <div className="relative flex items-center">
        <Calendar className="pointer-events-none absolute left-2 text-orange-400 w-3.5 h-3.5 z-10" />
        <input
          type="date"
          value={viewDate}
          max={today}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className={`pl-7 pr-2.5 py-1.5 rounded-xl text-xs cursor-pointer [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0 ${
            viewDate !== today && viewDate !== yesterday
              ? 'bg-white/15 border border-white/30 text-white font-black'
              : 'bg-white/5 border border-white/10 text-zinc-300 font-bold'
          }`}
        />
      </div>
    </div>
  );
};

// ── Tab 1: Daily Kitchen Expenses ─────────────────────────────────────────────

interface PurchasesTabProps {
  purchases: PurchaseEntry[];
  onPurchaseAdded: (entry: PurchaseEntry) => void;
  onPurchaseDeleted: (id: string) => void;
}

const PurchasesTab = ({ purchases, onPurchaseAdded, onPurchaseDeleted }: PurchasesTabProps) => {
  // Item selection
  const [selectedItem, setSelectedItem] = useState<string>(MEAT_ITEMS[0]);
  const [customItem,   setCustomItem]   = useState('');
  const isCustomItem = selectedItem === CUSTOM_SENTINEL;

  // Quantity split
  const [qtyValue,    setQtyValue]    = useState('');
  const [qtyUnit,     setQtyUnit]     = useState<string>('kg');
  const [customUnit,  setCustomUnit]  = useState('');
  const isCustomUnit = qtyUnit === CUSTOM_UNIT;

  // Rate / cost
  const [rate,       setRate]       = useState('');
  const [totalCost,  setTotalCost]  = useState('');
  const [costEdited, setCostEdited] = useState(false);

  // Entry date (for backdated logging) + view date (for filtering the table)
  const [entryDate, setEntryDate] = useState(todayStr);
  const [viewDate,  setViewDate]  = useState(todayStr);

  // Derive display values
  const resolvedItem = isCustomItem ? customItem.trim() : selectedItem;
  const resolvedUnit = isCustomUnit ? customUnit.trim() || 'unit' : qtyUnit;

  // Determine category from selected item
  const resolvedCategory = (): PurchaseCategory => {
    if (isCustomItem) return 'Custom';
    if ((MEAT_ITEMS as readonly string[]).includes(selectedItem)) return 'Meats';
    return 'Groceries & Supplies';
  };

  const autoCalc = (qty: string, r: string) => {
    const n = parseFloat(qty); const rv = parseFloat(r);
    return !isNaN(n) && !isNaN(rv) ? (n * rv).toFixed(2) : '';
  };

  const handleQtyChange = (v: string) => {
    setQtyValue(v);
    if (!costEdited) setTotalCost(autoCalc(v, rate));
  };
  const handleRateChange = (v: string) => {
    setRate(v);
    if (!costEdited) setTotalCost(autoCalc(qtyValue, v));
  };
  const handleCostChange = (v: string) => { setTotalCost(v); setCostEdited(true); };

  const reset = () => {
    setSelectedItem(MEAT_ITEMS[0]);
    setCustomItem('');
    setQtyValue('');
    setQtyUnit('kg');
    setCustomUnit('');
    setRate('');
    setTotalCost('');
    setCostEdited(false);
    setEntryDate(todayStr());
  };

  const handleAdd = () => {
    if (!resolvedItem) return toast.error('Item name is required');
    if (!qtyValue.trim() || parseFloat(qtyValue) <= 0) return toast.error('Enter a valid quantity');
    const r = parseFloat(rate);
    const c = parseFloat(totalCost);
    if (isNaN(r) || r < 0) return toast.error('Enter a valid rate');
    if (isNaN(c) || c < 0) return toast.error('Enter a valid total cost');

    onPurchaseAdded({
      id: crypto.randomUUID(),
      date: entryDate,
      time: timeStr(),
      itemName: resolvedItem,
      category: resolvedCategory(),
      quantity: `${parseFloat(qtyValue)} ${resolvedUnit}`,
      rate: r,
      totalCost: c,
    });
    reset();
    toast.success('Purchase logged');
  };

  const viewEntries = purchases.filter((e) => e.date === viewDate);
  const viewTotal   = viewEntries.reduce((s, e) => s + e.totalCost, 0);

  return (
    <div className="space-y-5">
      {/* Form */}
      <div style={CARD} className="mt-6">
        <h3 className="text-base font-black text-white flex items-center gap-2 mb-4">
          <DollarSign size={15} /> Log Kitchen Purchase
        </h3>

        <div className="flex flex-wrap items-end gap-4">

          {/* Date — for backdated logging */}
          <div className="w-44">
            <label className="text-xs font-black uppercase tracking-wider text-amber-400 dark:text-amber-400 mb-1.5 block">
              Date
              <span className="ml-2 text-zinc-400 font-normal normal-case tracking-normal">defaults to today</span>
            </label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-orange-400 w-5 h-5 z-10" />
              <input
                type="date"
                value={entryDate}
                max={todayStr()}
                onChange={(e) => e.target.value && setEntryDate(e.target.value)}
                onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker?.(); } catch { /* cross-origin iframe */ } }}
                className={`${inputCls} pl-10 cursor-pointer [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0`}
              />
            </div>
          </div>

          {/* Item Name — grouped dropdown */}
          <div className="w-52 space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-amber-400 dark:text-amber-400 mb-1.5 block">Item Name</label>
            <div className="relative">
              <select
                value={selectedItem}
                onChange={(e) => { setSelectedItem(e.target.value); setCustomItem(''); }}
                className={selectCls}
              >
                <optgroup label="Meats">
                  {MEAT_ITEMS.map((m) => (
                    <option key={m} value={m} className="bg-[#0f1929] text-white">{m}</option>
                  ))}
                </optgroup>
                <optgroup label="Groceries &amp; Supplies">
                  {GROCERY_ITEMS.map((g) => (
                    <option key={g} value={g} className="bg-[#0f1929] text-white">{g}</option>
                  ))}
                </optgroup>
                <option value={CUSTOM_SENTINEL} className="bg-[#0f1929] text-orange-300">
                  Custom Item...
                </option>
              </select>
              <Chevron />
            </div>
            {isCustomItem && (
              <input
                value={customItem}
                onChange={(e) => setCustomItem(e.target.value)}
                placeholder="Enter item name"
                className={inputCls}
                autoFocus
              />
            )}
          </div>

          {/* Quantity — value + unit side by side */}
          <div className="w-44">
            <label className="text-xs font-black uppercase tracking-wider text-amber-400 dark:text-amber-400 mb-1.5 block">Quantity</label>
            <div className="flex gap-2">
              <input
                value={qtyValue}
                onChange={(e) => handleQtyChange(e.target.value)}
                placeholder="e.g. 5"
                type="number"
                inputMode="decimal"
                min="0"
                className={`${inputCls} flex-1 min-w-0`}
              />
              <div className="relative w-24 flex-shrink-0">
                <select
                  value={qtyUnit}
                  onChange={(e) => setQtyUnit(e.target.value)}
                  className={selectCls}
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u} className="bg-[#0f1929] text-white">
                      {u === CUSTOM_UNIT ? 'custom...' : u}
                    </option>
                  ))}
                </select>
                <Chevron />
              </div>
            </div>
            {isCustomUnit && (
              <input
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                placeholder="Enter unit (e.g. skewers)"
                className={`${inputCls} mt-2`}
              />
            )}
          </div>

          {/* Rate */}
          <div className="w-32">
            <label className="text-xs font-black uppercase tracking-wider text-amber-400 dark:text-amber-400 mb-1.5 block">Rate / Price (Rs.)</label>
            <input
              value={rate}
              onChange={(e) => handleRateChange(e.target.value)}
              placeholder="e.g. 180"
              type="number"
              inputMode="decimal"
              min="0"
              className={inputCls}
            />
          </div>

          {/* Total Cost */}
          <div className="w-32">
            <label className="text-xs font-black uppercase tracking-wider text-amber-400 dark:text-amber-400 mb-1.5 block">
              Total (Rs.)
              <span className="ml-1.5 text-zinc-400 font-normal normal-case tracking-normal">auto-calc</span>
            </label>
            <input
              value={totalCost}
              onChange={(e) => handleCostChange(e.target.value)}
              onFocus={() => setCostEdited(true)}
              placeholder="e.g. 900"
              type="number"
              inputMode="decimal"
              min="0"
              className={inputCls}
            />
          </div>

          <button
            onClick={handleAdd}
            className="px-6 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all active:scale-95 flex items-center justify-center gap-2 self-end h-[48px]"
          >
            <Plus size={15} /> Log Purchase
          </button>
        </div>
      </div>

      {/* Date filter bar */}
      <DateFilterBar viewDate={viewDate} onChange={setViewDate} />

      {/* Spend total for viewed date */}
      {viewEntries.length > 0 && (
        <div
          className="flex items-center justify-between px-4 py-3 rounded-xl"
          style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' }}
        >
          <span className="text-sm text-white/55">Total spend · {fmtDisplayDate(viewDate)}</span>
          <span className="text-sm font-bold text-orange-400">
            Rs. {viewTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}

      {/* Purchases table */}
      {viewEntries.length > 0 ? (
        <div style={CARD} className="overflow-hidden">
          <h3 className="text-xs font-semibold text-white/35 uppercase tracking-widest mb-3">
            Purchases for {fmtDisplayDate(viewDate)}
          </h3>
          <div className="max-h-[320px] overflow-y-auto overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-white/8" style={{ background: '#0b1220' }}>
                  <th className={TH}>Item</th>
                  <th className={TH}>Category</th>
                  <th className={TH}>Quantity</th>
                  <th className={TH}>Rate (Rs.)</th>
                  <th className={TH}>Total (Rs.)</th>
                  <th className={TH}>Time</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {viewEntries.map((e) => (
                  <tr key={e.id} className="border-b border-white/5 last:border-0">
                    <td className={`${TD} text-white/85 font-medium`}>{e.itemName}</td>
                    <td className={`${TD} text-white/40 text-xs`}>{e.category ?? inferCategory(e.itemName)}</td>
                    <td className={`${TD} text-white/55`}>{e.quantity}</td>
                    <td className={`${TD} text-white/55`}>{e.rate.toLocaleString()}</td>
                    <td className={`${TD} font-semibold text-orange-400/90`}>
                      {e.totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </td>
                    <td className={`${TD} text-white/35 text-xs`}>{e.time}</td>
                    <td className={TD}>
                      <button
                        onClick={() => {
                          if (window.confirm('Delete this purchase record?')) {
                            onPurchaseDeleted(e.id);
                          }
                        }}
                        className="flex items-center justify-center w-8 h-8 rounded-xl transition-all
                          text-white/30 hover:text-red-400 hover:bg-red-500/20 active:scale-90"
                        title="Delete purchase"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="mt-8 p-12 rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.02] flex flex-col items-center justify-center text-center">
          <p className="text-sm font-bold text-zinc-200">No purchases or meat logs recorded for this date.</p>
        </div>
      )}
    </div>
  );
};

// ── Tab 2: Meat Tracker ───────────────────────────────────────────────────────

interface MeatTrackerTabProps {
  purchases: PurchaseEntry[];
  meatEntries: MeatEntry[];
  onMeatAdded: (entry: MeatEntry) => void;
  onMeatDeleted: (id: string) => void;
}

const MeatTrackerTab = ({ purchases, meatEntries, onMeatAdded, onMeatDeleted }: MeatTrackerTabProps) => {
  const pool = buildMeatPool(purchases);

  const [selectedItem,  setSelectedItem]  = useState<string>(pool[0]);
  const [action,        setAction]        = useState<MeatAction>('Marinated');
  const [meatQtyValue,  setMeatQtyValue]  = useState('');
  const [meatQtyUnit,   setMeatQtyUnit]   = useState<string>('kg');
  const [meatCustomUnit,setMeatCustomUnit]= useState('');

  // Entry date (for backdated logging) + view date (for filtering the log table)
  const [entryDate, setEntryDate] = useState(todayStr);
  const [viewDate,  setViewDate]  = useState(todayStr);

  const isCustomMeatUnit = meatQtyUnit === CUSTOM_UNIT;
  const resolvedMeatUnit = isCustomMeatUnit ? (meatCustomUnit.trim() || 'unit') : meatQtyUnit;

  // Keep selectedItem valid if pool changes
  const effectiveItem = pool.includes(selectedItem) ? selectedItem : pool[0];

  const bal        = calcBalance(effectiveItem, purchases, meatEntries);
  const enteredQty = parseFloat(meatQtyValue) || 0;

  // Hard stock checks — all-time cumulative values, no date filter
  const availableForAction =
    action === 'Sent to Grill' ? bal.readyForGrill : bal.rawPurchased;
  const stockExceeded =
    meatQtyValue.trim() !== '' &&
    enteredQty > 0 &&
    enteredQty > availableForAction;
  const stockLabel =
    action === 'Sent to Grill' ? 'Ready for Grill' : 'Total Raw Purchased';

  const resetQty = () => {
    setMeatQtyValue('');
    setMeatQtyUnit('kg');
    setMeatCustomUnit('');
    setEntryDate(todayStr());
  };

  const handleAdd = () => {
    if (!effectiveItem) return toast.error('Select a meat item');
    if (!meatQtyValue.trim() || enteredQty <= 0) return toast.error('Enter a valid quantity');
    if (stockExceeded) return toast.error('Insufficient stock available for this action.');

    onMeatAdded({
      id: crypto.randomUUID(),
      date: entryDate,
      time: timeStr(),
      meatItem: effectiveItem,
      action,
      quantity: `${enteredQty} ${resolvedMeatUnit}`,
    });
    resetQty();
    toast.success('Meat action recorded');
  };

  const viewEntries = meatEntries.filter((e) => e.date === viewDate);

  return (
    <div className="space-y-5">

      {/* Live balance cards */}
      <div style={CARD}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-zinc-300">
            Live Inventory Balance
          </h3>
          <div className="relative">
            <select
              value={effectiveItem}
              onChange={(e) => setSelectedItem(e.target.value)}
              className="bg-[#181B26] border border-white/20 text-white text-xs font-black rounded-xl px-4 py-2 pr-8 outline-none focus:border-amber-400 cursor-pointer appearance-none"
            >
              {pool.map((item) => (
                <option key={item} value={item} className="bg-[#0f1929] text-white">{item}</option>
              ))}
            </select>
            <Chevron />
          </div>
        </div>
        <BalanceCards bal={bal} />
      </div>

      {/* Form */}
      <div style={CARD}>
        <h3 className="text-base font-black text-white flex items-center gap-2 mb-4">
          <Flame size={15} /> Record Meat Action
        </h3>

        <div className="flex flex-wrap items-end gap-4">
          {/* Date — for backdated logging */}
          <div className="w-44">
            <label className="text-xs font-black uppercase tracking-wider text-amber-400 dark:text-amber-400 mb-1.5 block">
              Date
              <span className="ml-2 text-zinc-400 font-normal normal-case tracking-normal">defaults to today</span>
            </label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-orange-400 w-5 h-5 z-10" />
              <input
                type="date"
                value={entryDate}
                max={todayStr()}
                onChange={(e) => e.target.value && setEntryDate(e.target.value)}
                onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker?.(); } catch { /* cross-origin iframe */ } }}
                className={`${inputCls} pl-10 cursor-pointer [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0`}
              />
            </div>
          </div>

          {/* Action toggle — 3 buttons */}
          <div className="w-auto max-w-[420px]">
            <label className="text-xs font-black uppercase tracking-wider text-amber-400 dark:text-amber-400 mb-1.5 block">Action Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(['Marinated', 'Minced (Keema)', 'Sent to Grill'] as MeatAction[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAction(a)}
                  className={action === a
                    ? 'px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider border-2 border-amber-400 shadow-md shadow-amber-500/20 transition-all active:scale-95'
                    : 'px-4 py-2.5 rounded-xl bg-white/5 text-zinc-200 hover:text-white border border-white/15 hover:bg-white/10 text-xs font-black uppercase tracking-wider transition-all active:scale-95'}
                >
                  {a === 'Marinated' ? '🧂 Marinated' : a === 'Minced (Keema)' ? '🥩 Minced (Keema)' : '🔥 Sent to Grill'}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity — value + unit */}
          <div className="w-44">
            <label className="text-xs font-black uppercase tracking-wider text-amber-400 dark:text-amber-400 mb-1.5 block">Quantity</label>
            <div className="flex gap-2">
              <input
                value={meatQtyValue}
                onChange={(e) => setMeatQtyValue(e.target.value)}
                placeholder="e.g. 5"
                type="number"
                inputMode="decimal"
                min="0"
                className={`${inputCls} flex-1 min-w-0`}
              />
              <div className="relative w-24 flex-shrink-0">
                <select
                  value={meatQtyUnit}
                  onChange={(e) => setMeatQtyUnit(e.target.value)}
                  className={selectCls}
                >
                  {MEAT_UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u} className="bg-[#0f1929] text-white">
                      {u === CUSTOM_UNIT ? 'custom...' : u}
                    </option>
                  ))}
                </select>
                <Chevron />
              </div>
            </div>
            {/* Custom unit input */}
            {isCustomMeatUnit && (
              <input
                value={meatCustomUnit}
                onChange={(e) => setMeatCustomUnit(e.target.value)}
                placeholder="Enter unit (e.g. portions)"
                className={`${inputCls} mt-2`}
              />
            )}

            {/* Hard block — quantity exceeds available stock */}
            {stockExceeded && (
              <div
                className="mt-2 flex items-start gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                <AlertTriangle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-400/90">
                  Insufficient stock. Entered {enteredQty} {resolvedMeatUnit} but only{' '}
                  {+availableForAction.toFixed(2)} {bal.unit} available ({stockLabel}).
                </p>
              </div>
            )}
          </div>

          <button
            onClick={handleAdd}
            className="px-6 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all active:scale-95 self-end h-[48px] flex items-center gap-2"
          >
            <Plus size={15} /> Record Meat Action
          </button>
        </div>
      </div>

      {/* Date filter bar */}
      <DateFilterBar viewDate={viewDate} onChange={setViewDate} />

      {/* Meat log table */}
      {viewEntries.length > 0 ? (
        <div style={CARD} className="overflow-hidden">
          <h3 className="text-xs font-semibold text-white/35 uppercase tracking-widest mb-3">
            Meat Log for {fmtDisplayDate(viewDate)}
          </h3>
          <div className="max-h-[320px] overflow-y-auto overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-white/8" style={{ background: '#0b1220' }}>
                  <th className={TH}>Meat Item</th>
                  <th className={TH}>Action</th>
                  <th className={TH}>Quantity</th>
                  <th className={TH}>Timestamp</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {viewEntries.map((e) => (
                  <tr key={e.id} className="border-b border-white/5 last:border-0">
                    <td className={`${TD} text-white/85 font-medium`}>{e.meatItem}</td>
                    <td className={TD}>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold"
                        style={ACTION_BADGE[e.action]}>
                        {e.action}
                      </span>
                    </td>
                    <td className={`${TD} text-white/55`}>{e.quantity}</td>
                    <td className={`${TD} text-white/35 text-xs`}>{e.time}</td>
                    <td className={TD}>
                      <button
                        onClick={() => {
                          if (window.confirm('Delete this meat action?')) {
                            onMeatDeleted(e.id);
                          }
                        }}
                        className="flex items-center justify-center w-8 h-8 rounded-xl transition-all
                          text-white/30 hover:text-red-400 hover:bg-red-500/20 active:scale-90"
                        title="Delete meat action"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="mt-8 p-12 rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.02] flex flex-col items-center justify-center text-center">
          <p className="text-sm font-bold text-zinc-200">No purchases or meat logs recorded for this date.</p>
        </div>
      )}
    </div>
  );
};

// ── Kitchen Portal Shell ──────────────────────────────────────────────────────

type KitchenTab = 'purchases' | 'meat';

const KitchenPortal = () => {
  const purchases         = useKitchenPurchasesStore((s) => s.purchases);
  const addPurchase       = useKitchenPurchasesStore((s) => s.addPurchase);
  const deletePurchaseKP  = useKitchenPurchasesStore((s) => s.deletePurchase);

  const meatEntries    = useMeatTrackerStore((s) => s.meatEntries);
  const addMeatEntry   = useMeatTrackerStore((s) => s.addMeatEntry);
  const deleteMeatEntry = useMeatTrackerStore((s) => s.deleteMeatEntry);

  const [activeTab, setActiveTab] = useState<KitchenTab>('purchases');

  const handlePurchaseAdded   = (entry: PurchaseEntry) => addPurchase(entry);
  const handlePurchaseDeleted = (id: string) => deletePurchaseKP(id);

  const handleMeatAdded   = (entry: MeatEntry) => addMeatEntry(entry);
  const handleMeatDeleted = (id: string) => deleteMeatEntry(id);

  return (
    <AppLayout title="Kitchen Portal">
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#1E2235] border border-white/15 flex items-center justify-center text-2xl shadow-inner flex-shrink-0">
            <ChefHat size={24} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Kitchen Portal</h1>
            <p className="text-xs font-bold text-zinc-300 font-mono mt-0.5">{format(new Date(), 'EEEE, dd MMM yyyy')}</p>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('purchases')}
            className={activeTab === 'purchases'
              ? 'px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all flex items-center gap-2 active:scale-95'
              : 'px-5 py-2.5 rounded-xl bg-[#13151F] text-zinc-300 hover:text-white border border-white/15 hover:border-white/30 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95'}
          >
            <DollarSign size={14} /> Daily Expenses
          </button>
          <button
            onClick={() => setActiveTab('meat')}
            className={activeTab === 'meat'
              ? 'px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all flex items-center gap-2 active:scale-95'
              : 'px-5 py-2.5 rounded-xl bg-[#13151F] text-zinc-300 hover:text-white border border-white/15 hover:border-white/30 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95'}
          >
            <Flame size={14} /> Meat Tracker
          </button>
        </div>

        {/* Content */}
        {activeTab === 'purchases' && (
          <PurchasesTab purchases={purchases} onPurchaseAdded={handlePurchaseAdded} onPurchaseDeleted={handlePurchaseDeleted} />
        )}
        {activeTab === 'meat' && (
          <MeatTrackerTab
            purchases={purchases}
            meatEntries={meatEntries}
            onMeatAdded={handleMeatAdded}
            onMeatDeleted={handleMeatDeleted}
          />
        )}

      </div>
    </AppLayout>
  );
};

export default KitchenPortal;
