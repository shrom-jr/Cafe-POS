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

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBevStock(pieces: number, piecesPerCarton: number) {
  const crates = Math.floor(pieces / piecesPerCarton);
  const rem    = pieces % piecesPerCarton;
  if (crates === 0) return `${rem} pcs`;
  if (rem === 0)    return `${crates} crates / ${pieces} pcs`;
  return `${crates} crates + ${rem} pcs (${pieces} total)`;
}

// ── Product Form ──────────────────────────────────────────────────────────────
const EMPTY_PF = {
  name: '', piecesPerCarton: '24', currentStock: '', minStock: '2',
  costPerCarton: '', status: 'active' as 'active' | 'inactive',
};

const ProductForm = ({ editProduct, onClose }: { editProduct?: BeverageProduct; onClose: () => void }) => {
  const addBeverage    = useInventoryStore((s) => s.addBeverage);
  const updateBeverage = useInventoryStore((s) => s.updateBeverage);

  const [form, setForm] = useState(() => {
    if (editProduct) {
      const ppc      = editProduct.piecesPerCarton;
      const crates   = ppc > 0 ? String(Math.floor(editProduct.currentStock / ppc)) : '0';
      const minCrates = ppc > 0 ? String(Math.round(editProduct.minStock / ppc)) : '0';
      return {
        name: editProduct.name,
        status: editProduct.status,
        piecesPerCarton: String(ppc),
        currentStock: crates,
        minStock: minCrates,
        costPerCarton: editProduct.costPerCarton !== undefined ? String(editProduct.costPerCarton) : '',
      };
    }
    return EMPTY_PF;
  });

  const f = (k: keyof typeof EMPTY_PF) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const ppc        = parseFloat(form.piecesPerCarton);
  const cratesVal  = parseFloat(form.currentStock);
  const totalPieces = (!isNaN(ppc) && ppc > 0 && !isNaN(cratesVal) && cratesVal >= 0)
    ? Math.round(cratesVal) * Math.round(ppc)
    : null;

  const handleSave = () => {
    if (!form.name.trim()) return toast.error('Name is required');
    if (isNaN(ppc) || ppc <= 0) return toast.error('Pieces per carton must be > 0');
    const cs = parseFloat(form.currentStock);
    if (isNaN(cs) || cs < 0) return toast.error('Current stock is required (0 or more)');
    const min = parseFloat(form.minStock);
    if (isNaN(min) || min < 0) return toast.error('Min stock must be 0 or more');
    const cpc = form.costPerCarton !== '' ? parseFloat(form.costPerCarton) : undefined;
    if (cpc !== undefined && (isNaN(cpc) || cpc < 0)) return toast.error('Invalid cost per carton');

    const ppcR = Math.round(ppc);
    const data: Omit<BeverageProduct, 'id'> = {
      name: form.name.trim(),
      status: form.status,
      piecesPerCarton: ppcR,
      currentStock: Math.round(cs) * ppcR,
      minStock: Math.round(min) * ppcR,
      costPerCarton: cpc,
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
          <label className={LABEL}>Pieces per Carton/Crate *</label>
          <input className={INPUT} type="number" min="1" step="1" placeholder="24" value={form.piecesPerCarton} onChange={f('piecesPerCarton')} />
        </div>
        <div>
          <label className={LABEL}>Current Stock (cartons/crates) *</label>
          <input className={INPUT} type="number" min="0" step="1" placeholder="e.g. 5" value={form.currentStock} onChange={f('currentStock')} />
          {totalPieces !== null && (
            <p className="text-xs text-emerald-400/80 mt-1">= {totalPieces.toLocaleString()} total pieces</p>
          )}
        </div>
        <div>
          <label className={LABEL}>Min Stock Alert (cartons/crates) *</label>
          <input className={INPUT} type="number" min="0" step="1" placeholder="2" value={form.minStock} onChange={f('minStock')} />
        </div>
        <div>
          <label className={LABEL}>Cost per Carton/Crate (optional)</label>
          <input className={INPUT} type="number" min="0" step="any" placeholder="e.g. 1200" value={form.costPerCarton} onChange={f('costPerCarton')} />
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
const EMPTY_BUY = { purchaseUnit: 'carton' as 'piece' | 'carton', qty: '', supplier: '', invoiceNo: '' };

const PurchaseForm = ({ product, onClose }: { product: BeverageProduct; onClose: () => void }) => {
  const purchaseBeverage = useInventoryStore((s) => s.purchaseBeverage);
  const [form, setForm] = useState(EMPTY_BUY);

  const qty = parseFloat(form.qty);
  const addPieces = useMemo(() => {
    if (isNaN(qty) || qty <= 0) return null;
    if (form.purchaseUnit === 'piece') return qty;
    return qty * product.piecesPerCarton;
  }, [qty, form.purchaseUnit, product]);

  const handleSave = () => {
    if (isNaN(qty) || qty <= 0) return toast.error('Enter a valid quantity');
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
        Carton: {product.piecesPerCarton} pcs
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={LABEL}>Purchase Unit</label>
          <select className={SELECT} value={form.purchaseUnit}
            onChange={(e) => setForm((p) => ({ ...p, purchaseUnit: e.target.value as typeof form.purchaseUnit }))}>
            <option value="piece">Piece</option>
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
          <input className={INPUT} type="number" min="1" step="1" placeholder="e.g. 24" value={pieces}
            onChange={(e) => setPieces(e.target.value)} autoFocus />
          {!isNaN(parseFloat(pieces)) && product.piecesPerCarton > 0 && (
            <p className="text-xs text-muted-foreground/60 mt-1">
              = {(parseFloat(pieces) / product.piecesPerCarton).toFixed(1)} crates
            </p>
          )}
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
                  <th className={TH}>Product Name</th>
                  <th className={`${TH} hidden sm:table-cell`}>Pcs / Carton</th>
                  <th className={TH}>Current Stock</th>
                  <th className={`${TH} hidden md:table-cell`}>Min Stock</th>
                  <th className={`${TH} hidden sm:table-cell`}>Status</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const isLow = p.currentStock <= p.minStock && p.status === 'active';
                  const minCrates = Math.round(p.minStock / p.piecesPerCarton);
                  return (
                    <tr key={p.id}
                      className={`border-b border-white/[0.04] last:border-0 ${isLow ? 'bg-red-500/[0.03]' : ''}`}>
                      <td className={TD}>
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${isLow ? 'text-red-300' : 'text-foreground'}`}>{p.name}</span>
                          {isLow && <LowBadge />}
                        </div>
                      </td>
                      <td className={`${TD} hidden sm:table-cell text-muted-foreground`}>{p.piecesPerCarton}</td>
                      <td className={TD}>
                        <span className={`font-semibold font-mono ${isLow ? 'text-red-400' : 'text-foreground'}`}>
                          {fmtBevStock(p.currentStock, p.piecesPerCarton)}
                        </span>
                      </td>
                      <td className={`${TD} hidden md:table-cell text-muted-foreground`}>
                        {minCrates} crates
                      </td>
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
