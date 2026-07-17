import { useState, useMemo } from 'react';
import { useInventoryStore } from '@/store/useInventoryStore';
import { CigaretteProduct, InvMovementType } from '@/types/pos';
import {
  CARD, BTN_PRIMARY, BTN_GHOST, BTN_DANGER, BTN_EDIT, BTN_BUY, BTN_ADJUST,
  INPUT, SELECT, LABEL, TH, TD,
} from './styles';
import { LowStockBanner, LowBadge, StatusBadge, MappingsSection } from './components';
import { toast } from 'sonner';
import { Plus, Edit3, Trash2, ShoppingCart, SlidersHorizontal, Save, X } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtSticks(sticks: number, sticksPerPacket: number) {
  const pkts = Math.floor(sticks / sticksPerPacket);
  const rem  = sticks % sticksPerPacket;
  if (pkts === 0) return `${sticks} sticks`;
  if (rem  === 0) return `${pkts} pkts (${sticks} sticks)`;
  return `${pkts} pkts + ${rem} stk (${sticks} total)`;
}

// ── Product Form ──────────────────────────────────────────────────────────────
const EMPTY_PF = {
  name: '', sticksPerPacket: '20', packetsPerCarton: '10',
  minSticks: '40', costPerStick: '', status: 'active' as 'active' | 'inactive',
};

const ProductForm = ({ editProduct, onClose }: { editProduct?: CigaretteProduct; onClose: () => void }) => {
  const addCigarette    = useInventoryStore((s) => s.addCigarette);
  const updateCigarette = useInventoryStore((s) => s.updateCigarette);

  const [form, setForm] = useState(() => editProduct ? {
    name: editProduct.name, status: editProduct.status,
    sticksPerPacket:  String(editProduct.sticksPerPacket),
    packetsPerCarton: editProduct.packetsPerCarton !== undefined ? String(editProduct.packetsPerCarton) : '',
    minSticks:        String(editProduct.minSticks),
    costPerStick:     editProduct.costPerStick !== undefined ? String(editProduct.costPerStick) : '',
  } : EMPTY_PF);

  const f = (k: keyof typeof EMPTY_PF) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.name.trim()) return toast.error('Name is required');
    const spp = parseFloat(form.sticksPerPacket);
    const min = parseFloat(form.minSticks);
    if (isNaN(spp) || spp <= 0) return toast.error('Sticks per packet must be > 0');
    if (isNaN(min) || min < 0)  return toast.error('Min stock must be 0 or more');
    const ppc = form.packetsPerCarton !== '' ? parseFloat(form.packetsPerCarton) : undefined;
    if (ppc !== undefined && (isNaN(ppc) || ppc <= 0)) return toast.error('Packets per carton must be > 0');
    const cpu = form.costPerStick !== '' ? parseFloat(form.costPerStick) : undefined;
    if (cpu !== undefined && (isNaN(cpu) || cpu < 0)) return toast.error('Invalid cost per stick');

    const data: Omit<CigaretteProduct, 'id'> = {
      name: form.name.trim(), status: form.status,
      sticksPerPacket:  Math.round(spp),
      packetsPerCarton: ppc ? Math.round(ppc) : undefined,
      currentSticks: editProduct?.currentSticks ?? 0,
      minSticks: Math.round(min),
      costPerStick: cpu,
    };
    if (editProduct) { updateCigarette(editProduct.id, data); toast.success('Product updated'); }
    else             { addCigarette(data); toast.success('Product added'); }
    onClose();
  };

  return (
    <div className={CARD}>
      <h3 className="text-sm font-semibold text-foreground mb-4">
        {editProduct ? `Edit — ${editProduct.name}` : 'Add Cigarette Product'}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className={LABEL}>Brand / Product Name *</label>
          <input className={INPUT} placeholder="e.g. Surya" value={form.name} onChange={f('name')} />
        </div>
        <div>
          <label className={LABEL}>Sticks per Packet *</label>
          <input className={INPUT} type="number" min="1" step="1" placeholder="20" value={form.sticksPerPacket} onChange={f('sticksPerPacket')} />
        </div>
        <div>
          <label className={LABEL}>Packets per Carton (optional)</label>
          <input className={INPUT} type="number" min="1" step="1" placeholder="10" value={form.packetsPerCarton} onChange={f('packetsPerCarton')} />
        </div>
        <div>
          <label className={LABEL}>Min Stock Alert (sticks) *</label>
          <input className={INPUT} type="number" min="0" step="1" placeholder="40" value={form.minSticks} onChange={f('minSticks')} />
          {!isNaN(parseFloat(form.minSticks)) && !isNaN(parseFloat(form.sticksPerPacket)) && (
            <p className="text-xs text-muted-foreground/60 mt-1">
              = {(parseFloat(form.minSticks) / parseFloat(form.sticksPerPacket)).toFixed(1)} packets
            </p>
          )}
        </div>
        <div>
          <label className={LABEL}>Cost per Stick (optional)</label>
          <input className={INPUT} type="number" min="0" step="any" placeholder="e.g. 20" value={form.costPerStick} onChange={f('costPerStick')} />
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
const PurchaseForm = ({ product, onClose }: { product: CigaretteProduct; onClose: () => void }) => {
  const purchaseCigarette = useInventoryStore((s) => s.purchaseCigarette);
  const [purchaseUnit, setPurchaseUnit] = useState<'stick' | 'packet' | 'carton'>('packet');
  const [qty,      setQty]      = useState('');
  const [supplier, setSupplier] = useState('');
  const [invoiceNo,setInvoiceNo]= useState('');

  const addSticks = useMemo(() => {
    const q = parseFloat(qty);
    if (isNaN(q) || q <= 0) return null;
    if (purchaseUnit === 'stick')  return q;
    if (purchaseUnit === 'packet') return q * product.sticksPerPacket;
    const ppc = product.packetsPerCarton ?? 10;
    return q * ppc * product.sticksPerPacket;
  }, [qty, purchaseUnit, product]);

  const handleSave = () => {
    const q = parseFloat(qty);
    if (isNaN(q) || q <= 0) return toast.error('Enter a valid quantity');
    purchaseCigarette({ productId: product.id, purchaseUnit, qty: q, supplier: supplier || undefined, invoiceNo: invoiceNo || undefined });
    toast.success(`+${addSticks?.toLocaleString()} sticks added to ${product.name}`);
    onClose();
  };

  return (
    <div className={`${CARD} border-blue-500/20 bg-blue-500/[0.03]`}>
      <h3 className="text-sm font-semibold text-foreground mb-1">Purchase Stock — {product.name}</h3>
      <p className="text-xs text-muted-foreground mb-4">
        {product.sticksPerPacket} sticks/pkt · {product.packetsPerCarton ? `${product.packetsPerCarton} pkts/carton` : 'carton size N/A'}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={LABEL}>Purchase Unit</label>
          <select className={SELECT} value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value as typeof purchaseUnit)}>
            <option value="stick">Stick</option>
            <option value="packet">Packet ({product.sticksPerPacket} sticks)</option>
            {product.packetsPerCarton && <option value="carton">Carton ({product.packetsPerCarton} pkts)</option>}
          </select>
        </div>
        <div>
          <label className={LABEL}>Quantity *</label>
          <input className={INPUT} type="number" min="1" step="1" placeholder="10" value={qty}
            onChange={(e) => setQty(e.target.value)} autoFocus />
          {addSticks !== null && (
            <p className="text-xs text-blue-400/80 mt-1">+{addSticks.toLocaleString()} sticks to stock</p>
          )}
        </div>
        <div>
          <label className={LABEL}>Supplier</label>
          <input className={INPUT} placeholder="Supplier name" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </div>
        <div>
          <label className={LABEL}>Invoice #</label>
          <input className={INPUT} placeholder="INV-001" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
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
const AdjustForm = ({ product, onClose }: { product: CigaretteProduct; onClose: () => void }) => {
  const adjustCigarette = useInventoryStore((s) => s.adjustCigarette);
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [sticks,  setSticks]  = useState('');
  const [type,    setType]    = useState<InvMovementType>('Adjustment');
  const [reason,  setReason]  = useState('');

  const handleSave = () => {
    const s = parseFloat(sticks);
    if (isNaN(s) || s <= 0) return toast.error('Enter a valid stick count');
    if (!reason.trim()) return toast.error('Reason is required');
    adjustCigarette({ productId: product.id, changeSticks: direction === 'add' ? s : -s, type, reason: reason.trim() });
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
          <label className={LABEL}>Sticks</label>
          <input className={INPUT} type="number" min="1" step="1" placeholder="20" value={sticks}
            onChange={(e) => setSticks(e.target.value)} autoFocus />
          {!isNaN(parseFloat(sticks)) && (
            <p className="text-xs text-muted-foreground/60 mt-1">
              = {(parseFloat(sticks) / product.sticksPerPacket).toFixed(1)} packets
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

export const CigaretteSection = () => {
  const products         = useInventoryStore((s) => s.cigaretteProducts);
  const deleteCigarette  = useInventoryStore((s) => s.deleteCigarette);

  const [mode, setMode]     = useState<Mode>('none');
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeProduct = products.find((p) => p.id === activeId) ?? null;

  const sorted = useMemo(() =>
    [...products].sort((a, b) => {
      const aLow = a.currentSticks <= a.minSticks;
      const bLow = b.currentSticks <= b.minSticks;
      if (aLow && !bLow) return -1;
      if (!aLow && bLow) return 1;
      return a.name.localeCompare(b.name);
    }), [products]
  );

  const lowCount = products.filter((p) => p.status === 'active' && p.currentSticks <= p.minSticks).length;
  const close = () => { setMode('none'); setActiveId(null); };

  return (
    <div className="space-y-5">
      {lowCount > 0 && <LowStockBanner count={lowCount} noun="cigarette product" />}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Cigarettes</h3>
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
          No cigarette products yet. Click "Add Product" to get started.
        </div>
      ) : (
        <div className={CARD}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[540px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={TH}>Brand</th>
                  <th className={`${TH} hidden sm:table-cell`}>Sticks/Pkt</th>
                  <th className={TH}>Current Stock</th>
                  <th className={`${TH} hidden md:table-cell`}>Min Stock</th>
                  <th className={`${TH} hidden sm:table-cell`}>Status</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const isLow = p.currentSticks <= p.minSticks && p.status === 'active';
                  return (
                    <tr key={p.id}
                      className={`border-b border-white/[0.04] last:border-0 ${isLow ? 'bg-red-500/[0.03]' : ''}`}>
                      <td className={TD}>
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${isLow ? 'text-red-300' : 'text-foreground'}`}>{p.name}</span>
                          {isLow && <LowBadge />}
                        </div>
                      </td>
                      <td className={`${TD} hidden sm:table-cell text-muted-foreground`}>{p.sticksPerPacket}</td>
                      <td className={TD}>
                        <p className={`font-semibold font-mono ${isLow ? 'text-red-400' : 'text-foreground'}`}>
                          {fmtSticks(p.currentSticks, p.sticksPerPacket)}
                        </p>
                      </td>
                      <td className={`${TD} hidden md:table-cell text-muted-foreground`}>
                        {fmtSticks(p.minSticks, p.sticksPerPacket)}
                      </td>
                      <td className={`${TD} hidden sm:table-cell`}><StatusBadge status={p.status} /></td>
                      <td className={TD}>
                        <div className="flex items-center gap-0.5 justify-end">
                          <button className={BTN_BUY}    title="Purchase" onClick={() => { setActiveId(p.id); setMode('purchase'); }}><ShoppingCart size={14} /></button>
                          <button className={BTN_ADJUST} title="Adjust"   onClick={() => { setActiveId(p.id); setMode('adjust'); }}><SlidersHorizontal size={14} /></button>
                          <button className={BTN_EDIT}   title="Edit"     onClick={() => { setActiveId(p.id); setMode('editProduct'); }}><Edit3 size={14} /></button>
                          <button className={BTN_DANGER} title="Delete"   onClick={() => {
                            if (!confirm(`Delete ${p.name}?`)) return;
                            deleteCigarette(p.id); toast.success('Product deleted');
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
        productType="cigarette"
        products={products.map((p) => ({ id: p.id, name: p.name }))}
        unit="sticks"
      />
    </div>
  );
};
