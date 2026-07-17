import { useState, useMemo } from 'react';
import { useInventoryStore } from '@/store/useInventoryStore';
import { InventoryMovement, InvProductType, InvMovementType } from '@/types/pos';
import { CARD, TH, TD } from './styles';
import { TypeBadge, ProdTypeBadge } from './components';
import { format, startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { Activity } from 'lucide-react';

type TypeFilter = 'all' | InvMovementType;
type ProdFilter = 'all' | InvProductType;
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
  { id: 'all',       label: 'All' },
  { id: 'alcohol',   label: 'Alcohol' },
  { id: 'beverage',  label: 'Beverages' },
  { id: 'cigarette', label: 'Cigarettes' },
];

const DATE_OPTIONS: { id: DateFilter; label: string }[] = [
  { id: 'all',   label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: 'week',  label: 'This Week' },
  { id: 'month', label: 'This Month' },
];

const PAGE_SIZE = 50;

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
    if (prodFilter !== 'all') list = list.filter((m) => m.productType === prodFilter);
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

  // Reset to page 1 when filters change
  useMemo(() => { setPage(1); }, [typeFilter, prodFilter, dateFilter, search]);

  const FilterBar = ({ options, value, onChange }: {
    options: { id: string; label: string }[];
    value: string;
    onChange: (v: string) => void;
  }) => (
    <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06] flex-wrap">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            value === o.id ? 'bg-accent text-accent-foreground' : 'text-white/40 hover:text-white/70'
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
          <Activity size={15} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Stock Movements</h3>
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} records</span>
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
            className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent w-44"
            placeholder="Search product, ref…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className={`${CARD} text-center py-12 text-muted-foreground text-sm`}>
          {movements.length === 0
            ? 'No stock movements recorded yet.'
            : 'No movements match the selected filters.'}
        </div>
      ) : (
        <div className={CARD}>
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
                {visible.map((m: InventoryMovement) => (
                  <tr key={m.id} className="border-b border-white/[0.04] last:border-0">
                    <td className={`${TD} text-xs whitespace-nowrap`}>
                      <p className="text-muted-foreground">{format(m.timestamp, 'dd MMM yyyy')}</p>
                      <p className="text-muted-foreground/50">{format(m.timestamp, 'HH:mm')}</p>
                    </td>
                    <td className={`${TD} font-medium text-foreground`}>{m.productName}</td>
                    <td className={`${TD} hidden sm:table-cell`}><ProdTypeBadge type={m.productType} /></td>
                    <td className={TD}><TypeBadge type={m.type} /></td>
                    <td className={`${TD} text-right font-mono font-semibold ${m.quantity >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {m.quantity >= 0 ? '+' : ''}{m.quantity.toLocaleString()} {m.unit}
                    </td>
                    <td className={`${TD} hidden md:table-cell text-muted-foreground text-xs max-w-[100px]`}>
                      <span className="truncate block">{m.supplier ? `${m.supplier}` : ''}{m.reference ? ` ${m.reference}` : ''|| '—'}</span>
                    </td>
                    <td className={`${TD} hidden md:table-cell text-muted-foreground text-xs max-w-[140px]`}>
                      <span className="truncate block">{m.reason ?? m.notes ?? '—'}</span>
                    </td>
                  </tr>
                ))}
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
        <p className="text-xs text-muted-foreground/50 text-center">
          Movement history is permanent and cannot be deleted.
        </p>
      )}
    </div>
  );
};
