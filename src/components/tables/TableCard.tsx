import { useEffect, useState } from 'react';
import { CafeTable } from '@/types/pos';
import { tableDisplayName } from '@/utils/tableName';

function useTimer(startTime?: number) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!startTime) { setElapsed(''); return; }
    const update = () => {
      const diff = Math.floor((Date.now() - startTime) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      setElapsed(h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`);
    };
    update();
    const id = setInterval(update, 10000);
    return () => clearInterval(id);
  }, [startTime]);
  return elapsed;
}

interface TableCardProps {
  table: CafeTable;
  itemCount?: number;
  customerName?: string;
  onClick: () => void;
  showSection?: boolean;
  /** Extra classes forwarded to the root <button>; use for height overrides (e.g. h-full). */
  className?: string;
}

const TableCard = ({
  table,
  itemCount = 0,
  customerName,
  onClick,
  showSection = false,
  className = '',
}: TableCardProps) => {
  const timer = useTimer(table.orderStartTime);
  const isActive = table.status !== 'free';

  const statusLabel = table.status === 'billing' ? 'BILLING' : 'OCCUPIED';
  const statusDot   = table.status === 'billing'
    ? 'bg-emerald-500 dark:bg-red-400'
    : 'bg-orange-500 dark:bg-amber-400';
  const statusBadge = table.status === 'billing'
    ? 'border-emerald-600/60 bg-emerald-500/10 text-emerald-800 dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-300'
    : 'border-amber-500 bg-amber-500 text-white dark:border-amber-500/60 dark:bg-amber-500/15 dark:text-amber-400';

  // ── Card shell tone ───────────────────────────────────────────────────────
  const cardTone = table.status === 'free'
    ? 'border-[1.5px] border-slate-900 bg-slate-100 text-slate-950 shadow-sm transition-all duration-150 hover:bg-slate-200 hover:border-emerald-600 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-[#13151F] dark:text-white'
    : table.status === 'billing'
      ? 'border-2 border-emerald-600 bg-emerald-50 shadow-sm dark:border-emerald-500 dark:bg-emerald-950/60'
      : 'border-2 border-amber-500 bg-amber-50/90 shadow-md shadow-amber-500/10 dark:border-amber-500/80 dark:bg-gradient-to-b dark:from-[#221813] dark:to-[#14100E]';

  return (
    <button
      onClick={onClick}
      data-testid={`table-card-${table.id}`}
      className={`group relative flex w-full flex-col rounded-xl p-2 text-card-foreground transition-all duration-150 active:translate-y-0 active:scale-[0.98] ${cardTone} ${className}`}
    >
      {/* ── FREE state ── */}
      {!isActive ? (
        <div className="flex h-full w-full min-h-[44px] items-center justify-center">
          <span className="text-center text-lg font-black tracking-wide text-slate-950 dark:text-white leading-tight">
            {tableDisplayName(table.number)}
          </span>
        </div>
      ) : (
        /* ── OCCUPIED / BILLING state ── */
        <div className="flex w-full flex-1 flex-col gap-0.5">
          {/* Row 1: table name + status badge */}
          <div className="flex items-center justify-between gap-1 min-w-0">
            <span
              title={tableDisplayName(table.number)}
              className="min-w-0 truncate text-sm font-black leading-tight tracking-tight text-slate-900 dark:text-white"
            >
              {tableDisplayName(table.number)}
            </span>
            <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-bold leading-none tracking-wider ${statusBadge}`}>
              <span className={`h-1 w-1 rounded-full ${statusDot}`} />
              {statusLabel}
            </span>
          </div>

          {showSection && (
            <span className="max-w-full truncate text-[10px] font-medium text-slate-600 dark:text-slate-400" title={table.section || 'Ground Floor'}>
              {table.section || 'Ground Floor'}
            </span>
          )}

          {/* Row 2: guest count + optional customer pill */}
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span className="text-[11px] font-black text-slate-900 dark:text-white">
              {table.pax ?? 1}g
            </span>
            {customerName && (
              <span className="min-w-0 truncate rounded-full bg-slate-900 px-2 py-px text-[10px] font-bold tracking-wide text-white dark:bg-white/10 dark:text-white">
                {customerName}
              </span>
            )}
          </div>

          {/* Row 3: timer + item count */}
          <div className="mt-auto flex items-center justify-between border-t border-slate-200 pt-1 text-[10px] font-bold text-slate-700 dark:border-white/10 dark:text-slate-300">
            <span className="tabular-nums">{timer || '—'}</span>
            <span>{itemCount}i</span>
          </div>
        </div>
      )}
    </button>
  );
};

export default TableCard;
