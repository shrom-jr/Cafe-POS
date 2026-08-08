import { useEffect, useState } from 'react';
import { CafeTable } from '@/types/pos';
import { tableDisplayName } from '@/utils/tableName';

const DARK_SURFACE = 'linear-gradient(160deg, #0f1929 0%, #0b1220 100%)';
const OCCUPIED_SURFACE = 'linear-gradient(160deg, #1a1308 0%, #120e06 100%)';
const HOVER_BORDER = 'rgba(59,130,246,0.50)';
const HOVER_SHADOW = '0 8px 28px -4px rgba(59,130,246,0.22), inset 0 1px 0 0 rgba(59,130,246,0.06)';
const BASE_SHADOW  = '0 2px 10px -2px rgba(0,0,0,0.55), inset 0 1px 0 0 rgba(255,255,255,0.03)';

const AMBER_BORDER = 'hsl(32 90% 50% / 0.72)';
const AMBER_SHADOW = `0 0 0 1px hsl(32 90% 50% / 0.22), 0 4px 20px -4px hsl(32 90% 45% / 0.40), ${BASE_SHADOW}`;
const AMBER_HOVER_SHADOW = `0 0 0 1px hsl(32 90% 50% / 0.38), 0 8px 28px -4px hsl(32 90% 45% / 0.45), ${HOVER_SHADOW}`;

const RED_BORDER  = 'hsl(0 72% 51% / 0.65)';
const RED_SHADOW  = `0 0 0 1px hsl(0 72% 51% / 0.20), 0 4px 20px -4px hsl(0 72% 45% / 0.38), ${BASE_SHADOW}`;

const statusConfig = {
  free: {
    cardBg: DARK_SURFACE,
    cardBorder: 'rgba(255,255,255,0.08)',
    cardShadow: BASE_SHADOW,
    cardHoverBorder: HOVER_BORDER,
    cardHoverShadow: HOVER_SHADOW,
    showDot: false,
    dotColor: '',
    dotGlow: '',
    dotPulse: false,
    showBadge: false,
    label: 'Available',
    labelBg: '',
    labelColor: '',
    numberColor: '#ffffff',
    numberShadow: 'none',
    paxColor: '',
    metaColor: '',
  },
  occupied: {
    cardBg: OCCUPIED_SURFACE,
    cardBorder: AMBER_BORDER,
    cardShadow: AMBER_SHADOW,
    cardHoverBorder: 'hsl(32 90% 60% / 0.80)',
    cardHoverShadow: AMBER_HOVER_SHADOW,
    showDot: false,
    dotColor: 'hsl(32 90% 55%)',
    dotGlow: '0 0 6px 2px hsl(32 90% 50% / 0.5)',
    dotPulse: true,
    showBadge: true,
    label: 'OCCUPIED',
    labelBg: 'hsl(32 90% 50%)',
    labelColor: '#000000',
    numberColor: '#ffffff',
    numberShadow: '0 0 12px rgba(255,200,100,0.15)',
    paxColor: '#ffffff',
    metaColor: 'rgba(255,255,255,0.80)',
  },
  billing: {
    cardBg: DARK_SURFACE,
    cardBorder: RED_BORDER,
    cardShadow: RED_SHADOW,
    cardHoverBorder: HOVER_BORDER,
    cardHoverShadow: HOVER_SHADOW,
    showDot: false,
    dotColor: 'hsl(0 72% 55%)',
    dotGlow: '0 0 6px 2px hsl(0 72% 51% / 0.5)',
    dotPulse: true,
    showBadge: true,
    label: 'BILLING',
    labelBg: 'hsl(0 72% 51%)',
    labelColor: '#ffffff',
    numberColor: '#ffffff',
    numberShadow: 'none',
    paxColor: '#ffffff',
    metaColor: 'rgba(255,255,255,0.80)',
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
  onClick: () => void;
  showSection?: boolean;
}

const TableCard = ({ table, itemCount = 0, onClick, showSection = false }: TableCardProps) => {
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
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 40%)' }}
      />

      {/* Table name */}
      <span
        title={tableDisplayName(table.number)}
        className="block w-full min-w-0 truncate text-center text-xl sm:text-2xl font-bold tracking-tight leading-tight"
        style={{ color: cfg.numberColor, textShadow: cfg.numberShadow }}
      >
        {tableDisplayName(table.number)}
      </span>

      {showSection && (
        <span className="mt-1 max-w-full truncate text-[10px] font-medium text-white/40" title={table.section || 'Ground Floor'}>
          {table.section || 'Ground Floor'}
        </span>
      )}

      {/* Status badge — only for occupied/billing, hidden for free */}
      {cfg.showBadge && (
        <span
          className="mt-2 text-[11px] font-bold leading-none px-3 py-1 rounded-full tracking-wide"
          style={{ background: cfg.labelBg, color: cfg.labelColor }}
        >
          {cfg.label}
        </span>
      )}

      {/* Active/Billing metrics — emoji format */}
      {isActive && (
        <div className="mt-2.5 flex w-full flex-col items-center gap-1">
          <span className="text-sm font-bold leading-tight" style={{ color: cfg.paxColor }}>
            👥 {table.pax ?? 1} Pax
          </span>
          <span
            className="max-w-full truncate text-[11px] font-semibold leading-tight tabular-nums"
            style={{ color: cfg.metaColor }}
          >
            📦 {itemCount} Item{itemCount !== 1 ? 's' : ''}
            {timer ? `  ⏱ ${timer}` : ''}
          </span>
        </div>
      )}
    </button>
  );
};

export default TableCard;
