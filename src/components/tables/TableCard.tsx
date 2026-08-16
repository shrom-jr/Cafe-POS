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
      const s = diff % 60;
      setElapsed(
        h > 0
          ? `${h}h ${String(m).padStart(2, '0')}m`
          : `${m}m`
      );
    };
    update();
    const id = setInterval(update, 10000); // update every 10s — sufficient for minute display
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
  const statusLabel = table.status === 'billing'
      ? 'BILLING'
      : 'OCCUPIED';
  const statusTone = table.status === 'billing'
      ? 'border-emerald-600/60 bg-emerald-500/10 font-bold text-emerald-800 dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-300'
       : 'border-amber-500 bg-amber-500 font-bold text-white dark:border-amber-500/60 dark:bg-amber-500/15 dark:text-amber-400';
  const statusDot = table.status === 'billing'
      ? 'bg-emerald-500 dark:bg-red-400'
      : 'bg-orange-500 dark:bg-amber-400';
    const cardTone = table.status === 'free'
     ? 'border-[1.5px] border-slate-900 bg-slate-100 text-slate-950 shadow-sm transition-all duration-150 hover:bg-slate-200 hover:border-emerald-600 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-[#13151F] dark:text-white'
    : table.status === 'billing'
       ? 'border-2 border-emerald-600 bg-emerald-50 shadow-sm dark:border-emerald-500 dark:bg-emerald-950/60'
         : 'border-2 border-amber-500 bg-amber-50/90 shadow-md shadow-amber-500/10 dark:border-amber-500/80 dark:bg-gradient-to-b dark:from-[#221813] dark:to-[#14100E]';

  return (
    <button
      onClick={onClick}
      data-testid={`table-card-${table.id}`}
      className={`group relative flex min-h-[176px] w-full flex-col rounded-2xl p-4 text-card-foreground transition-all duration-150 active:translate-y-0 active:scale-[0.98] ${cardTone} ${className}`}
    >
      {table.status === 'free' ? (
        <div className="relative flex min-h-full w-full items-center justify-center">
          <span
            title={tableDisplayName(table.number)}
                 className="text-center text-2xl font-black tracking-wide text-slate-950 dark:text-white"
          >
            {tableDisplayName(table.number)}
          </span>
        </div>
      ) : (
        <div className="flex w-full flex-1 flex-col">
          {/* Top header zone */}
          <div className="flex items-center justify-between gap-3">
            <span
              title={tableDisplayName(table.number)}
                className="min-w-0 truncate text-xl font-black leading-tight tracking-tight text-left text-slate-900 dark:text-white"
            >
              {tableDisplayName(table.number)}
            </span>

             <span className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold leading-none tracking-wider ${statusTone}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
              {statusLabel}
            </span>
          </div>

          {showSection && (
            <span className="mt-1 max-w-full truncate text-sm font-medium text-slate-700 dark:text-slate-300" title={table.section || 'Ground Floor'}>
              {table.section || 'Ground Floor'}
            </span>
          )}

          {/* Middle body zone */}
          <div className="flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1.5 py-2 text-center">
             <span className="text-sm font-black leading-tight text-slate-900 dark:text-white">
              {table.pax ?? 1} Guest{(table.pax ?? 1) !== 1 ? 's' : ''}
            </span>
            {customerName && (
                <span className="w-fit max-w-full truncate rounded-full bg-slate-900 px-3 py-1 text-xs font-bold tracking-wide text-white shadow-sm dark:bg-white/10 dark:text-white">
                {customerName}
              </span>
            )}
          </div>

          {/* Bottom footer zone */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm font-bold text-slate-800 dark:border-white/10 dark:text-slate-100">
            <span className="tabular-nums">{timer || '—'}</span>
            <span>{itemCount} Item{itemCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}
    </button>
  );
};

export default TableCard;
