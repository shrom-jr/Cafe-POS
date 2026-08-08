import { MenuItem } from '@/types/pos';
import { Plus } from 'lucide-react';
import { fmt } from '@/utils/format';

const CARD_BG = 'linear-gradient(160deg, #0f1929 0%, #0b1220 100%)';
const CARD_BORDER = '1px solid rgba(30,41,59,0.85)';
const CARD_SHADOW = '0 2px 10px -2px rgba(0,0,0,0.55)';

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
        className="relative flex flex-row items-center rounded-xl overflow-hidden w-full text-left transition-transform duration-100 active:scale-[0.97]"
        style={{
          background: CARD_BG,
          border: CARD_BORDER,
          boxShadow: CARD_SHADOW,
          opacity: disabled ? 0.4 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {/* Thumbnail */}
        <div className="relative flex-shrink-0 overflow-hidden" style={{ width: 52, height: 52 }}>
          {item.image ? (
            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-xl font-black select-none"
              style={{ background: 'rgba(15,23,42,0.9)', color: 'rgba(255,255,255,0.18)' }}
            >
              {item.name.charAt(0).toUpperCase()}
            </div>
          )}
          {/* Quantity badge — top-left of thumbnail */}
          {quantityInOrder > 0 && (
            <span className="absolute top-0.5 left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center leading-none shadow-sm">
              {quantityInOrder}
            </span>
          )}
        </div>

        {/* Name + price */}
        <div className="flex-1 min-w-0 px-2.5 py-1.5">
          <span className="block text-xs font-bold leading-snug line-clamp-2" style={{ color: '#ffffff' }}>
            {item.name}
          </span>
          <span className="text-[11px] font-bold" style={{ color: 'rgba(52,211,153,0.9)' }}>
            Rs. {fmt(item.price)}
          </span>
        </div>

        {/* Add button */}
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center mr-2 shadow-sm">
          <Plus size={13} strokeWidth={2.5} />
        </div>
      </button>
    );
  }

  /* ── PORTRAIT: card — click anywhere to add ── */
  return (
    <button
      onClick={() => !disabled && onAdd()}
      data-testid={`menu-item-${item.id}`}
      disabled={disabled}
      className="relative flex flex-col rounded-xl overflow-hidden w-full text-left transition-transform duration-100 active:scale-[0.97]"
      style={{
        background: CARD_BG,
        border: CARD_BORDER,
        boxShadow: CARD_SHADOW,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
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
        <span className="text-sm font-bold leading-snug pr-9 line-clamp-2" style={{ color: '#ffffff' }}>
          {item.name}
        </span>
        <span className="text-xs font-bold" style={{ color: 'rgba(52,211,153,0.9)' }}>
          Rs. {fmt(item.price)}
        </span>

        {/* Quantity badge — top-right corner of the card */}
        {quantityInOrder > 0 && (
          <span className="absolute top-2 right-2 min-w-[20px] h-[20px] px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center leading-none shadow-sm">
            {quantityInOrder}
          </span>
        )}

        {/* Add button */}
        <div className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-sm">
          <Plus size={14} strokeWidth={2.5} />
        </div>
      </div>
    </button>
  );
};

export default MenuItemCard;
