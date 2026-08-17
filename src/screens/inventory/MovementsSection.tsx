import { useState, useMemo } from 'react';
import { useInventoryStore } from '@/store/useInventoryStore';
import { InventoryMovement } from '@/types/pos';
import { startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { Activity, AlertTriangle, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { ActivityCard, EmptyActivityState } from './ActivityCard';
import { DrawerCategory, DrawerTimeframe, DrawerToolbar } from './DrawerToolbar';

type ProdFilter = DrawerCategory;
type DateFilter = DrawerTimeframe;

const PAGE_SIZE = 50;

function movementCategory(m: InventoryMovement): Exclude<ProdFilter, 'all'> {
  const name = m.productName.toLowerCase();
  if (m.productType === 'cigarette') return 'cigarettes';
  if (m.productType === 'alcohol') return name.includes('wine') ? 'wine' : 'spirits';
  return name.includes('beer') ? 'beer' : 'soft-drinks';
}

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

export const MovementsSection = () => {
  const movements = useInventoryStore((s) => s.invMovements);

  const [prodFilter, setProdFilter] = useState<ProdFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(1);

  const todayStart = useMemo(() => startOfDay(new Date()).getTime(), []);
  const weekStart  = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }).getTime(), []);
  const monthStart = useMemo(() => startOfMonth(new Date()).getTime(), []);

  const filtered = useMemo(() => {
    let list = [...movements];
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
  }, [movements, prodFilter, dateFilter, search, todayStart, weekStart, monthStart]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => ({
    total: movements.length,
    restocks: movements.filter((m) => m.type === 'Purchase' || (m.source === 'bar' && m.quantity > 0)).length,
    sales: movements.filter((m) => m.type === 'Sale').length,
    waste: movements.filter((m) => m.type === 'Waste').length,
  }), [movements]);

  // Reset to page 1 when filters change
  useMemo(() => { setPage(1); }, [prodFilter, dateFilter, search]);

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
        <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-3">
          <div className="flex items-center gap-2 mb-2"><Activity size={15} className="text-slate-300" /><span className="text-xs font-semibold text-slate-300">Total Events</span></div>
          <p className="text-lg font-bold text-white">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-3">
          <div className="flex items-center gap-2 mb-2"><ArrowDownLeft size={15} className="text-emerald-400" /><span className="text-xs font-semibold text-slate-300">Restock / Purchases</span></div>
          <p className="text-lg font-bold text-emerald-300">{stats.restocks}</p>
        </div>
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-3">
          <div className="flex items-center gap-2 mb-2"><ArrowUpRight size={15} className="text-rose-400" /><span className="text-xs font-semibold text-slate-300">POS Sales</span></div>
          <p className="text-lg font-bold text-rose-300">{stats.sales}</p>
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-3">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle size={15} className="text-amber-400" /><span className="text-xs font-semibold text-slate-300">Spills / Loss</span></div>
          <p className="text-lg font-bold text-amber-300">{stats.waste}</p>
        </div>
      </div>

      <DrawerToolbar
        category={prodFilter}
        onCategoryChange={setProdFilter}
        timeframe={dateFilter}
        onTimeframeChange={setDateFilter}
        search={search}
        onSearchChange={setSearch}
      />
      <p className="text-amber-400 font-bold text-xs uppercase tracking-wider">{filtered.length} records</p>

      {visible.length === 0 ? (
        <EmptyActivityState
          icon={<Activity size={22} />}
          title="No Stock Movements Yet"
          helper={movements.length === 0 ? 'Movement activity will appear here as stock changes.' : 'Try a different category, timeframe, or search.'}
        />
      ) : (
        <div className="space-y-2.5">
          {visible.map((m: InventoryMovement) => {
            const { primary, secondary } = fmtQty(m);
            const isLoss = m.type === 'Waste';
            const isSale = m.type === 'Sale' || (m.quantity < 0 && !isLoss);
            const accent = isLoss ? 'loss' : isSale ? 'sale' : 'inflow';
            const icon = isLoss
              ? <AlertTriangle size={17} />
              : isSale
                ? <ArrowUpRight size={17} />
                : <ArrowDownLeft size={17} />;
            return (
              <ActivityCard
                key={m.id}
                accent={accent}
                icon={icon}
                headline={`${primary}${secondary ? ` (${secondary})` : ''} • ${m.productName}`}
                supporting={
                  <>
                    <span>{isLoss ? 'Spill / Loss' : isSale ? 'Sales Deduction' : m.type}</span>
                    {m.reference && <span className="text-slate-300"> • Reference: {m.reference}</span>}
                    {m.reason && <span className="text-slate-300"> • Reason: {m.reason}</span>}
                    {!m.reason && m.source === 'bar' && m.notes && <span className="text-slate-300"> • {m.notes}</span>}
                  </>
                }
                timestamp={m.timestamp}
                loggedBy={m.loggedBy}
              />
            );
          })}

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
