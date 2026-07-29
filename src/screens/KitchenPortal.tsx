import { useState } from 'react';
import { format } from 'date-fns';
import AppLayout from '@/components/ui/AppLayout';
import { Plus, ChefHat, DollarSign, Flame, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

interface PurchaseEntry {
  id: string;
  date: string;     // yyyy-MM-dd
  time: string;     // HH:mm
  itemName: string;
  quantity: string; // free-text: "5 kg", "2 L"
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

const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const timeStr  = () => format(new Date(), 'HH:mm');

/** Extract leading numeric value: "5 kg" → 5, "40 skewers" → 40 */
const parseQty = (s: string): number => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };

/** Strip leading number to get unit: "5 kg" → "kg" */
const extractUnit = (s: string): string => s.replace(/^[\d.]+\s*/, '').trim();

const norm = (s: string) => s.trim().toLowerCase();

// Default meat items always in the pool
const DEFAULT_MEATS = ['Chicken', 'Mutton', 'Fish', 'Pork'];

/** Build the dropdown pool: defaults + unique item names from today's purchases */
const buildMeatPool = (purchases: PurchaseEntry[]): string[] => {
  const today = todayStr();
  const fromPurchases = purchases
    .filter((p) => p.date === today)
    .map((p) => p.itemName.trim())
    .filter(Boolean);
  const seen = new Set(DEFAULT_MEATS.map(norm));
  const pool = [...DEFAULT_MEATS];
  for (const name of fromPurchases) {
    if (!seen.has(norm(name))) { pool.push(name); seen.add(norm(name)); }
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

/** Live balance for one meat item derived from purchases + meat log */
const calcBalance = (
  item: string,
  purchases: PurchaseEntry[],
  meatEntries: MeatEntry[],
): MeatBalance => {
  const today = todayStr();

  const purchased = purchases
    .filter((p) => p.date === today && norm(p.itemName) === norm(item));
  const rawPurchased = purchased.reduce((s, p) => s + parseQty(p.quantity), 0);
  const unit = purchased[0] ? extractUnit(purchased[0].quantity) : 'kg';

  const todayMeat = meatEntries.filter((e) => e.date === today && norm(e.meatItem) === norm(item));
  const totalMarinated   = todayMeat.filter((e) => e.action === 'Marinated')
    .reduce((s, e) => s + parseQty(e.quantity), 0);
  const totalMinced      = todayMeat.filter((e) => e.action === 'Minced (Keema)')
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

const ACTION_BADGE: Record<MeatAction, React.CSSProperties> = {
  'Marinated':      { background: 'rgba(249,115,22,0.18)', border: '1px solid rgba(249,115,22,0.4)',  color: '#fb923c' },
  'Minced (Keema)': { background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.4)',  color: '#a78bfa' },
  'Sent to Grill':  { background: 'rgba(34,197,94,0.15)',  border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80' },
};
const ACTION_ACTIVE: Record<MeatAction, React.CSSProperties> = {
  'Marinated':      { background: 'rgba(249,115,22,0.22)', border: '1px solid rgba(249,115,22,0.5)',  color: '#fb923c' },
  'Minced (Keema)': { background: 'rgba(139,92,246,0.22)', border: '1px solid rgba(139,92,246,0.5)',  color: '#a78bfa' },
  'Sent to Grill':  { background: 'rgba(34,197,94,0.18)',  border: '1px solid rgba(34,197,94,0.45)', color: '#4ade80' },
};
const ACTION_INACTIVE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.35)',
};

// ── Balance Cards ─────────────────────────────────────────────────────────────

const BalanceCards = ({ bal }: { bal: MeatBalance }) => {
  const u = bal.unit || 'kg';
  const fmt2 = (n: number) => +n.toFixed(2);

  const cards = [
    {
      label: 'Total Raw Purchased',
      value: fmt2(bal.rawPurchased),
      unit: u,
      style: { background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.25)', color: '#fb923c' },
    },
    {
      label: 'Raw Unprocessed Left',
      value: fmt2(bal.rawUnprocessedLeft),
      unit: u,
      style: bal.rawUnprocessedLeft < 0
        ? { background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }
        : { background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24' },
    },
    {
      label: 'Ready for Grill',
      value: fmt2(bal.readyForGrill),
      unit: u,
      style: bal.readyForGrill <= 0
        ? { background: 'rgba(100,116,139,0.12)', border: '1px solid rgba(100,116,139,0.2)', color: 'rgba(255,255,255,0.3)' }
        : { background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' },
    },
    {
      label: 'Total Keema Stock',
      value: fmt2(bal.totalKeema),
      unit: u,
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
          <p className="text-xs font-semibold opacity-60">{c.unit}</p>
        </div>
      ))}
    </div>
  );
};

// ── Tab 1: Daily Kitchen Expenses ─────────────────────────────────────────────

interface PurchasesTabProps {
  purchases: PurchaseEntry[];
  onPurchaseAdded: (entry: PurchaseEntry) => void;
}

const PurchasesTab = ({ purchases, onPurchaseAdded }: PurchasesTabProps) => {
  const [itemName,   setItemName]   = useState('');
  const [quantity,   setQuantity]   = useState('');
  const [rate,       setRate]       = useState('');
  const [totalCost,  setTotalCost]  = useState('');
  const [costEdited, setCostEdited] = useState(false);

  const autoCalc = (qty: string, r: string) => {
    const n = parseFloat(qty); const rv = parseFloat(r);
    return !isNaN(n) && !isNaN(rv) ? (n * rv).toFixed(2) : '';
  };

  const handleQtyChange = (v: string) => {
    setQuantity(v);
    if (!costEdited) setTotalCost(autoCalc(v, rate));
  };
  const handleRateChange = (v: string) => {
    setRate(v);
    if (!costEdited) setTotalCost(autoCalc(quantity, v));
  };
  const handleCostChange = (v: string) => { setTotalCost(v); setCostEdited(true); };

  const reset = () => {
    setItemName(''); setQuantity(''); setRate(''); setTotalCost(''); setCostEdited(false);
  };

  const handleAdd = () => {
    if (!itemName.trim()) return toast.error('Item name is required');
    if (!quantity.trim()) return toast.error('Quantity is required');
    const r = parseFloat(rate);
    const c = parseFloat(totalCost);
    if (isNaN(r) || r < 0) return toast.error('Enter a valid rate');
    if (isNaN(c) || c < 0) return toast.error('Enter a valid total cost');
    onPurchaseAdded({
      id: crypto.randomUUID(),
      date: todayStr(), time: timeStr(),
      itemName: itemName.trim(),
      quantity: quantity.trim(),
      rate: r, totalCost: c,
    });
    reset();
    toast.success('Purchase logged');
  };

  const today = todayStr();
  const todayEntries = purchases.filter((e) => e.date === today);
  const todayTotal   = todayEntries.reduce((s, e) => s + e.totalCost, 0);

  return (
    <div className="space-y-5">
      {/* Form */}
      <div style={CARD}>
        <h3 className="text-sm font-semibold text-orange-400/90 mb-4 flex items-center gap-2">
          <DollarSign size={15} /> Log Kitchen Purchase
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-white/40 block mb-1.5">Item Name</label>
            <input value={itemName} onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. Cooking Oil, Chicken, Salt" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Quantity</label>
            <input value={quantity} onChange={(e) => handleQtyChange(e.target.value)}
              placeholder="e.g. 5 kg, 2 L, 3 packets" inputMode="decimal" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Rate / Price per Unit (Rs.)</label>
            <input value={rate} onChange={(e) => handleRateChange(e.target.value)}
              placeholder="e.g. 180" type="number" inputMode="decimal" min="0" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-white/40 block mb-1.5">
              Total Cost (Rs.)
              <span className="ml-2 text-orange-400/55 font-normal">auto-calculated · editable</span>
            </label>
            <input value={totalCost} onChange={(e) => handleCostChange(e.target.value)}
              onFocus={() => setCostEdited(true)}
              placeholder="e.g. 900" type="number" inputMode="decimal" min="0" className={inputCls} />
          </div>
        </div>
        <button onClick={handleAdd}
          className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 hover:brightness-110"
          style={addBtnStyle}>
          <Plus size={15} /> Log Kitchen Purchase
        </button>
      </div>

      {/* Today's total banner */}
      {todayEntries.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl"
          style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' }}>
          <span className="text-sm text-white/55">Today's total spend</span>
          <span className="text-sm font-bold text-orange-400">
            Rs. {todayTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}

      {/* Today's table */}
      {todayEntries.length > 0 ? (
        <div style={CARD} className="overflow-hidden">
          <h3 className="text-xs font-semibold text-white/35 uppercase tracking-widest mb-3">Today's Purchases</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/8">
                  <th className={TH}>Item Name</th>
                  <th className={TH}>Quantity</th>
                  <th className={TH}>Rate (Rs.)</th>
                  <th className={TH}>Total (Rs.)</th>
                  <th className={TH}>Logged Time</th>
                </tr>
              </thead>
              <tbody>
                {todayEntries.map((e) => (
                  <tr key={e.id} className="border-b border-white/5 last:border-0">
                    <td className={`${TD} text-white/85 font-medium`}>{e.itemName}</td>
                    <td className={`${TD} text-white/55`}>{e.quantity}</td>
                    <td className={`${TD} text-white/55`}>{e.rate.toLocaleString()}</td>
                    <td className={`${TD} font-semibold text-orange-400/90`}>
                      {e.totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </td>
                    <td className={`${TD} text-white/35 text-xs`}>{e.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-14 text-white/25 text-sm">No purchases logged today.</div>
      )}
    </div>
  );
};

// ── Tab 2: Meat Tracker ───────────────────────────────────────────────────────

interface MeatTrackerTabProps {
  purchases: PurchaseEntry[];
  meatEntries: MeatEntry[];
  onMeatAdded: (entry: MeatEntry) => void;
}

const MeatTrackerTab = ({ purchases, meatEntries, onMeatAdded }: MeatTrackerTabProps) => {
  const pool = buildMeatPool(purchases);

  const [selectedItem, setSelectedItem] = useState<string>(pool[0]);
  const [action,       setAction]       = useState<MeatAction>('Marinated');
  const [quantity,     setQuantity]     = useState('');

  // Keep selectedItem valid if pool changes (new purchase added while on this tab)
  const effectiveItem = pool.includes(selectedItem) ? selectedItem : pool[0];

  const bal = calcBalance(effectiveItem, purchases, meatEntries);
  const enteredQty = parseQty(quantity);
  const grillWarning =
    action === 'Sent to Grill' &&
    quantity.trim() !== '' &&
    enteredQty > 0 &&
    enteredQty > bal.readyForGrill;

  const handleAdd = () => {
    if (!effectiveItem) return toast.error('Select a meat item');
    if (!quantity.trim()) return toast.error('Quantity is required');
    if (parseQty(quantity) <= 0) return toast.error('Enter a valid quantity');

    onMeatAdded({
      id: crypto.randomUUID(),
      date: todayStr(), time: timeStr(),
      meatItem: effectiveItem,
      action,
      quantity: quantity.trim(),
    });
    setQuantity('');
    toast.success('Meat action recorded');
  };

  const today = todayStr();
  const todayEntries = meatEntries.filter((e) => e.date === today);

  return (
    <div className="space-y-5">

      {/* Live balance cards for the selected item */}
      <div style={{ ...CARD, padding: '1rem' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest">
            Live Inventory Balance
          </h3>
          {/* Item selector shown here for immediate context */}
          <select
            value={effectiveItem}
            onChange={(e) => setSelectedItem(e.target.value)}
            className="text-xs font-semibold rounded-lg px-2 py-1 bg-white/5 border border-white/10
              text-orange-400 focus:outline-none cursor-pointer"
          >
            {pool.map((item) => (
              <option key={item} value={item} className="bg-[#0f1929] text-white">{item}</option>
            ))}
          </select>
        </div>
        <BalanceCards bal={bal} />
      </div>

      {/* Form */}
      <div style={CARD}>
        <h3 className="text-sm font-semibold text-orange-400/90 mb-4 flex items-center gap-2">
          <Flame size={15} /> Record Meat Action
        </h3>

        <div className="space-y-3">
          {/* Meat Item dropdown — synced with balance selector */}
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Meat Item</label>
            <div className="relative">
              <select
                value={effectiveItem}
                onChange={(e) => setSelectedItem(e.target.value)}
                className={selectCls}
              >
                {pool.map((item) => (
                  <option key={item} value={item} className="bg-[#0f1929] text-white">{item}</option>
                ))}
              </select>
              {/* Chevron */}
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/30">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
          </div>

          {/* Action toggle */}
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Action Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(['Marinated', 'Minced (Keema)', 'Sent to Grill'] as MeatAction[]).map((a) => (
                <button key={a} onClick={() => setAction(a)}
                  className="py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
                  style={action === a ? ACTION_ACTIVE[a] : ACTION_INACTIVE}>
                  {a === 'Marinated' ? '🧂 Marinated' : a === 'Minced (Keema)' ? '🥩 Minced (Keema)' : '🔥 Sent to Grill'}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Quantity</label>
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 5 kg, 40 skewers"
              inputMode="decimal" className={inputCls} />

            {/* Soft warning — Sent to Grill exceeds ready balance */}
            {grillWarning && (
              <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
                <AlertTriangle size={13} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-400/90">
                  Entered quantity ({enteredQty} {bal.unit}) exceeds "Ready for Grill"
                  ({+bal.readyForGrill.toFixed(2)} {bal.unit}).
                  Check your marination log.
                </p>
              </div>
            )}
          </div>
        </div>

        <button onClick={handleAdd}
          className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 hover:brightness-110"
          style={addBtnStyle}>
          <Plus size={15} /> Record Meat Action
        </button>
      </div>

      {/* Today's meat log table */}
      {todayEntries.length > 0 ? (
        <div style={CARD} className="overflow-hidden">
          <h3 className="text-xs font-semibold text-white/35 uppercase tracking-widest mb-3">Today's Meat Log</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/8">
                  <th className={TH}>Meat Item</th>
                  <th className={TH}>Action</th>
                  <th className={TH}>Quantity</th>
                  <th className={TH}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {todayEntries.map((e) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-14 text-white/25 text-sm">No meat actions logged today.</div>
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
  // ── Shared state lifted here so both tabs stay in sync ──
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

  return (
    <AppLayout title="Kitchen Portal">
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl flex-shrink-0"
            style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)' }}>
            <ChefHat size={20} className="text-orange-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white/90">Kitchen Portal</h1>
            <p className="text-xs text-white/40">{format(new Date(), 'EEEE, dd MMM yyyy')}</p>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('purchases')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
            style={activeTab === 'purchases' ? TAB_ACTIVE : TAB_INACTIVE}>
            <DollarSign size={14} /> Daily Expenses
          </button>
          <button onClick={() => setActiveTab('meat')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
            style={activeTab === 'meat' ? TAB_ACTIVE : TAB_INACTIVE}>
            <Flame size={14} /> Meat Tracker
          </button>
        </div>

        {/* Content */}
        {activeTab === 'purchases' && (
          <PurchasesTab purchases={purchases} onPurchaseAdded={handlePurchaseAdded} />
        )}
        {activeTab === 'meat' && (
          <MeatTrackerTab
            purchases={purchases}
            meatEntries={meatEntries}
            onMeatAdded={handleMeatAdded}
          />
        )}

      </div>
    </AppLayout>
  );
};

export default KitchenPortal;
