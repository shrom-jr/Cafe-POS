/**
 * MeatPrepLogsTab — Admin audit & reporting dashboard for the Meat Tracker.
 *
 * Read-only view: subscribes to the same useMeatTrackerStore and
 * useKitchenPurchasesStore used by KitchenPortal's Meat Tracker so that
 * any action logged in the kitchen is instantly visible here.
 */

import { useState } from 'react';
import {
  format,
  parseISO,
  subDays,
  startOfWeek,
  startOfMonth,
  isWithinInterval,
} from 'date-fns';
import { Trash2, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { useMeatTrackerStore } from '@/store/useMeatTrackerStore';
import type { MeatEntry, MeatAction } from '@/store/useMeatTrackerStore';
import { useKitchenPurchasesStore } from '@/store/useKitchenPurchasesStore';
import type { PurchaseEntry } from '@/store/useKitchenPurchasesStore';

// ── Constants ─────────────────────────────────────────────────────────────────

const MEAT_ITEMS = ['Chicken', 'Mutton', 'Pork', 'Fish'] as const;

type DateRange = 'Today' | 'Yesterday' | 'This Week' | 'This Month';
const DATE_RANGES: DateRange[] = ['Today', 'Yesterday', 'This Week', 'This Month'];

// ── Helpers ───────────────────────────────────────────────────────────────────

const todayStr     = () => format(new Date(), 'yyyy-MM-dd');
const yesterdayStr = () => format(subDays(new Date(), 1), 'yyyy-MM-dd');

const norm       = (s: string) => s.trim().toLowerCase();
const parseQty   = (s: string): number => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };
const extractUnit = (s: string): string => s.replace(/^[\d.]+\s*/, '').trim();

const fmtDisplayDate = (d: string) => {
  try { return format(parseISO(d), 'MMM d, yyyy'); } catch { return d; }
};

/** Build the list of known meat items (MEAT_ITEMS + any purchased meat items). */
const buildMeatPool = (purchases: PurchaseEntry[]): string[] => {
  const seen = new Set(MEAT_ITEMS.map(norm));
  const pool = [...MEAT_ITEMS] as string[];
  for (const p of purchases) {
    if (p.category === 'Meats') {
      const key = norm(p.itemName);
      if (!seen.has(key)) { pool.push(p.itemName.trim()); seen.add(key); }
    }
  }
  return pool;
};

interface MeatBalance {
  rawPurchased:   number;
  totalMarinated: number;
  readyForGrill:  number;
  totalKeema:     number;
  unit:           string;
}

/** All-time cumulative balance for one meat item. */
const calcBalance = (
  item: string,
  purchases: PurchaseEntry[],
  meatEntries: MeatEntry[],
): MeatBalance => {
  const allPurchases   = purchases.filter((p) => norm(p.itemName) === norm(item));
  const rawPurchased   = allPurchases.reduce((s, p) => s + parseQty(p.quantity), 0);
  const unit           = allPurchases[0] ? extractUnit(allPurchases[0].quantity) : 'kg';

  const allMeat          = meatEntries.filter((e) => norm(e.meatItem) === norm(item));
  const totalMarinated   = allMeat.filter((e) => e.action === 'Marinated')
    .reduce((s, e) => s + parseQty(e.quantity), 0);
  const totalMinced      = allMeat.filter((e) => e.action === 'Minced (Keema)')
    .reduce((s, e) => s + parseQty(e.quantity), 0);
  const totalSentToGrill = allMeat.filter((e) => e.action === 'Sent to Grill')
    .reduce((s, e) => s + parseQty(e.quantity), 0);

  return {
    rawPurchased,
    totalMarinated,
    readyForGrill: totalMarinated - totalSentToGrill,
    totalKeema: totalMinced,
    unit,
  };
};

/** Return the inclusive date interval for a DateRange label. */
const getInterval = (range: DateRange): { start: Date; end: Date } => {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  switch (range) {
    case 'Today':
      return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end: today };
    case 'Yesterday': {
      const y = subDays(now, 1);
      return {
        start: new Date(y.getFullYear(), y.getMonth(), y.getDate()),
        end:   new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59),
      };
    }
    case 'This Week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: today };
    case 'This Month':
      return { start: startOfMonth(now), end: today };
  }
};

const dateInRange = (dateStr: string, range: DateRange): boolean => {
  try {
    const d   = parseISO(dateStr);
    const { start, end } = getInterval(range);
    return isWithinInterval(d, { start, end });
  } catch { return false; }
};

// ── Styles ────────────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: 'linear-gradient(160deg, #0f1929 0%, #0b1220 100%)',
  border: '1px solid rgba(249,115,22,0.18)',
  borderRadius: '1rem',
  padding: '1.25rem',
};

const selectCls =
  'px-3 py-2 rounded-xl text-sm text-white/90 ' +
  'focus:outline-none focus:ring-2 focus:ring-orange-500/40 ' +
  'bg-[#0f1929] border border-white/10 appearance-none cursor-pointer';

const TH = 'text-left py-2 pr-4 text-xs font-medium text-slate-400 whitespace-nowrap uppercase tracking-wide';
const TD = 'py-3 pr-4 text-sm align-middle';

const Chevron = () => (
  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/30">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  </div>
);

const ACTION_BADGE: Record<MeatAction, React.CSSProperties> = {
  'Marinated':      { background: 'rgba(249,115,22,0.18)', border: '1px solid rgba(249,115,22,0.4)',  color: '#fb923c' },
  'Minced (Keema)': { background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.4)', color: '#a78bfa' },
  'Sent to Grill':  { background: 'rgba(34,197,94,0.15)',  border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80' },
};

const RANGE_ACTIVE: React.CSSProperties = {
  background: 'rgba(249,115,22,0.2)',
  border: '1px solid rgba(249,115,22,0.35)',
  color: '#fb923c',
};
const RANGE_INACTIVE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgb(51,65,85)',
  color: 'rgb(203,213,225)',
};

// ── Balance Cards ─────────────────────────────────────────────────────────────

const BalanceCards = ({ bal }: { bal: MeatBalance }) => {
  const u    = bal.unit || 'kg';
  const fmt2 = (n: number) => +n.toFixed(2);

  const cards: {
    label: string;
    value: number;
    containerStyle: React.CSSProperties;
    labelCls?: string;
    valueCls?: string;
  }[] = [
    {
      label: 'Raw Purchased',
      value: fmt2(bal.rawPurchased),
      containerStyle: { background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.25)' },
      labelCls: 'text-orange-300/70',
      valueCls: 'text-orange-400 font-black',
    },
    {
      label: 'Marinated',
      value: fmt2(bal.totalMarinated),
      containerStyle: { background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.25)' },
      labelCls: 'text-yellow-300/70',
      valueCls: 'text-yellow-400 font-black',
    },
    {
      label: 'Keema Stock',
      value: fmt2(bal.totalKeema),
      containerStyle: bal.totalKeema <= 0
        ? { background: 'rgba(100,116,139,0.12)', border: '1px solid rgba(100,116,139,0.2)' }
        : { background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)' },
      labelCls: 'text-indigo-300/70',
      valueCls: 'text-indigo-400 font-black',
    },
    {
      label: 'Ready for Grill',
      value: fmt2(bal.readyForGrill),
      containerStyle: bal.readyForGrill <= 0
        ? { background: 'rgba(100,116,139,0.12)', border: '1px solid rgba(100,116,139,0.2)' }
        : { background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.3)' },
      labelCls: 'text-emerald-300/70',
      valueCls: 'text-emerald-400 font-black',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl p-3.5 text-center" style={c.containerStyle}>
          <p className={`text-xs font-semibold mb-1.5 leading-tight ${c.labelCls ?? 'text-white/50'}`}>
            {c.label}
          </p>
          <p className={`text-2xl leading-none ${c.valueCls ?? 'text-white font-black'}`}>{c.value}</p>
          <p className="text-xs font-semibold text-slate-400 mt-1">{u}</p>
        </div>
      ))}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const MeatPrepLogsTab = () => {
  const meatEntries   = useMeatTrackerStore((s) => s.meatEntries);
  const deleteMeatEntry = useMeatTrackerStore((s) => s.deleteMeatEntry);
  const purchases     = useKitchenPurchasesStore((s) => s.purchases);

  const pool = buildMeatPool(purchases);

  const [selectedMeat, setSelectedMeat] = useState<string>(pool[0] ?? 'Chicken');
  const [dateRange,    setDateRange]    = useState<DateRange>('Today');

  // Ensure selectedMeat is always valid if pool changes
  const effectiveMeat = pool.includes(selectedMeat) ? selectedMeat : (pool[0] ?? 'Chicken');

  // All-time cumulative balance for the selected meat
  const bal = calcBalance(effectiveMeat, purchases, meatEntries);

  // Entries in the selected date range (all meats) for the audit table & summary
  const rangeEntries = meatEntries.filter((e) => dateInRange(e.date, dateRange));

  // Summary stats for the date range (all meat purchases vs all sent-to-grill)
  const meatPurchases = purchases.filter(
    (p) => p.category === 'Meats' && dateInRange(p.date, dateRange),
  );
  const totalPurchasedKg = meatPurchases.reduce((s, p) => s + parseQty(p.quantity), 0);
  const totalSentToGrillKg = rangeEntries
    .filter((e) => e.action === 'Sent to Grill')
    .reduce((s, e) => s + parseQty(e.quantity), 0);

  const handleDelete = (entry: MeatEntry) => {
    if (!window.confirm(`Delete this ${entry.action} entry for ${entry.meatItem}?`)) return;
    deleteMeatEntry(entry.id);
    toast.success('Entry removed');
  };

  // Sort audit table: newest first
  const sortedEntries = [...rangeEntries].sort((a, b) => {
    const cmp = b.date.localeCompare(a.date);
    return cmp !== 0 ? cmp : b.time.localeCompare(a.time);
  });

  return (
    <div className="space-y-5">

      {/* ── Section 1: Live Balance Snapshot ─────────────────────────────── */}
      <div style={CARD}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-white/35 uppercase tracking-widest">
              Live Balance Snapshot
            </p>
            <p className="text-[11px] text-white/25 mt-0.5">All-time cumulative physical stock</p>
          </div>
          {/* Meat selector */}
          <div className="relative">
            <select
              value={effectiveMeat}
              onChange={(e) => setSelectedMeat(e.target.value)}
              className={`${selectCls} pr-8 text-orange-400 font-semibold`}
            >
              {pool.map((item) => (
                <option key={item} value={item} className="bg-[#0f1929] text-white">{item}</option>
              ))}
            </select>
            <Chevron />
          </div>
        </div>
        <BalanceCards bal={bal} />
      </div>

      {/* ── Section 2: Movement & Usage Summary ──────────────────────────── */}
      <div style={CARD}>
        <p className="text-xs font-semibold text-white/35 uppercase tracking-widest mb-3">
          Movement &amp; Usage Summary
        </p>

        {/* Date range selector */}
        <div className="flex flex-wrap gap-2 mb-4">
          {DATE_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
              style={dateRange === r ? RANGE_ACTIVE : RANGE_INACTIVE}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded-xl p-4 flex flex-col gap-1"
            style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' }}
          >
            <p className="text-xs text-orange-300/60 font-medium">Total Purchased</p>
            <p className="text-2xl font-black text-orange-400">{+totalPurchasedKg.toFixed(2)}</p>
            <p className="text-xs text-slate-500 font-semibold">kg · all meats</p>
          </div>
          <div
            className="rounded-xl p-4 flex flex-col gap-1"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}
          >
            <p className="text-xs text-emerald-300/60 font-medium">Total Sent to Grill</p>
            <p className="text-2xl font-black text-emerald-400">{+totalSentToGrillKg.toFixed(2)}</p>
            <p className="text-xs text-slate-500 font-semibold">kg · all meats</p>
          </div>
        </div>
      </div>

      {/* ── Section 3: Audit History Table ───────────────────────────────── */}
      <div style={CARD} className="overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-white/35 uppercase tracking-widest">
              Audit History
            </p>
            <p className="text-[11px] text-white/25 mt-0.5">
              {sortedEntries.length} action{sortedEntries.length !== 1 ? 's' : ''} · {dateRange}
            </p>
          </div>
          <ClipboardList size={16} className="text-white/20" />
        </div>

        {sortedEntries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/8" style={{ background: '#0b1220' }}>
                  <th className={TH}>Date &amp; Time</th>
                  <th className={TH}>Logged By</th>
                  <th className={TH}>Meat Item</th>
                  <th className={TH}>Action Type</th>
                  <th className={TH}>Qty</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((e) => (
                  <tr key={e.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className={`${TD} text-white/40 text-xs whitespace-nowrap`}>
                      <span className="block">{fmtDisplayDate(e.date)}</span>
                      <span className="text-white/25">{e.time}</span>
                    </td>
                    <td className={`${TD} text-white/50 text-xs`}>
                      {e.loggedBy ?? 'Kitchen'}
                    </td>
                    <td className={`${TD} text-white/85 font-medium`}>{e.meatItem}</td>
                    <td className={TD}>
                      <span
                        className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap"
                        style={ACTION_BADGE[e.action]}
                      >
                        {e.action}
                      </span>
                    </td>
                    <td className={`${TD} text-white/60 font-mono text-xs whitespace-nowrap`}>
                      {e.quantity}
                    </td>
                    <td className={TD}>
                      <button
                        onClick={() => handleDelete(e)}
                        className="flex items-center justify-center w-8 h-8 rounded-xl transition-all
                          text-white/25 hover:text-red-400 hover:bg-red-500/15 active:scale-90"
                        title="Delete entry"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16 text-white/20 text-sm">
            No meat actions logged for <span className="text-white/30 font-medium">{dateRange}</span>.
          </div>
        )}
      </div>

    </div>
  );
};

export default MeatPrepLogsTab;
