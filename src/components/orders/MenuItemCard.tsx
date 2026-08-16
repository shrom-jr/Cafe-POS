import { MenuItem } from '@/types/pos';
import { fmt } from '@/utils/format';

interface MenuItemCardProps {
  item: MenuItem;
  quantityInOrder?: number;
  onAdd: () => void;
  disabled?: boolean;
  compact?: boolean;
}

const MenuItemCard = ({ item, onAdd, disabled = false, compact = false }: MenuItemCardProps) => {
  if (compact) {
    /* ── LANDSCAPE COMPACT: horizontal row ── */
    return (
      <button
        onClick={() => !disabled && onAdd()}
        data-testid={`menu-item-${item.id}`}
        disabled={disabled}
        className="group relative flex flex-row items-center p-3.5 rounded-2xl bg-[#13151F] hover:bg-[#181B26] border border-white/15 hover:border-amber-400/60 shadow-lg transition-all w-full text-left active:scale-[0.97]"
        style={{
          opacity: disabled ? 0.4 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {/* Thumbnail */}
        <div className="relative flex-shrink-0 overflow-hidden rounded-xl" style={{ width: 52, height: 52 }}>
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
        </div>

        {/* Name + price */}
        <div className="flex-1 min-w-0 px-3 py-1.5">
          <span className="block text-sm font-black leading-snug line-clamp-2 text-white group-hover:text-amber-200 transition-colors tracking-wide">
            {item.name}
          </span>
          <span className="text-sm font-black text-amber-400 font-mono mt-1 block">
            Rs. {fmt(item.price)}
          </span>
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
      className="group relative flex flex-col justify-between min-h-[100px] p-4 rounded-2xl bg-[#13151F] hover:bg-[#181B26] border border-white/15 hover:border-amber-400/60 shadow-lg transition-all w-full text-left active:scale-[0.97]"
      style={{
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
      <div className="flex-1 px-0 pt-3 flex flex-col gap-1">
        <span className="text-base font-black leading-snug line-clamp-2 text-white group-hover:text-amber-200 transition-colors tracking-wide">
          {item.name}
        </span>
        <div className="mt-2.5">
          <span className="text-base font-black text-amber-400 font-mono tracking-tight">
            Rs. {fmt(item.price)}
          </span>
        </div>
      </div>
    </button>
  );
};

export default MenuItemCard;
