import { useState, useMemo } from 'react';
import { useInventoryStore } from '@/store/useInventoryStore';
import { InventoryMovement, InvMovementType } from '@/types/pos';
import { TH, TD } from './styles';
import { TypeBadge } from './components';
import { format, startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { Activity, AlertTriangle, ArrowDownLeft, ArrowUpRight, Search } from 'lucide-react';

type TypeFilter = 'all' | InvMovementType;
type ProdFilter = 'all' | 'spirits' | 'wine' | 'beer' | 'soft-drinks' | 'cigarettes';
type DateFilter = 'all' | 'today' | 'week' | 'month';

const MOVE_TYPES: { id: TypeFilter; label: string }[] = [
  { id: 'all',        label: 'All' },
  { id: 'Purchase',   label: 'Purchase' },
  { id: 'Sale',       label: 'Sale' },
  { id: 'Adjustment', label: 'Adjustment' },
  { id: 'Waste',      label: 'Waste' },
  { id: 'Correction', label: 'Correction' },
];

const PROD_TYPES: { id: ProdFilter; label: string }[] = [
  { id: 'all',         label: 'All' },
  { id: 'spirits',     label: 'Spirits' },
  { id: 'wine',        label: 'Wine' },
  { id: 'beer',        label: 'Beer' },
  { id: 'soft-drinks', label: 'Soft Drinks' },
  { id: 'cigarettes',  label: 'Cigarettes' },
];

const DATE_OPTIONS: { id: DateFilter; label: string }[] = [
  { id: 'all',   label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: 'week',  label: 'This Week' },
  { id: 'month', label: 'This Month' },
];

const PAGE_SIZE = 50;

function movementCategory(m: InventoryMovement): Exclude<ProdFilter, 'all'> {
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

// ── Display-unit formatter ────────────────────────────────────────────────────
// Returns container-unit primary string + muted raw secondary.
// Alcohol → btl/ml  |  Beverage → btl/can/pcs  |  Cigarette → packets/sticks
function fmtQty(m: InventoryMovement): { primary: string; secondary: string | null } {
  const abs  = Math.abs(m.quantity);
  const sign = m.quantity >= 0 ? '+' : '−';

  // New movements carry explicit container qty
  if (m.containerQty !== undefined && m.containerUnit) {
    const cAbs  = Math.abs(m.containerQty);
    const raw   = `${abs.toLocaleString()} ${m.unit}`;
    const cont  = `${sign}${cAbs} ${m.containerUnit}`;
    return {
      primary:   cont,
      secondary: cont === `${sign}${raw}` ? null : raw,
    };
  }

  // Legacy purchase movements: notes carries human-readable text
  if (m.notes && (m.type === 'Purchase' || m.source === 'bar')) {
    return { primary: `${sign} ${m.notes}`, secondary: null };
  }

  // Raw fallback (adjustments / sales / corrections)
  return { primary: `${sign}${abs.toLocaleString()} ${m.unit}`, secondary: null };
}

function movementQtyBadgeClass(m: InventoryMovement): string {
  if (m.type === 'Waste') {
    return 'bg-amber-950/80 border border-amber-800/80 text-amber-300 font-semibold px-2.5 py-1 rounded-lg text-xs';
  }
  if (m.type === 'Sale' || m.quantity < 0) {
    return 'bg-rose-950/80 border border-rose-800/80 text-rose-300 font-bold px-2.5 py-1 rounded-lg text-xs';
  }
  return 'bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 font-bold px-2.5 py-1 rounded-lg text-xs';
}

export const MovementsSection = () => {
  const movements = useInventoryStore((s) => s.invMovements);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [prodFilter, setProdFilter] = useState<ProdFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(1);

  const todayStart = useMemo(() => startOfDay(new Date()).getTime(), []);
  const weekStart  = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }).getTime(), []);
  const monthStart = useMemo(() => startOfMonth(new Date()).getTime(), []);

  const filtered = useMemo(() => {
    let list = [...movements];
    if (typeFilter !== 'all') list = list.filter((m) => m.type === typeFilter);
    if (prodFilter !== 'all') list = list.filter((m) => movementCategory(m) === prodFilter);
    if (dateFilter === 'today') list = list.filter((m) => m.timestamp >= todayStart);
    if (dateFilter === 'week')  list = list.filter((m) => m.timestamp >= weekStart);
    if (dateFilter === 'month') list = list.filter((m) => m.timestamp >= monthStart);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((m) =>
        m.productName.toLowerCase().includes(q) ||
        (m.reference ?? '').toLowerCase().includes(q) ||
        (m.reason ?? '').toLowerCase().includes(q) ||
        (m.supplier ?? '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [movements, typeFilter, prodFilter, dateFilter, search, todayStart, weekStart, monthStart]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => ({
    total: movements.length,
    restocks: movements.filter((m) => m.type === 'Purchase' || (m.source === 'bar' && m.quantity > 0)).length,
    sales: movements.filter((m) => m.type === 'Sale').length,
    waste: movements.filter((m) => m.type === 'Waste').length,
  }), [movements]);

  // Reset to page 1 when filters change
  useMemo(() => { setPage(1); }, [typeFilter, prodFilter, dateFilter, search]);

  const FilterBar = ({ options, value, onChange }: {
    options: { id: string; label: string }[];
    value: string;
    onChange: (v: string) => void;
  }) => (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`px-3.5 py-1.5 rounded-lg text-xs transition-all ${
            value === o.id
              ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
              : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-slate-300" />
          <h3 className="text-sm font-bold text-white">Stock Movements</h3>
        </div>
        <span className="text-xs text-slate-400">{filtered.length} records</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
          <div className="flex items-center gap-2 mb-2"><Activity size={15} className="text-slate-300" /><span className="text-xs font-semibold text-slate-300">Total Events</span></div>
          <p className="text-xl font-bold text-white">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4">
          <div className="flex items-center gap-2 mb-2"><ArrowDownLeft size={15} className="text-emerald-400" /><span className="text-xs font-semibold text-slate-300">Restock / Purchases</span></div>
          <p className="text-xl font-bold text-emerald-300">{stats.restocks}</p>
        </div>
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-4">
          <div className="flex items-center gap-2 mb-2"><ArrowUpRight size={15} className="text-rose-400" /><span className="text-xs font-semibold text-slate-300">POS Sales</span></div>
          <p className="text-xl font-bold text-rose-300">{stats.sales}</p>
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle size={15} className="text-amber-400" /><span className="text-xs font-semibold text-slate-300">Spills / Loss</span></div>
          <p className="text-xl font-bold text-amber-300">{stats.waste}</p>
        </div>
      </div>

      {/* Filter bars */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <FilterBar options={MOVE_TYPES}  value={typeFilter}  onChange={(v) => setTypeFilter(v as TypeFilter)} />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <FilterBar options={PROD_TYPES}  value={prodFilter}  onChange={(v) => setProdFilter(v as ProdFilter)} />
          <FilterBar options={DATE_OPTIONS} value={dateFilter} onChange={(v) => setDateFilter(v as DateFilter)} />
          <input
            className="bg-slate-900/90 border border-slate-800 text-white placeholder:text-slate-400 rounded-xl px-4 py-2 text-sm focus:border-amber-500 focus:outline-none w-full sm:w-56"
            placeholder="Search product, ref…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 bg-slate-950 border border-slate-800 rounded-2xl">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-300 shadow-lg">
            <Activity size={24} />
          </div>
          <p className="text-slate-200 font-semibold text-base mt-4">
            {movements.length === 0 ? 'No stock movements recorded' : 'No movements match the filters'}
          </p>
          <p className="text-slate-400 text-xs max-w-sm text-center mt-1">
            {movements.length === 0 ? 'Movement history will appear here as stock changes.' : 'Try changing the movement type, product, timeframe, or search.'}
          </p>
        </div>
      ) : (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl shadow-black/20">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={TH}>Date & Time</th>
                  <th className={TH}>Product</th>
                  <th className={`${TH} hidden sm:table-cell`}>Category</th>
                  <th className={TH}>Type</th>
                  <th className={`${TH} text-right`}>Qty</th>
                  <th className={`${TH} hidden md:table-cell`}>Reference</th>
                  <th className={`${TH} hidden md:table-cell`}>Reason / Notes</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m: InventoryMovement) => {
                  const { primary, secondary } = fmtQty(m);
                  return (
                    <tr key={m.id} className="border-b border-white/[0.04] last:border-0">
                      <td className={`${TD} text-xs whitespace-nowrap`}>
                        <p className="text-slate-300">{format(m.timestamp, 'dd MMM yyyy')}</p>
                        <p className="text-slate-500">{format(m.timestamp, 'HH:mm')}</p>
                      </td>
                       <td className={`${TD} font-bold text-white`}>{m.productName}</td>
                      <td className={`${TD} hidden sm:table-cell`}>
                        {(() => {
                          const category = movementCategory(m);
                          return <span className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold ${CATEGORY_BADGE_CLASSES[category]}`}>{CATEGORY_LABELS[category]}</span>;
                        })()}
                      </td>
                      <td className={TD}><TypeBadge type={m.type} /></td>
                       <td className={`${TD} text-right whitespace-nowrap`}>
                         <span className={`inline-flex flex-col items-end ${movementQtyBadgeClass(m)}`}>
                           <span>{primary}</span>
                           {secondary && <span className="text-[10px] opacity-70 font-normal">({secondary})</span>}
                         </span>
                      </td>
                      <td className={`${TD} hidden md:table-cell text-slate-300 text-xs max-w-[100px]`}>
                        <span className="truncate block">{m.supplier || m.reference ? `${m.supplier ?? ''}${m.reference ? ` ${m.reference}` : ''}` : '—'}</span>
                      </td>
                      <td className={`${TD} hidden md:table-cell text-slate-300 text-xs max-w-[140px]`}>
                        <span className="truncate block">{m.reason ?? (m.source === 'bar' ? m.notes : undefined) ?? '—'}</span>
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
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white disabled:opacity-30 transition-all">
                  ← Prev
                </button>
                <button
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white disabled:opacity-30 transition-all">
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {movements.length > 0 && (
        <p className="text-xs text-slate-500 text-center">
          Inventory movement history is permanent. Bar portal entries can be corrected via Bar Restock Audit.
        </p>
      )}
    </div>
  );
};
