import { useState, useMemo } from 'react';
import { useInventoryStore } from '@/store/useInventoryStore';
import { GroceryPurchase } from '@/types/pos';
import { CARD, CARD_SM, BTN_PRIMARY, BTN_GHOST, BTN_DANGER, INPUT, SELECT, LABEL, TH, TD } from './styles';
import { toast } from 'sonner';
import { Plus, Trash2, Save, X, ShoppingCart, TrendingDown, Calendar } from 'lucide-react';
import { format, startOfMonth, subMonths } from 'date-fns';

const GROCERY_UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'dozen', 'packet', 'box', 'bag', 'tin', 'bunch'];
const TODAY = new Date().toISOString().slice(0, 10);

const EMPTY_FORM: Omit<GroceryPurchase, 'id'> = {
  item: '', qty: 0, unit: 'kg', cost: 0,
  supplier: '', invoiceNo: '', date: TODAY, note: '',
};

// ── Add Purchase Form ─────────────────────────────────────────────────────────
const AddPurchaseForm = ({ onClose }: { onClose: () => void }) => {
  const addGroceryPurchase = useInventoryStore((s) => s.addGroceryPurchase);
  const [form, setForm] = useState(EMPTY_FORM);

  const f = (k: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.item.trim())       return toast.error('Item name is required');
    const qty  = parseFloat(String(form.qty));
    const cost = parseFloat(String(form.cost));
    if (isNaN(qty)  || qty  <= 0) return toast.error('Enter a valid quantity');
    if (isNaN(cost) || cost < 0)  return toast.error('Enter a valid cost');
    if (!form.date)               return toast.error('Date is required');

    addGroceryPurchase({
      item:      form.item.trim(),
      qty,
      unit:      form.unit,
      cost,
      supplier:  form.supplier  ? form.supplier.trim()  : undefined,
      invoiceNo: form.invoiceNo ? form.invoiceNo.trim() : undefined,
      date:      form.date,
      note:      form.note      ? form.note.trim()      : undefined,
    });
    toast.success('Purchase recorded');
    onClose();
  };

  return (
    <div className={CARD}>
      <h3 className="text-sm font-semibold text-foreground mb-4">Record Grocery Purchase</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className={LABEL}>Item Name *</label>
          <input className={INPUT} placeholder="e.g. Chicken, Potato, Rice" value={form.item} onChange={f('item')} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL}>Quantity *</label>
            <input className={INPUT} type="number" min="0.01" step="any" placeholder="20" value={form.qty || ''} onChange={f('qty')} />
          </div>
          <div>
            <label className={LABEL}>Unit</label>
            <select className={SELECT} value={form.unit} onChange={f('unit')}>
              {GROCERY_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={LABEL}>Total Cost (Rs.) *</label>
          <input className={INPUT} type="number" min="0" step="any" placeholder="2000" value={form.cost || ''} onChange={f('cost')} />
        </div>
        <div>
          <label className={LABEL}>Date *</label>
          <input className={INPUT} type="date" value={form.date} onChange={f('date')} />
        </div>
        <div>
          <label className={LABEL}>Supplier</label>
          <input className={INPUT} placeholder="Supplier name" value={form.supplier} onChange={f('supplier')} />
        </div>
        <div>
          <label className={LABEL}>Invoice #</label>
          <input className={INPUT} placeholder="INV-001" value={form.invoiceNo} onChange={f('invoiceNo')} />
        </div>
        <div className="col-span-2">
          <label className={LABEL}>Note (optional)</label>
          <input className={INPUT} placeholder="Any additional notes…" value={form.note} onChange={f('note')} />
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button className={BTN_PRIMARY} onClick={handleSave}><Save size={14} /> Save Purchase</button>
        <button className={BTN_GHOST} onClick={onClose}><X size={14} /> Cancel</button>
      </div>
    </div>
  );
};

// ── Main Section ──────────────────────────────────────────────────────────────
export const GrocerySection = () => {
  const purchases         = useInventoryStore((s) => s.groceryPurchases);
  const deleteGrocery     = useInventoryStore((s) => s.deleteGroceryPurchase);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch]     = useState('');

  const monthStart = useMemo(() => startOfMonth(new Date()).toISOString().slice(0, 10), []);
  const prevMonthStart = useMemo(() => startOfMonth(subMonths(new Date(), 1)).toISOString().slice(0, 10), []);

  const stats = useMemo(() => {
    const totalSpend = purchases.reduce((s, p) => s + p.cost, 0);
    const thisMonth  = purchases.filter((p) => p.date >= monthStart);
    const prevMonth  = purchases.filter((p) => p.date >= prevMonthStart && p.date < monthStart);
    const avgCost    = purchases.length > 0 ? totalSpend / purchases.length : 0;

    // Supplier breakdown
    const bySupplier: Record<string, { count: number; total: number }> = {};
    for (const p of purchases) {
      const s = p.supplier ?? 'Unknown';
      if (!bySupplier[s]) bySupplier[s] = { count: 0, total: 0 };
      bySupplier[s].count++;
      bySupplier[s].total += p.cost;
    }
    const topSuppliers = Object.entries(bySupplier)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 5);

    return { totalSpend, thisMonth, prevMonth, avgCost, topSuppliers };
  }, [purchases, monthStart, prevMonthStart]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = search
      ? purchases.filter((p) =>
          p.item.toLowerCase().includes(q) ||
          (p.supplier ?? '').toLowerCase().includes(q) ||
          (p.invoiceNo ?? '').toLowerCase().includes(q)
        )
      : purchases;
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [purchases, search]);

  const fmtRs = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-IN')}`;

  return (
    <div className="space-y-5">

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={CARD_SM}>
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart size={13} className="text-blue-400" />
            <span className="text-xs text-muted-foreground">Total Purchases</span>
          </div>
          <p className="text-xl font-bold text-foreground">{purchases.length}</p>
          <p className="text-xs text-muted-foreground/60">entries recorded</p>
        </div>
        <div className={CARD_SM}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={13} className="text-red-400" />
            <span className="text-xs text-muted-foreground">Total Spending</span>
          </div>
          <p className="text-xl font-bold text-foreground">{fmtRs(stats.totalSpend)}</p>
          <p className="text-xs text-muted-foreground/60">all time</p>
        </div>
        <div className={CARD_SM}>
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={13} className="text-green-400" />
            <span className="text-xs text-muted-foreground">This Month</span>
          </div>
          <p className="text-xl font-bold text-foreground">{fmtRs(stats.thisMonth.reduce((s, p) => s + p.cost, 0))}</p>
          <p className="text-xs text-muted-foreground/60">{stats.thisMonth.length} purchases</p>
        </div>
        <div className={CARD_SM}>
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={13} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Avg per Entry</span>
          </div>
          <p className="text-xl font-bold text-foreground">{fmtRs(stats.avgCost)}</p>
          <p className="text-xs text-muted-foreground/60">per purchase</p>
        </div>
      </div>

      {/* Header + Add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Purchase Ledger</h3>
        <div className="flex items-center gap-2">
          <input
            className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent w-44"
            placeholder="Search entries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {!showForm && (
            <button className={BTN_PRIMARY} onClick={() => setShowForm(true)}>
              <Plus size={14} /> Add Purchase
            </button>
          )}
        </div>
      </div>

      {showForm && <AddPurchaseForm onClose={() => setShowForm(false)} />}

      {/* Purchase history table */}
      {purchases.length === 0 ? (
        <div className={`${CARD} text-center py-12 text-muted-foreground text-sm`}>
          No purchases recorded yet. Click "Add Purchase" to start tracking grocery expenses.
        </div>
      ) : (
        <div className={CARD}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={TH}>Date</th>
                  <th className={TH}>Item</th>
                  <th className={`${TH} hidden sm:table-cell`}>Qty</th>
                  <th className={TH}>Cost</th>
                  <th className={`${TH} hidden md:table-cell`}>Supplier</th>
                  <th className={`${TH} hidden md:table-cell`}>Invoice</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p: GroceryPurchase) => (
                  <tr key={p.id} className="border-b border-white/[0.04] last:border-0">
                    <td className={`${TD} text-muted-foreground whitespace-nowrap`}>{p.date}</td>
                    <td className={TD}>
                      <p className="font-medium text-foreground">{p.item}</p>
                      {p.note && <p className="text-xs text-muted-foreground/60 truncate max-w-[120px]">{p.note}</p>}
                    </td>
                    <td className={`${TD} hidden sm:table-cell text-muted-foreground`}>
                      {p.qty} {p.unit}
                    </td>
                    <td className={`${TD} font-semibold text-foreground`}>
                      Rs. {p.cost.toLocaleString('en-IN')}
                    </td>
                    <td className={`${TD} hidden md:table-cell text-muted-foreground`}>{p.supplier ?? '—'}</td>
                    <td className={`${TD} hidden md:table-cell text-muted-foreground`}>{p.invoiceNo ?? '—'}</td>
                    <td className={TD}>
                      <button
                        className={BTN_DANGER}
                        onClick={() => { if (confirm('Delete this purchase entry?')) { deleteGrocery(p.id); toast.success('Entry deleted'); } }}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/[0.08]">
                  <td colSpan={3} className="pt-2.5 text-xs text-muted-foreground">
                    {filtered.length} {filtered.length !== purchases.length ? `of ${purchases.length}` : ''} entries
                  </td>
                  <td className="pt-2.5 text-sm font-bold text-foreground">
                    Rs. {filtered.reduce((s, p) => s + p.cost, 0).toLocaleString('en-IN')}
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Supplier summary */}
      {stats.topSuppliers.length > 1 && (
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-foreground mb-4">Supplier Summary</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className={TH}>Supplier</th>
                <th className={`${TH} text-right`}>Purchases</th>
                <th className={`${TH} text-right`}>Total Spend</th>
              </tr>
            </thead>
            <tbody>
              {stats.topSuppliers.map(([supplier, { count, total }]) => (
                <tr key={supplier} className="border-b border-white/[0.04] last:border-0">
                  <td className={`${TD} text-foreground font-medium`}>{supplier}</td>
                  <td className={`${TD} text-right text-muted-foreground`}>{count}</td>
                  <td className={`${TD} text-right font-semibold text-foreground`}>Rs. {total.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
