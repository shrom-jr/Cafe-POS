import { useState, useMemo } from 'react';
import { useInventoryStore } from '@/store/useInventoryStore';
import { InventoryMovement, InvProductType } from '@/types/pos';
import { CARD, CARD_SM, TH, TD } from './styles';
import { TypeBadge, ProdTypeBadge } from './components';
import { format, startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { ShoppingCart, Package } from 'lucide-react';

type FilterType = 'all' | InvProductType;

export const PurchasesSection = () => {
  const movements       = useInventoryStore((s) => s.invMovements);
  const groceryPurchases= useInventoryStore((s) => s.groceryPurchases);
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  const todayStart = useMemo(() => startOfDay(new Date()).getTime(), []);
  const weekStart  = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }).getTime(), []);
  const monthStart = useMemo(() => startOfMonth(new Date()).getTime(), []);

  const purchases = useMemo(() => {
    let list = movements.filter((m) => m.type === 'Purchase');
    if (typeFilter !== 'all') list = list.filter((m) => m.productType === typeFilter);
    if (dateFilter === 'today') list = list.filter((m) => m.timestamp >= todayStart);
    if (dateFilter === 'week')  list = list.filter((m) => m.timestamp >= weekStart);
    if (dateFilter === 'month') list = list.filter((m) => m.timestamp >= monthStart);
    return [...list].sort((a, b) => b.timestamp - a.timestamp);
  }, [movements, typeFilter, dateFilter, todayStart, weekStart, monthStart]);

  const stats = useMemo(() => {
    const allPurchases = movements.filter((m) => m.type === 'Purchase');
    const todayCount = allPurchases.filter((m) => m.timestamp >= todayStart).length;
    const weekCount  = allPurchases.filter((m) => m.timestamp >= weekStart).length;
    const monthCount = allPurchases.filter((m) => m.timestamp >= monthStart).length;
    const byType: Record<string, number> = {};
    for (const m of allPurchases) { byType[m.productType] = (byType[m.productType] ?? 0) + 1; }
    return { total: allPurchases.length, todayCount, weekCount, monthCount, byType };
  }, [movements, todayStart, weekStart, monthStart]);

  const FILTERS: { id: FilterType; label: string }[] = [
    { id: 'all',       label: 'All' },
    { id: 'alcohol',   label: 'Alcohol' },
    { id: 'beverage',  label: 'Beverages' },
    { id: 'cigarette', label: 'Cigarettes' },
  ];

  const DATE_FILTERS = [
    { id: 'all'   as const, label: 'All Time' },
    { id: 'today' as const, label: 'Today' },
    { id: 'week'  as const, label: 'This Week' },
    { id: 'month' as const, label: 'This Month' },
  ];

  return (
    <div className="space-y-5">

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={CARD_SM}>
          <div className="flex items-center gap-2 mb-2"><ShoppingCart size={13} className="text-blue-400" /><span className="text-xs text-muted-foreground">Total Purchases</span></div>
          <p className="text-xl font-bold text-foreground">{stats.total}</p>
          <p className="text-xs text-muted-foreground/60">all time</p>
        </div>
        <div className={CARD_SM}>
          <div className="flex items-center gap-2 mb-2"><Package size={13} className="text-amber-400" /><span className="text-xs text-muted-foreground">Today</span></div>
          <p className="text-xl font-bold text-foreground">{stats.todayCount}</p>
          <p className="text-xs text-muted-foreground/60">purchases</p>
        </div>
        <div className={CARD_SM}>
          <div className="flex items-center gap-2 mb-2"><Package size={13} className="text-green-400" /><span className="text-xs text-muted-foreground">This Week</span></div>
          <p className="text-xl font-bold text-foreground">{stats.weekCount}</p>
          <p className="text-xs text-muted-foreground/60">purchases</p>
        </div>
        <div className={CARD_SM}>
          <div className="flex items-center gap-2 mb-2"><Package size={13} className="text-purple-400" /><span className="text-xs text-muted-foreground">This Month</span></div>
          <p className="text-xl font-bold text-foreground">{stats.monthCount}</p>
          <p className="text-xs text-muted-foreground/60">purchases</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setTypeFilter(f.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                typeFilter === f.id ? 'bg-accent text-accent-foreground' : 'text-white/40 hover:text-white/70'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
          {DATE_FILTERS.map((f) => (
            <button key={f.id} onClick={() => setDateFilter(f.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                dateFilter === f.id ? 'bg-accent text-accent-foreground' : 'text-white/40 hover:text-white/70'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{purchases.length} records</span>
      </div>

      {/* Table */}
      {purchases.length === 0 ? (
        <div className={`${CARD} text-center py-12 text-muted-foreground text-sm`}>
          No purchase records found for the selected filter.
        </div>
      ) : (
        <div className={CARD}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={TH}>Date & Time</th>
                  <th className={TH}>Product</th>
                  <th className={`${TH} hidden sm:table-cell`}>Category</th>
                  <th className={TH}>Details</th>
                  <th className={`${TH} hidden md:table-cell`}>Supplier</th>
                  <th className={`${TH} hidden md:table-cell`}>Invoice</th>
                  <th className={`${TH} text-right`}>Qty Added</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((m: InventoryMovement) => (
                  <tr key={m.id} className="border-b border-white/[0.04] last:border-0">
                    <td className={`${TD} text-muted-foreground whitespace-nowrap text-xs`}>
                      <p>{format(m.timestamp, 'dd MMM yyyy')}</p>
                      <p className="text-muted-foreground/50">{format(m.timestamp, 'HH:mm')}</p>
                    </td>
                    <td className={`${TD} font-medium text-foreground`}>{m.productName}</td>
                    <td className={`${TD} hidden sm:table-cell`}><ProdTypeBadge type={m.productType} /></td>
                    <td className={`${TD} text-muted-foreground text-xs max-w-[140px]`}>
                      <span className="truncate block">{m.notes ?? '—'}</span>
                    </td>
                    <td className={`${TD} hidden md:table-cell text-muted-foreground`}>{m.supplier ?? '—'}</td>
                    <td className={`${TD} hidden md:table-cell text-muted-foreground`}>{m.reference ?? '—'}</td>
                    <td className={`${TD} text-right font-mono font-semibold text-green-400`}>
                      +{m.quantity.toLocaleString()} {m.unit}
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
        <div className="px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] text-xs text-muted-foreground">
          Note: {groceryPurchases.length} grocery purchase{groceryPurchases.length !== 1 ? 's' : ''} are tracked separately in the Groceries section.
        </div>
      )}
    </div>
  );
};
