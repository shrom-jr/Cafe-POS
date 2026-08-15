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
      ? 'border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300'
      : 'border-orange-500 bg-orange-500 text-orange-950';
  const statusDot = table.status === 'billing'
      ? 'bg-red-400'
      : 'bg-orange-950';
  const cardTone = table.status === 'free'
    ? 'border-border/60'
    : table.status === 'billing'
      ? 'border-2 border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.12)]'
      : 'border-2 border-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.18)]';

  return (
    <button
      onClick={onClick}
      data-testid={`table-card-${table.id}`}
      className={`group relative flex min-h-[176px] w-full flex-col justify-start rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg active:translate-y-0 active:scale-[0.98] ${cardTone}`}
    >
      <div className="flex w-full flex-1 flex-col">
        {/* Top header zone */}
        <div className="flex items-center justify-between gap-3">
          <span
            title={tableDisplayName(table.number)}
            className="min-w-0 truncate text-left text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl"
          >
            {tableDisplayName(table.number)}
          </span>

          {isActive && (
            <span className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold leading-none tracking-[0.08em] ${statusTone}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
              {statusLabel}
            </span>
          )}
        </div>

        {showSection && (
          <span className="mt-1 max-w-full truncate text-sm font-medium text-foreground/70" title={table.section || 'Ground Floor'}>
            {table.section || 'Ground Floor'}
          </span>
        )}

        {/* Middle body zone */}
        <div className="flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1.5 py-2 text-center">
          {isActive ? (
            <>
              <span className="text-sm font-bold leading-tight text-foreground">
                {table.pax ?? 1} Guest{(table.pax ?? 1) !== 1 ? 's' : ''}
              </span>
              {customerName && (
                <span className="w-fit max-w-full truncate rounded-md bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
                  {customerName}
                </span>
              )}
            </>
          ) : null}
        </div>

        {/* Bottom footer zone */}
        <div className="flex items-center justify-between border-t border-border/60 pt-2 text-sm text-foreground">
          {isActive ? (
            <>
              <span className="font-semibold tabular-nums">{timer || '—'}</span>
              <span className="font-semibold">{itemCount} Item{itemCount !== 1 ? 's' : ''}</span>
            </>
          ) : (
            <span className="font-medium">Open Table</span>
          )}
        </div>
      </div>
    </button>
  );
};

export default TableCard;
