import { useState } from 'react';
import { format } from 'date-fns';
import AppLayout from '@/components/ui/AppLayout';
import { Plus, ChefHat, DollarSign, Flame } from 'lucide-react';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

interface PurchaseEntry {
  id: string;
  date: string;       // yyyy-MM-dd  — used to filter "today"
  time: string;       // HH:mm
  itemName: string;
  quantity: string;   // free-text: "5 kg", "2 L", "3 packets"
  rate: number;       // Rs. per unit
  totalCost: number;  // Rs.
}

type MeatAction = 'Marinated' | 'Sent to Grill';

interface MeatEntry {
  id: string;
  date: string;
  time: string;
  meatItem: string;
  action: MeatAction;
  quantity: string;
}

// ── LocalStorage helpers ─────────────────────────────────────────────────────

const PURCHASE_KEY  = 'kitchen_purchases';
const MEAT_KEY      = 'kitchen_meat_tracker';

function loadPurchases(): PurchaseEntry[] {
  try { return JSON.parse(localStorage.getItem(PURCHASE_KEY) || '[]'); }
  catch { return []; }
}
function savePurchases(data: PurchaseEntry[]) {
  localStorage.setItem(PURCHASE_KEY, JSON.stringify(data));
}
function loadMeat(): MeatEntry[] {
  try { return JSON.parse(localStorage.getItem(MEAT_KEY) || '[]'); }
  catch { return []; }
}
function saveMeat(data: MeatEntry[]) {
  localStorage.setItem(MEAT_KEY, JSON.stringify(data));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const timeStr  = () => format(new Date(), 'HH:mm');

/** Extract leading numeric value from a quantity string like "5 kg" → 5 */
function parseQtyNumber(qty: string): number | null {
  const n = parseFloat(qty);
  return isNaN(n) ? null : n;
}

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

const addBtnCls =
  'mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold ' +
  'transition-all active:scale-95 hover:brightness-110';

const ADD_BTN_STYLE: React.CSSProperties = {
  background: 'rgba(249,115,22,0.2)',
  border: '1px solid rgba(249,115,22,0.35)',
  color: '#fb923c',
};

const TH = 'text-left py-2 pr-3 text-xs font-medium text-white/35 whitespace-nowrap';
const TD = 'py-2.5 pr-3 text-sm';

// ── Section 1: Daily Kitchen Expenses / Orders Log ───────────────────────────

const PurchasesTab = () => {
  const [entries, setEntries] = useState<PurchaseEntry[]>(loadPurchases);

  const [itemName,   setItemName]   = useState('');
  const [quantity,   setQuantity]   = useState('');
  const [rate,       setRate]       = useState('');
  const [totalCost,  setTotalCost]  = useState('');
  const [costEdited, setCostEdited] = useState(false); // true → user overrode auto-calc

  // Auto-calc total when qty or rate changes (unless user manually edited cost)
  const handleQuantityChange = (val: string) => {
    setQuantity(val);
    if (!costEdited) {
      const n = parseQtyNumber(val);
      const r = parseFloat(rate);
      if (n !== null && !isNaN(r)) setTotalCost((n * r).toFixed(2));
      else setTotalCost('');
    }
  };

  const handleRateChange = (val: string) => {
    setRate(val);
    if (!costEdited) {
      const n = parseQtyNumber(quantity);
      const r = parseFloat(val);
      if (n !== null && !isNaN(r)) setTotalCost((n * r).toFixed(2));
      else setTotalCost('');
    }
  };

  const handleCostChange = (val: string) => {
    setTotalCost(val);
    setCostEdited(true);
  };

  const resetForm = () => {
    setItemName(''); setQuantity(''); setRate(''); setTotalCost(''); setCostEdited(false);
  };

  const handleAdd = () => {
    if (!itemName.trim()) return toast.error('Item name is required');
    if (!quantity.trim()) return toast.error('Quantity is required');
    const r = parseFloat(rate);
    const c = parseFloat(totalCost);
    if (isNaN(r) || r < 0)  return toast.error('Enter a valid rate');
    if (isNaN(c) || c < 0)  return toast.error('Enter a valid total cost');

    const entry: PurchaseEntry = {
      id: crypto.randomUUID(),
      date: todayStr(),
      time: timeStr(),
      itemName: itemName.trim(),
      quantity: quantity.trim(),
      rate: r,
      totalCost: c,
    };
    const updated = [entry, ...entries];
    setEntries(updated);
    savePurchases(updated);
    resetForm();
    toast.success('Purchase logged');
  };

  const todayEntries = entries.filter((e) => e.date === todayStr());
  const todayTotal   = todayEntries.reduce((s, e) => s + e.totalCost, 0);

  return (
    <div className="space-y-5">

      {/* ── Input form ── */}
      <div style={CARD}>
        <h3 className="text-sm font-semibold text-orange-400/90 mb-4 flex items-center gap-2">
          <DollarSign size={15} /> Log Kitchen Purchase
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Item Name */}
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-white/40 block mb-1.5">Item Name</label>
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. Cooking Oil, Chicken, Salt"
              className={inputCls}
            />
          </div>

          {/* Quantity */}
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Quantity</label>
            <input
              value={quantity}
              onChange={(e) => handleQuantityChange(e.target.value)}
              placeholder="e.g. 5 kg, 2 L, 3 packets"
              inputMode="decimal"
              className={inputCls}
            />
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
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-white/40 block mb-1.5">
              Total Cost (Rs.)
              <span className="ml-2 text-orange-400/60 font-normal">auto-calculated · editable</span>
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

        <button onClick={handleAdd} className={addBtnCls} style={ADD_BTN_STYLE}>
          <Plus size={15} /> Log Kitchen Purchase
        </button>
      </div>

      {/* ── Today's total ── */}
      {todayEntries.length > 0 && (
        <div
          className="flex items-center justify-between px-4 py-3 rounded-xl"
          style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' }}
        >
          <span className="text-sm text-white/55">Today's total spend</span>
          <span className="text-sm font-bold text-orange-400">
            Rs. {todayTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}

      {/* ── Today's table ── */}
      {todayEntries.length > 0 ? (
        <div style={CARD} className="overflow-hidden">
          <h3 className="text-xs font-semibold text-white/35 uppercase tracking-widest mb-3">
            Today's Purchases
          </h3>
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
        <div className="text-center py-14 text-white/25 text-sm">
          No purchases logged today.
        </div>
      )}
    </div>
  );
};

// ── Section 2: Meat Tracker (Marinate vs. Grill) ─────────────────────────────

const ACTION_STYLE: Record<MeatAction, React.CSSProperties> = {
  'Marinated':     { background: 'rgba(249,115,22,0.18)', border: '1px solid rgba(249,115,22,0.4)',  color: '#fb923c' },
  'Sent to Grill': { background: 'rgba(34,197,94,0.15)',  border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80' },
};

const ACTION_TOGGLE_ACTIVE: Record<MeatAction, React.CSSProperties> = {
  'Marinated':     { background: 'rgba(249,115,22,0.22)', border: '1px solid rgba(249,115,22,0.5)', color: '#fb923c' },
  'Sent to Grill': { background: 'rgba(34,197,94,0.18)',  border: '1px solid rgba(34,197,94,0.45)', color: '#4ade80' },
};

const ACTION_TOGGLE_INACTIVE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.35)',
};

const MeatTrackerTab = () => {
  const [entries,  setEntries]  = useState<MeatEntry[]>(loadMeat);
  const [meatItem, setMeatItem] = useState('');
  const [action,   setAction]   = useState<MeatAction>('Marinated');
  const [quantity, setQuantity] = useState('');

  const handleAdd = () => {
    if (!meatItem.trim()) return toast.error('Meat item name is required');
    if (!quantity.trim()) return toast.error('Quantity is required');

    const entry: MeatEntry = {
      id: crypto.randomUUID(),
      date: todayStr(),
      time: timeStr(),
      meatItem: meatItem.trim(),
      action,
      quantity: quantity.trim(),
    };
    const updated = [entry, ...entries];
    setEntries(updated);
    saveMeat(updated);
    setMeatItem(''); setQuantity('');
    toast.success('Meat action recorded');
  };

  const todayEntries = entries.filter((e) => e.date === todayStr());

  return (
    <div className="space-y-5">

      {/* ── Input form ── */}
      <div style={CARD}>
        <h3 className="text-sm font-semibold text-orange-400/90 mb-4 flex items-center gap-2">
          <Flame size={15} /> Record Meat Action
        </h3>

        <div className="space-y-3">
          {/* Meat Item */}
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Meat Item Name</label>
            <input
              value={meatItem}
              onChange={(e) => setMeatItem(e.target.value)}
              placeholder="e.g. Chicken Sekuwa, Pork Ribs, Fish, Mutton"
              className={inputCls}
            />
          </div>

          {/* Action Type toggle */}
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Action Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['Marinated', 'Sent to Grill'] as MeatAction[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAction(a)}
                  className="py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
                  style={action === a ? ACTION_TOGGLE_ACTIVE[a] : ACTION_TOGGLE_INACTIVE}
                >
                  {a === 'Marinated' ? '🧂 Marinated' : '🔥 Sent to Grill'}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="text-xs font-medium text-white/40 block mb-1.5">Quantity</label>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 5 kg, 40 skewers, 2 kg"
              inputMode="decimal"
              className={inputCls}
            />
          </div>
        </div>

        <button onClick={handleAdd} className={addBtnCls} style={ADD_BTN_STYLE}>
          <Plus size={15} /> Record Meat Action
        </button>
      </div>

      {/* ── Today's table ── */}
      {todayEntries.length > 0 ? (
        <div style={CARD} className="overflow-hidden">
          <h3 className="text-xs font-semibold text-white/35 uppercase tracking-widest mb-3">
            Today's Meat Log
          </h3>
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
                      <span
                        className="px-2.5 py-0.5 rounded-full text-xs font-bold"
                        style={ACTION_STYLE[e.action]}
                      >
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
        <div className="text-center py-14 text-white/25 text-sm">
          No meat actions logged today.
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
  const [activeTab, setActiveTab] = useState<KitchenTab>('purchases');

  return (
    <AppLayout title="Kitchen Portal">
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">

        {/* ── Portal header ── */}
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

        {/* ── Sub-tabs ── */}
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

        {/* ── Tab content ── */}
        {activeTab === 'purchases' && <PurchasesTab />}
        {activeTab === 'meat'      && <MeatTrackerTab />}

      </div>
    </AppLayout>
  );
};

export default KitchenPortal;
