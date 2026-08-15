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
  const statusLabel = table.status === 'free'
    ? 'FREE'
    : table.status === 'billing'
      ? 'BILLING'
      : 'OCCUPIED';
  const statusTone = table.status === 'free'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : table.status === 'billing'
      ? 'border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300'
      : 'border-amber-500/45 bg-amber-500/15 text-amber-700 shadow-[0_0_0_2px_hsl(var(--warning)/0.10)] dark:text-amber-300';
  const statusDot = table.status === 'free'
    ? 'bg-emerald-400'
    : table.status === 'billing'
      ? 'bg-red-400'
      : 'bg-amber-400';

  return (
    <button
      onClick={onClick}
      data-testid={`table-card-${table.id}`}
      className="group relative flex min-h-[148px] w-full flex-col items-center justify-center rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg active:translate-y-0 active:scale-[0.98]"
    >
      {/* Table name */}
      <span
        title={tableDisplayName(table.number)}
        className="block w-full min-w-0 truncate text-center text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl"
      >
        {tableDisplayName(table.number)}
      </span>

      {showSection && (
        <span className="mt-1 max-w-full truncate text-[10px] font-medium text-muted-foreground" title={table.section || 'Ground Floor'}>
          {table.section || 'Ground Floor'}
        </span>
      )}

      {/* Status badge */}
      <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold leading-none tracking-[0.08em] ${statusTone}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
        {statusLabel}
      </span>

      {/* Active/Billing metrics */}
      {isActive && (
        <div className="mt-2.5 flex w-full flex-col items-center gap-1">
          <span className="text-sm font-bold leading-tight text-foreground">
            👥 {table.pax ?? 1} Pax
          </span>
          <div className="flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] font-semibold leading-tight tabular-nums text-muted-foreground">
            {timer && <span>⏱ {timer}</span>}
            {customerName && <span className="max-w-full truncate text-foreground/80">👤 {customerName}</span>}
            <span>📦 {itemCount} Item{itemCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}
    </button>
  );
};

export default TableCard;
