/**
 * KitchenReportTab — Visual "Kitchen & Meat Analytics" report.
 *
 * Lives in the Admin Reports section. Read-only — no logging forms.
 * Subscribes live to useKitchenPurchasesStore and useMeatTrackerStore.
 */

import { useState } from 'react';
import {
  format, parseISO, subDays,
  startOfWeek, startOfMonth, differenceInCalendarDays,
} from 'date-fns';
import { Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useKitchenPurchasesStore } from '@/store/useKitchenPurchasesStore';
import type { PurchaseEntry } from '@/store/useKitchenPurchasesStore';
import { useMeatTrackerStore } from '@/store/useMeatTrackerStore';
import type { MeatEntry, MeatAction } from '@/store/useMeatTrackerStore';

// ── Types ─────────────────────────────────────────────────────────────────────

type SubView        = 'expenses' | 'meat';
type DateRange      = 'Today' | 'Yesterday' | 'This Week' | 'This Month' | 'All Time' | 'Pick Date';
type MeatDateRange  = 'Today' | 'Yesterday' | 'This Week' | 'This Month' | 'All Time';

const EXPENSE_RANGES: DateRange[]     = ['Today', 'Yesterday', 'This Week', 'This Month', 'All Time', 'Pick Date'];
const MEAT_RANGES: MeatDateRange[]    = ['Today', 'Yesterday', 'This Week', 'This Month', 'All Time'];

const MEAT_ITEMS = ['Chicken', 'Mutton', 'Pork', 'Fish'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

const todayStr     = () => format(new Date(), 'yyyy-MM-dd');
const yesterdayStr = () => format(subDays(new Date(), 1), 'yyyy-MM-dd');

const parseQty = (s: string): number => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };
const norm     = (s: string) => s.trim().toLowerCase();

const fmtRs   = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtKg   = (n: number) => +n.toFixed(2);
const fmtDate = (d: string) => { try { return format(parseISO(d), 'MMM d, yyyy'); } catch { return d; } };

const inRange = (dateStr: string, range: string, pickDate = ''): boolean => {
  const today     = todayStr();
  const yesterday = yesterdayStr();
  if (range === 'All Time')    return true;
  if (range === 'Today')       return dateStr === today;
  if (range === 'Yesterday')   return dateStr === yesterday;
  if (range === 'Pick Date')   return dateStr === pickDate;
  if (range === 'This Week') {
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    return dateStr >= weekStart && dateStr <= today;
  }
  if (range === 'This Month') {
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    return dateStr >= monthStart && dateStr <= today;
  }
  return true;
};

const getDayCount = (range: string, dates: string[]): number => {
  const now = new Date();
  if (range === 'Today' || range === 'Yesterday' || range === 'Pick Date') return 1;
  if (range === 'This Week')  return Math.max(1, differenceInCalendarDays(now, startOfWeek(now, { weekStartsOn: 1 })) + 1);
  if (range === 'This Month') return Math.max(1, differenceInCalendarDays(now, startOfMonth(now)) + 1);
  // All Time
  if (dates.length === 0) return 1;
  const sorted = [...dates].sort();
  return Math.max(1, differenceInCalendarDays(now, parseISO(sorted[0])) + 1);
};

// ── CSV export helper ─────────────────────────────────────────────────────────

const exportCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// ── Shared styles ─────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: 'rgba(15,25,41,0.8)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '1rem',
  padding: '1.25rem',
};

const TH = 'text-left py-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap';
const TD = 'py-3 pr-4 text-sm align-middle';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];

const ACTION_BADGE: Record<MeatAction, React.CSSProperties> = {
  'Marinated':      { background: 'rgba(249,115,22,0.18)', border: '1px solid rgba(249,115,22,0.4)',  color: '#fb923c' },
  'Minced (Keema)': { background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.4)', color: '#a78bfa' },
  'Sent to Grill':  { background: 'rgba(34,197,94,0.15)',  border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80' },
};

const MEAT_ACTION_COLORS: Record<MeatAction, string> = {
  'Marinated':      '#fb923c',
  'Minced (Keema)': '#a78bfa',
  'Sent to Grill':  '#4ade80',
};

const rangeBtn = (active: boolean): React.CSSProperties => active
  ? { background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', color: '#93c5fd' }
  : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' };

// ── Shared sub-components ─────────────────────────────────────────────────────

const RangeBar = ({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) => (
  <div className="flex flex-wrap gap-2">
    {options.map((r) => (
      <button
        key={r}
        onClick={() => onChange(r)}
        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
        style={rangeBtn(r === value)}
      >
        {r}
      </button>
    ))}
  </div>
);

const StatCard = ({
  label, value, sub, colorClass, borderClass,
}: { label: string; value: string | number; sub: string; colorClass: string; borderClass: string }) => (
  <div className={`rounded-2xl border ${borderClass} bg-slate-900/60 p-4`}>
    <p className={`text-xl font-bold ${colorClass} leading-tight`}>{String(value)}</p>
    <p className="text-xs font-bold text-slate-100 mt-0.5">{label}</p>
    <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
  </div>
);

// ── Kitchen Expenses View ─────────────────────────────────────────────────────

const KitchenExpensesView = () => {
  const purchases      = useKitchenPurchasesStore((s) => s.purchases);
  const deletePurchase = useKitchenPurchasesStore((s) => s.deletePurchase);

  const [range,    setRange]    = useState<DateRange>('Today');
  const [pickDate, setPickDate] = useState(todayStr());
  const [page,     setPage]     = useState(1);
  const PAGE_SIZE = 10;

  const filtered     = purchases.filter((p) => inRange(p.date, range, pickDate));
  const totalSpend   = filtered.reduce((s, p) => s + p.totalCost, 0);
  const dayCount     = getDayCount(range, filtered.map((p) => p.date));
  const avgDaily     = totalSpend / dayCount;

  // Top expense item
  const itemMap: Record<string, number> = {};
  filtered.forEach((p) => { itemMap[p.itemName] = (itemMap[p.itemName] || 0) + p.totalCost; });
  const topItems     = Object.entries(itemMap).sort((a, b) => b[1] - a[1]);
  const topItem      = topItems[0];
  const maxItemSpend = topItems[0]?.[1] ?? 1;

  // Category breakdown
  const catMap: Record<string, number> = {};
  filtered.forEach((p) => { const k = p.category ?? 'Other'; catMap[k] = (catMap[k] || 0) + p.totalCost; });
  const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const catTotal   = catEntries.reduce((s, [, v]) => s + v, 0);

  // Sorted + paginated audit table
  const sorted     = [...filtered].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated  = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = (p: PurchaseEntry) => {
    if (!window.confirm(`Delete purchase entry for "${p.itemName}"?`)) return;
    deletePurchase(p.id);
    toast.success('Entry deleted');
  };

  const handleExport = () => {
    const label = range === 'Pick Date' ? pickDate : range.replace(/\s+/g, '-');
    exportCSV(
      `kitchen-expenses-${label}.csv`,
      ['Date', 'Time', 'Item', 'Category', 'Quantity', 'Rate (Rs.)', 'Total Cost (Rs.)'],
      sorted.map((p) => [p.date, p.time, p.itemName, p.category ?? '', p.quantity, p.rate, p.totalCost]),
    );
  };

  return (
    <div className="space-y-5">
      {/* Range selector */}
      <RangeBar options={EXPENSE_RANGES} value={range} onChange={(v) => { setRange(v as DateRange); setPage(1); }} />
      {range === 'Pick Date' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Select date:</span>
          <input
            type="date"
            value={pickDate}
            max={todayStr()}
            onChange={(e) => e.target.value && setPickDate(e.target.value)}
            className="px-2.5 py-1.5 text-sm rounded-lg bg-white/5 border border-white/10 text-white
              focus:outline-none focus:border-blue-500/40 [color-scheme:dark]"
          />
        </div>
      )}

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Kitchen Spend" value={`Rs. ${fmtRs(totalSpend)}`}       sub={range}                                          colorClass="text-blue-300"    borderClass="border-blue-500/25" />
        <StatCard label="Total Purchases"     value={filtered.length}                   sub="entries recorded"                               colorClass="text-emerald-300" borderClass="border-emerald-500/25" />
        <StatCard label="Top Expense Item"    value={topItem ? topItem[0] : '—'}        sub={topItem ? `Rs. ${fmtRs(topItem[1])}` : 'no data'} colorClass="text-amber-300"  borderClass="border-amber-500/25" />
        <StatCard label="Avg Daily Spend"     value={`Rs. ${fmtRs(avgDaily)}`}          sub={`over ${dayCount} day${dayCount !== 1 ? 's' : ''}`} colorClass="text-indigo-300" borderClass="border-indigo-500/25" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top items bar */}
        <div style={CARD}>
          <p className="text-sm font-semibold text-white/80 mb-4">📊 Top Items by Spend</p>
          {topItems.length === 0 ? (
            <p className="text-center py-10 text-white/25 text-sm">No purchases in this period</p>
          ) : (
            <div className="space-y-3">
              {topItems.slice(0, 8).map(([name, spend], i) => {
                const pct = maxItemSpend > 0 ? (spend / maxItemSpend) * 100 : 0;
                return (
                  <div key={name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-xs font-medium text-white/70 truncate">{name}</span>
                      </div>
                      <span className="text-xs font-bold text-white/55 ml-2 flex-shrink-0">Rs. {fmtRs(spend)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Category breakdown */}
        <div style={CARD}>
          <p className="text-sm font-semibold text-white/80 mb-4">🥧 Category Spend Breakdown</p>
          {catEntries.length === 0 ? (
            <p className="text-center py-10 text-white/25 text-sm">No category data in this period</p>
          ) : (
            <div className="space-y-3">
              {catEntries.map(([cat, spend], i) => {
                const pct = catTotal > 0 ? Math.round((spend / catTotal) * 100) : 0;
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-xs font-medium text-white/70 truncate">{cat}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                        <span className="text-xs text-white/35">{pct}%</span>
                        <span className="text-xs font-bold text-white/55">Rs. {fmtRs(spend)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Audit table */}
      <div style={CARD}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-white/80">Purchase Audit Log</p>
          <div className="flex items-center gap-3">
            {sorted.length > 0 && (
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd' }}
                title="Export to CSV"
              >
                <Download size={12} /> Export CSV
              </button>
            )}
            <p className="text-[11px] text-white/25">{filtered.length} entries · {range}</p>
          </div>
        </div>
        {sorted.length === 0 ? (
          <p className="text-center py-12 text-white/20 text-sm">No purchases in this period</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className={TH}>Date &amp; Time</th>
                    <th className={TH}>Item</th>
                    <th className={TH}>Category</th>
                    <th className={TH}>Quantity</th>
                    <th className={TH}>Rate (Rs.)</th>
                    <th className={TH}>Total Cost (Rs.)</th>
                    <th className={TH}></th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((p) => (
                    <tr key={p.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                      <td className={`${TD} text-white/40 text-xs whitespace-nowrap`}>
                        <span className="block">{fmtDate(p.date)}</span>
                        <span className="text-white/25">{p.time}</span>
                      </td>
                      <td className={`${TD} text-white/85 font-medium`}>{p.itemName}</td>
                      <td className={`${TD} text-white/40 text-xs`}>{p.category ?? '—'}</td>
                      <td className={`${TD} text-white/55 font-mono text-xs`}>{p.quantity}</td>
                      <td className={`${TD} text-white/55`}>{p.rate.toLocaleString()}</td>
                      <td className={`${TD} font-semibold text-orange-400/80`}>
                        {p.totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </td>
                      <td className={TD}>
                        <button
                          onClick={() => handleDelete(p)}
                          className="flex items-center justify-center w-7 h-7 rounded-lg transition-all text-white/20 hover:text-red-400 hover:bg-red-500/15 active:scale-90"
                          title="Delete entry"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.06]">
                <p className="text-xs text-white/30">{sorted.length} entries · Page {page} of {totalPages}</p>
                <div className="flex gap-1">
                  <button onClick={() => setPage((v) => Math.max(1, v - 1))} disabled={page === 1}
                    className="px-2.5 py-1 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.06] disabled:opacity-30 transition-colors">
                    ← Prev
                  </button>
                  <button onClick={() => setPage((v) => Math.min(totalPages, v + 1))} disabled={page === totalPages}
                    className="px-2.5 py-1 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.06] disabled:opacity-30 transition-colors">
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ── Meat Analytics View ───────────────────────────────────────────────────────

const MeatAnalyticsView = () => {
  const meatEntries    = useMeatTrackerStore((s) => s.meatEntries);
  const deleteMeatEntry = useMeatTrackerStore((s) => s.deleteMeatEntry);
  const purchases      = useKitchenPurchasesStore((s) => s.purchases);

  const [range, setRange] = useState<MeatDateRange>('Today');

  const filteredMeat      = meatEntries.filter((e) => inRange(e.date, range));
  const filteredPurchases = purchases.filter((p) => p.category === 'Meats' && inRange(p.date, range));

  // Global stats
  const totalRaw       = filteredPurchases.reduce((s, p) => s + parseQty(p.quantity), 0);
  const totalMarinated = filteredMeat.filter((e) => e.action === 'Marinated').reduce((s, e) => s + parseQty(e.quantity), 0);
  const totalKeema     = filteredMeat.filter((e) => e.action === 'Minced (Keema)').reduce((s, e) => s + parseQty(e.quantity), 0);
  const totalGrill     = filteredMeat.filter((e) => e.action === 'Sent to Grill').reduce((s, e) => s + parseQty(e.quantity), 0);

  // Per-meat breakdown
  const seenMeats = new Set(MEAT_ITEMS.map(norm));
  const meatPool: string[] = [...MEAT_ITEMS];
  filteredPurchases.forEach((p) => {
    const k = norm(p.itemName);
    if (!seenMeats.has(k)) { meatPool.push(p.itemName.trim()); seenMeats.add(k); }
  });
  filteredMeat.forEach((e) => {
    const k = norm(e.meatItem);
    if (!seenMeats.has(k)) { meatPool.push(e.meatItem.trim()); seenMeats.add(k); }
  });

  const perMeat = meatPool.map((meat) => {
    const purchased = filteredPurchases.filter((p) => norm(p.itemName) === norm(meat)).reduce((s, p) => s + parseQty(p.quantity), 0);
    const entries   = filteredMeat.filter((e) => norm(e.meatItem) === norm(meat));
    const marinated = entries.filter((e) => e.action === 'Marinated').reduce((s, e) => s + parseQty(e.quantity), 0);
    const keema     = entries.filter((e) => e.action === 'Minced (Keema)').reduce((s, e) => s + parseQty(e.quantity), 0);
    const grill     = entries.filter((e) => e.action === 'Sent to Grill').reduce((s, e) => s + parseQty(e.quantity), 0);
    return { meat, purchased, marinated, keema, grill };
  }).filter((m) => m.purchased > 0 || m.marinated > 0 || m.keema > 0 || m.grill > 0);

  const maxRaw    = Math.max(...perMeat.map((m) => m.purchased), 1);
  const variance  = totalRaw - totalGrill;

  // Sorted audit table
  const sortedMeat = [...filteredMeat].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

  const handleDelete = (e: MeatEntry) => {
    if (!window.confirm(`Delete this ${e.action} entry for ${e.meatItem}?`)) return;
    deleteMeatEntry(e.id);
    toast.success('Entry deleted');
  };

  const handleExport = () => {
    exportCSV(
      `meat-analytics-${range.replace(/\s+/g, '-')}.csv`,
      ['Date', 'Time', 'Logged By', 'Meat Item', 'Action Type', 'Quantity (kg)'],
      sortedMeat.map((e) => [e.date, e.time, e.loggedBy ?? 'Kitchen', e.meatItem, e.action, e.quantity]),
    );
  };

  return (
    <div className="space-y-5">
      {/* Range selector */}
      <RangeBar options={MEAT_RANGES} value={range} onChange={(v) => setRange(v as MeatDateRange)} />

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Raw Purchased" value={`${fmtKg(totalRaw)} kg`}       sub="all meats"              colorClass="text-orange-300" borderClass="border-orange-500/25" />
        <StatCard label="Total Marinated"     value={`${fmtKg(totalMarinated)} kg`} sub="marination batches"     colorClass="text-yellow-300" borderClass="border-yellow-500/25" />
        <StatCard label="Total Keema Made"    value={`${fmtKg(totalKeema)} kg`}     sub="minced / keema stock"   colorClass="text-purple-300" borderClass="border-purple-500/25" />
        <StatCard label="Total Sent to Grill" value={`${fmtKg(totalGrill)} kg`}     sub="dispatched to grill"    colorClass="text-emerald-300" borderClass="border-emerald-500/25" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Meat transformation breakdown */}
        <div style={CARD}>
          <p className="text-sm font-semibold text-white/80 mb-4">🔄 Meat Transformation Breakdown</p>
          {perMeat.length === 0 ? (
            <p className="text-center py-10 text-white/25 text-sm">No data in this period</p>
          ) : (
            <div className="space-y-5">
              {perMeat.map(({ meat, purchased, marinated, keema, grill }) => {
                const purchasedPct = maxRaw > 0 ? (purchased / maxRaw) * 100 : 0;
                return (
                  <div key={meat}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold text-white/80">{meat}</span>
                      <span className="text-xs text-white/30 font-mono">{fmtKg(purchased)} kg raw</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden mb-2">
                      <div className="h-full rounded-full" style={{ width: `${purchasedPct}%`, background: 'rgba(249,115,22,0.5)' }} />
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['Marinated', 'Minced (Keema)', 'Sent to Grill'] as MeatAction[]).map((action) => {
                        const qty = action === 'Marinated' ? marinated : action === 'Minced (Keema)' ? keema : grill;
                        return (
                          <div key={action} className="rounded-lg px-2 py-1.5 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                            <p className="text-[10px] text-white/30 font-medium leading-tight">{action}</p>
                            <p className="text-xs font-bold mt-0.5" style={{ color: MEAT_ACTION_COLORS[action] }}>{fmtKg(qty)} kg</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Purchase vs Grill reconciliation */}
        <div style={CARD}>
          <p className="text-sm font-semibold text-white/80 mb-5">⚖️ Purchase vs. Grill Reconciliation</p>
          <div className="space-y-4">
            {[
              { label: 'Total Bought (kg)',         value: fmtKg(totalRaw),   color: '#fb923c', pct: 100 },
              { label: 'Total Sent to Grill (kg)',  value: fmtKg(totalGrill), color: '#4ade80', pct: totalRaw > 0 ? Math.min(100, (totalGrill / totalRaw) * 100) : 0 },
            ].map(({ label, value, color, pct }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-white/55">{label}</span>
                  <span className="text-sm font-bold" style={{ color }}>{value} kg</span>
                </div>
                <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
            ))}

            {/* Variance banner */}
            <div
              className="mt-2 rounded-xl p-3.5 flex items-center justify-between"
              style={variance >= 0
                ? { background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }
                : { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <div>
                <p className="text-xs font-medium text-white/50">Stock Variance</p>
                <p className="text-[10px] text-white/30 mt-0.5">Bought − Sent to Grill</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black" style={{ color: variance >= 0 ? '#4ade80' : '#f87171' }}>
                  {variance >= 0 ? '+' : ''}{fmtKg(variance)} kg
                </p>
                <p className="text-[10px] text-white/25 mt-0.5">
                  {variance >= 0 ? 'still in kitchen' : 'over-dispatched vs purchases'}
                </p>
              </div>
            </div>

            {totalRaw > 0 && (
              <p className="text-center text-xs text-white/30">
                Grill yield: <span className="font-bold text-white/50">{Math.round((totalGrill / totalRaw) * 100)}%</span> of purchased stock dispatched
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Audit table */}
      <div style={CARD}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-white/80">Meat Action Audit Log</p>
          <div className="flex items-center gap-3">
            {sortedMeat.length > 0 && (
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd' }}
                title="Export to CSV"
              >
                <Download size={12} /> Export CSV
              </button>
            )}
            <p className="text-[11px] text-white/25">{sortedMeat.length} actions · {range}</p>
          </div>
        </div>
        {sortedMeat.length === 0 ? (
          <p className="text-center py-12 text-white/20 text-sm">No meat actions in this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={TH}>Date &amp; Time</th>
                  <th className={TH}>Logged By</th>
                  <th className={TH}>Meat Item</th>
                  <th className={TH}>Action Type</th>
                  <th className={TH}>Quantity (kg)</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {sortedMeat.map((e) => (
                  <tr key={e.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className={`${TD} text-white/40 text-xs whitespace-nowrap`}>
                      <span className="block">{fmtDate(e.date)}</span>
                      <span className="text-white/25">{e.time}</span>
                    </td>
                    <td className={`${TD} text-white/50 text-xs`}>{e.loggedBy ?? 'Kitchen'}</td>
                    <td className={`${TD} text-white/85 font-medium`}>{e.meatItem}</td>
                    <td className={TD}>
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap" style={ACTION_BADGE[e.action]}>
                        {e.action}
                      </span>
                    </td>
                    <td className={`${TD} text-white/55 font-mono text-xs whitespace-nowrap`}>{e.quantity}</td>
                    <td className={TD}>
                      <button
                        onClick={() => handleDelete(e)}
                        className="flex items-center justify-center w-7 h-7 rounded-lg transition-all text-white/20 hover:text-red-400 hover:bg-red-500/15 active:scale-90"
                        title="Delete entry"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main export ───────────────────────────────────────────────────────────────

export const KitchenReportTab = () => {
  const [subView, setSubView] = useState<SubView>('expenses');

  const TAB_ACTIVE: React.CSSProperties = {
    background: 'rgba(59,130,246,0.18)',
    border: '1px solid rgba(59,130,246,0.35)',
    color: '#93c5fd',
  };
  const TAB_INACTIVE: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.4)',
  };

  return (
    <div className="space-y-5">
      {/* Sub-toggle */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSubView('expenses')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
          style={subView === 'expenses' ? TAB_ACTIVE : TAB_INACTIVE}
        >
          🛒 Kitchen Expenses
        </button>
        <button
          onClick={() => setSubView('meat')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
          style={subView === 'meat' ? TAB_ACTIVE : TAB_INACTIVE}
        >
          🥩 Meat Analytics
        </button>
      </div>

      {subView === 'expenses' && <KitchenExpensesView />}
      {subView === 'meat'     && <MeatAnalyticsView />}
    </div>
  );
};

export default KitchenReportTab;
