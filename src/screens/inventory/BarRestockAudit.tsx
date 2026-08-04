import { useState, useMemo } from 'react';
import { format, startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { Trash2, Pencil, X, Check, GlassWater, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { useInventoryStore } from '@/store/useInventoryStore';
import { InventoryMovement, InvProductType } from '@/types/pos';
import { fmt } from '@/utils/format';
import {
  CARD, CARD_SM, TH, TD, INPUT, LABEL, BTN_DANGER, BTN_EDIT,
  PROD_TYPE_COLORS,
} from './styles';

// ── Types ─────────────────────────────────────────────────────────────────────

type ProdFilter  = 'all' | InvProductType;
type EntryFilter = 'all' | 'Restock' | 'Spill/Loss';
type DateFilter  = 'all' | 'today' | 'week' | 'month';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROD_LABEL: Record<InvProductType, string> = {
  alcohol: 'Alcohol', beverage: 'Beverage', cigarette: 'Cigarette',
};

const ProdBadge = ({ type }: { type: InvProductType }) => (
  <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold leading-none ${PROD_TYPE_COLORS[type]}`}>
    {PROD_LABEL[type]}
  </span>
);

const EntryBadge = ({ t }: { t: 'Restock' | 'Spill/Loss' }) => (
  <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold leading-none flex items-center gap-1 w-fit ${
    t === 'Restock'
      ? 'bg-green-500/15 border-green-500/20 text-green-400'
      : 'bg-red-500/15 border-red-500/20 text-red-400'
  }`}>
    {t === 'Restock' ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
    {t}
  </span>
);

// Derive entry type from movement quantity sign
const entryTypeOf = (m: InventoryMovement): 'Restock' | 'Spill/Loss' =>
  m.quantity >= 0 ? 'Restock' : 'Spill/Loss';

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
        className="relative w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-2xl"
        style={{ background: 'linear-gradient(160deg, #0f1929 0%, #0b1220 100%)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white/90">Edit Entry</h3>
            <p className="text-xs text-white/40 mt-0.5">{entry.productName} · {entryTypeOf(entry)}</p>
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
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all hover:brightness-110 active:scale-95"
            style={{ background: 'rgba(59,130,246,0.3)', border: '1px solid rgba(59,130,246,0.5)', color: '#93c5fd' }}
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
  <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06] flex-wrap">
    {options.map((o) => (
      <button
        key={o.id}
        onClick={() => onChange(o.id)}
        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
          value === o.id ? 'bg-accent text-accent-foreground' : 'text-white/40 hover:text-white/70'
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
    if (prodFilter !== 'all') list = list.filter((m) => m.productType === prodFilter);
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
    const todaySpend  = restocks
      .filter((m) => m.timestamp >= todayStart)
      .reduce((s, m) => s + (m.totalCost ?? 0), 0);
    return {
      total:     barMovements.length,
      restocks:  restocks.length,
      spills:    spills.length,
      todaySpend,
    };
  }, [barMovements, todayStart]);

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
        <div className={CARD_SM}>
          <div className="flex items-center gap-2 mb-2">
            <GlassWater size={13} className="text-indigo-400" />
            <span className="text-xs text-muted-foreground">Total Entries</span>
          </div>
          <p className="text-xl font-bold text-foreground">{stats.total}</p>
          <p className="text-xs text-muted-foreground/60">all time</p>
        </div>
        <div className={CARD_SM}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={13} className="text-green-400" />
            <span className="text-xs text-muted-foreground">Restocks</span>
          </div>
          <p className="text-xl font-bold text-foreground">{stats.restocks}</p>
          <p className="text-xs text-muted-foreground/60">deliveries logged</p>
        </div>
        <div className={CARD_SM}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={13} className="text-red-400" />
            <span className="text-xs text-muted-foreground">Spill / Loss</span>
          </div>
          <p className="text-xl font-bold text-foreground">{stats.spills}</p>
          <p className="text-xs text-muted-foreground/60">loss entries</p>
        </div>
        <div className={CARD_SM}>
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={13} className="text-amber-400" />
            <span className="text-xs text-muted-foreground">Today's Spend</span>
          </div>
          <p className="text-xl font-bold text-foreground">Rs. {fmt(stats.todaySpend)}</p>
          <p className="text-xs text-muted-foreground/60">restock cost</p>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <FilterBar<ProdFilter>
            options={[
              { id: 'all',       label: 'All Categories' },
              { id: 'alcohol',   label: 'Alcohol'        },
              { id: 'beverage',  label: 'Beverage'       },
              { id: 'cigarette', label: 'Cigarette'      },
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
            className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent w-52"
            placeholder="Search item or staff name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} records</span>
        </div>
      </div>

      {/* ── Audit table ── */}
      {visible.length === 0 ? (
        <div className={`${CARD} text-center py-12 text-muted-foreground text-sm`}>
          {barMovements.length === 0
            ? 'No bar restock entries recorded yet.'
            : 'No entries match the selected filters.'}
        </div>
      ) : (
        <div className={CARD}>
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
                        <p className="text-muted-foreground">{format(m.timestamp, 'dd MMM yyyy')}</p>
                        <p className="text-muted-foreground/50">{format(m.timestamp, 'hh:mm a')}</p>
                      </td>

                      {/* Item */}
                      <td className={`${TD} font-medium text-foreground max-w-[140px]`}>
                        <span className="truncate block">{m.productName}</span>
                      </td>

                      {/* Category */}
                      <td className={`${TD} hidden sm:table-cell`}>
                        <ProdBadge type={m.productType} />
                      </td>

                      {/* Entry type */}
                      <td className={TD}>
                        <EntryBadge t={et} />
                      </td>

                      {/* Qty — container unit primary, raw secondary */}
                      <td className={`${TD} font-mono text-xs whitespace-nowrap`}>
                        <span className={et === 'Restock' ? 'text-green-400' : 'text-red-400'}>
                          {et === 'Restock' ? '+' : '−'}{qty}
                        </span>{' '}
                        <span className="text-muted-foreground/60">{unit}</span>
                      </td>

                      {/* Cost */}
                      <td className={`${TD} hidden md:table-cell text-muted-foreground`}>
                        {(m.totalCost ?? 0) > 0
                          ? <span className="text-foreground font-medium">Rs. {fmt(m.totalCost!)}</span>
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>

                      {/* Supplier */}
                      <td className={`${TD} hidden md:table-cell text-muted-foreground text-xs max-w-[110px]`}>
                        <span className="truncate block">{m.supplier || '—'}</span>
                      </td>

                      {/* Logged By */}
                      <td className={`${TD} hidden lg:table-cell text-muted-foreground text-xs`}>
                        {m.loggedBy || '—'}
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
              <span className="text-xs text-muted-foreground">
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
        <p className="text-xs text-muted-foreground/50 text-center">
          Deleting or editing an entry automatically corrects live inventory stock.
        </p>
      )}
    </div>
  );
};
