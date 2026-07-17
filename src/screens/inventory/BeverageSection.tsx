import { useState, useMemo } from 'react';
import { useInventoryStore } from '@/store/useInventoryStore';
import { BeverageProduct, InvMovementType } from '@/types/pos';
import {
  CARD, BTN_PRIMARY, BTN_GHOST, BTN_DANGER, BTN_EDIT, BTN_BUY, BTN_ADJUST,
  INPUT, SELECT, LABEL, TH, TD,
} from './styles';
import { LowStockBanner, LowBadge, StatusBadge, MappingsSection } from './components';
import { toast } from 'sonner';
import { Plus, Edit3, Trash2, ShoppingCart, SlidersHorizontal, Save, X } from 'lucide-react';

// ── Product Form ──────────────────────────────────────────────────────────────
const EMPTY_PF = {
  name: '', piecesPerPack: '', piecesPerCarton: '24', minStock: '12', costPerPiece: '',
  status: 'active' as 'active' | 'inactive',
};

const ProductForm = ({ editProduct, onClose }: { editProduct?: BeverageProduct; onClose: () => void }) => {
  const addBeverage    = useInventoryStore((s) => s.addBeverage);
  const updateBeverage = useInventoryStore((s) => s.updateBeverage);

  const [form, setForm] = useState(() => editProduct ? {
    name: editProduct.name, status: editProduct.status,
    piecesPerPack: editProduct.piecesPerPack !== undefined ? String(editProduct.piecesPerPack) : '',
    piecesPerCarton: String(editProduct.piecesPerCarton),
    minStock: String(editProduct.minStock),
    costPerPiece: editProduct.costPerPiece !== undefined ? String(editProduct.costPerPiece) : '',
  } : EMPTY_PF);

  const f = (k: keyof typeof EMPTY_PF) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.name.trim()) return toast.error('Name is required');
    const ppc  = parseFloat(form.piecesPerCarton);
    const min  = parseFloat(form.minStock);
    if (isNaN(ppc) || ppc <= 0) return toast.error('Pieces per carton must be > 0');
    if (isNaN(min) || min < 0)  return toast.error('Min stock must be 0 or more');
    const pack = form.piecesPerPack !== '' ? parseFloat(form.piecesPerPack) : undefined;
    if (pack !== undefined && (isNaN(pack) || pack <= 0)) return toast.error('Pieces per pack must be > 0');
    const cpu = form.costPerPiece !== '' ? parseFloat(form.costPerPiece) : undefined;
    if (cpu !== undefined && (isNaN(cpu) || cpu < 0)) return toast.error('Invalid cost per piece');

    const data: Omit<BeverageProduct, 'id'> = {
      name: form.name.trim(), status: form.status,
      piecesPerPack: pack ? Math.round(pack) : undefined,
      piecesPerCarton: Math.round(ppc),
      currentStock: editProduct?.currentStock ?? 0,
      minStock: Math.round(min),
      costPerPiece: cpu,
    };
    if (editProduct) { updateBeverage(editProduct.id, data); toast.success('Product updated'); }
    else             { addBeverage(data); toast.success('Product added'); }
    onClose();
  };

  return (
    <div className={CARD}>
      <h3 className="text-sm font-semibold text-foreground mb-4">
        {editProduct ? `Edit — ${editProduct.name}` : 'Add Beverage Product'}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className={LABEL}>Product Name *</label>
          <input className={INPUT} placeholder="e.g. Pepsi" value={form.name} onChange={f('name')} />
        </div>
        <div>
          <label className={LABEL}>Pieces per Pack (optional)</label>
          <input className={INPUT} type="number" min="1" step="1" placeholder="e.g. 6" value={form.piecesPerPack} onChange={f('piecesPerPack')} />
        </div>
        <div>
          <label className={LABEL}>Pieces per Carton *</label>
          <input className={INPUT} type="number" min="1" step="1" placeholder="24" value={form.piecesPerCarton} onChange={f('piecesPerCarton')} />
        </div>
        <div>
          <label className={LABEL}>Min Stock Alert (pieces) *</label>
          <input className={INPUT} type="number" min="0" step="1" placeholder="12" value={form.minStock} onChange={f('minStock')} />
        </div>
        <div>
          <label className={LABEL}>Cost per Piece (optional)</label>
          <input className={INPUT} type="number" min="0" step="any" placeholder="e.g. 50" value={form.costPerPiece} onChange={f('costPerPiece')} />
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
const EMPTY_BUY = { purchaseUnit: 'carton' as 'piece' | 'pack' | 'carton', qty: '', supplier: '', invoiceNo: '' };

const PurchaseForm = ({ product, onClose }: { product: BeverageProduct; onClose: () => void }) => {
  const purchaseBeverage = useInventoryStore((s) => s.purchaseBeverage);
  const [form, setForm] = useState(EMPTY_BUY);

  const qty = parseFloat(form.qty);
  const addPieces = useMemo(() => {
    if (isNaN(qty) || qty <= 0) return null;
    if (form.purchaseUnit === 'piece')  return qty;
    if (form.purchaseUnit === 'pack')   return product.piecesPerPack ? qty * product.piecesPerPack : null;
    return qty * product.piecesPerCarton;
  }, [qty, form.purchaseUnit, product]);

  const handleSave = () => {
    if (isNaN(qty) || qty <= 0) return toast.error('Enter a valid quantity');
    if (form.purchaseUnit === 'pack' && !product.piecesPerPack)
      return toast.error('This product has no pack size configured. Edit the product first.');
    purchaseBeverage({
      productId: product.id, purchaseUnit: form.purchaseUnit, qty,
      supplier: form.supplier.trim() || undefined,
      invoiceNo: form.invoiceNo.trim() || undefined,
    });
    toast.success(`+${addPieces?.toLocaleString()} pieces added to ${product.name}`);
    onClose();
  };

  return (
    <div className={`${CARD} border-blue-500/20 bg-blue-500/[0.03]`}>
      <h3 className="text-sm font-semibold text-foreground mb-1">Purchase Stock — {product.name}</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Pack: {product.piecesPerPack ?? 'N/A'} pcs · Carton: {product.piecesPerCarton} pcs
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={LABEL}>Purchase Unit</label>
          <select className={SELECT} value={form.purchaseUnit}
            onChange={(e) => setForm((p) => ({ ...p, purchaseUnit: e.target.value as typeof form.purchaseUnit }))}>
            <option value="piece">Piece</option>
            {product.piecesPerPack && <option value="pack">Pack ({product.piecesPerPack} pcs)</option>}
            <option value="carton">Carton ({product.piecesPerCarton} pcs)</option>
          </select>
        </div>
        <div>
          <label className={LABEL}>Quantity *</label>
          <input className={INPUT} type="number" min="1" step="1" placeholder="e.g. 5" value={form.qty}
            onChange={(e) => setForm((p) => ({ ...p, qty: e.target.value }))} autoFocus />
          {addPieces !== null && (
            <p className="text-xs text-blue-400/80 mt-1">+{addPieces.toLocaleString()} pieces to stock</p>
          )}
        </div>
        <div>
          <label className={LABEL}>Supplier</label>
          <input className={INPUT} placeholder="Supplier name" value={form.supplier}
            onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))} />
        </div>
        <div>
          <label className={LABEL}>Invoice #</label>
          <input className={INPUT} placeholder="INV-001" value={form.invoiceNo}
            onChange={(e) => setForm((p) => ({ ...p, invoiceNo: e.target.value }))} />
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
const AdjustForm = ({ product, onClose }: { product: BeverageProduct; onClose: () => void }) => {
  const adjustBeverage = useInventoryStore((s) => s.adjustBeverage);
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [pieces, setPieces]   = useState('');
  const [type, setType]       = useState<InvMovementType>('Adjustment');
  const [reason, setReason]   = useState('');

  const handleSave = () => {
    const p = parseFloat(pieces);
    if (isNaN(p) || p <= 0) return toast.error('Enter a valid piece count');
    if (!reason.trim()) return toast.error('Reason is required');
    adjustBeverage({ productId: product.id, changePieces: direction === 'add' ? p : -p, type, reason: reason.trim() });
    toast.success('Stock adjusted');
    onClose();
  };

  return (
    <div className={`${CARD} border-yellow-500/20 bg-yellow-500/[0.03]`}>
      <h3 className="text-sm font-semibold text-foreground mb-4">Adjust Stock — {product.name}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={LABEL}>Direction</label>
          <select className={SELECT} value={direction} onChange={(e) => setDirection(e.target.value as 'add' | 'remove')}>
            <option value="add">Increase Stock</option>
            <option value="remove">Decrease Stock</option>
          </select>
        </div>
        <div>
          <label className={LABEL}>Pieces</label>
          <input className={INPUT} type="number" min="1" step="1" placeholder="e.g. 12" value={pieces}
            onChange={(e) => setPieces(e.target.value)} autoFocus />
        </div>
        <div>
          <label className={LABEL}>Type</label>
          <select className={SELECT} value={type} onChange={(e) => setType(e.target.value as InvMovementType)}>
            <option value="Adjustment">Adjustment</option>
            <option value="Waste">Waste</option>
            <option value="Correction">Correction</option>
          </select>
        </div>
        <div>
          <label className={LABEL}>Reason *</label>
          <input className={INPUT} placeholder="Required" value={reason} onChange={(e) => setReason(e.target.value)} />
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

export const BeverageSection = () => {
  const products       = useInventoryStore((s) => s.beverageProducts);
  const deleteBeverage = useInventoryStore((s) => s.deleteBeverage);

  const [mode, setMode]     = useState<Mode>('none');
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeProduct = products.find((p) => p.id === activeId) ?? null;

  const sorted = useMemo(() =>
    [...products].sort((a, b) => {
      const aLow = a.currentStock <= a.minStock;
      const bLow = b.currentStock <= b.minStock;
      if (aLow && !bLow) return -1;
      if (!aLow && bLow) return 1;
      return a.name.localeCompare(b.name);
    }), [products]
  );

  const lowCount = products.filter((p) => p.status === 'active' && p.currentStock <= p.minStock).length;
  const close = () => { setMode('none'); setActiveId(null); };

  return (
    <div className="space-y-5">
      {lowCount > 0 && <LowStockBanner count={lowCount} noun="beverage product" />}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Soft Drinks & Packaged Beverages</h3>
        {mode !== 'addProduct' && (
          <button className={BTN_PRIMARY} onClick={() => { close(); setMode('addProduct'); }}>
            <Plus size={14} /> Add Product
          </button>
        )}
      </div>

      {mode === 'addProduct'  && <ProductForm onClose={close} />}
      {mode === 'editProduct' && activeProduct && <ProductForm editProduct={activeProduct} onClose={close} />}
      {mode === 'purchase'    && activeProduct && <PurchaseForm product={activeProduct} onClose={close} />}
      {mode === 'adjust'      && activeProduct && <AdjustForm product={activeProduct} onClose={close} />}

      {products.length === 0 ? (
        <div className={`${CARD} text-center py-12 text-muted-foreground text-sm`}>
          No beverage products yet. Click "Add Product" to get started.
        </div>
      ) : (
        <div className={CARD}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[540px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={TH}>Product</th>
                  <th className={`${TH} hidden sm:table-cell`}>Pack / Carton</th>
                  <th className={TH}>Current Stock</th>
                  <th className={`${TH} hidden md:table-cell`}>Min Stock</th>
                  <th className={`${TH} hidden sm:table-cell`}>Status</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const isLow = p.currentStock <= p.minStock && p.status === 'active';
                  return (
                    <tr key={p.id}
                      className={`border-b border-white/[0.04] last:border-0 ${isLow ? 'bg-red-500/[0.03]' : ''}`}>
                      <td className={TD}>
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${isLow ? 'text-red-300' : 'text-foreground'}`}>{p.name}</span>
                          {isLow && <LowBadge />}
                        </div>
                      </td>
                      <td className={`${TD} hidden sm:table-cell text-muted-foreground text-xs`}>
                        {p.piecesPerPack ? `${p.piecesPerPack} pcs/pack` : '—'} · {p.piecesPerCarton} pcs/carton
                      </td>
                      <td className={TD}>
                        <span className={`font-semibold font-mono ${isLow ? 'text-red-400' : 'text-foreground'}`}>
                          {p.currentStock.toLocaleString()} pcs
                        </span>
                      </td>
                      <td className={`${TD} hidden md:table-cell text-muted-foreground`}>{p.minStock} pcs</td>
                      <td className={`${TD} hidden sm:table-cell`}><StatusBadge status={p.status} /></td>
                      <td className={TD}>
                        <div className="flex items-center gap-0.5 justify-end">
                          <button className={BTN_BUY}    title="Purchase" onClick={() => { setActiveId(p.id); setMode('purchase'); }}><ShoppingCart size={14} /></button>
                          <button className={BTN_ADJUST} title="Adjust"   onClick={() => { setActiveId(p.id); setMode('adjust'); }}><SlidersHorizontal size={14} /></button>
                          <button className={BTN_EDIT}   title="Edit"     onClick={() => { setActiveId(p.id); setMode('editProduct'); }}><Edit3 size={14} /></button>
                          <button className={BTN_DANGER} title="Delete"   onClick={() => {
                            if (!confirm(`Delete ${p.name}?`)) return;
                            deleteBeverage(p.id); toast.success('Product deleted');
                            if (activeId === p.id) close();
                          }}><Trash2 size={14} /></button>
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

      <MappingsSection
        productType="beverage"
        products={products.map((p) => ({ id: p.id, name: p.name }))}
        unit="pcs"
      />
    </div>
  );
};
