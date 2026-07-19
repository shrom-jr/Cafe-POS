import { MenuItem } from '@/types/pos';
import { Plus } from 'lucide-react';
import { fmt } from '@/utils/format';

interface MenuItemCardProps {
  item: MenuItem;
  quantityInOrder?: number;
  onAdd: () => void;
  disabled?: boolean;
  compact?: boolean;
}

const MenuItemCard = ({ item, quantityInOrder = 0, onAdd, disabled = false, compact = false }: MenuItemCardProps) => {
  if (compact) {
    /* ── LANDSCAPE COMPACT: horizontal row ── */
    return (
      <button
        onClick={() => !disabled && onAdd()}
        data-testid={`menu-item-${item.id}`}
        disabled={disabled}
        className={`
          relative flex flex-row items-center rounded-xl overflow-hidden border w-full text-left
          transition-transform duration-100
          ${disabled
            ? 'opacity-40 cursor-not-allowed border-border/40 bg-card'
            : 'border-white/[0.07] bg-card active:scale-[0.97] shadow-[0_2px_8px_-3px_rgba(0,0,0,0.4)]'
          }
        `}
      >
        {/* Thumbnail */}
        <div className="relative flex-shrink-0 overflow-hidden" style={{ width: 52, height: 52 }}>
          {item.image ? (
            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-xl font-black select-none"
              style={{
                background: 'linear-gradient(160deg, #111827 0%, #0d1425 100%)',
                color: 'rgba(255,255,255,0.18)',
              }}
            >
              {item.name.charAt(0).toUpperCase()}
            </div>
          )}
          {/* Quantity badge */}
          {quantityInOrder > 0 && (
            <span className="absolute top-0.5 left-0.5 min-w-[16px] h-[16px] px-0.5 rounded-full bg-accent text-accent-foreground text-[9px] font-bold flex items-center justify-center leading-none">
              {quantityInOrder}
            </span>
          )}
        </div>

        {/* Name + price */}
        <div className="flex-1 min-w-0 px-2 py-1.5">
          <span className="block text-xs font-bold leading-snug line-clamp-1" style={{ color: 'rgba(255,255,255,0.92)' }}>
            {item.name}
          </span>
          <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Rs. {fmt(item.price)}
          </span>
        </div>

        {/* Add button */}
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center mr-2 shadow-[0_2px_6px_rgba(0,0,0,0.4)]">
          <Plus size={13} strokeWidth={2.5} />
        </div>
      </button>
    );
  }

  /* ── PORTRAIT: compact typographic card — no placeholder box ── */
  return (
    <button
      onClick={() => !disabled && onAdd()}
      data-testid={`menu-item-${item.id}`}
      disabled={disabled}
      className={`
        relative flex flex-col rounded-xl overflow-hidden border w-full text-left
        transition-transform duration-100
        ${disabled
          ? 'opacity-40 cursor-not-allowed border-border/40 bg-card'
          : 'border-white/[0.07] bg-card active:scale-[0.97] shadow-[0_2px_12px_-3px_rgba(0,0,0,0.45)]'
        }
      `}
    >
      {/* ── Image (only when one exists) ── */}
      {item.image && (
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: '1 / 0.75' }}>
          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
        </div>
      )}

      {/* ── Text + controls ── */}
      <div className="flex-1 px-3 py-3 flex flex-col gap-1 relative">
        <span className="text-sm font-bold leading-snug line-clamp-2 pr-8" style={{ color: 'rgba(255,255,255,0.92)' }}>
          {item.name}
        </span>
        <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.65)' }}>
          Rs. {fmt(item.price)}
        </span>

        {/* Quantity badge */}
        {quantityInOrder > 0 && (
          <span className="absolute top-2 right-8 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center leading-none shadow-[0_2px_6px_rgba(0,0,0,0.4)]">
            {quantityInOrder}
          </span>
        )}

        {/* Add button */}
        <div className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
          <Plus size={14} strokeWidth={2.5} />
        </div>
      </div>
    </button>
  );
};

export default MenuItemCard;
