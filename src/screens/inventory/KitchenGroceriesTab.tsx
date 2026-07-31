import { useState, useMemo } from 'react';
import { format, parseISO, subDays, startOfMonth } from 'date-fns';
import { useKitchenPurchasesStore, PurchaseEntry } from '@/store/useKitchenPurchasesStore';
import {
  CARD, CARD_SM, BTN_PRIMARY, BTN_GHOST, BTN_DANGER, BTN_EDIT,
  INPUT, SELECT, LABEL, TH, TD,
} from './styles';
import { toast } from 'sonner';
import {
  Plus, Save, X, Trash2, Edit3, ShoppingCart,
  TrendingDown, Calendar, CalendarDays,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const UNIT_OPTIONS = ['kg', 'g', 'L', 'ml', 'pcs', 'packets', 'bags', 'dozen', 'box', 'tin', 'bunch', 'custom'] as const;
const MEAT_ITEMS   = ['Chicken', 'Mutton', 'Pork', 'Fish'] as const;
const GROCERY_ITEMS = ['Cooking Oil', 'Salt', 'Rice', 'Vegetables', 'Spices', 'Gas Cylinder'] as const;
const CUSTOM_SENTINEL = '__custom__';

const todayStr     = () => format(new Date(), 'yyyy-MM-dd');
const yesterdayStr = () => format(subDays(new Date(), 1), 'yyyy-MM-dd');
const timeStr      = () => format(new Date(), 'HH:mm');
const fmtDisplay   = (d: string) => { try { return format(parseISO(d), 'dd MMM yyyy'); } catch { return d; } };
const fmtRs = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-IN')}`;

type DateFilter = 'today' | 'yesterday' | 'all' | 'custom';

// ── Log Purchase Form ─────────────────────────────────────────────────────────

interface LogFormProps { onClose: () => void; editEntry?: PurchaseEntry; }

const LogForm = ({ onClose, editEntry }: LogFormProps) => {
  const addPurchase    = useKitchenPurchasesStore((s) => s.addPurchase);
  const updatePurchase = useKitchenPurchasesStore((s) => s.updatePurchase);

  const resolveInitItem = () => {
    if (!editEntry) return MEAT_ITEMS[0];
    const allPresets = [...MEAT_ITEMS, ...GROCERY_ITEMS] as string[];
    return allPresets.includes(editEntry.itemName) ? editEntry.itemName : CUSTOM_SENTINEL;
  };

  // Parse existing quantity string like "5 kg" → { value: '5', unit: 'kg' }
  const parseQtyStr = (s: string) => {
    const m = s.match(/^([\d.]+)\s*(.*)$/);
    return m ? { value: m[1], unit: m[2].trim() || 'kg' } : { value: '', unit: 'kg' };
  };

  const initQty  = editEntry ? parseQtyStr(editEntry.quantity) : { value: '', unit: 'kg' };
  const isCustomU = !UNIT_OPTIONS.slice(0, -1).includes(initQty.unit as typeof UNIT_OPTIONS[number]);

  const [selectedItem, setSelectedItem] = useState(resolveInitItem);
  const [customItem,   setCustomItem]   = useState(editEntry && selectedItem === CUSTOM_SENTINEL ? editEntry.itemName : '');
  const [date,         setDate]         = useState(editEntry?.date ?? todayStr());
  const [qtyValue,     setQtyValue]     = useState(initQty.value);
  const [qtyUnit,      setQtyUnit]      = useState(isCustomU ? 'custom' : initQty.unit);
  const [customUnit,   setCustomUnit]   = useState(isCustomU ? initQty.unit : '');
  const [rate,         setRate]         = useState(editEntry ? String(editEntry.rate) : '');
  const [totalCost,    setTotalCost]    = useState(editEntry ? String(editEntry.totalCost) : '');
  const [costEdited,   setCostEdited]   = useState(!!editEntry);

  const isCustomItem = selectedItem === CUSTOM_SENTINEL;
  const isCustomUnit = qtyUnit === 'custom';
  const resolvedItem = isCustomItem ? customItem.trim() : selectedItem;
  const resolvedUnit = isCustomUnit ? (customUnit.trim() || 'unit') : qtyUnit;

  const resolveCategory = (): PurchaseEntry['category'] => {
    if (isCustomItem) return 'Custom';
    if ((MEAT_ITEMS as readonly string[]).includes(selectedItem)) return 'Meats';
    return 'Groceries & Supplies';
  };

  const autoCalc = (qty: string, r: string) => {
    const n = parseFloat(qty), rv = parseFloat(r);
    return !isNaN(n) && !isNaN(rv) ? (n * rv).toFixed(2) : '';
  };

  const handleQtyChange  = (v: string) => { setQtyValue(v); if (!costEdited) setTotalCost(autoCalc(v, rate)); };
  const handleRateChange = (v: string) => { setRate(v);     if (!costEdited) setTotalCost(autoCalc(qtyValue, v)); };
  const handleCostChange = (v: string) => { setTotalCost(v); setCostEdited(true); };

  const handleSave = () => {
    if (!resolvedItem)                           return toast.error('Item name is required');
    if (!qtyValue.trim() || parseFloat(qtyValue) <= 0) return toast.error('Enter a valid quantity');
    const r = parseFloat(rate);
    const c = parseFloat(totalCost);
    if (isNaN(r) || r < 0)  return toast.error('Enter a valid rate');
    if (isNaN(c) || c < 0)  return toast.error('Enter a valid total cost');
    if (!date)               return toast.error('Date is required');

    const data = {
      date,
      time:      editEntry?.time ?? timeStr(),
      itemName:  resolvedItem,
      category:  resolveCategory(),
      quantity:  `${parseFloat(qtyValue)} ${resolvedUnit}`,
      rate:      r,
      totalCost: c,
    };

    if (editEntry) {
      updatePurchase(editEntry.id, data);
      toast.success('Entry updated');
    } else {
      addPurchase({ id: crypto.randomUUID(), ...data });
      toast.success('Purchase logged');
    }
    onClose();
  };

  return (
    <div className={`${CARD} border-orange-500/15`}>
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <ShoppingCart size={14} className="text-orange-400" />
        {editEntry ? `Edit — ${editEntry.itemName}` : 'Log Kitchen Purchase'}
      </h3>

      <div className="flex flex-wrap items-end gap-3">

        {/* Date */}
        <div className="w-40">
          <label className={LABEL}>Date</label>
          <input
            className={INPUT}
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </div>

        {/* Item Name */}
        <div className="w-52">
          <label className={LABEL}>Item Name *</label>
          <select
            className={SELECT}
            value={selectedItem}
            onChange={(e) => { setSelectedItem(e.target.value); setCustomItem(''); }}
          >
            <optgroup label="Meats">
              {MEAT_ITEMS.map((m) => <option key={m} value={m}>{m}</option>)}
            </optgroup>
            <optgroup label="Groceries &amp; Supplies">
              {GROCERY_ITEMS.map((g) => <option key={g} value={g}>{g}</option>)}
            </optgroup>
            <option value={CUSTOM_SENTINEL}>Custom item…</option>
          </select>
          {isCustomItem && (
            <input
              className={`${INPUT} mt-1.5`}
              placeholder="Type item name"
              value={customItem}
              onChange={(e) => setCustomItem(e.target.value)}
              autoFocus
            />
          )}
        </div>

        {/* Quantity + Unit */}
        <div className="w-44">
          <label className={LABEL}>Quantity *</label>
          <div className="flex gap-1.5">
            <input
              className={`${INPUT} flex-1 min-w-0`}
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 5"
              value={qtyValue}
              onChange={(e) => handleQtyChange(e.target.value)}
            />
            <select
              className={`${SELECT} w-24 flex-shrink-0`}
              value={qtyUnit}
              onChange={(e) => setQtyUnit(e.target.value)}
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>{u === 'custom' ? 'custom…' : u}</option>
              ))}
            </select>
          </div>
          {isCustomUnit && (
            <input
              className={`${INPUT} mt-1.5`}
              placeholder="Unit name (e.g. skewers)"
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value)}
            />
          )}
        </div>

        {/* Rate */}
        <div className="w-32">
          <label className={LABEL}>Rate / Price (Rs.) *</label>
          <input
            className={INPUT}
            type="number"
            min="0"
            step="any"
            placeholder="e.g. 180"
            value={rate}
            onChange={(e) => handleRateChange(e.target.value)}
          />
        </div>

        {/* Total */}
        <div className="w-32">
          <label className={LABEL}>
            Total (Rs.)
            {!costEdited && <span className="ml-1 text-orange-400/70 font-normal">auto</span>}
          </label>
          <input
            className={INPUT}
            type="number"
            min="0"
            step="any"
            placeholder="e.g. 900"
            value={totalCost}
            onChange={(e) => handleCostChange(e.target.value)}
            onFocus={() => setCostEdited(true)}
          />
        </div>

        <div className="flex gap-2">
          <button className={BTN_PRIMARY} onClick={handleSave}>
            <Save size={14} /> {editEntry ? 'Save Changes' : 'Log Purchase'}
          </button>
          <button className={BTN_GHOST} onClick={onClose}>
            <X size={14} /> Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const KitchenGroceriesTab = () => {
  const purchases      = useKitchenPurchasesStore((s) => s.purchases);
  const deletePurchase = useKitchenPurchasesStore((s) => s.deletePurchase);

  const [dateFilter,  setDateFilter]  = useState<DateFilter>('today');
  const [customDate,  setCustomDate]  = useState('');
  const [showForm,    setShowForm]    = useState(false);
  const [editEntry,   setEditEntry]   = useState<PurchaseEntry | null>(null);

  // ── Summary metrics ──────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const totalSpend  = purchases.reduce((s, p) => s + p.totalCost, 0);
    const monthStart  = startOfMonth(new Date()).toISOString().slice(0, 10);
    const thisMonthPs = purchases.filter((p) => p.date >= monthStart);
    const thisMonthSpend = thisMonthPs.reduce((s, p) => s + p.totalCost, 0);
    return { totalCount: purchases.length, totalSpend, thisMonthSpend, thisMonthCount: thisMonthPs.length };
  }, [purchases]);

  // ── Date filtering ───────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = purchases;
    if (dateFilter === 'today')     list = purchases.filter((p) => p.date === todayStr());
    if (dateFilter === 'yesterday') list = purchases.filter((p) => p.date === yesterdayStr());
    if (dateFilter === 'custom' && customDate) list = purchases.filter((p) => p.date === customDate);
    return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  }, [purchases, dateFilter, customDate]);

  const filteredTotal = filtered.reduce((s, p) => s + p.totalCost, 0);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleDelete = (p: PurchaseEntry) => {
    if (!confirm(`Delete "${p.itemName}" (${fmtDisplay(p.date)})?`)) return;
    deletePurchase(p.id);
    toast.success('Entry deleted');
  };

  const openEdit = (entry: PurchaseEntry) => {
    setShowForm(false);
    setEditEntry(entry);
  };

  const openAdd = () => {
    setEditEntry(null);
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditEntry(null); };

  // ── Category badge ───────────────────────────────────────────────────────

  const catBadge = (cat: PurchaseEntry['category']) => {
    const cls =
      cat === 'Meats'               ? 'bg-red-500/15 border-red-500/20 text-red-400' :
      cat === 'Groceries & Supplies' ? 'bg-green-500/15 border-green-500/20 text-green-400' :
                                       'bg-slate-500/15 border-slate-500/20 text-slate-400';
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold leading-none ${cls}`}>
        {cat === 'Groceries & Supplies' ? 'Grocery' : cat}
      </span>
    );
  };

  return (
    <div className="space-y-5">

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

        <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.18)' }}>
          <div className="p-2.5 rounded-lg shrink-0" style={{ background: 'rgba(59,130,246,0.12)' }}>
            <ShoppingCart size={18} className="text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Total Purchases</p>
            <p className="text-xl font-bold text-blue-300">{stats.totalCount}</p>
            <p className="text-[10px] text-slate-500">entries recorded</p>
          </div>
        </div>

        <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)' }}>
          <div className="p-2.5 rounded-lg shrink-0" style={{ background: 'rgba(239,68,68,0.12)' }}>
            <TrendingDown size={18} className="text-red-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Total Spending</p>
            <p className="text-xl font-bold text-red-300">{fmtRs(stats.totalSpend)}</p>
            <p className="text-[10px] text-slate-500">all time</p>
          </div>
        </div>

        <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.18)' }}>
          <div className="p-2.5 rounded-lg shrink-0" style={{ background: 'rgba(34,197,94,0.12)' }}>
            <CalendarDays size={18} className="text-green-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">This Month's Spending</p>
            <p className="text-xl font-bold text-green-300">{fmtRs(stats.thisMonthSpend)}</p>
            <p className="text-[10px] text-slate-500">{stats.thisMonthCount} purchases</p>
          </div>
        </div>

      </div>

      {/* ── Filter bar + action ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">

        <div className="flex items-center gap-1.5 flex-wrap">
          {([ ['today', 'Today'], ['yesterday', 'Yesterday'], ['all', 'All Time'] ] as [DateFilter, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setDateFilter(val)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={dateFilter === val
                ? { background: 'rgba(249,115,22,0.18)', border: '1px solid rgba(249,115,22,0.35)', color: '#fb923c' }
                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,1)' }
              }
            >
              {label}
            </button>
          ))}

          {/* Date picker pill */}
          <div className="relative flex items-center">
            <button
              onClick={() => setDateFilter('custom')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={dateFilter === 'custom'
                ? { background: 'rgba(249,115,22,0.18)', border: '1px solid rgba(249,115,22,0.35)', color: '#fb923c' }
                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,1)' }
              }
            >
              <Calendar size={12} />
              {dateFilter === 'custom' && customDate ? fmtDisplay(customDate) : 'Pick Date'}
            </button>
            <input
              type="date"
              max={todayStr()}
              value={customDate}
              onChange={(e) => { setCustomDate(e.target.value); setDateFilter('custom'); }}
              className="absolute inset-0 opacity-0 cursor-pointer w-full"
              tabIndex={-1}
            />
          </div>

          <span className="text-xs text-slate-600 ml-1">
            {filtered.length} entry{filtered.length !== 1 ? 'ies' : ''}
          </span>
        </div>

        {!showForm && !editEntry && (
          <button className={BTN_PRIMARY} onClick={openAdd}>
            <Plus size={14} /> Log Purchase
          </button>
        )}
      </div>

      {/* ── Add / Edit form ───────────────────────────────────────────────── */}
      {(showForm || editEntry) && (
        <LogForm
          onClose={closeForm}
          editEntry={editEntry ?? undefined}
        />
      )}

      {/* ── Filtered total banner ─────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div
          className="flex items-center justify-between px-4 py-2.5 rounded-xl"
          style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.15)' }}
        >
          <span className="text-xs text-slate-400">
            Total spend ·{' '}
            {dateFilter === 'today'     ? 'Today' :
             dateFilter === 'yesterday' ? 'Yesterday' :
             dateFilter === 'custom' && customDate ? fmtDisplay(customDate) : 'All Time'}
          </span>
          <span className="text-sm font-bold text-orange-400">
            Rs. {filteredTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </span>
        </div>
      )}

      {/* ── Purchases table ───────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className={`${CARD} text-center py-14`}>
          <ShoppingCart size={28} className="text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">
            {purchases.length === 0
              ? 'No purchases recorded yet. Click "Log Purchase" to start tracking.'
              : 'No purchases for this date range.'}
          </p>
        </div>
      ) : (
        <div className={CARD}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={TH}>Date</th>
                  <th className={TH}>Item</th>
                  <th className={`${TH} hidden sm:table-cell`}>Category</th>
                  <th className={TH}>Quantity</th>
                  <th className={`${TH} hidden md:table-cell`}>Rate (Rs.)</th>
                  <th className={TH}>Total Cost</th>
                  <th className={TH}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.015] transition-colors">
                    <td className={`${TD} whitespace-nowrap`}>
                      <p className="text-foreground font-medium">{fmtDisplay(p.date)}</p>
                      <p className="text-[10px] text-slate-500">{p.time}</p>
                    </td>
                    <td className={TD}>
                      <p className="font-medium text-foreground">{p.itemName}</p>
                    </td>
                    <td className={`${TD} hidden sm:table-cell`}>
                      {catBadge(p.category)}
                    </td>
                    <td className={`${TD} text-muted-foreground`}>{p.quantity}</td>
                    <td className={`${TD} hidden md:table-cell text-muted-foreground`}>
                      {p.rate.toLocaleString('en-IN')}
                    </td>
                    <td className={TD}>
                      <span className="font-semibold text-orange-400">
                        Rs. {p.totalCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className={TD}>
                      <div className="flex items-center gap-0.5">
                        <button
                          className={BTN_EDIT}
                          title="Edit entry"
                          onClick={() => openEdit(p)}
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          className={BTN_DANGER}
                          title="Delete entry"
                          onClick={() => handleDelete(p)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/[0.08]">
                  <td colSpan={5} className="pt-3 text-xs text-muted-foreground">
                    {filtered.length} entr{filtered.length !== 1 ? 'ies' : 'y'} shown
                  </td>
                  <td className="pt-3 text-sm font-bold text-foreground">
                    Rs. {filteredTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
