import { useState, useMemo } from 'react';
import { useInventoryStore } from '@/store/useInventoryStore';
import { InventoryMovement, InvProductType } from '@/types/pos';
import { TH, TD } from './styles';
import { format, startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { Calendar, PieChart, Search, ShoppingBag, TrendingUp } from 'lucide-react';
import { fmt } from '@/utils/format';

type CategoryFilter = 'all' | 'spirits' | 'wine' | 'beer' | 'soft-drinks' | 'cigarettes';

function categoryOfPurchase(row: Pick<NormRow, 'productName' | 'productType'>): Exclude<CategoryFilter, 'all'> {
  const name = row.productName.toLowerCase();
  if (row.productType === 'cigarette') return 'cigarettes';
  if (row.productType === 'alcohol') return name.includes('wine') ? 'wine' : 'spirits';
  return name.includes('beer') ? 'beer' : 'soft-drinks';
}

const CATEGORY_LABELS: Record<Exclude<CategoryFilter, 'all'>, string> = {
  spirits: 'Spirits',
  wine: 'Wine',
  beer: 'Beer',
  'soft-drinks': 'Soft Drinks',
  cigarettes: 'Cigarettes',
};

const CATEGORY_BADGE_CLASSES: Record<Exclude<CategoryFilter, 'all'>, string> = {
  spirits: 'bg-amber-950/70 border-amber-800/70 text-amber-300',
  wine: 'bg-purple-950/70 border-purple-800/70 text-purple-300',
  beer: 'bg-orange-950/70 border-orange-800/70 text-orange-300',
  'soft-drinks': 'bg-sky-950/70 border-sky-800/70 text-sky-300',
  cigarettes: 'bg-slate-800 border-slate-700 text-slate-300',
};

// ── Qty formatter — container units first, raw in parentheses ────────────────

function fmtPurchaseQty(m: InventoryMovement): { primary: string; secondary: string | null } {
  const abs = Math.abs(m.quantity);
  const sign = m.quantity >= 0 ? '+' : '−';

  if (m.containerQty !== undefined && m.containerUnit) {
    const cAbs = Math.abs(m.containerQty);
    const rawStr = `${abs.toLocaleString()} ${m.unit}`;
    const containerStr = `${sign}${cAbs} ${m.containerUnit}`;
    return {
      primary:   containerStr,
      secondary: containerStr === `${sign}${rawStr}` ? null : rawStr,
    };
  }

  // Legacy: notes often contain human description e.g. "12 bottles × 750ml"
  if (m.notes) {
    return { primary: `${sign} ${m.notes}`, secondary: null };
  }

  return { primary: `${sign}${abs.toLocaleString()} ${m.unit}`, secondary: null };
}

// ── Normalised row ────────────────────────────────────────────────────────────

interface NormRow {
  id:          string;
  timestamp:   number;
  productName: string;
  productType: InvProductType;
  logType:     string;
  details:     string;
  supplier:    string;
  reference:   string;
  qtyPrimary:  string;
  qtySec:      string | null;
  totalCost:   number;
  loggedBy:    string;
  source:      string;
}

export const PurchasesSection = () => {
  const movements        = useInventoryStore((s) => s.invMovements);
  const groceryPurchases = useInventoryStore((s) => s.groceryPurchases);

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [search, setSearch] = useState('');

  const todayStart = useMemo(() => startOfDay(new Date()).getTime(), []);
  const weekStart  = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }).getTime(), []);
  const monthStart = useMemo(() => startOfMonth(new Date()).getTime(), []);

  // All Purchase-type invMovements (inventory forms) + bar Restock movements
  const normRows = useMemo<NormRow[]>(() =>
    movements
      .filter((m) => m.type === 'Purchase' || (m.source === 'bar' && m.quantity > 0))
      .map((m): NormRow => {
        const { primary, secondary } = fmtPurchaseQty(m);
        const logType = m.source === 'bar' ? 'Bar Restock' : 'Purchase';
        return {
          id:          m.id,
          timestamp:   m.timestamp,
          productName: m.productName,
          productType: m.productType,
          logType,
          details:     m.notes ?? '',
          supplier:    m.supplier ?? '',
          reference:   m.reference ?? '',
          qtyPrimary:  primary,
          qtySec:      secondary,
          totalCost:   m.totalCost ?? 0,
          loggedBy:    m.loggedBy ?? '',
          source:      m.source ?? 'inventory',
        };
      }),
  [movements]);

  // Merge, filter, sort
  const purchases = useMemo(() => {
    let list = [...normRows];
    if (categoryFilter !== 'all') list = list.filter((r) => categoryOfPurchase(r) === categoryFilter);
    if (dateFilter === 'today') list = list.filter((r) => r.timestamp >= todayStart);
    if (dateFilter === 'week')  list = list.filter((r) => r.timestamp >= weekStart);
    if (dateFilter === 'month') list = list.filter((r) => r.timestamp >= monthStart);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.productName.toLowerCase().includes(q) ||
        r.details.toLowerCase().includes(q) ||
        r.supplier.toLowerCase().includes(q) ||
        r.reference.toLowerCase().includes(q) ||
        r.loggedBy.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [normRows, categoryFilter, dateFilter, search, todayStart, weekStart, monthStart]);

  // Stats from full list (unfiltered)
  const stats = useMemo(() => {
    const todayCount  = normRows.filter((r) => r.timestamp >= todayStart).length;
    const weekCount   = normRows.filter((r) => r.timestamp >= weekStart).length;
    const monthCount  = normRows.filter((r) => r.timestamp >= monthStart).length;
    return { total: normRows.length, todayCount, weekCount, monthCount };
  }, [normRows, todayStart, weekStart, monthStart]);

  const FILTERS: { id: CategoryFilter; label: string }[] = [
    { id: 'all',        label: 'All' },
    { id: 'spirits',    label: 'Spirits' },
    { id: 'wine',       label: 'Wine' },
    { id: 'beer',       label: 'Beer' },
    { id: 'soft-drinks', label: 'Soft Drinks' },
    { id: 'cigarettes', label: 'Cigarettes' },
  ];

  const DATE_FILTERS = [
    { id: 'all'   as const, label: 'All Time'   },
    { id: 'today' as const, label: 'Today'      },
    { id: 'week'  as const, label: 'This Week'  },
    { id: 'month' as const, label: 'This Month' },
  ];

  return (
    <div className="space-y-5">

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 shadow-lg shadow-amber-950/20">
          <div className="flex items-center gap-2 mb-2"><ShoppingBag size={15} className="text-amber-400" /><span className="text-xs font-semibold text-slate-300">Total Purchases</span></div>
          <p className="text-xl font-bold text-amber-300">{stats.total}</p>
          <p className="text-xs text-slate-400 mt-1">all time</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 shadow-lg shadow-emerald-950/20">
          <div className="flex items-center gap-2 mb-2"><Calendar size={15} className="text-emerald-400" /><span className="text-xs font-semibold text-slate-300">Today</span></div>
          <p className="text-xl font-bold text-emerald-300">{stats.todayCount}</p>
          <p className="text-xs text-slate-400 mt-1">purchases</p>
        </div>
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-4 shadow-lg shadow-cyan-950/20">
          <div className="flex items-center gap-2 mb-2"><TrendingUp size={15} className="text-cyan-400" /><span className="text-xs font-semibold text-slate-300">This Week</span></div>
          <p className="text-xl font-bold text-cyan-300">{stats.weekCount}</p>
          <p className="text-xs text-slate-400 mt-1">purchases</p>
        </div>
        <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-4 shadow-lg shadow-purple-950/20">
          <div className="flex items-center gap-2 mb-2"><PieChart size={15} className="text-purple-400" /><span className="text-xs font-semibold text-slate-300">This Month</span></div>
          <p className="text-xl font-bold text-purple-300">{stats.monthCount}</p>
          <p className="text-xs text-slate-400 mt-1">purchases</p>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Category</span>
          <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setCategoryFilter(f.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs transition-all ${
                categoryFilter === f.id
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
              }`}>
              {f.label}
            </button>
          ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Timeframe</span>
          <div className="flex flex-wrap gap-1.5">
          {DATE_FILTERS.map((f) => (
            <button key={f.id} onClick={() => setDateFilter(f.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs transition-all ${
                dateFilter === f.id
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
              }`}>
              {f.label}
            </button>
          ))}
          </div>
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="bg-slate-900/90 border border-slate-800 text-white placeholder:text-slate-400 rounded-xl pl-9 pr-4 py-2 text-sm focus:border-amber-500 focus:outline-none w-full"
              placeholder="Search product, supplier, reference…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <span className="text-xs text-slate-400">{purchases.length} records</span>
      </div>

      {/* Table */}
      {purchases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 bg-slate-950 border border-slate-800 rounded-2xl">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-amber-400 shadow-lg shadow-amber-950/30">
            <ShoppingBag size={24} />
          </div>
          <p className="text-slate-200 font-semibold text-base mt-4">No purchase records found</p>
          <p className="text-slate-400 text-xs max-w-sm text-center mt-1">Try changing the category, timeframe, or search filters.</p>
        </div>
      ) : (
         <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl shadow-black/20">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={TH}>Date & Time</th>
                  <th className={TH}>Product</th>
                  <th className={`${TH} hidden sm:table-cell`}>Category</th>
                  <th className={TH}>Log Type</th>
                  <th className={`${TH} hidden md:table-cell`}>Details</th>
                  <th className={`${TH} hidden md:table-cell`}>Supplier</th>
                  <th className={`${TH} hidden lg:table-cell`}>Cost</th>
                  <th className={`${TH} hidden lg:table-cell`}>Logged By</th>
                  <th className={`${TH} text-right`}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((r: NormRow) => (
                  <tr key={r.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.015] transition-colors">
                    <td className={`${TD} text-slate-300 whitespace-nowrap text-xs`}>
                      <p>{format(r.timestamp, 'dd MMM yyyy')}</p>
                      <p className="text-slate-500">{format(r.timestamp, 'HH:mm')}</p>
                    </td>
                     <td className={`${TD} font-bold text-white`}>{r.productName}</td>
                     <td className={`${TD} hidden sm:table-cell`}>
                       {(() => {
                         const category = categoryOfPurchase(r);
                         return <span className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold ${CATEGORY_BADGE_CLASSES[category]}`}>{CATEGORY_LABELS[category]}</span>;
                       })()}
                     </td>
                     <td className={TD}>
                       <span className="text-[10px] px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 font-bold">{r.logType}</span>
                     </td>
                     <td className={`${TD} hidden md:table-cell text-slate-300 text-xs max-w-[130px]`}>
                      <span className="truncate block">{r.details || '—'}</span>
                    </td>
                     <td className={`${TD} hidden md:table-cell text-slate-300 text-xs`}>
                      {r.supplier || (r.reference ? `Inv: ${r.reference}` : '—')}
                    </td>
                     <td className={`${TD} hidden lg:table-cell text-slate-300 text-xs`}>
                       {r.totalCost > 0 ? <span className="text-amber-300 font-bold">Rs. {fmt(r.totalCost)}</span> : '—'}
                    </td>
                     <td className={`${TD} hidden lg:table-cell text-slate-300 text-xs`}>
                       {r.loggedBy || <span className="text-slate-500">—</span>}
                    </td>
                     <td className={`${TD} text-right whitespace-nowrap`}>
                       <span className="inline-flex flex-col items-end bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 font-bold px-2.5 py-1 rounded-lg text-xs">
                         <span>{r.qtyPrimary}</span>
                         {r.qtySec && <span className="text-[10px] text-emerald-400/70 font-normal">({r.qtySec})</span>}
                       </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grocery purchases note */}
      {groceryPurchases.length > 0 && (
        <div className="px-4 py-3 rounded-xl border border-slate-800 bg-slate-900/70 text-xs text-slate-400">
          Note: {groceryPurchases.length} grocery purchase{groceryPurchases.length !== 1 ? 's' : ''} are tracked separately in the Groceries section.
        </div>
      )}
    </div>
  );
};
