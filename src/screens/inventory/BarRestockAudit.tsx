import { useState, useMemo } from 'react';
import { format, startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { AlertOctagon, Boxes, Check, DollarSign, Pencil, Search, Trash2, TrendingDown, TrendingUp, Truck, X } from 'lucide-react';
import { toast } from 'sonner';
import { useInventoryStore } from '@/store/useInventoryStore';
import { InventoryMovement } from '@/types/pos';
import { fmt } from '@/utils/format';
import {
  TH, TD, INPUT, LABEL, BTN_DANGER, BTN_EDIT,
} from './styles';

// ── Types ─────────────────────────────────────────────────────────────────────

type ProdFilter  = 'all' | 'spirits' | 'wine' | 'beer' | 'soft-drinks' | 'cigarettes';
type EntryFilter = 'all' | 'Restock' | 'Spill/Loss';
type DateFilter  = 'all' | 'today' | 'week' | 'month';

// ── Helpers ───────────────────────────────────────────────────────────────────

function auditCategory(m: InventoryMovement): Exclude<ProdFilter, 'all'> {
  const name = m.productName.toLowerCase();
  if (m.productType === 'cigarette') return 'cigarettes';
  if (m.productType === 'alcohol') return name.includes('wine') ? 'wine' : 'spirits';
  return name.includes('beer') ? 'beer' : 'soft-drinks';
}

const CATEGORY_LABELS: Record<Exclude<ProdFilter, 'all'>, string> = {
  spirits: 'Spirits',
  wine: 'Wine',
  beer: 'Beer',
  'soft-drinks': 'Soft Drinks',
  cigarettes: 'Cigarettes',
};

const CATEGORY_BADGE_CLASSES: Record<Exclude<ProdFilter, 'all'>, string> = {
  spirits: 'bg-amber-950/70 border-amber-800/70 text-amber-300',
  wine: 'bg-purple-950/70 border-purple-800/70 text-purple-300',
  beer: 'bg-orange-950/70 border-orange-800/70 text-orange-300',
  'soft-drinks': 'bg-sky-950/70 border-sky-800/70 text-sky-300',
  cigarettes: 'bg-slate-800 border-slate-700 text-slate-300',
};

const EntryBadge = ({ t }: { t: 'Restock' | 'Spill/Loss' }) => (
  <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold leading-none flex items-center gap-1 w-fit ${
    t === 'Restock'
      ? 'bg-emerald-950/80 border border-emerald-800/80 text-emerald-300'
      : 'bg-amber-950/80 border border-amber-800/80 text-amber-300'
  }`}>
    {t === 'Restock' ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
    {t}
  </span>
);

// Derive entry type from movement quantity sign
const entryTypeOf = (m: InventoryMovement): 'Restock' | 'Spill/Loss' =>
  m.quantity >= 0 ? 'Restock' : 'Spill/Loss';

const auditQtyBadgeClass = (entryType: 'Restock' | 'Spill/Loss') =>
  entryType === 'Restock'
    ? 'bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 font-bold px-2.5 py-1 rounded-lg text-xs'
    : 'bg-amber-950/80 border border-amber-800/80 text-amber-300 font-semibold px-2.5 py-1 rounded-lg text-xs';

// Human-display qty and unit from movement
function displayQty(m: InventoryMovement): { qty: number; unit: string } {
  return {
    qty:  m.containerQty !== undefined ? Math.abs(m.containerQty) : Math.abs(m.quantity),
    unit: m.containerUnit ?? m.unit,
  };
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

interface EditModalProps {
  entry:   InventoryMovement;
  onSave:  (newContainerQty: number, newCost: number, newSupplier: string) => void;
  onClose: () => void;
}

const EditModal = ({ entry, onSave, onClose }: EditModalProps) => {
  const { qty: initQty, unit: qtyUnit } = displayQty(entry);
  const [qty,      setQty]      = useState(String(initQty));
  const [cost,     setCost]     = useState(String(entry.totalCost ?? 0));
  const [supplier, setSupplier] = useState(entry.supplier ?? '');
  const isRestock = entryTypeOf(entry) === 'Restock';

  const handleSave = () => {
    const qNum = Number(qty);
    if (!qty || qNum <= 0) { toast.error('Enter a valid quantity'); return; }
    onSave(qNum, Number(cost) || 0, supplier.trim());
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-2xl bg-slate-950 border border-slate-800"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Edit Entry</h3>
            <p className="text-xs text-slate-400 mt-0.5">{entry.productName} · {entryTypeOf(entry)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={LABEL}>
              Quantity <span className="text-white/30">({qtyUnit})</span>
            </label>
            <input
              type="number" min="0.01" step="any"
              className={INPUT}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>

          {isRestock && (
            <>
              <div>
                <label className={LABEL}>Total Cost (Rs.)</label>
                <input
                  type="number" min="0" step="1"
                  className={INPUT}
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL}>Supplier / Payment Source</label>
                <input
                  type="text"
                  className={INPUT}
                  placeholder="Cash, Credit, Supplier name…"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <p className="text-[11px] text-amber-400/70 bg-amber-400/[0.07] border border-amber-400/20 rounded-lg px-3 py-2">
          Saving will automatically correct live stock by the quantity difference.
        </p>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold shadow-lg shadow-amber-500/20 transition-all active:scale-95"
          >
            <Check size={14} /> Save Changes
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Filter pill bar ───────────────────────────────────────────────────────────

const FilterBar = <T extends string>({
  options, value, onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) => (
    <div className="flex gap-1.5 flex-wrap">
    {options.map((o) => (
      <button
        key={o.id}
        onClick={() => onChange(o.id)}
        className={`px-3.5 py-1.5 rounded-lg text-xs transition-all ${
          value === o.id
            ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
            : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export const BarRestockAudit = () => {
  const movements          = useInventoryStore((s) => s.invMovements);
  const updateBarMovement  = useInventoryStore((s) => s.updateBarMovement);
  const deleteBarMovement  = useInventoryStore((s) => s.deleteBarMovement);

  const [prodFilter,   setProdFilter]   = useState<ProdFilter>('all');
  const [entryFilter,  setEntryFilter]  = useState<EntryFilter>('all');
  const [dateFilter,   setDateFilter]   = useState<DateFilter>('all');
  const [search,       setSearch]       = useState('');
  const [page,         setPage]         = useState(1);
  const [editingEntry, setEditingEntry] = useState<InventoryMovement | null>(null);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);

  const todayStart = useMemo(() => startOfDay(new Date()).getTime(), []);
  const weekStart  = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }).getTime(), []);
  const monthStart = useMemo(() => startOfMonth(new Date()).getTime(), []);

  // Bar-sourced movements only
  const barMovements = useMemo(
    () => movements.filter((m) => m.source === 'bar'),
    [movements],
  );

  // ── Filtered & sorted list ──
  const filtered = useMemo(() => {
    let list = [...barMovements];
    if (prodFilter !== 'all') list = list.filter((m) => auditCategory(m) === prodFilter);
    if (entryFilter === 'Restock')    list = list.filter((m) => m.quantity >= 0);
    if (entryFilter === 'Spill/Loss') list = list.filter((m) => m.quantity < 0);
    if (dateFilter === 'today') list = list.filter((m) => m.timestamp >= todayStart);
    if (dateFilter === 'week')  list = list.filter((m) => m.timestamp >= weekStart);
    if (dateFilter === 'month') list = list.filter((m) => m.timestamp >= monthStart);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((m) =>
        m.productName.toLowerCase().includes(q) ||
        (m.loggedBy ?? '').toLowerCase().includes(q) ||
        (m.supplier ?? '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [barMovements, prodFilter, entryFilter, dateFilter, search, todayStart, weekStart, monthStart]);

  // Reset page on filter change
  useMemo(() => setPage(1), [prodFilter, entryFilter, dateFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Stats (over all bar movements) ──
  const stats = useMemo(() => {
    const restocks    = barMovements.filter((m) => m.quantity >= 0);
    const spills      = barMovements.filter((m) => m.quantity < 0);
    return {
      total:     barMovements.length,
      restocks:  restocks.length,
      spills:    spills.length,
      totalSpend: restocks.reduce((s, m) => s + (m.totalCost ?? 0), 0),
    };
  }, [barMovements]);

  // ── Edit save ──
  const handleSaveEdit = (newContainerQty: number, newCost: number, newSupplier: string) => {
    if (!editingEntry) return;

    const oldContainerQty = editingEntry.containerQty !== undefined
      ? Math.abs(editingEntry.containerQty)
      : Math.abs(editingEntry.quantity);

    const sign = editingEntry.quantity >= 0 ? 1 : -1;
    const newBaseUnitChange = oldContainerQty > 0
      ? sign * (newContainerQty / oldContainerQty) * Math.abs(editingEntry.quantity)
      : sign * newContainerQty;

    updateBarMovement({
      id:               editingEntry.id,
      containerQty:     newContainerQty,
      newBaseUnitChange,
      totalCost:        newCost,
      supplier:         newSupplier,
    });

    toast.success('Entry updated and stock corrected');
    setEditingEntry(null);
  };

  // ── Delete ──
  const handleDelete = (m: InventoryMovement) => {
    if (deletingId !== m.id) { setDeletingId(m.id); return; }
    deleteBarMovement(m.id);
    setDeletingId(null);
    toast.success('Entry removed and stock reversed');
  };

  // ── Render ──
  return (
    <div className="space-y-5">

      {/* Edit modal */}
      {editingEntry && (
        <EditModal
          entry={editingEntry}
          onSave={handleSaveEdit}
          onClose={() => setEditingEntry(null)}
        />
      )}

      {/* ── Summary stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Boxes size={15} className="text-amber-300" />
            <span className="text-xs font-semibold text-slate-300">Total Entries</span>
          </div>
          <p className="text-xl font-bold text-white">{stats.total}</p>
          <p className="text-xs text-slate-400 mt-1">all time</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Truck size={15} className="text-emerald-400" />
            <span className="text-xs font-semibold text-slate-300">Restocks Logged</span>
          </div>
          <p className="text-xl font-bold text-emerald-300">{stats.restocks}</p>
          <p className="text-xs text-slate-400 mt-1">deliveries logged</p>
        </div>
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertOctagon size={15} className="text-rose-400" />
            <span className="text-xs font-semibold text-slate-300">Loss / Spills</span>
          </div>
          <p className="text-xl font-bold text-rose-300">{stats.spills}</p>
          <p className="text-xs text-slate-400 mt-1">loss entries</p>
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={13} className="text-amber-400" />
            <span className="text-xs font-semibold text-slate-300">Total Spend</span>
          </div>
          <p className="text-xl font-bold text-amber-300">Rs. {fmt(stats.totalSpend)}</p>
          <p className="text-xs text-slate-400 mt-1">restock cost</p>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <FilterBar<ProdFilter>
            options={[
               { id: 'all',         label: 'All'         },
               { id: 'spirits',     label: 'Spirits'     },
               { id: 'wine',        label: 'Wine'        },
               { id: 'beer',        label: 'Beer'        },
               { id: 'soft-drinks', label: 'Soft Drinks' },
               { id: 'cigarettes',  label: 'Cigarettes'  },
            ]}
            value={prodFilter}
            onChange={setProdFilter}
          />
          <FilterBar<EntryFilter>
            options={[
              { id: 'all',        label: 'All Types'  },
              { id: 'Restock',    label: 'Restock'    },
              { id: 'Spill/Loss', label: 'Spill/Loss' },
            ]}
            value={entryFilter}
            onChange={setEntryFilter}
          />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <FilterBar<DateFilter>
            options={[
              { id: 'all',   label: 'All Time'   },
              { id: 'today', label: 'Today'      },
              { id: 'week',  label: 'This Week'  },
              { id: 'month', label: 'This Month' },
            ]}
            value={dateFilter}
            onChange={setDateFilter}
          />
          <input
            className="bg-slate-900/90 border border-slate-800 text-white placeholder:text-slate-400 rounded-xl px-4 py-2 text-sm focus:border-amber-500 focus:outline-none w-full sm:w-56"
            placeholder="Search item or staff name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
            <span className="text-xs text-slate-400 ml-auto">{filtered.length} records</span>
        </div>
      </div>

      {/* ── Audit table ── */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 bg-slate-950 border border-slate-800 rounded-2xl">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-amber-400 shadow-lg shadow-amber-950/30">
            <Boxes size={24} />
          </div>
          <p className="text-slate-200 font-semibold text-base mt-4">
            {barMovements.length === 0 ? 'No bar restock entries recorded' : 'No entries match the filters'}
          </p>
          <p className="text-slate-400 text-xs max-w-sm text-center mt-1">
            {barMovements.length === 0 ? 'Bar restocks, spills, and losses will appear here.' : 'Try changing the category, entry type, timeframe, or search.'}
          </p>
        </div>
      ) : (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl shadow-black/20">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={TH}>Date & Time</th>
                  <th className={TH}>Item</th>
                  <th className={`${TH} hidden sm:table-cell`}>Category</th>
                  <th className={TH}>Type</th>
                  <th className={TH}>Qty</th>
                  <th className={`${TH} hidden md:table-cell`}>Cost</th>
                  <th className={`${TH} hidden md:table-cell`}>Supplier</th>
                  <th className={`${TH} hidden lg:table-cell`}>Logged By</th>
                  <th className={`${TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m: InventoryMovement) => {
                  const isDeleting = deletingId === m.id;
                  const et = entryTypeOf(m);
                  const { qty, unit } = displayQty(m);
                  return (
                    <tr
                      key={m.id}
                      className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.015] transition-colors"
                    >
                      {/* Date & Time */}
                      <td className={`${TD} text-xs whitespace-nowrap`}>
                        <p className="text-slate-300">{format(m.timestamp, 'dd MMM yyyy')}</p>
                        <p className="text-slate-500">{format(m.timestamp, 'hh:mm a')}</p>
                      </td>

                      {/* Item */}
                       <td className={`${TD} font-bold text-white max-w-[140px]`}>
                        <span className="truncate block">{m.productName}</span>
                      </td>

                      {/* Category */}
                      <td className={`${TD} hidden sm:table-cell`}>
                         {(() => {
                           const category = auditCategory(m);
                           return <span className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold ${CATEGORY_BADGE_CLASSES[category]}`}>{CATEGORY_LABELS[category]}</span>;
                         })()}
                      </td>

                      {/* Entry type */}
                      <td className={TD}>
                        <EntryBadge t={et} />
                      </td>

                      {/* Qty — container unit primary, raw secondary */}
                       <td className={`${TD} whitespace-nowrap`}>
                         <span className={`inline-flex items-center gap-1 ${auditQtyBadgeClass(et)}`}>
                           {et === 'Restock' ? '+' : '−'}{qty} {unit}
                         </span>
                      </td>

                      {/* Cost */}
                       <td className={`${TD} hidden md:table-cell text-slate-300`}>
                        {(m.totalCost ?? 0) > 0
                           ? <span className="text-amber-300 font-bold">Rs. {fmt(m.totalCost!)}</span>
                           : <span className="text-slate-500">—</span>}
                      </td>

                      {/* Supplier */}
                       <td className={`${TD} hidden md:table-cell text-slate-300 text-xs max-w-[110px]`}>
                        <span className="truncate block">{m.supplier || '—'}</span>
                      </td>

                      {/* Logged By */}
                       <td className={`${TD} hidden lg:table-cell text-slate-300 text-xs`}>
                         {m.loggedBy || <span className="text-slate-500">—</span>}
                      </td>

                      {/* Actions */}
                      <td className={`${TD} text-right whitespace-nowrap`}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setDeletingId(null); setEditingEntry(m); }}
                            className={BTN_EDIT}
                            title="Edit entry"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(m)}
                            className={`${BTN_DANGER} ${isDeleting ? '!text-red-400 !bg-red-400/10' : ''}`}
                            title={isDeleting ? 'Click again to confirm delete' : 'Delete entry'}
                          >
                            {isDeleting ? (
                              <span className="text-[10px] font-semibold px-1">Confirm?</span>
                            ) : (
                              <Trash2 size={13} />
                            )}
                          </button>
                          {isDeleting && (
                            <button
                              onClick={() => setDeletingId(null)}
                              className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
                              title="Cancel"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/[0.06]">
              <span className="text-xs text-slate-400">
                Page {page} of {pageCount} · {filtered.length} total
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white disabled:opacity-30 transition-all"
                >
                  ← Prev
                </button>
                <button
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white disabled:opacity-30 transition-all"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {barMovements.length > 0 && (
        <p className="text-xs text-slate-500 text-center">
          Deleting or editing an entry automatically corrects live inventory stock.
        </p>
      )}
    </div>
  );
};
