import { useState, useMemo } from 'react';
import { useInventoryStore } from '@/store/useInventoryStore';
import {
  AlcoholProduct, BeverageProduct, CigaretteProduct,
  InvProductType, InvMovementType,
} from '@/types/pos';
import {
  CARD, BTN_PRIMARY, BTN_GHOST, BTN_DANGER, BTN_EDIT, BTN_BUY, BTN_ADJUST,
  INPUT, SELECT, LABEL, TH, TD,
} from './styles';
import { LowBadge, StatusBadge } from './components';
import { toast } from 'sonner';
import {
  Plus, Save, X, ShoppingCart, SlidersHorizontal, Edit3, Trash2,
  TrendingDown, AlertTriangle, Coins,
  Wine, GlassWater, Cigarette,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type CatFilter = 'all' | InvProductType;

type FormState =
  | { kind: 'add'; cat: InvProductType }
  | { kind: 'edit-alcohol';   p: AlcoholProduct }
  | { kind: 'edit-beverage';  p: BeverageProduct }
  | { kind: 'edit-cigarette'; p: CigaretteProduct }
  | { kind: 'buy-alcohol';    p: AlcoholProduct }
  | { kind: 'buy-beverage';   p: BeverageProduct }
  | { kind: 'buy-cigarette';  p: CigaretteProduct }
  | { kind: 'adj-alcohol';    p: AlcoholProduct }
  | { kind: 'adj-beverage';   p: BeverageProduct }
  | { kind: 'adj-cigarette';  p: CigaretteProduct };

interface UnifiedRow {
  id: string;
  name: string;
  category: InvProductType;
  stockPrimary: string;
  stockSecondary: string;
  minDisplay: string;
  isLow: boolean;
  status: 'active' | 'inactive';
  raw: AlcoholProduct | BeverageProduct | CigaretteProduct;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtAlcohol(p: AlcoholProduct): Pick<UnifiedRow, 'stockPrimary' | 'stockSecondary' | 'minDisplay' | 'isLow'> {
  const fullBtl = Math.floor(p.currentStockMl / p.bottleSizeMl);
  const remMl   = p.currentStockMl % p.bottleSizeMl;
  const minBtl  = Math.floor(p.minStockMl / p.bottleSizeMl);
  const minRemMl = p.minStockMl % p.bottleSizeMl;

  const stockStr = fullBtl === 0
    ? `${remMl} ml`
    : remMl === 0
      ? `${fullBtl} btl`
      : `${fullBtl} btl + ${remMl} ml`;

  // Always display in btl — never raw ml
  const minStr = `${minBtl} btl`;

  return {
    stockPrimary:   stockStr,
    stockSecondary: `${p.currentStockMl.toLocaleString()} ml total`,
    minDisplay:     minStr,
    isLow: p.status === 'active' && p.currentStockMl <= p.minStockMl,
  };
}

function fmtBeverage(p: BeverageProduct): Pick<UnifiedRow, 'stockPrimary' | 'stockSecondary' | 'minDisplay' | 'isLow'> {
  const crates   = Math.floor(p.currentStock / p.piecesPerCarton);
  const remPcs   = p.currentStock % p.piecesPerCarton;
  const minCrates = Math.floor(p.minStock / p.piecesPerCarton);
  const minRemPcs = p.minStock % p.piecesPerCarton;

  const stockStr = crates === 0
    ? `${remPcs} pcs`
    : remPcs === 0
      ? `${crates} crates`
      : `${crates} crates + ${remPcs} pcs`;

  // Always display in crates — never raw pcs
  const minStr = `${minCrates} crates`;

  return {
    stockPrimary:   stockStr,
    stockSecondary: `${p.currentStock} pcs total`,
    minDisplay:     minStr,
    isLow: p.status === 'active' && p.currentStock <= p.minStock,
  };
}

function fmtCigarette(p: CigaretteProduct): Pick<UnifiedRow, 'stockPrimary' | 'stockSecondary' | 'minDisplay' | 'isLow'> {
  const pkts    = Math.floor(p.currentSticks / p.sticksPerPacket);
  const remStks = p.currentSticks % p.sticksPerPacket;
  const minPkts    = Math.floor(p.minSticks / p.sticksPerPacket);
  const minRemStks = p.minSticks % p.sticksPerPacket;

  const stockStr = pkts === 0
    ? `${remStks} sticks`
    : remStks === 0
      ? `${pkts} packets`
      : `${pkts} packets + ${remStks} sticks`;

  // Always display in packets — never raw sticks
  const minStr = `${minPkts} packets`;

  return {
    stockPrimary:   stockStr,
    stockSecondary: `${p.currentSticks} sticks total`,
    minDisplay:     minStr,
    isLow: p.status === 'active' && p.currentSticks <= p.minSticks,
  };
}

// ── Alcohol Forms ─────────────────────────────────────────────────────────────

const AlcoholAddEditForm = ({ edit, onClose }: { edit?: AlcoholProduct; onClose: () => void }) => {
  const addAlcohol    = useInventoryStore((s) => s.addAlcohol);
  const updateAlcohol = useInventoryStore((s) => s.updateAlcohol);

  const init = edit ? {
    name: edit.name, bottleSizeMl: String(edit.bottleSizeMl), status: edit.status,
    currentStockBottles: String(edit.currentStockMl / edit.bottleSizeMl),
    minStockBottles: String(edit.minStockMl / edit.bottleSizeMl),
    costPerBottle: edit.costPerBottle !== undefined ? String(edit.costPerBottle) : '',
  } : { name: '', bottleSizeMl: '750', currentStockBottles: '0', minStockBottles: '', costPerBottle: '', status: 'active' as const };

  const [f, setF] = useState(init);
  const upd = (k: keyof typeof init) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const handleSave = () => {
    const bsz = parseFloat(f.bottleSizeMl), csb = parseFloat(f.currentStockBottles);
    const msb = f.minStockBottles === '' ? 0 : parseFloat(f.minStockBottles);
    if (!f.name.trim())         return toast.error('Name required');
    if (isNaN(bsz) || bsz <= 0) return toast.error('Bottle size must be > 0');
    if (isNaN(csb) || csb < 0)  return toast.error('Current stock must be ≥ 0');
    if (!isNaN(msb) && msb < 0)  return toast.error('Min stock must be ≥ 0');
    const cpu = f.costPerBottle !== '' ? parseFloat(f.costPerBottle) : undefined;
    if (cpu !== undefined && isNaN(cpu)) return toast.error('Invalid cost');
    const data = { name: f.name.trim(), bottleSizeMl: Math.round(bsz), currentStockMl: Math.round(csb * bsz), minStockMl: Math.round(msb * bsz), costPerBottle: cpu, status: f.status as 'active' | 'inactive' };
    if (edit) { updateAlcohol(edit.id, data); toast.success('Updated'); }
    else      { addAlcohol(data); toast.success('Product added'); }
    onClose();
  };

  return (
    <div className={`${CARD} border-blue-500/15`}>
      <h3 className="text-sm font-semibold text-foreground mb-4">{edit ? `Edit — ${edit.name}` : 'Add Alcohol Product'}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="col-span-2 sm:col-span-2"><label className={LABEL}>Product Name *</label><input className={INPUT} placeholder="e.g. Ruslan Vodka" value={f.name} onChange={upd('name')} autoFocus /></div>
        <div><label className={LABEL}>Bottle Size (ml) *</label><input className={INPUT} type="number" min="1" value={f.bottleSizeMl} onChange={upd('bottleSizeMl')} /></div>
        <div><label className={LABEL}>Current Stock (btl) *</label><input className={INPUT} type="number" min="0" step="0.5" value={f.currentStockBottles} onChange={upd('currentStockBottles')} /></div>
        <div><label className={LABEL}>Min Stock (btl)</label><input className={INPUT} type="number" min="0" step="0.5" placeholder="optional" value={f.minStockBottles} onChange={upd('minStockBottles')} /></div>
        <div><label className={LABEL}>Cost/Bottle</label><input className={INPUT} type="number" min="0" step="any" placeholder="optional" value={f.costPerBottle} onChange={upd('costPerBottle')} /></div>
      </div>
      <div className="flex gap-2 mt-4">
        <button className={BTN_PRIMARY} onClick={handleSave}><Save size={14} />{edit ? 'Save Changes' : 'Add Product'}</button>
        <button className={BTN_GHOST} onClick={onClose}><X size={14} />Cancel</button>
      </div>
    </div>
  );
};

const AlcoholBuyForm = ({ p, onClose }: { p: AlcoholProduct; onClose: () => void }) => {
  const purchaseAlcohol = useInventoryStore((s) => s.purchaseAlcohol);
  const [bottles, setBottles] = useState(''); const [supplier, setSupplier] = useState(''); const [invoice, setInvoice] = useState(''); const [cost, setCost] = useState('');
  const handleSave = () => {
    const b = parseFloat(bottles);
    if (isNaN(b) || b <= 0) return toast.error('Enter bottle count');
    const cpu = cost !== '' ? parseFloat(cost) : undefined;
    purchaseAlcohol({ productId: p.id, bottles: b, supplier: supplier || undefined, invoiceNo: invoice || undefined, costPerBottle: cpu && !isNaN(cpu) ? cpu : undefined });
    toast.success(`+${(b * p.bottleSizeMl).toLocaleString()} ml added`); onClose();
  };
  return (
    <div className={`${CARD} border-green-500/15`}>
      <h3 className="text-sm font-semibold text-foreground mb-4">Purchase Stock — {p.name} <span className="text-muted-foreground font-normal text-xs">({p.bottleSizeMl} ml/btl)</span></h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div><label className={LABEL}>Bottles *</label><input className={INPUT} type="number" min="0.5" step="0.5" placeholder="12" value={bottles} onChange={(e) => setBottles(e.target.value)} autoFocus /></div>
        <div><label className={LABEL}>Cost/Bottle</label><input className={INPUT} type="number" min="0" step="any" placeholder="optional" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
        <div><label className={LABEL}>Supplier</label><input className={INPUT} placeholder="optional" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
        <div><label className={LABEL}>Invoice #</label><input className={INPUT} placeholder="optional" value={invoice} onChange={(e) => setInvoice(e.target.value)} /></div>
      </div>
      <div className="flex gap-2 mt-4"><button className={BTN_PRIMARY} onClick={handleSave}><ShoppingCart size={14} />Confirm Purchase</button><button className={BTN_GHOST} onClick={onClose}><X size={14} />Cancel</button></div>
    </div>
  );
};

const AlcoholAdjForm = ({ p, onClose }: { p: AlcoholProduct; onClose: () => void }) => {
  const adjustAlcohol = useInventoryStore((s) => s.adjustAlcohol);
  const [dir, setDir] = useState<'add' | 'remove'>('add'); const [ml, setMl] = useState(''); const [type, setType] = useState<InvMovementType>('Adjustment'); const [reason, setReason] = useState('');
  const handleSave = () => {
    const v = parseFloat(ml);
    if (isNaN(v) || v <= 0) return toast.error('Enter amount in ml');
    if (!reason.trim()) return toast.error('Reason required');
    adjustAlcohol({ productId: p.id, changeMl: dir === 'add' ? v : -v, type, reason: reason.trim() });
    toast.success('Stock adjusted'); onClose();
  };
  return (
    <div className={`${CARD} border-yellow-500/15`}>
      <h3 className="text-sm font-semibold text-foreground mb-4">Adjust Stock — {p.name}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div><label className={LABEL}>Direction</label><select className={SELECT} value={dir} onChange={(e) => setDir(e.target.value as 'add' | 'remove')}><option value="add">Increase</option><option value="remove">Decrease</option></select></div>
        <div><label className={LABEL}>Amount (ml) *</label><input className={INPUT} type="number" min="1" step="any" placeholder="750" value={ml} onChange={(e) => setMl(e.target.value)} autoFocus /></div>
        <div><label className={LABEL}>Type</label><select className={SELECT} value={type} onChange={(e) => setType(e.target.value as InvMovementType)}><option value="Adjustment">Adjustment</option><option value="Waste">Waste</option><option value="Correction">Correction</option></select></div>
        <div><label className={LABEL}>Reason *</label><input className={INPUT} placeholder="Required" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      </div>
      <div className="flex gap-2 mt-4"><button className={BTN_PRIMARY} onClick={handleSave}><Save size={14} />Apply</button><button className={BTN_GHOST} onClick={onClose}><X size={14} />Cancel</button></div>
    </div>
  );
};

// ── Beverage Forms ────────────────────────────────────────────────────────────

const BeverageAddEditForm = ({ edit, onClose }: { edit?: BeverageProduct; onClose: () => void }) => {
  const addBeverage    = useInventoryStore((s) => s.addBeverage);
  const updateBeverage = useInventoryStore((s) => s.updateBeverage);
  const init = edit ? {
    name: edit.name, piecesPerCarton: String(edit.piecesPerCarton), status: edit.status,
    currentStock: String(Math.floor(edit.currentStock / edit.piecesPerCarton)),
    minStock: String(Math.round(edit.minStock / edit.piecesPerCarton)),
    costPerCarton: edit.costPerCarton !== undefined ? String(edit.costPerCarton) : '',
  } : { name: '', piecesPerCarton: '24', currentStock: '', minStock: '', costPerCarton: '', status: 'active' as const };
  const [f, setF] = useState(init);
  const upd = (k: keyof typeof init) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const handleSave = () => {
    const ppc = parseFloat(f.piecesPerCarton), cs = parseFloat(f.currentStock);
    const ms = f.minStock === '' ? 0 : parseFloat(f.minStock);
    if (!f.name.trim())         return toast.error('Name required');
    if (isNaN(ppc) || ppc <= 0) return toast.error('Pieces per carton must be > 0');
    if (isNaN(cs) || cs < 0)   return toast.error('Current stock must be ≥ 0');
    if (!isNaN(ms) && ms < 0)   return toast.error('Min stock must be ≥ 0');
    const cpc = f.costPerCarton !== '' ? parseFloat(f.costPerCarton) : undefined;
    const ppcR = Math.round(ppc);
    const data = { name: f.name.trim(), piecesPerCarton: ppcR, currentStock: Math.round(cs) * ppcR, minStock: Math.round(ms) * ppcR, costPerCarton: cpc && !isNaN(cpc) ? cpc : undefined, status: f.status as 'active' | 'inactive' };
    if (edit) { updateBeverage(edit.id, data); toast.success('Updated'); }
    else      { addBeverage(data); toast.success('Product added'); }
    onClose();
  };
  return (
    <div className={`${CARD} border-sky-500/15`}>
      <h3 className="text-sm font-semibold text-foreground mb-4">{edit ? `Edit — ${edit.name}` : 'Add Beverage Product'}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="col-span-2"><label className={LABEL}>Product Name *</label><input className={INPUT} placeholder="e.g. Pepsi" value={f.name} onChange={upd('name')} autoFocus /></div>
        <div><label className={LABEL}>Pcs/Carton *</label><input className={INPUT} type="number" min="1" value={f.piecesPerCarton} onChange={upd('piecesPerCarton')} /></div>
        <div><label className={LABEL}>Current (cartons) *</label><input className={INPUT} type="number" min="0" step="1" value={f.currentStock} onChange={upd('currentStock')} /></div>
        <div><label className={LABEL}>Min (cartons)</label><input className={INPUT} type="number" min="0" step="1" placeholder="optional" value={f.minStock} onChange={upd('minStock')} /></div>
        <div><label className={LABEL}>Cost/Carton</label><input className={INPUT} type="number" min="0" step="any" placeholder="optional" value={f.costPerCarton} onChange={upd('costPerCarton')} /></div>
      </div>
      <div className="flex gap-2 mt-4"><button className={BTN_PRIMARY} onClick={handleSave}><Save size={14} />{edit ? 'Save Changes' : 'Add Product'}</button><button className={BTN_GHOST} onClick={onClose}><X size={14} />Cancel</button></div>
    </div>
  );
};

const BeverageBuyForm = ({ p, onClose }: { p: BeverageProduct; onClose: () => void }) => {
  const purchaseBeverage = useInventoryStore((s) => s.purchaseBeverage);
  const [unit, setUnit] = useState<'piece' | 'carton'>('carton'); const [qty, setQty] = useState(''); const [supplier, setSupplier] = useState(''); const [invoice, setInvoice] = useState('');
  const addPcs = !isNaN(parseFloat(qty)) && parseFloat(qty) > 0 ? (unit === 'piece' ? parseFloat(qty) : parseFloat(qty) * p.piecesPerCarton) : null;
  const handleSave = () => {
    const q = parseFloat(qty);
    if (isNaN(q) || q <= 0) return toast.error('Enter quantity');
    purchaseBeverage({ productId: p.id, purchaseUnit: unit, qty: q, supplier: supplier || undefined, invoiceNo: invoice || undefined });
    toast.success(`+${addPcs?.toLocaleString()} pieces added`); onClose();
  };
  return (
    <div className={`${CARD} border-green-500/15`}>
      <h3 className="text-sm font-semibold text-foreground mb-4">Purchase Stock — {p.name} <span className="text-muted-foreground font-normal text-xs">({p.piecesPerCarton} pcs/carton)</span></h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div><label className={LABEL}>Unit</label><select className={SELECT} value={unit} onChange={(e) => setUnit(e.target.value as 'piece' | 'carton')}><option value="carton">Carton ({p.piecesPerCarton} pcs)</option><option value="piece">Piece</option></select></div>
        <div><label className={LABEL}>Quantity *</label><input className={INPUT} type="number" min="1" step="1" placeholder="5" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />{addPcs !== null && <p className="text-xs text-green-400/80 mt-0.5">+{addPcs.toLocaleString()} pcs</p>}</div>
        <div><label className={LABEL}>Supplier</label><input className={INPUT} placeholder="optional" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
        <div><label className={LABEL}>Invoice #</label><input className={INPUT} placeholder="optional" value={invoice} onChange={(e) => setInvoice(e.target.value)} /></div>
      </div>
      <div className="flex gap-2 mt-4"><button className={BTN_PRIMARY} onClick={handleSave}><ShoppingCart size={14} />Confirm Purchase</button><button className={BTN_GHOST} onClick={onClose}><X size={14} />Cancel</button></div>
    </div>
  );
};

const BeverageAdjForm = ({ p, onClose }: { p: BeverageProduct; onClose: () => void }) => {
  const adjustBeverage = useInventoryStore((s) => s.adjustBeverage);
  const [dir, setDir] = useState<'add' | 'remove'>('add'); const [pieces, setPieces] = useState(''); const [type, setType] = useState<InvMovementType>('Adjustment'); const [reason, setReason] = useState('');
  const handleSave = () => {
    const v = parseFloat(pieces);
    if (isNaN(v) || v <= 0) return toast.error('Enter piece count');
    if (!reason.trim()) return toast.error('Reason required');
    adjustBeverage({ productId: p.id, changePieces: dir === 'add' ? v : -v, type, reason: reason.trim() });
    toast.success('Stock adjusted'); onClose();
  };
  return (
    <div className={`${CARD} border-yellow-500/15`}>
      <h3 className="text-sm font-semibold text-foreground mb-4">Adjust Stock — {p.name}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div><label className={LABEL}>Direction</label><select className={SELECT} value={dir} onChange={(e) => setDir(e.target.value as 'add' | 'remove')}><option value="add">Increase</option><option value="remove">Decrease</option></select></div>
        <div><label className={LABEL}>Pieces *</label><input className={INPUT} type="number" min="1" step="1" placeholder="24" value={pieces} onChange={(e) => setPieces(e.target.value)} autoFocus /></div>
        <div><label className={LABEL}>Type</label><select className={SELECT} value={type} onChange={(e) => setType(e.target.value as InvMovementType)}><option value="Adjustment">Adjustment</option><option value="Waste">Waste</option><option value="Correction">Correction</option></select></div>
        <div><label className={LABEL}>Reason *</label><input className={INPUT} placeholder="Required" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      </div>
      <div className="flex gap-2 mt-4"><button className={BTN_PRIMARY} onClick={handleSave}><Save size={14} />Apply</button><button className={BTN_GHOST} onClick={onClose}><X size={14} />Cancel</button></div>
    </div>
  );
};

// ── Cigarette Forms ───────────────────────────────────────────────────────────

const CigaretteAddEditForm = ({ edit, onClose }: { edit?: CigaretteProduct; onClose: () => void }) => {
  const addCigarette    = useInventoryStore((s) => s.addCigarette);
  const updateCigarette = useInventoryStore((s) => s.updateCigarette);
  const init = edit ? {
    name: edit.name, sticksPerPacket: String(edit.sticksPerPacket), status: edit.status,
    currentPackets: String(Math.floor(edit.currentSticks / edit.sticksPerPacket)),
    minPackets: String(Math.round(edit.minSticks / edit.sticksPerPacket)),
    costPerPacket: edit.costPerPacket !== undefined ? String(edit.costPerPacket) : '',
  } : { name: '', sticksPerPacket: '20', currentPackets: '', minPackets: '', costPerPacket: '', status: 'active' as const };
  const [f, setF] = useState(init);
  const upd = (k: keyof typeof init) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const handleSave = () => {
    const spp = parseFloat(f.sticksPerPacket), cp = parseFloat(f.currentPackets);
    const mp = f.minPackets === '' ? 0 : parseFloat(f.minPackets);
    if (!f.name.trim())         return toast.error('Name required');
    if (isNaN(spp) || spp <= 0) return toast.error('Sticks per packet must be > 0');
    if (isNaN(cp) || cp < 0)   return toast.error('Current stock must be ≥ 0');
    if (!isNaN(mp) && mp < 0)   return toast.error('Min stock must be ≥ 0');
    const cpp = f.costPerPacket !== '' ? parseFloat(f.costPerPacket) : undefined;
    const sppR = Math.round(spp);
    const data = { name: f.name.trim(), sticksPerPacket: sppR, currentSticks: Math.round(cp) * sppR, minSticks: Math.round(mp) * sppR, costPerPacket: cpp && !isNaN(cpp) ? cpp : undefined, status: f.status as 'active' | 'inactive' };
    if (edit) { updateCigarette(edit.id, data); toast.success('Updated'); }
    else      { addCigarette(data); toast.success('Product added'); }
    onClose();
  };
  return (
    <div className={`${CARD} border-orange-500/15`}>
      <h3 className="text-sm font-semibold text-foreground mb-4">{edit ? `Edit — ${edit.name}` : 'Add Cigarette Product'}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="col-span-2"><label className={LABEL}>Product Name *</label><input className={INPUT} placeholder="e.g. Surya Classic" value={f.name} onChange={upd('name')} autoFocus /></div>
        <div><label className={LABEL}>Sticks/Packet *</label><input className={INPUT} type="number" min="1" value={f.sticksPerPacket} onChange={upd('sticksPerPacket')} /></div>
        <div><label className={LABEL}>Current (packets) *</label><input className={INPUT} type="number" min="0" step="1" value={f.currentPackets} onChange={upd('currentPackets')} /></div>
        <div><label className={LABEL}>Min (packets)</label><input className={INPUT} type="number" min="0" step="1" placeholder="optional" value={f.minPackets} onChange={upd('minPackets')} /></div>
        <div><label className={LABEL}>Cost/Packet</label><input className={INPUT} type="number" min="0" step="any" placeholder="optional" value={f.costPerPacket} onChange={upd('costPerPacket')} /></div>
      </div>
      <div className="flex gap-2 mt-4"><button className={BTN_PRIMARY} onClick={handleSave}><Save size={14} />{edit ? 'Save Changes' : 'Add Product'}</button><button className={BTN_GHOST} onClick={onClose}><X size={14} />Cancel</button></div>
    </div>
  );
};

const CigaretteBuyForm = ({ p, onClose }: { p: CigaretteProduct; onClose: () => void }) => {
  const purchaseCigarette = useInventoryStore((s) => s.purchaseCigarette);
  const [unit, setUnit] = useState<'stick' | 'packet'>('packet'); const [qty, setQty] = useState(''); const [supplier, setSupplier] = useState(''); const [invoice, setInvoice] = useState('');
  const addSticks = !isNaN(parseFloat(qty)) && parseFloat(qty) > 0 ? (unit === 'stick' ? parseFloat(qty) : parseFloat(qty) * p.sticksPerPacket) : null;
  const handleSave = () => {
    const q = parseFloat(qty);
    if (isNaN(q) || q <= 0) return toast.error('Enter quantity');
    purchaseCigarette({ productId: p.id, purchaseUnit: unit, qty: q, supplier: supplier || undefined, invoiceNo: invoice || undefined });
    toast.success(`+${addSticks?.toLocaleString()} sticks added`); onClose();
  };
  return (
    <div className={`${CARD} border-green-500/15`}>
      <h3 className="text-sm font-semibold text-foreground mb-4">Purchase Stock — {p.name} <span className="text-muted-foreground font-normal text-xs">({p.sticksPerPacket} sticks/packet)</span></h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div><label className={LABEL}>Unit</label><select className={SELECT} value={unit} onChange={(e) => setUnit(e.target.value as 'stick' | 'packet')}><option value="packet">Packet ({p.sticksPerPacket} sticks)</option><option value="stick">Stick</option></select></div>
        <div><label className={LABEL}>Quantity *</label><input className={INPUT} type="number" min="1" step="1" placeholder="10" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />{addSticks !== null && <p className="text-xs text-green-400/80 mt-0.5">+{addSticks.toLocaleString()} sticks</p>}</div>
        <div><label className={LABEL}>Supplier</label><input className={INPUT} placeholder="optional" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
        <div><label className={LABEL}>Invoice #</label><input className={INPUT} placeholder="optional" value={invoice} onChange={(e) => setInvoice(e.target.value)} /></div>
      </div>
      <div className="flex gap-2 mt-4"><button className={BTN_PRIMARY} onClick={handleSave}><ShoppingCart size={14} />Confirm Purchase</button><button className={BTN_GHOST} onClick={onClose}><X size={14} />Cancel</button></div>
    </div>
  );
};

const CigaretteAdjForm = ({ p, onClose }: { p: CigaretteProduct; onClose: () => void }) => {
  const adjustCigarette = useInventoryStore((s) => s.adjustCigarette);
  const [dir, setDir] = useState<'add' | 'remove'>('add'); const [sticks, setSticks] = useState(''); const [type, setType] = useState<InvMovementType>('Adjustment'); const [reason, setReason] = useState('');
  const handleSave = () => {
    const v = parseFloat(sticks);
    if (isNaN(v) || v <= 0) return toast.error('Enter stick count');
    if (!reason.trim()) return toast.error('Reason required');
    adjustCigarette({ productId: p.id, changeSticks: dir === 'add' ? v : -v, type, reason: reason.trim() });
    toast.success('Stock adjusted'); onClose();
  };
  return (
    <div className={`${CARD} border-yellow-500/15`}>
      <h3 className="text-sm font-semibold text-foreground mb-4">Adjust Stock — {p.name}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div><label className={LABEL}>Direction</label><select className={SELECT} value={dir} onChange={(e) => setDir(e.target.value as 'add' | 'remove')}><option value="add">Increase</option><option value="remove">Decrease</option></select></div>
        <div><label className={LABEL}>Sticks *</label><input className={INPUT} type="number" min="1" step="1" placeholder="20" value={sticks} onChange={(e) => setSticks(e.target.value)} autoFocus /></div>
        <div><label className={LABEL}>Type</label><select className={SELECT} value={type} onChange={(e) => setType(e.target.value as InvMovementType)}><option value="Adjustment">Adjustment</option><option value="Waste">Waste</option><option value="Correction">Correction</option></select></div>
        <div><label className={LABEL}>Reason *</label><input className={INPUT} placeholder="Required" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      </div>
      <div className="flex gap-2 mt-4"><button className={BTN_PRIMARY} onClick={handleSave}><Save size={14} />Apply</button><button className={BTN_GHOST} onClick={onClose}><X size={14} />Cancel</button></div>
    </div>
  );
};

// ── Category badge ────────────────────────────────────────────────────────────

const CAT_BADGE: Record<InvProductType, string> = {
  alcohol:   'bg-amber-500/15 border-amber-500/20 text-amber-400',
  beverage:  'bg-sky-500/15 border-sky-500/20 text-sky-400',
  cigarette: 'bg-orange-500/15 border-orange-500/20 text-orange-400',
};
const CAT_LABEL: Record<InvProductType, string> = {
  alcohol: 'Alcohol', beverage: 'Beverage', cigarette: 'Cigarette',
};
// ── Main Component ────────────────────────────────────────────────────────────

export const PackagedStockTab = () => {
  const alcoholProducts   = useInventoryStore((s) => s.alcoholProducts);
  const beverageProducts  = useInventoryStore((s) => s.beverageProducts);
  const cigaretteProducts = useInventoryStore((s) => s.cigaretteProducts);
  const invMovements      = useInventoryStore((s) => s.invMovements);
  const deleteAlcohol     = useInventoryStore((s) => s.deleteAlcohol);
  const deleteBeverage    = useInventoryStore((s) => s.deleteBeverage);
  const deleteCigarette   = useInventoryStore((s) => s.deleteCigarette);

  const [catFilter, setCatFilter] = useState<CatFilter>('all');
  const [form,      setForm]      = useState<FormState | null>(null);

  const closeForm = () => setForm(null);

  // ── Summary metrics ──────────────────────────────────────────────────────

  const totalValue = useMemo(() => {
    // Use fractional units (not Math.floor) so partial cartons/packets still contribute
    const alc = alcoholProducts.reduce((s, p) => s + (p.currentStockMl / p.bottleSizeMl) * (p.costPerBottle ?? 0), 0);
    const bev = beverageProducts.reduce((s, p) => s + (p.currentStock / p.piecesPerCarton) * (p.costPerCarton ?? 0), 0);
    const cig = cigaretteProducts.reduce((s, p) => s + (p.currentSticks / p.sticksPerPacket) * (p.costPerPacket ?? 0), 0);
    return alc + bev + cig;
  }, [alcoholProducts, beverageProducts, cigaretteProducts]);

  const lowCount = useMemo(() => {
    const a = alcoholProducts.filter((p) => p.status === 'active' && p.currentStockMl <= p.minStockMl).length;
    const b = beverageProducts.filter((p) => p.status === 'active' && p.currentStock <= p.minStock).length;
    const c = cigaretteProducts.filter((p) => p.status === 'active' && p.currentSticks <= p.minSticks).length;
    return a + b + c;
  }, [alcoholProducts, beverageProducts, cigaretteProducts]);

  const todayDeductions = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return invMovements.filter((m) => m.type === 'Sale' && m.timestamp >= start.getTime()).length;
  }, [invMovements]);

  // ── Unified rows ─────────────────────────────────────────────────────────

  const rows: UnifiedRow[] = useMemo(() => {
    const alcRows: UnifiedRow[] = alcoholProducts.map((p) => ({
      id: p.id, name: p.name, category: 'alcohol' as const,
      ...fmtAlcohol(p), raw: p,
    }));
    const bevRows: UnifiedRow[] = beverageProducts.map((p) => ({
      id: p.id, name: p.name, category: 'beverage' as const,
      ...fmtBeverage(p), raw: p,
    }));
    const cigRows: UnifiedRow[] = cigaretteProducts.map((p) => ({
      id: p.id, name: p.name, category: 'cigarette' as const,
      ...fmtCigarette(p), raw: p,
    }));
    const all = [...alcRows, ...bevRows, ...cigRows].sort((a, b) => {
      if (a.isLow && !b.isLow) return -1;
      if (!a.isLow && b.isLow) return 1;
      return a.name.localeCompare(b.name);
    });
    return catFilter === 'all' ? all : all.filter((r) => r.category === catFilter);
  }, [alcoholProducts, beverageProducts, cigaretteProducts, catFilter]);

  // ── Add button label ─────────────────────────────────────────────────────

  const handleDelete = (row: UnifiedRow) => {
    if (!confirm(`Delete "${row.name}"? This also removes its POS mappings.`)) return;
    if (row.category === 'alcohol')   deleteAlcohol(row.id);
    if (row.category === 'beverage')  deleteBeverage(row.id);
    if (row.category === 'cigarette') deleteCigarette(row.id);
    toast.success('Product deleted');
    if (form && 'p' in form && form.p.id === row.id) closeForm();
  };

  const handleBuy = (row: UnifiedRow) => {
    if (row.category === 'alcohol')   setForm({ kind: 'buy-alcohol',   p: row.raw as AlcoholProduct });
    if (row.category === 'beverage')  setForm({ kind: 'buy-beverage',  p: row.raw as BeverageProduct });
    if (row.category === 'cigarette') setForm({ kind: 'buy-cigarette', p: row.raw as CigaretteProduct });
  };
  const handleAdj = (row: UnifiedRow) => {
    if (row.category === 'alcohol')   setForm({ kind: 'adj-alcohol',   p: row.raw as AlcoholProduct });
    if (row.category === 'beverage')  setForm({ kind: 'adj-beverage',  p: row.raw as BeverageProduct });
    if (row.category === 'cigarette') setForm({ kind: 'adj-cigarette', p: row.raw as CigaretteProduct });
  };
  const handleEdit = (row: UnifiedRow) => {
    if (row.category === 'alcohol')   setForm({ kind: 'edit-alcohol',   p: row.raw as AlcoholProduct });
    if (row.category === 'beverage')  setForm({ kind: 'edit-beverage',  p: row.raw as BeverageProduct });
    if (row.category === 'cigarette') setForm({ kind: 'edit-cigarette', p: row.raw as CigaretteProduct });
  };

  // ── Add buttons based on current filter ──────────────────────────────────

  const addButtons = catFilter === 'all' ? (
    <div className="flex items-center gap-1.5">
      <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 border border-amber-500/25 text-amber-400 hover:brightness-110 transition-all" onClick={() => setForm({ kind: 'add', cat: 'alcohol' })}>
        <Wine size={12} /> Alcohol
      </button>
      <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500/15 border border-sky-500/25 text-sky-400 hover:brightness-110 transition-all" onClick={() => setForm({ kind: 'add', cat: 'beverage' })}>
        <GlassWater size={12} /> Beverage
      </button>
      <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-500/15 border border-orange-500/25 text-orange-400 hover:brightness-110 transition-all" onClick={() => setForm({ kind: 'add', cat: 'cigarette' })}>
        <Cigarette size={12} /> Cigarette
      </button>
    </div>
  ) : (
    <button className={BTN_PRIMARY} onClick={() => setForm({ kind: 'add', cat: catFilter })}>
      <Plus size={14} /> Add {CAT_LABEL[catFilter]}
    </button>
  );

  return (
    <div className="space-y-5">

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.18)' }}>
          <div className="p-2.5 rounded-lg shrink-0" style={{ background: 'rgba(59,130,246,0.12)' }}><Coins size={18} className="text-blue-400" /></div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Total Stock Value</p>
            <p className="text-xl font-bold text-blue-300">
              Rs. {totalValue > 0 ? totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
            </p>
            <p className="text-[10px] text-slate-500">based on cost price data</p>
          </div>
        </div>
        <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: lowCount > 0 ? 'rgba(239,68,68,0.07)' : 'rgba(34,197,94,0.07)', border: lowCount > 0 ? '1px solid rgba(239,68,68,0.18)' : '1px solid rgba(34,197,94,0.18)' }}>
          <div className="p-2.5 rounded-lg shrink-0" style={{ background: lowCount > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)' }}>
            <AlertTriangle size={18} className={lowCount > 0 ? 'text-red-400' : 'text-green-400'} />
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Low Stock Items</p>
            <p className={`text-xl font-bold ${lowCount > 0 ? 'text-red-300' : 'text-green-300'}`}>{lowCount}</p>
            <p className="text-[10px] text-slate-500">{lowCount > 0 ? 'at or below min threshold' : 'all items adequately stocked'}</p>
          </div>
        </div>
        <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.18)' }}>
          <div className="p-2.5 rounded-lg shrink-0" style={{ background: 'rgba(139,92,246,0.12)' }}><TrendingDown size={18} className="text-violet-400" /></div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Today's Deductions</p>
            <p className="text-xl font-bold text-violet-300">{todayDeductions}</p>
            <p className="text-[10px] text-slate-500">POS-triggered deduction events</p>
          </div>
        </div>
      </div>

      {/* ── Filter pills + Add buttons ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {(['all', 'alcohol', 'beverage', 'cigarette'] as CatFilter[]).map((cat) => (
            <button
              key={cat}
              onClick={() => { setCatFilter(cat); closeForm(); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                catFilter === cat
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              style={catFilter === cat
                ? { background: 'rgba(249,115,22,0.18)', border: '1px solid rgba(249,115,22,0.35)', color: '#fb923c' }
                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }
              }
            >
              {cat === 'all' ? 'All' : CAT_LABEL[cat]}
            </button>
          ))}
          <span className="text-xs text-slate-600 ml-1">{rows.length} item{rows.length !== 1 ? 's' : ''}</span>
        </div>
        {addButtons}
      </div>

      {/* ── Inline form panel ────────────────────────────────────────────── */}
      {form && (
        <div>
          {form.kind === 'add' && form.cat === 'alcohol'   && <AlcoholAddEditForm onClose={closeForm} />}
          {form.kind === 'add' && form.cat === 'beverage'  && <BeverageAddEditForm onClose={closeForm} />}
          {form.kind === 'add' && form.cat === 'cigarette' && <CigaretteAddEditForm onClose={closeForm} />}
          {form.kind === 'edit-alcohol'   && <AlcoholAddEditForm   edit={form.p} onClose={closeForm} />}
          {form.kind === 'edit-beverage'  && <BeverageAddEditForm  edit={form.p} onClose={closeForm} />}
          {form.kind === 'edit-cigarette' && <CigaretteAddEditForm edit={form.p} onClose={closeForm} />}
          {form.kind === 'buy-alcohol'    && <AlcoholBuyForm    p={form.p} onClose={closeForm} />}
          {form.kind === 'buy-beverage'   && <BeverageBuyForm   p={form.p} onClose={closeForm} />}
          {form.kind === 'buy-cigarette'  && <CigaretteBuyForm  p={form.p} onClose={closeForm} />}
          {form.kind === 'adj-alcohol'    && <AlcoholAdjForm    p={form.p} onClose={closeForm} />}
          {form.kind === 'adj-beverage'   && <BeverageAdjForm   p={form.p} onClose={closeForm} />}
          {form.kind === 'adj-cigarette'  && <CigaretteAdjForm  p={form.p} onClose={closeForm} />}
        </div>
      )}

      {/* ── Unified table ─────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <div className={`${CARD} text-center py-14 text-slate-500 text-sm`}>
          No products found. Use the add buttons above to get started.
        </div>
      ) : (
        <div className={CARD}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={TH}>Product Name</th>
                  <th className={`${TH} hidden sm:table-cell`}>Category</th>
                  <th className={TH}>Current Stock</th>
                  <th className={`${TH} hidden md:table-cell`}>Min Stock Alert</th>
                  <th className={`${TH} hidden sm:table-cell`}>Status</th>
                  <th className={TH}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.category}-${row.id}`}
                    className={`border-b border-white/[0.04] last:border-0 transition-colors ${row.isLow ? 'bg-red-500/[0.03]' : 'hover:bg-white/[0.015]'}`}
                  >
                    <td className={TD}>
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${row.isLow ? 'text-red-300' : 'text-foreground'}`}>{row.name}</span>
                        {row.isLow && <LowBadge />}
                      </div>
                    </td>
                    <td className={`${TD} hidden sm:table-cell`}>
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold leading-none ${CAT_BADGE[row.category]}`}>
                        {CAT_LABEL[row.category]}
                      </span>
                    </td>
                    <td className={TD}>
                      <p className={`font-semibold font-mono ${row.isLow ? 'text-red-400' : 'text-foreground'}`}>{row.stockPrimary}</p>
                      <p className="text-xs text-muted-foreground/60">{row.stockSecondary}</p>
                    </td>
                    <td className={`${TD} hidden md:table-cell text-muted-foreground`}>{row.minDisplay}</td>
                    <td className={`${TD} hidden sm:table-cell`}><StatusBadge status={(row.raw as { status: 'active' | 'inactive' }).status} /></td>
                    <td className={TD}>
                      <div className="flex items-center gap-0.5">
                        <button className={BTN_BUY}    title="Purchase stock" onClick={() => handleBuy(row)}> <ShoppingCart size={14} /></button>
                        <button className={BTN_ADJUST} title="Adjust stock"    onClick={() => handleAdj(row)}> <SlidersHorizontal size={14} /></button>
                        <button className={BTN_EDIT}   title="Edit product"    onClick={() => handleEdit(row)}><Edit3 size={14} /></button>
                        <button className={BTN_DANGER} title="Delete product"  onClick={() => handleDelete(row)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
