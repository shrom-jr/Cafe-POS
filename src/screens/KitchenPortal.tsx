import { useState } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import AppLayout from '@/components/ui/AppLayout';
import { Plus, ChefHat, DollarSign, Flame, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

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

type MeatAction = 'Marinated' | 'Minced (Keema)' | 'Sent to Grill';

interface MeatEntry {
  id: string;
  date: string;
  time: string;
  meatItem: string;
  action: MeatAction;
  quantity: string;
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

// ── LocalStorage ─────────────────────────────────────────────────────────────

const PURCHASE_KEY = 'kitchen_purchases';
const MEAT_KEY     = 'kitchen_meat_tracker';

const loadPurchases = (): PurchaseEntry[] => {
  try { return JSON.parse(localStorage.getItem(PURCHASE_KEY) || '[]'); } catch { return []; }
};
const savePurchases = (d: PurchaseEntry[]) => localStorage.setItem(PURCHASE_KEY, JSON.stringify(d));

const loadMeat = (): MeatEntry[] => {
  try { return JSON.parse(localStorage.getItem(MEAT_KEY) || '[]'); } catch { return []; }
};
const saveMeat = (d: MeatEntry[]) => localStorage.setItem(MEAT_KEY, JSON.stringify(d));

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
  rawUnprocessedLeft: number;
  readyForGrill: number;
  totalKeema: number;
  unit: string;
}

/** Live balance for one meat item */
const calcBalance = (
  item: string,
  purchases: PurchaseEntry[],
  meatEntries: MeatEntry[],
): MeatBalance => {
  const today = todayStr();

  const purchased    = purchases.filter((p) => p.date === today && norm(p.itemName) === norm(item));
  const rawPurchased = purchased.reduce((s, p) => s + parseQty(p.quantity), 0);
  const unit         = purchased[0] ? extractUnit(purchased[0].quantity) : 'kg';

  const todayMeat      = meatEntries.filter((e) => e.date === today && norm(e.meatItem) === norm(item));
  const totalMarinated = todayMeat.filter((e) => e.action === 'Marinated')
    .reduce((s, e) => s + parseQty(e.quantity), 0);
  const totalMinced    = todayMeat.filter((e) => e.action === 'Minced (Keema)')
    .reduce((s, e) => s + parseQty(e.quantity), 0);
  const totalSentToGrill = todayMeat.filter((e) => e.action === 'Sent to Grill')
    .reduce((s, e) => s + parseQty(e.quantity), 0);

  return {
    rawPurchased,
    rawUnprocessedLeft: rawPurchased - totalMarinated - totalMinced,
    readyForGrill: totalMarinated - totalSentToGrill,
    totalKeema: totalMinced,
    unit,
  };
};

// ── Shared styles ─────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: 'linear-gradient(160deg, #0f1929 0%, #0b1220 100%)',
  border: '1px solid rgba(249,115,22,0.18)',
  borderRadius: '1rem',
  padding: '1.25rem',
};

const inputCls =
  'w-full px-3 py-2.5 rounded-xl text-sm text-white/90 placeholder:text-white/25 ' +
  'focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40 ' +
  'transition-colors h-11 bg-white/5 border border-white/10';

const selectCls =
  'w-full px-3 py-2.5 rounded-xl text-sm text-white/90 ' +
  'focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40 ' +
  'transition-colors h-11 bg-[#0f1929] border border-white/10 appearance-none cursor-pointer';

const addBtnStyle: React.CSSProperties = {
  background: 'rgba(249,115,22,0.2)',
  border: '1px solid rgba(249,115,22,0.35)',
  color: '#fb923c',
};

const TH = 'text-left py-2 pr-3 text-xs font-medium text-white/35 whitespace-nowrap';
const TD = 'py-2.5 pr-3 text-sm';

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
const ACTION_ACTIVE: Record<MeatAction, React.CSSProperties> = {
  'Marinated':      { background: 'rgba(249,115,22,0.22)', border: '1px solid rgba(249,115,22,0.5)',  color: '#fb923c' },
  'Minced (Keema)': { background: 'rgba(139,92,246,0.22)', border: '1px solid rgba(139,92,246,0.5)', color: '#a78bfa' },
  'Sent to Grill':  { background: 'rgba(34,197,94,0.18)',  border: '1px solid rgba(34,197,94,0.45)', color: '#4ade80' },
};
const ACTION_INACTIVE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.35)',
};

// ── Balance Cards ─────────────────────────────────────────────────────────────

const BalanceCards = ({ bal }: { bal: MeatBalance }) => {
  const u    = bal.unit || 'kg';
  const fmt2 = (n: number) => +n.toFixed(2);

  const cards = [
    {
      label: 'Total Raw Purchased',
      value: fmt2(bal.rawPurchased),
      style: { background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.25)', color: '#fb923c' },
    },
    {
      label: 'Raw Unprocessed Left',
      value: fmt2(bal.rawUnprocessedLeft),
      style: bal.rawUnprocessedLeft < 0
        ? { background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }
        : { background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24' },
    },
    {
      label: 'Ready for Grill',
      value: fmt2(bal.readyForGrill),
      style: bal.readyForGrill <= 0
        ? { background: 'rgba(100,116,139,0.12)', border: '1px solid rgba(100,116,139,0.2)', color: 'rgba(255,255,255,0.3)' }
        : { background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' },
    },
    {
      label: 'Total Keema Stock',
      value: fmt2(bal.totalKeema),
      style: bal.totalKeema <= 0
        ? { background: 'rgba(100,116,139,0.12)', border: '1px solid rgba(100,116,139,0.2)', color: 'rgba(255,255,255,0.3)' }
        : { background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' },
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl p-3 text-center" style={c.style}>
          <p className="text-xs font-medium opacity-70 mb-1 leading-tight">{c.label}</p>
          <p className="text-xl font-black">{c.value}</p>
          <p className="text-xs font-semibold opacity-60">{u}</p>
        </div>
      ))}
    </div>
  );
};

// ── Date Filter Bar ───────────────────────────────────────────────────────────

const FB_ACTIVE: React.CSSProperties = {
  background: 'rgba(249,115,22,0.2)',
  border: '1px solid rgba(249,115,22,0.35)',
  color: '#fb923c',
};
const FB_INACTIVE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.4)',
};

const DateFilterBar = ({ viewDate, onChange }: { viewDate: string; onChange: (d: string) => void }) => {
  const today     = todayStr();
  const yesterday = yesterdayStr();
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => onChange(today)}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
        style={viewDate === today ? FB_ACTIVE : FB_INACTIVE}
      >
        Today
      </button>
      <button
        onClick={() => onChange(yesterday)}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
        style={viewDate === yesterday ? FB_ACTIVE : FB_INACTIVE}
      >
        Yesterday
      </button>
      <input
        type="date"
        value={viewDate}
        max={today}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="px-2.5 py-1.5 rounded-lg text-xs text-white/60 bg-white/5 border border-white/10
          focus:outline-none focus:ring-1 focus:ring-orange-500/40 cursor-pointer"
      />
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
      <div style={CARD}>
        <h3 className="text-sm font-semibold text-orange-400/90 mb-4 flex items-center gap-2">
          <DollarSign size={15} /> Log Kitchen Purchase
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* Date — for backdated logging */}
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-white/40 block mb-1.5">
              Date
              <span className="ml-2 text-white/25 font-normal">defaults to today · change for late entries</span>
            </label>
            <input
              type="date"
              value={entryDate}
              max={todayStr()}
              onChange={(e) => e.target.value && setEntryDate(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Item Name — grouped dropdown */}
          <div className="sm:col-span-2 space-y-2">
            <label className="text-xs font-medium text-white/40 block">Item Name</label>
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
            {/* Custom item text input */}
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
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-white/40 block mb-1.5">Quantity</label>
            <div className="flex gap-2">
              <input
                value={qtyValue}
                onChange={(e) => handleQtyChange(e.target.value)}
                placeholder="e.g. 5"
                type="number"
                inputMode="decimal"
                min="0"
                className={`${inputCls} flex-1`}
              />
              <div className="relative w-36 flex-shrink-0">
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
            {/* Custom unit input */}
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
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Rate / Price per Unit (Rs.)</label>
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
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">
              Total Cost (Rs.)
              <span className="ml-2 text-orange-400/55 font-normal">auto-calculated · editable</span>
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
        </div>

        <button
          onClick={handleAdd}
          className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 hover:brightness-110"
          style={addBtnStyle}
        >
          <Plus size={15} /> Log Kitchen Purchase
        </button>
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
        <div className="text-center py-14 text-white/25 text-sm">
          No purchases logged for {fmtDisplayDate(viewDate)}.
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

  // Hard stock checks — computed for both the warning banner and submission guard
  const availableForAction =
    action === 'Sent to Grill' ? bal.readyForGrill : bal.rawUnprocessedLeft;
  const stockExceeded =
    meatQtyValue.trim() !== '' &&
    enteredQty > 0 &&
    enteredQty > availableForAction;
  const stockLabel =
    action === 'Sent to Grill' ? 'Ready for Grill' : 'Raw Unprocessed Left';

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
      <div style={{ ...CARD, padding: '1rem' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest">
            Live Inventory Balance
          </h3>
          <div className="relative">
            <select
              value={effectiveItem}
              onChange={(e) => setSelectedItem(e.target.value)}
              className="text-xs font-semibold rounded-lg px-2 py-1 pr-6 bg-white/5 border border-white/10
                text-orange-400 focus:outline-none cursor-pointer appearance-none"
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
        <h3 className="text-sm font-semibold text-orange-400/90 mb-4 flex items-center gap-2">
          <Flame size={15} /> Record Meat Action
        </h3>

        <div className="space-y-3">
          {/* Date — for backdated logging */}
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">
              Date
              <span className="ml-2 text-white/25 font-normal">defaults to today · change for late entries</span>
            </label>
            <input
              type="date"
              value={entryDate}
              max={todayStr()}
              onChange={(e) => e.target.value && setEntryDate(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Action toggle — 3 buttons */}
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Action Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(['Marinated', 'Minced (Keema)', 'Sent to Grill'] as MeatAction[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAction(a)}
                  className="py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
                  style={action === a ? ACTION_ACTIVE[a] : ACTION_INACTIVE}
                >
                  {a === 'Marinated' ? '🧂 Marinated' : a === 'Minced (Keema)' ? '🥩 Minced (Keema)' : '🔥 Sent to Grill'}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity — value + unit */}
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Quantity</label>
            <div className="flex gap-2">
              <input
                value={meatQtyValue}
                onChange={(e) => setMeatQtyValue(e.target.value)}
                placeholder="e.g. 5"
                type="number"
                inputMode="decimal"
                min="0"
                className={`${inputCls} flex-1`}
              />
              <div className="relative w-36 flex-shrink-0">
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
        </div>

        <button
          onClick={handleAdd}
          className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 hover:brightness-110"
          style={addBtnStyle}
        >
          <Plus size={15} /> Record Meat Action
        </button>
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
        <div className="text-center py-14 text-white/25 text-sm">
          No meat actions logged for {fmtDisplayDate(viewDate)}.
        </div>
      )}
    </div>
  );
};

// ── Kitchen Portal Shell ──────────────────────────────────────────────────────

type KitchenTab = 'purchases' | 'meat';

const TAB_ACTIVE: React.CSSProperties = {
  background: 'rgba(249,115,22,0.2)',
  border: '1px solid rgba(249,115,22,0.35)',
  color: '#fb923c',
};
const TAB_INACTIVE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.4)',
};

const KitchenPortal = () => {
  const [purchases,   setPurchases]   = useState<PurchaseEntry[]>(loadPurchases);
  const [meatEntries, setMeatEntries] = useState<MeatEntry[]>(loadMeat);
  const [activeTab,   setActiveTab]   = useState<KitchenTab>('purchases');

  const handlePurchaseAdded = (entry: PurchaseEntry) => {
    const updated = [entry, ...purchases];
    setPurchases(updated);
    savePurchases(updated);
  };

  const handleMeatAdded = (entry: MeatEntry) => {
    const updated = [entry, ...meatEntries];
    setMeatEntries(updated);
    saveMeat(updated);
  };

  const handlePurchaseDeleted = (id: string) => {
    const updated = purchases.filter((p) => p.id !== id);
    setPurchases(updated);
    savePurchases(updated);
  };

  const handleMeatDeleted = (id: string) => {
    const updated = meatEntries.filter((e) => e.id !== id);
    setMeatEntries(updated);
    saveMeat(updated);
  };

  return (
    <AppLayout title="Kitchen Portal">
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className="p-2.5 rounded-xl flex-shrink-0"
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
            onClick={() => setActiveTab('purchases')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
            style={activeTab === 'purchases' ? TAB_ACTIVE : TAB_INACTIVE}
          >
            <DollarSign size={14} /> Daily Expenses
          </button>
          <button
            onClick={() => setActiveTab('meat')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
            style={activeTab === 'meat' ? TAB_ACTIVE : TAB_INACTIVE}
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
