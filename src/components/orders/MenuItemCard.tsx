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
          {/* Quantity badge — top-left of thumbnail */}
          {quantityInOrder > 0 && (
             <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shadow-lg shadow-amber-500/40 border-2 border-[#13151F] animate-in zoom-in-75 duration-150 z-10">
              {quantityInOrder}
            </span>
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

        {/* Add button */}
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-lg flex items-center justify-center shadow-md shadow-amber-500/20 transition-all active:scale-90">
          <Plus size={17} strokeWidth={3} />
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
      className="group relative flex flex-col p-4 rounded-2xl bg-[#13151F] hover:bg-[#181B26] border border-white/15 hover:border-amber-400/60 shadow-lg transition-all w-full text-left active:scale-[0.97]"
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
      <div className="flex-1 px-3 py-3 flex flex-col gap-1 relative">
        <span className="text-base font-black leading-snug pr-9 line-clamp-2 text-white group-hover:text-amber-200 transition-colors tracking-wide">
          {item.name}
        </span>
        <span className="text-base font-black text-amber-400 font-mono mt-1 block">
          Rs. {fmt(item.price)}
        </span>

        {/* Quantity badge — top-right corner of the card */}
        {quantityInOrder > 0 && (
          <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shadow-lg shadow-amber-500/40 border-2 border-[#13151F] animate-in zoom-in-75 duration-150 z-10">
            {quantityInOrder}
          </span>
        )}

        {/* Add button */}
        <div className="absolute bottom-3 right-3 w-9 h-9 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-lg flex items-center justify-center shadow-md shadow-amber-500/20 transition-all active:scale-90">
          <Plus size={17} strokeWidth={3} />
        </div>
      </div>
    </button>
  );
};

export default MenuItemCard;
