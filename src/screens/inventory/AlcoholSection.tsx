import { useState, useMemo } from 'react';
import { useInventoryStore } from '@/store/useInventoryStore';
import { AlcoholProduct, InvMovementType } from '@/types/pos';
import {
  CARD, BTN_PRIMARY, BTN_GHOST, BTN_DANGER, BTN_EDIT, BTN_BUY, BTN_ADJUST,
  INPUT, SELECT, LABEL, TH, TD,
} from './styles';
import { LowStockBanner, LowBadge, StatusBadge, MappingsSection } from './components';
import { toast } from 'sonner';
import { Plus, Edit3, Trash2, ShoppingCart, SlidersHorizontal, Save, X } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtMl(ml: number, bottleSizeMl: number) {
  const btl = ml / bottleSizeMl;
  const btlStr = Number.isInteger(btl) ? String(btl) : btl.toFixed(1);
  return { primary: `${ml.toLocaleString()} ml`, secondary: `${btlStr} btl` };
}

// ── Product Form ──────────────────────────────────────────────────────────────
const EMPTY_PF = { name: '', brand: '', bottleSizeMl: '750', minStockBottles: '3', costPerBottle: '', status: 'active' as 'active' | 'inactive' };

interface ProductFormProps {
  editProduct?: AlcoholProduct;
  onClose: () => void;
}

const ProductForm = ({ editProduct, onClose }: ProductFormProps) => {
  const addAlcohol    = useInventoryStore((s) => s.addAlcohol);
  const updateAlcohol = useInventoryStore((s) => s.updateAlcohol);

  const [form, setForm] = useState(() => editProduct ? {
    name: editProduct.name, brand: editProduct.brand ?? '', status: editProduct.status,
    bottleSizeMl: String(editProduct.bottleSizeMl),
    minStockBottles: String(editProduct.minStockMl / editProduct.bottleSizeMl),
    costPerBottle: editProduct.costPerBottle !== undefined ? String(editProduct.costPerBottle) : '',
  } : EMPTY_PF);

  const f = (k: keyof typeof EMPTY_PF) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.name.trim()) return toast.error('Name is required');
    const bsz = parseFloat(form.bottleSizeMl);
    const msb = parseFloat(form.minStockBottles);
    if (isNaN(bsz) || bsz <= 0) return toast.error('Bottle size must be greater than 0');
    if (isNaN(msb) || msb < 0)  return toast.error('Min stock must be 0 or more');
    const cpu = form.costPerBottle !== '' ? parseFloat(form.costPerBottle) : undefined;
    if (cpu !== undefined && (isNaN(cpu) || cpu < 0)) return toast.error('Invalid cost per bottle');

    const data: Omit<AlcoholProduct, 'id'> = {
      name: form.name.trim(), brand: form.brand.trim() || undefined,
      bottleSizeMl: Math.round(bsz),
      currentStockMl: editProduct?.currentStockMl ?? 0,
      minStockMl: Math.round(msb * bsz),
      costPerBottle: cpu, status: form.status,
    };
    if (editProduct) {
      updateAlcohol(editProduct.id, data);
      toast.success('Product updated');
    } else {
      addAlcohol(data);
      toast.success('Product added');
    }
    onClose();
  };

  return (
    <div className={CARD}>
      <h3 className="text-sm font-semibold text-foreground mb-4">
        {editProduct ? `Edit — ${editProduct.name}` : 'Add Alcohol Product'}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className={LABEL}>Product Name *</label>
          <input className={INPUT} placeholder="e.g. Red Label" value={form.name} onChange={f('name')} />
        </div>
        <div>
          <label className={LABEL}>Brand</label>
          <input className={INPUT} placeholder="e.g. Johnnie Walker" value={form.brand} onChange={f('brand')} />
        </div>
        <div>
          <label className={LABEL}>Bottle Size (ml) *</label>
          <input className={INPUT} type="number" min="1" step="1" placeholder="750" value={form.bottleSizeMl} onChange={f('bottleSizeMl')} />
        </div>
        <div>
          <label className={LABEL}>Min Stock Alert (bottles) *</label>
          <input className={INPUT} type="number" min="0" step="0.5" placeholder="3" value={form.minStockBottles} onChange={f('minStockBottles')} />
          {!isNaN(parseFloat(form.minStockBottles)) && !isNaN(parseFloat(form.bottleSizeMl)) && (
            <p className="text-xs text-muted-foreground/60 mt-1">
              = {(parseFloat(form.minStockBottles) * parseFloat(form.bottleSizeMl)).toLocaleString()} ml
            </p>
          )}
        </div>
        <div>
          <label className={LABEL}>Cost per Bottle (optional)</label>
          <input className={INPUT} type="number" min="0" step="any" placeholder="e.g. 4500" value={form.costPerBottle} onChange={f('costPerBottle')} />
        </div>
        <div>
          <label className={LABEL}>Status</label>
          <select className={SELECT} value={form.status} onChange={f('status') as React.ChangeEventHandler<HTMLSelectElement>}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button className={BTN_PRIMARY} onClick={handleSave}><Save size={14} /> {editProduct ? 'Save Changes' : 'Add Product'}</button>
        <button className={BTN_GHOST} onClick={onClose}><X size={14} /> Cancel</button>
      </div>
    </div>
  );
};

// ── Purchase Form ─────────────────────────────────────────────────────────────
const EMPTY_BUY = { bottles: '', supplier: '', invoiceNo: '', costPerBottle: '' };

interface PurchaseFormProps { product: AlcoholProduct; onClose: () => void; }

const PurchaseForm = ({ product, onClose }: PurchaseFormProps) => {
  const purchaseAlcohol = useInventoryStore((s) => s.purchaseAlcohol);
  const [form, setForm] = useState(EMPTY_BUY);

  const f = (k: keyof typeof EMPTY_BUY) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const bottles = parseFloat(form.bottles);
  const addMl   = !isNaN(bottles) && bottles > 0 ? bottles * product.bottleSizeMl : null;

  const handleSave = () => {
    if (isNaN(bottles) || bottles <= 0) return toast.error('Enter a valid bottle quantity');
    const cpu = form.costPerBottle !== '' ? parseFloat(form.costPerBottle) : undefined;
    purchaseAlcohol({
      productId: product.id, bottles,
      supplier: form.supplier.trim() || undefined,
      invoiceNo: form.invoiceNo.trim() || undefined,
      costPerBottle: cpu && !isNaN(cpu) ? cpu : undefined,
    });
    toast.success(`Stock updated: +${addMl?.toLocaleString()} ml added to ${product.name}`);
    onClose();
  };

  return (
    <div className={`${CARD} border-blue-500/20 bg-blue-500/[0.03]`}>
      <h3 className="text-sm font-semibold text-foreground mb-1">Purchase Stock — {product.name}</h3>
      <p className="text-xs text-muted-foreground mb-4">Bottle size: {product.bottleSizeMl}ml</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={LABEL}>Bottles Purchased *</label>
          <input className={INPUT} type="number" min="0.5" step="0.5" placeholder="12" value={form.bottles} onChange={f('bottles')} autoFocus />
          {addMl !== null && (
            <p className="text-xs text-blue-400/80 mt-1">+{addMl.toLocaleString()} ml to stock</p>
          )}
        </div>
        <div>
          <label className={LABEL}>Supplier</label>
          <input className={INPUT} placeholder="Supplier name" value={form.supplier} onChange={f('supplier')} />
        </div>
        <div>
          <label className={LABEL}>Invoice #</label>
          <input className={INPUT} placeholder="INV-001" value={form.invoiceNo} onChange={f('invoiceNo')} />
        </div>
        <div>
          <label className={LABEL}>Cost per Bottle</label>
          <input className={INPUT} type="number" min="0" step="any" placeholder="4500" value={form.costPerBottle} onChange={f('costPerBottle')} />
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button className={BTN_PRIMARY} onClick={handleSave}><ShoppingCart size={14} /> Confirm Purchase</button>
        <button className={BTN_GHOST} onClick={onClose}><X size={14} /> Cancel</button>
      </div>
    </div>
  );
};

// ── Adjust Form ───────────────────────────────────────────────────────────────
const EMPTY_ADJ = { direction: 'add' as 'add' | 'remove', amountMl: '', type: 'Adjustment' as InvMovementType, reason: '' };

interface AdjustFormProps { product: AlcoholProduct; onClose: () => void; }

const AdjustForm = ({ product, onClose }: AdjustFormProps) => {
  const adjustAlcohol = useInventoryStore((s) => s.adjustAlcohol);
  const [form, setForm] = useState(EMPTY_ADJ);
  const ml = parseFloat(form.amountMl);
  const btl = !isNaN(ml) && product.bottleSizeMl > 0 ? ml / product.bottleSizeMl : null;

  const handleSave = () => {
    if (isNaN(ml) || ml <= 0) return toast.error('Enter a valid amount in ml');
    if (!form.reason.trim()) return toast.error('Reason is required');
    const changeMl = form.direction === 'add' ? ml : -ml;
    adjustAlcohol({ productId: product.id, changeMl, type: form.type, reason: form.reason.trim() });
    toast.success(`Stock adjusted: ${form.direction === 'add' ? '+' : '-'}${ml} ml`);
    onClose();
  };

  return (
    <div className={`${CARD} border-yellow-500/20 bg-yellow-500/[0.03]`}>
      <h3 className="text-sm font-semibold text-foreground mb-4">Adjust Stock — {product.name}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={LABEL}>Direction</label>
          <select className={SELECT} value={form.direction}
            onChange={(e) => setForm((p) => ({ ...p, direction: e.target.value as 'add' | 'remove' }))}>
            <option value="add">Increase Stock</option>
            <option value="remove">Decrease Stock</option>
          </select>
        </div>
        <div>
          <label className={LABEL}>Amount (ml)</label>
          <input className={INPUT} type="number" min="1" step="any" placeholder="750" value={form.amountMl}
            onChange={(e) => setForm((p) => ({ ...p, amountMl: e.target.value }))} />
          {btl !== null && (
            <p className="text-xs text-muted-foreground/60 mt-1">= {btl.toFixed(2)} bottles</p>
          )}
        </div>
        <div>
          <label className={LABEL}>Type</label>
          <select className={SELECT} value={form.type}
            onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as InvMovementType }))}>
            <option value="Adjustment">Adjustment</option>
            <option value="Waste">Waste / Spillage</option>
            <option value="Correction">Correction</option>
          </select>
        </div>
        <div>
          <label className={LABEL}>Reason *</label>
          <input className={INPUT} placeholder="e.g. Spoilage" value={form.reason}
            onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} />
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button className={BTN_PRIMARY} onClick={handleSave}><Save size={14} /> Apply Adjustment</button>
        <button className={BTN_GHOST} onClick={onClose}><X size={14} /> Cancel</button>
      </div>
    </div>
  );
};

// ── Main Section ──────────────────────────────────────────────────────────────
type Mode = 'none' | 'addProduct' | 'editProduct' | 'purchase' | 'adjust';

export const AlcoholSection = () => {
  const products      = useInventoryStore((s) => s.alcoholProducts);
  const deleteAlcohol = useInventoryStore((s) => s.deleteAlcohol);

  const [mode, setMode]     = useState<Mode>('none');
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeProduct = products.find((p) => p.id === activeId) ?? null;

  const sorted = useMemo(() =>
    [...products].sort((a, b) => {
      const aLow = a.currentStockMl <= a.minStockMl;
      const bLow = b.currentStockMl <= b.minStockMl;
      if (aLow && !bLow) return -1;
      if (!aLow && bLow) return 1;
      return a.name.localeCompare(b.name);
    }), [products]
  );

  const lowCount = products.filter((p) => p.status === 'active' && p.currentStockMl <= p.minStockMl).length;

  const close = () => { setMode('none'); setActiveId(null); };

  const handleEdit    = (p: AlcoholProduct) => { setActiveId(p.id); setMode('editProduct'); };
  const handleBuy     = (p: AlcoholProduct) => { setActiveId(p.id); setMode('purchase'); };
  const handleAdjust  = (p: AlcoholProduct) => { setActiveId(p.id); setMode('adjust'); };
  const handleDelete  = (p: AlcoholProduct) => {
    if (!confirm(`Delete ${p.name}? This also removes all its mappings.`)) return;
    deleteAlcohol(p.id);
    toast.success('Product deleted');
    if (activeId === p.id) close();
  };

  return (
    <div className="space-y-5">
      {lowCount > 0 && <LowStockBanner count={lowCount} noun="alcohol product" />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Alcohol Products</h3>
        {mode !== 'addProduct' && (
          <button className={BTN_PRIMARY} onClick={() => { close(); setMode('addProduct'); }}>
            <Plus size={14} /> Add Product
          </button>
        )}
      </div>

      {/* Add product form */}
      {mode === 'addProduct' && <ProductForm onClose={close} />}

      {/* Edit product form */}
      {mode === 'editProduct' && activeProduct && (
        <ProductForm editProduct={activeProduct} onClose={close} />
      )}

      {/* Purchase form */}
      {mode === 'purchase' && activeProduct && (
        <PurchaseForm product={activeProduct} onClose={close} />
      )}

      {/* Adjust form */}
      {mode === 'adjust' && activeProduct && (
        <AdjustForm product={activeProduct} onClose={close} />
      )}

      {/* Product table */}
      {products.length === 0 ? (
        <div className={`${CARD} text-center py-12 text-muted-foreground text-sm`}>
          No alcohol products yet. Click "Add Product" to get started.
        </div>
      ) : (
        <div className={CARD}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={TH}>Product</th>
                  <th className={TH}>Brand</th>
                  <th className={`${TH} hidden sm:table-cell`}>Btl Size</th>
                  <th className={TH}>Current Stock</th>
                  <th className={`${TH} hidden md:table-cell`}>Min Stock</th>
                  <th className={`${TH} hidden sm:table-cell`}>Status</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const isLow = p.currentStockMl <= p.minStockMl && p.status === 'active';
                  const stock = fmtMl(p.currentStockMl, p.bottleSizeMl);
                  const min   = fmtMl(p.minStockMl, p.bottleSizeMl);
                  return (
                    <tr key={p.id}
                      className={`border-b border-white/[0.04] last:border-0 ${isLow ? 'bg-red-500/[0.03]' : ''}`}>
                      <td className={TD}>
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${isLow ? 'text-red-300' : 'text-foreground'}`}>{p.name}</span>
                          {isLow && <LowBadge />}
                        </div>
                      </td>
                      <td className={`${TD} text-muted-foreground`}>{p.brand ?? '—'}</td>
                      <td className={`${TD} hidden sm:table-cell text-muted-foreground`}>{p.bottleSizeMl}ml</td>
                      <td className={TD}>
                        <p className={`font-semibold font-mono ${isLow ? 'text-red-400' : 'text-foreground'}`}>
                          {stock.primary}
                        </p>
                        <p className="text-xs text-muted-foreground/60">{stock.secondary}</p>
                      </td>
                      <td className={`${TD} hidden md:table-cell text-muted-foreground`}>
                        {min.primary}
                        <span className="block text-xs text-muted-foreground/50">{min.secondary}</span>
                      </td>
                      <td className={`${TD} hidden sm:table-cell`}><StatusBadge status={p.status} /></td>
                      <td className={TD}>
                        <div className="flex items-center gap-0.5 justify-end">
                          <button className={BTN_BUY}    title="Purchase stock"   onClick={() => handleBuy(p)}>    <ShoppingCart size={14} /></button>
                          <button className={BTN_ADJUST} title="Adjust stock"     onClick={() => handleAdjust(p)}>  <SlidersHorizontal size={14} /></button>
                          <button className={BTN_EDIT}   title="Edit product"     onClick={() => handleEdit(p)}>    <Edit3 size={14} /></button>
                          <button className={BTN_DANGER} title="Delete product"   onClick={() => handleDelete(p)}>  <Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Menu item mappings */}
      <MappingsSection
        productType="alcohol"
        products={products.map((p) => ({ id: p.id, name: p.name }))}
        unit="ml"
      />
    </div>
  );
};
