import { useState, useMemo } from 'react';
import { useInventoryStore } from '@/store/useInventoryStore';
import { InventoryMovement, InvProductType } from '@/types/pos';
import { startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { Calendar, PieChart, ShoppingBag, TrendingUp } from 'lucide-react';
import { fmt } from '@/utils/format';
import { ActivityCard, EmptyActivityState } from './ActivityCard';
import {
  DrawerCategory,
  DrawerTimeframe,
  DrawerToolbar,
} from './DrawerToolbar';

type CategoryFilter = DrawerCategory;

function categoryOfPurchase(row: Pick<NormRow, 'productName' | 'productType'>): Exclude<CategoryFilter, 'all'> {
  const name = row.productName.toLowerCase();
  if (row.productType === 'cigarette') return 'cigarettes';
  if (row.productType === 'alcohol') return name.includes('wine') ? 'wine' : 'spirits';
  return name.includes('beer') ? 'beer' : 'soft-drinks';
}

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

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [dateFilter, setDateFilter] = useState<DrawerTimeframe>('all');
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

  return (
    <div className="space-y-5">

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-3 shadow-lg shadow-amber-950/20">
          <div className="flex items-center gap-2 mb-2"><ShoppingBag size={15} className="text-amber-400" /><span className="text-xs font-semibold text-slate-300">Total Purchases</span></div>
          <p className="text-lg font-bold text-amber-300">{stats.total}</p>
          <p className="text-slate-300 text-xs font-medium uppercase tracking-wider mt-1">all time</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-3 shadow-lg shadow-emerald-950/20">
          <div className="flex items-center gap-2 mb-2"><Calendar size={15} className="text-emerald-400" /><span className="text-xs font-semibold text-slate-300">Today</span></div>
          <p className="text-lg font-bold text-emerald-300">{stats.todayCount}</p>
          <p className="text-slate-300 text-xs font-medium uppercase tracking-wider mt-1">purchases</p>
        </div>
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-3 shadow-lg shadow-cyan-950/20">
          <div className="flex items-center gap-2 mb-2"><TrendingUp size={15} className="text-cyan-400" /><span className="text-xs font-semibold text-slate-300">This Week</span></div>
          <p className="text-lg font-bold text-cyan-300">{stats.weekCount}</p>
          <p className="text-slate-300 text-xs font-medium uppercase tracking-wider mt-1">purchases</p>
        </div>
        <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-3 shadow-lg shadow-purple-950/20">
          <div className="flex items-center gap-2 mb-2"><PieChart size={15} className="text-purple-400" /><span className="text-xs font-semibold text-slate-300">This Month</span></div>
          <p className="text-lg font-bold text-purple-300">{stats.monthCount}</p>
          <p className="text-slate-300 text-xs font-medium uppercase tracking-wider mt-1">purchases</p>
        </div>
      </div>

      <DrawerToolbar
        category={categoryFilter}
        onCategoryChange={setCategoryFilter}
        timeframe={dateFilter}
        onTimeframeChange={setDateFilter}
        search={search}
        onSearchChange={setSearch}
      />
      <p className="text-amber-400 font-bold text-xs uppercase tracking-wider">{purchases.length} records</p>

      {/* Human-readable activity cards */}
      {purchases.length === 0 ? (
        <EmptyActivityState
          icon={<ShoppingBag size={22} />}
          title="No Purchases Yet"
          helper="Purchase and restock activity will appear here."
        />
      ) : (
        <div className="space-y-2.5">
          {purchases.map((r: NormRow) => (
            <ActivityCard
              key={r.id}
              accent="inflow"
              icon={<ShoppingBag size={17} />}
              headline={`${r.qtyPrimary} • ${r.productName}`}
              supporting={
                <>
                  {r.totalCost > 0 && <>Cost: Rs. {fmt(r.totalCost)}</>}
                  {r.totalCost > 0 && r.supplier && <span className="text-slate-500"> • </span>}
                  {r.supplier && <>Supplier: {r.supplier}</>}
                  {!r.totalCost && !r.supplier && r.details}
                  {r.reference && <span className="text-slate-400"> • Ref: {r.reference}</span>}
                </>
              }
              timestamp={r.timestamp}
              loggedBy={r.loggedBy}
            />
          ))}
        </div>
      )}

    </div>
  );
};
