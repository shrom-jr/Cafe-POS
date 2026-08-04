import { useState, useMemo } from 'react';
import { useInventoryStore } from '@/store/useInventoryStore';
import { InventoryMovement, InvProductType } from '@/types/pos';
import { CARD, CARD_SM, TH, TD } from './styles';
import { ProdTypeBadge, TypeBadge } from './components';
import { format, startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { ShoppingCart, Package } from 'lucide-react';
import { fmt } from '@/utils/format';

type FilterType = 'all' | InvProductType;

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

  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

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
    if (typeFilter !== 'all') list = list.filter((r) => r.productType === typeFilter);
    if (dateFilter === 'today') list = list.filter((r) => r.timestamp >= todayStart);
    if (dateFilter === 'week')  list = list.filter((r) => r.timestamp >= weekStart);
    if (dateFilter === 'month') list = list.filter((r) => r.timestamp >= monthStart);
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [normRows, typeFilter, dateFilter, todayStart, weekStart, monthStart]);

  // Stats from full list (unfiltered)
  const stats = useMemo(() => {
    const todayCount  = normRows.filter((r) => r.timestamp >= todayStart).length;
    const weekCount   = normRows.filter((r) => r.timestamp >= weekStart).length;
    const monthCount  = normRows.filter((r) => r.timestamp >= monthStart).length;
    return { total: normRows.length, todayCount, weekCount, monthCount };
  }, [normRows, todayStart, weekStart, monthStart]);

  const FILTERS: { id: FilterType; label: string }[] = [
    { id: 'all',       label: 'All' },
    { id: 'alcohol',   label: 'Alcohol' },
    { id: 'beverage',  label: 'Beverages' },
    { id: 'cigarette', label: 'Cigarettes' },
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
                    <td className={`${TD} text-muted-foreground whitespace-nowrap text-xs`}>
                      <p>{format(r.timestamp, 'dd MMM yyyy')}</p>
                      <p className="text-muted-foreground/50">{format(r.timestamp, 'HH:mm')}</p>
                    </td>
                    <td className={`${TD} font-medium text-foreground`}>{r.productName}</td>
                    <td className={`${TD} hidden sm:table-cell`}><ProdTypeBadge type={r.productType} /></td>
                    <td className={TD}><TypeBadge type={r.logType} /></td>
                    <td className={`${TD} hidden md:table-cell text-muted-foreground text-xs max-w-[130px]`}>
                      <span className="truncate block">{r.details || '—'}</span>
                    </td>
                    <td className={`${TD} hidden md:table-cell text-muted-foreground text-xs`}>
                      {r.supplier || (r.reference ? `Inv: ${r.reference}` : '—')}
                    </td>
                    <td className={`${TD} hidden lg:table-cell text-muted-foreground text-xs`}>
                      {r.totalCost > 0 ? <span className="text-foreground font-medium">Rs. {fmt(r.totalCost)}</span> : '—'}
                    </td>
                    <td className={`${TD} hidden lg:table-cell text-muted-foreground text-xs`}>
                      {r.loggedBy || <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className={`${TD} text-right font-mono font-semibold text-green-400 whitespace-nowrap`}>
                      <p>{r.qtyPrimary}</p>
                      {r.qtySec && <p className="text-[10px] text-muted-foreground/50 font-normal">({r.qtySec})</p>}
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
