import { useEffect, useState } from 'react';
import { CafeTable } from '@/types/pos';
import { tableDisplayName } from '@/utils/tableName';

const DARK_SURFACE = 'linear-gradient(160deg, #0f1929 0%, #0b1220 100%)';
const HOVER_BORDER = 'rgba(59,130,246,0.38)';
const HOVER_SHADOW = '0 6px 24px -4px rgba(59,130,246,0.18), inset 0 1px 0 0 rgba(59,130,246,0.05)';
const BASE_SHADOW  = '0 2px 10px -2px rgba(0,0,0,0.55), inset 0 1px 0 0 rgba(255,255,255,0.03)';

const statusConfig = {
  free: {
    cardBg: DARK_SURFACE,
    cardBorder: 'rgba(16,185,129,0.22)',
    cardShadow: BASE_SHADOW,
    cardHoverBorder: HOVER_BORDER,
    cardHoverShadow: HOVER_SHADOW,
    dotColor: '#10b981',
    dotGlow: '0 0 6px 2px rgba(16,185,129,0.45)',
    dotPulse: false,
    label: 'Available',
    labelBg: 'rgba(16,185,129,0.09)',
    labelColor: 'rgba(52,211,153,0.78)',
    numberColor: 'rgba(255,255,255,0.75)',
    numberShadow: 'none',
    paxColor: '',
    metaColor: '',
  },
  occupied: {
    cardBg: DARK_SURFACE,
    cardBorder: 'hsl(32 90% 50% / 0.28)',
    cardShadow: BASE_SHADOW,
    cardHoverBorder: HOVER_BORDER,
    cardHoverShadow: HOVER_SHADOW,
    dotColor: 'hsl(32 90% 55%)',
    dotGlow: '0 0 6px 2px hsl(32 90% 50% / 0.5)',
    dotPulse: true,
    label: 'Active',
    labelBg: 'hsl(32 90% 50% / 0.11)',
    labelColor: 'hsl(32 90% 65%)',
    numberColor: 'rgba(255,255,255,0.88)',
    numberShadow: 'none',
    paxColor: 'hsl(32 85% 62%)',
    metaColor: 'rgba(255,255,255,0.32)',
  },
  billing: {
    cardBg: DARK_SURFACE,
    cardBorder: 'hsl(0 72% 51% / 0.28)',
    cardShadow: BASE_SHADOW,
    cardHoverBorder: HOVER_BORDER,
    cardHoverShadow: HOVER_SHADOW,
    dotColor: 'hsl(0 72% 55%)',
    dotGlow: '0 0 6px 2px hsl(0 72% 51% / 0.5)',
    dotPulse: true,
    label: 'Billing',
    labelBg: 'hsl(0 72% 51% / 0.11)',
    labelColor: 'hsl(0 72% 65%)',
    numberColor: 'rgba(255,255,255,0.88)',
    numberShadow: 'none',
    paxColor: 'hsl(0 70% 62%)',
    metaColor: 'rgba(255,255,255,0.32)',
  },
};

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
          ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
          : `${m}:${String(s).padStart(2, '0')}`
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startTime]);
  return elapsed;
}

interface TableCardProps {
  table: CafeTable;
  itemCount?: number;
  onClick: () => void;
}

const TableCard = ({ table, itemCount = 0, onClick }: TableCardProps) => {
  const timer = useTimer(table.orderStartTime);
  const cfg = statusConfig[table.status];
  const isActive = table.status !== 'free';
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-testid={`table-card-${table.id}`}
      className="relative flex flex-col items-center justify-center p-4 rounded-2xl w-full min-h-[148px] transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.97] active:translate-y-0"
      style={{
        background: cfg.cardBg,
        border: `1px solid ${hovered ? cfg.cardHoverBorder : cfg.cardBorder}`,
        boxShadow: hovered ? cfg.cardHoverShadow : cfg.cardShadow,
      }}
    >
      {/* Top inner highlight */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.035) 0%, transparent 40%)' }}
      />

      {/* Status dot */}
      <div
        className="absolute top-3 right-3 w-2 h-2 rounded-full"
        style={{ background: cfg.dotColor, boxShadow: cfg.dotGlow }}
      >
        {cfg.dotPulse && (
          <div
            className="absolute inset-0 rounded-full animate-ping opacity-50"
            style={{ background: cfg.dotColor, animationDuration: '2.2s' }}
          />
        )}
      </div>

      {/* Table number */}
      <span
        className="text-5xl font-black tracking-tight leading-none"
        style={{ color: cfg.numberColor, textShadow: cfg.numberShadow }}
      >
        {tableDisplayName(table.number)}
      </span>

      {/* Status badge */}
      <span
        className="mt-1.5 text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
        style={{ background: cfg.labelBg, color: cfg.labelColor }}
      >
        {cfg.label}
      </span>

      {/* Active/Billing details */}
      {isActive && (
        <div className="mt-2 flex flex-col items-center gap-0.5 w-full">
          <span className="text-[15px] font-bold leading-tight" style={{ color: cfg.paxColor }}>
            {table.pax ?? 1} pax
          </span>
          <span className="text-[10px] font-medium tabular-nums" style={{ color: cfg.metaColor }}>
            {itemCount} item{itemCount !== 1 ? 's' : ''}{timer ? ` · ${timer}` : ''}
          </span>
        </div>
      )}
    </button>
  );
};

export default TableCard;
