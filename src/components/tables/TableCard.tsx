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
}

const TableCard = ({
  table,
  itemCount = 0,
  customerName,
  onClick,
  showSection = false,
}: TableCardProps) => {
  const timer = useTimer(table.orderStartTime);
  const isActive = table.status !== 'free';
  const statusLabel = table.status === 'billing'
      ? 'BILLING'
      : 'OCCUPIED';
  const statusTone = table.status === 'billing'
      ? 'border-red-500/35 bg-red-500/10 font-bold text-red-700 dark:text-red-300'
       : 'border border-amber-500/60 bg-amber-500/15 font-bold text-amber-800 dark:border-amber-500/60 dark:bg-amber-500/15 dark:text-amber-400';
  const statusDot = table.status === 'billing'
      ? 'bg-red-400'
      : 'bg-amber-400';
   const cardTone = table.status === 'free'
     ? 'border border-slate-300/90 bg-gradient-to-b from-white to-slate-50/90 text-slate-800 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-md dark:border-white/10 dark:bg-gradient-to-b dark:from-[#1C1F2B] dark:to-[#12141D] dark:text-white'
    : table.status === 'billing'
      ? 'border-2 border-red-500 bg-red-50/60 shadow-sm dark:bg-gradient-to-b dark:from-[#281D17] dark:to-[#141217] dark:border-red-500 hover:border-red-400'
       : 'border-2 border-amber-500 bg-gradient-to-b from-amber-50/90 to-amber-100/40 shadow-sm dark:border-amber-500/80 dark:bg-gradient-to-b dark:from-[#221813] dark:to-[#14100E] hover:border-amber-400';

  return (
    <button
      onClick={onClick}
      data-testid={`table-card-${table.id}`}
      className={`group relative flex min-h-[176px] w-full flex-col rounded-2xl p-4 text-card-foreground transition-all duration-150 active:translate-y-0 active:scale-[0.98] ${cardTone}`}
    >
      {table.status === 'free' ? (
        <div className="relative flex w-full flex-1 items-center justify-center">
          <span
            title={tableDisplayName(table.number)}
             className="text-center text-2xl font-black tracking-wide text-slate-800 dark:text-white"
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
            <span className="mt-1 max-w-full truncate text-sm font-medium text-slate-600 dark:text-slate-300" title={table.section || 'Ground Floor'}>
              {table.section || 'Ground Floor'}
            </span>
          )}

          {/* Middle body zone */}
          <div className="flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1.5 py-2 text-center">
             <span className="text-sm font-bold leading-tight text-slate-900 dark:text-white">
              {table.pax ?? 1} Guest{(table.pax ?? 1) !== 1 ? 's' : ''}
            </span>
            {customerName && (
              <span className="w-fit max-w-full truncate rounded-full border border-slate-300 bg-slate-200/90 px-3 py-1 text-xs font-bold tracking-wide text-slate-900 shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-white">
                {customerName}
              </span>
            )}
          </div>

          {/* Bottom footer zone */}
          <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-800 dark:border-white/10 dark:text-slate-100">
            <span className="tabular-nums">{timer || '—'}</span>
            <span>{itemCount} Item{itemCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}
    </button>
  );
};

export default TableCard;
