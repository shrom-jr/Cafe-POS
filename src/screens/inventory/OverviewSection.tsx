import { useMemo } from 'react';
import { useInventoryStore } from '@/store/useInventoryStore';
import { ValueCard, TypeBadge, ProdTypeBadge } from './components';
import { CARD } from './styles';
import { AlertTriangle, ShoppingCart, Activity } from 'lucide-react';
import { format, startOfDay, startOfWeek, startOfMonth, subDays } from 'date-fns';

const fmt = (n: number) =>
  'Rs. ' + Math.round(n).toLocaleString('en-IN');

export const OverviewSection = () => {
  const alcohol    = useInventoryStore((s) => s.alcoholProducts);
  const beverages  = useInventoryStore((s) => s.beverageProducts);
  const cigarettes = useInventoryStore((s) => s.cigaretteProducts);
  const movements  = useInventoryStore((s) => s.invMovements);

  const now = useMemo(() => Date.now(), []);
  const todayStart   = useMemo(() => startOfDay(new Date()).getTime(), []);
  const weekStart    = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }).getTime(), []);
  const monthStart   = useMemo(() => startOfMonth(new Date()).getTime(), []);

  const stats = useMemo(() => {
    // ── Values ───────────────────────────────────────────────────────────
    const alcoholVal = alcohol.reduce((sum, p) => {
      if (!p.costPerBottle || !p.bottleSizeMl) return sum;
      return sum + (p.currentStockMl / p.bottleSizeMl) * p.costPerBottle;
    }, 0);
    const bevVal = beverages.reduce((sum, p) => {
      return sum + (p.costPerCarton ? (p.currentStock / p.piecesPerCarton) * p.costPerCarton : 0);
    }, 0);
    const cigVal = cigarettes.reduce((sum, p) => {
      return sum + (p.costPerPacket ? (p.currentSticks / p.sticksPerPacket) * p.costPerPacket : 0);
    }, 0);

    // ── Low stock ───────────────────────────────────────────────────────
    const lowAlcohol    = alcohol.filter((p) => p.status === 'active' && p.currentStockMl   <= p.minStockMl);
    const lowBeverage   = beverages.filter((p) => p.status === 'active' && p.currentStock    <= p.minStock);
    const lowCigarette  = cigarettes.filter((p) => p.status === 'active' && p.currentSticks  <= p.minSticks);
    const allLow = [
      ...lowAlcohol.map((p)   => ({ name: p.name, type: 'alcohol'   as const })),
      ...lowBeverage.map((p)  => ({ name: p.name, type: 'beverage'  as const })),
      ...lowCigarette.map((p) => ({ name: p.name, type: 'cigarette' as const })),
    ];

    // ── Purchases ───────────────────────────────────────────────────────
    const todayPurchases = movements.filter((m) => m.type === 'Purchase' && m.timestamp >= todayStart);

    // ── Consumption (Sale movements) ────────────────────────────────────
    const salesThisWeek  = movements.filter((m) => m.type === 'Sale' && m.timestamp >= weekStart);
    const salesThisMonth = movements.filter((m) => m.type === 'Sale' && m.timestamp >= monthStart);
    const salesYesterday = movements.filter((m) => {
      const yd = subDays(new Date(todayStart), 1).getTime();
      return m.type === 'Sale' && m.timestamp >= yd && m.timestamp < todayStart;
    });
    const salesToday = movements.filter((m) => m.type === 'Sale' && m.timestamp >= todayStart);

    // ── Recent ──────────────────────────────────────────────────────────
    const recentPurchases = [...movements]
      .filter((m) => m.type === 'Purchase')
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 8);

    const recentMovements = [...movements]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);

    return {
      alcoholVal, bevVal, cigVal, totalVal: alcoholVal + bevVal + cigVal,
      allLow, todayPurchases, recentPurchases, recentMovements,
      salesToday: salesToday.length, salesYesterday: salesYesterday.length,
      salesThisWeek: salesThisWeek.length, salesThisMonth: salesThisMonth.length,
    };
  }, [alcohol, beverages, cigarettes, movements, todayStart, weekStart, monthStart]);

  const hasProducts = alcohol.length > 0 || beverages.length > 0 || cigarettes.length > 0;

  return (
    <div className="space-y-5">

      {/* ── Value cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <ValueCard label="Total Inventory Value"  value={fmt(stats.totalVal)}    sub="Trackable stock" accent />
        <ValueCard label="Alcohol Stock Value"     value={fmt(stats.alcoholVal)}  sub={`${alcohol.length} products`} />
        <ValueCard label="Beverage Stock Value"    value={fmt(stats.bevVal)}      sub={`${beverages.length} products`} />
        <ValueCard label="Cigarette Stock Value"   value={fmt(stats.cigVal)}      sub={`${cigarettes.length} products`} />
      </div>

      {/* ── Stat row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart size={13} className="text-blue-400" />
            <span className="text-xs text-muted-foreground">Today's Purchases</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.todayPurchases.length}</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">transactions</p>
        </div>
        <div className={`rounded-xl border p-4 ${stats.allLow.length > 0 ? 'border-red-500/25 bg-red-500/[0.05]' : 'border-white/[0.07] bg-white/[0.03]'}`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={13} className={stats.allLow.length > 0 ? 'text-red-400' : 'text-muted-foreground'} />
            <span className="text-xs text-muted-foreground">Low Stock</span>
          </div>
          <p className={`text-2xl font-bold ${stats.allLow.length > 0 ? 'text-red-400' : 'text-foreground'}`}>{stats.allLow.length}</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">products below min</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={13} className="text-purple-400" />
            <span className="text-xs text-muted-foreground">Sales Today</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.salesToday}</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">deductions</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={13} className="text-green-400" />
            <span className="text-xs text-muted-foreground">This Month</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.salesThisMonth}</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">sale deductions</p>
        </div>
      </div>

      {/* ── Low stock + Recent purchases ── */}
      {(stats.allLow.length > 0 || stats.recentPurchases.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.allLow.length > 0 && (
            <div className={CARD}>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-400" /> Low Stock Products
              </h3>
              <div className="space-y-2">
                {stats.allLow.map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                    <span className="text-sm text-foreground">{p.name}</span>
                    <ProdTypeBadge type={p.type} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.recentPurchases.length > 0 && (
            <div className={CARD}>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <ShoppingCart size={14} className="text-blue-400" /> Recent Purchases
              </h3>
              <div className="space-y-2">
                {stats.recentPurchases.map((m) => (
                  <div key={m.id} className="flex items-start justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground font-medium truncate">{m.productName}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.notes ?? `+${m.quantity} ${m.unit}`}</p>
                    </div>
                    <span className="text-xs text-muted-foreground ml-3 flex-shrink-0">
                      {format(m.timestamp, 'dd MMM')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Recent movements ── */}
      {stats.recentMovements.length > 0 && (
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-foreground mb-4">Recent Stock Movements</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-left">
                  <th className="pb-2.5 text-xs font-medium text-muted-foreground pr-4">Time</th>
                  <th className="pb-2.5 text-xs font-medium text-muted-foreground pr-4">Product</th>
                  <th className="pb-2.5 text-xs font-medium text-muted-foreground pr-4">Type</th>
                  <th className="pb-2.5 text-xs font-medium text-muted-foreground text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentMovements.map((m) => (
                  <tr key={m.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="py-2 text-muted-foreground text-xs pr-4 whitespace-nowrap">
                      {format(m.timestamp, 'dd MMM HH:mm')}
                    </td>
                    <td className="py-2 text-foreground pr-4 font-medium">{m.productName}</td>
                    <td className="py-2 pr-4"><TypeBadge type={m.type} /></td>
                    <td className={`py-2 text-right font-mono font-semibold ${m.quantity >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {m.quantity >= 0 ? '+' : ''}{m.quantity.toLocaleString()} {m.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!hasProducts && (
        <div className={`${CARD} text-center py-16`}>
          <p className="text-muted-foreground text-sm">No inventory products yet.</p>
          <p className="text-muted-foreground/60 text-xs mt-1">
            Start by adding products in the Alcohol, Beverages, or Cigarettes sections.
          </p>
        </div>
      )}
    </div>
  );
};
