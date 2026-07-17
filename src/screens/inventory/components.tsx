import { useState } from 'react';
import { useInventoryStore } from '@/store/useInventoryStore';
import { usePOSStore } from '@/store/usePOSStore';
import { InvMenuMapping, InvProductType } from '@/types/pos';
import {
  CARD, BTN_PRIMARY, BTN_GHOST, BTN_DANGER, BTN_SM_PRIMARY,
  INPUT, SELECT, LABEL, MOVE_TYPE_COLORS, PROD_TYPE_COLORS,
} from './styles';
import { Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

// ── TypeBadge ────────────────────────────────────────────────────────────────
export const TypeBadge = ({ type }: { type: string }) => (
  <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold leading-none ${MOVE_TYPE_COLORS[type] ?? 'bg-white/[0.06] border-white/[0.08] text-white/40'}`}>
    {type}
  </span>
);

// ── ProdTypeBadge ────────────────────────────────────────────────────────────
export const ProdTypeBadge = ({ type }: { type: InvProductType }) => {
  const labels: Record<InvProductType, string> = {
    alcohol: 'Alcohol', beverage: 'Beverage', cigarette: 'Cigarette',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold leading-none ${PROD_TYPE_COLORS[type]}`}>
      {labels[type]}
    </span>
  );
};

// ── LowBadge ────────────────────────────────────────────────────────────────
export const LowBadge = () => (
  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/20 text-red-400 font-semibold leading-none">
    LOW
  </span>
);

// ── StatusBadge ─────────────────────────────────────────────────────────────
export const StatusBadge = ({ status }: { status: 'active' | 'inactive' }) =>
  status === 'active' ? (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 border border-green-500/20 text-green-400 font-semibold leading-none">Active</span>
  ) : (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-white/35 font-semibold leading-none">Inactive</span>
  );

// ── ValueCard ────────────────────────────────────────────────────────────────
export const ValueCard = ({
  label, value, sub, accent = false, warn = false,
}: {
  label: string; value: string; sub?: string; accent?: boolean; warn?: boolean;
}) => (
  <div className={`rounded-xl border p-4 ${
    accent ? 'border-blue-500/20 bg-blue-500/[0.05]' :
    warn   ? 'border-red-500/20 bg-red-500/[0.05]' :
             'border-white/[0.07] bg-white/[0.03]'
  }`}>
    <p className="text-xs text-muted-foreground mb-1">{label}</p>
    <p className={`text-xl font-bold ${warn ? 'text-red-400' : 'text-foreground'}`}>{value}</p>
    {sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{sub}</p>}
  </div>
);

// ── SectionBanner (low stock warning) ───────────────────────────────────────
export const LowStockBanner = ({ count, noun = 'product' }: { count: number; noun?: string }) => (
  <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-500/25 bg-red-500/[0.07] text-red-300 text-sm">
    <span>⚠</span>
    <span>
      <strong className="text-red-300">{count}</strong> {noun}{count !== 1 ? 's are' : ' is'} below minimum stock level.
    </span>
  </div>
);

// ── Divider ─────────────────────────────────────────────────────────────────
export const Divider = () => <hr className="border-white/[0.06]" />;

// ── MappingsSection ──────────────────────────────────────────────────────────
// Reusable across Alcohol / Beverage / Cigarette sections
interface SimpleProduct { id: string; name: string; }

interface MappingsSectionProps {
  productType: InvProductType;
  products:    SimpleProduct[];
  unit:        string;          // ml | pcs | sticks
}

export const MappingsSection = ({ productType, products, unit }: MappingsSectionProps) => {
  const invMappings  = useInventoryStore((s) => s.invMappings);
  const addMapping   = useInventoryStore((s) => s.addMapping);
  const deleteMapping= useInventoryStore((s) => s.deleteMapping);
  const menuItems    = usePOSStore((s) => s.menuItems);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ productId: '', menuItemId: '', deductQty: '' });

  const myMappings = invMappings.filter((m) => m.productType === productType);

  const getProductName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const getMenuItemName= (id: string) => menuItems.find((m) => m.id === id)?.name ?? id;

  const handleAdd = () => {
    if (!form.productId)  return toast.error('Select an inventory product');
    if (!form.menuItemId) return toast.error('Select a menu item');
    const qty = parseFloat(form.deductQty);
    if (isNaN(qty) || qty <= 0) return toast.error(`Enter a valid deduct quantity (${unit})`);
    // Prevent duplicate
    const dup = myMappings.find(
      (m) => m.productId === form.productId && m.menuItemId === form.menuItemId
    );
    if (dup) return toast.error('This mapping already exists');

    addMapping({ productType, productId: form.productId, menuItemId: form.menuItemId, deductQty: qty });
    toast.success('Mapping added');
    setForm({ productId: '', menuItemId: '', deductQty: '' });
    setShowForm(false);
  };

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">POS Menu Item Mappings</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Link each menu item to an inventory product and set exactly how much stock to deduct per sale. Selling prices are set independently in the menu and are not affected here.
          </p>
        </div>
        {!showForm && (
          <button className={BTN_SM_PRIMARY} onClick={() => setShowForm(true)}>
            <Plus size={13} /> Add Mapping
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-4 p-4 rounded-lg border border-white/[0.08] bg-white/[0.02] space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={LABEL}>Inventory Product</label>
              <select className={SELECT} value={form.productId}
                onChange={(e) => setForm((p) => ({ ...p, productId: e.target.value }))}>
                <option value="">Select product…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Menu Item (POS)</label>
              <select className={SELECT} value={form.menuItemId}
                onChange={(e) => setForm((p) => ({ ...p, menuItemId: e.target.value }))}>
                <option value="">Select menu item…</option>
                {menuItems.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Deduct per sale ({unit})</label>
              <input className={INPUT} type="number" min="0.01" step="any"
                placeholder={unit === 'ml' ? 'e.g. 90' : '1'}
                value={form.deductQty}
                onChange={(e) => setForm((p) => ({ ...p, deductQty: e.target.value }))} />
              {unit === 'ml' && (
                <p className="text-xs text-muted-foreground/60 mt-1">ml deducted from stock per sale — does not affect selling price</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button className={BTN_PRIMARY} onClick={handleAdd}><Plus size={14} /> Add</button>
            <button className={BTN_GHOST} onClick={() => setShowForm(false)}><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      {myMappings.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No mappings yet — add one to enable automatic stock deduction on sale.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-left">
              <th className="pb-2 text-xs font-medium text-muted-foreground">Product</th>
              <th className="pb-2 text-xs font-medium text-muted-foreground">Menu Item</th>
              <th className="pb-2 text-xs font-medium text-muted-foreground text-right">Deducted per Sale</th>
              <th className="pb-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {myMappings.map((m: InvMenuMapping) => (
              <tr key={m.id} className="border-b border-white/[0.04] last:border-0">
                <td className="py-2 text-foreground font-medium">{getProductName(m.productId)}</td>
                <td className="py-2 text-muted-foreground">{getMenuItemName(m.menuItemId)}</td>
                <td className="py-2 text-right font-mono text-foreground">
                  {m.deductQty} {unit}
                </td>
                <td className="py-2">
                  <button className={BTN_DANGER} onClick={() => {
                    deleteMapping(m.id);
                    toast.success('Mapping removed');
                  }}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
