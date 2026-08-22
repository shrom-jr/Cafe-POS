import { useMemo, useState } from 'react';
import { useInventoryStore } from '@/store/useInventoryStore';
import {
  AlcoholProduct, BeverageProduct, CigaretteProduct, InventoryCategory,
  InvMovementType,
} from '@/types/pos';
import {
  CARD, BTN_PRIMARY, BTN_SM_PRIMARY, BTN_GHOST, BTN_DANGER, BTN_EDIT, BTN_BUY, BTN_ADJUST,
  INPUT, SELECT, LABEL, TH, TD,
} from './styles';
import { DeficitBadge, LowBadge, StatusBadge } from './components';
import { toast } from 'sonner';
import AppModal from '@/components/ui/AppModal';
import {
  Plus, Save, X, ShoppingCart, SlidersHorizontal, Edit3, Trash2,
  Wine, Beer, GlassWater, Cigarette, Martini,
} from 'lucide-react';

type Product = AlcoholProduct | BeverageProduct | CigaretteProduct;
type FormState =
  | { kind: 'add'; category: InventoryCategory }
  | { kind: 'edit-alcohol'; p: AlcoholProduct }
  | { kind: 'edit-beverage'; p: BeverageProduct }
  | { kind: 'edit-cigarette'; p: CigaretteProduct }
  | { kind: 'buy-alcohol'; p: AlcoholProduct }
  | { kind: 'buy-beverage'; p: BeverageProduct }
  | { kind: 'buy-cigarette'; p: CigaretteProduct }
  | { kind: 'adjust-alcohol'; p: AlcoholProduct }
  | { kind: 'adjust-beverage'; p: BeverageProduct }
  | { kind: 'adjust-cigarette'; p: CigaretteProduct };

const TAB_DEFS: Array<{ id: InventoryCategory; label: string; icon: typeof Wine; tone: string }> = [
  { id: 'spirits', label: 'Spirits', icon: Martini, tone: 'amber' },
  { id: 'wine', label: 'Wine', icon: Wine, tone: 'rose' },
  { id: 'beer', label: 'Beer', icon: Beer, tone: 'yellow' },
  { id: 'soft-drinks', label: 'Soft Drinks & Mixers', icon: GlassWater, tone: 'sky' },
  { id: 'cigarettes', label: 'Cigarettes', icon: Cigarette, tone: 'orange' },
];

const CATEGORY_LABEL: Record<InventoryCategory, string> = {
  spirits: 'Spirits', wine: 'Wine', beer: 'Beer',
  'soft-drinks': 'Soft Drinks & Mixers', cigarettes: 'Cigarettes',
};

const CATEGORY_BADGE: Record<InventoryCategory, string> = {
  spirits: 'bg-amber-500/15 border-amber-500/20 text-amber-400',
  wine: 'bg-rose-500/15 border-rose-500/20 text-rose-400',
  beer: 'bg-yellow-500/15 border-yellow-500/20 text-yellow-400',
  'soft-drinks': 'bg-sky-500/15 border-sky-500/20 text-sky-400',
  cigarettes: 'bg-orange-500/15 border-orange-500/20 text-orange-400',
};

const categoryForAlcohol = (p: AlcoholProduct): 'spirits' | 'wine' => p.category === 'wine' ? 'wine' : 'spirits';
const categoryForBeverage = (p: BeverageProduct): 'beer' | 'soft-drinks' => p.category === 'beer' ? 'beer' : 'soft-drinks';
const packagingLabel = (p: BeverageProduct) => `${p.packagingType}${p.sizeLabel ? ` · ${p.sizeLabel}` : ''}`;

function mlDisplay(ml: number, bottleSize: number) {
  const bottles = bottleSize > 0 ? ml / bottleSize : 0;
  const bottleText = Number.isInteger(bottles) ? String(bottles) : bottles.toFixed(2).replace(/0+$/, '');
  return `${ml.toLocaleString()} ml · ${bottleText} btl`;
}

function unitDisplay(p: BeverageProduct, qty: number) {
  return `${qty.toLocaleString()} ${p.packagingType}`;
}

function cigaretteDisplay(sticks: number, perPacket: number) {
  const packets = perPacket > 0 ? sticks / perPacket : 0;
  const packetText = Number.isInteger(packets) ? String(packets) : packets.toFixed(2).replace(/0+$/, '');
  return `${sticks.toLocaleString()} sticks · ${packetText} pkt`;
}

const FormActions = ({ onClose, children }: { onClose: () => void; children: React.ReactNode }) => (
  <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-5 mt-5 border-t border-white/10">
    <button className={BTN_GHOST} onClick={onClose}><X size={14} />Cancel</button>
    {children}
  </div>
);

const AlcoholForm = ({ edit, category, onClose }: { edit?: AlcoholProduct; category: 'spirits' | 'wine'; onClose: () => void }) => {
  const add = useInventoryStore((s) => s.addAlcohol);
  const update = useInventoryStore((s) => s.updateAlcohol);
  const initial = edit
    ? { name: edit.name, bottleSizeMl: String(edit.bottleSizeMl), stockBottles: String(edit.currentStockMl / edit.bottleSizeMl), minBottles: String(edit.minStockMl / edit.bottleSizeMl), cost: edit.costPerBottle === undefined ? '' : String(edit.costPerBottle), status: edit.status }
    : { name: '', bottleSizeMl: category === 'wine' ? '750' : '750', stockBottles: '0', minBottles: '', cost: '', status: 'active' as const };
  const [f, setF] = useState(initial);
  const set = (key: keyof typeof initial) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((v) => ({ ...v, [key]: e.target.value }));
  const save = () => {
    const size = Number(f.bottleSizeMl), stock = Number(f.stockBottles), min = f.minBottles === '' ? 0 : Number(f.minBottles);
    if (!f.name.trim()) return toast.error('Name is required');
    if (!Number.isFinite(size) || size <= 0) return toast.error('Bottle size must be greater than 0');
    if (!Number.isFinite(stock) || stock < 0 || !Number.isFinite(min) || min < 0) return toast.error('Stock values must be 0 or greater');
    const cost = f.cost === '' ? undefined : Number(f.cost);
    if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) return toast.error('Invalid cost');
    const data = { name: f.name.trim(), category, bottleSizeMl: Math.round(size), currentStockMl: stock * size, minStockMl: min * size, costPerBottle: cost, status: f.status as 'active' | 'inactive' };
    if (edit) update(edit.id, data); else add(data);
    toast.success(edit ? 'Product updated' : 'Product added'); onClose();
  };
  return <div className={`${CARD} border-amber-500/15`}>
     <div className="border-b border-white/10 pb-4"><h3 className="text-base font-black text-white tracking-tight">{edit ? `Edit — ${edit.name}` : `Add ${CATEGORY_LABEL[category]} Product`}</h3><p className="text-xs text-zinc-400 mt-1">Define the product and its opening stock details.</p></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2"><label className={LABEL}>Product Name *</label><input className={INPUT} value={f.name} onChange={set('name')} autoFocus /></div>
      <div><label className={LABEL}>Bottle Size (ml) *</label><input className={INPUT} type="number" min="1" value={f.bottleSizeMl} onChange={set('bottleSizeMl')} /></div>
      <div><label className={LABEL}>Current (btl) *</label><input className={INPUT} type="number" min="0" step="0.01" value={f.stockBottles} onChange={set('stockBottles')} /></div>
      <div><label className={LABEL}>Min Alert (btl)</label><input className={INPUT} type="number" min="0" step="0.01" value={f.minBottles} onChange={set('minBottles')} /></div>
      <div><label className={LABEL}>Cost/Bottle</label><input className={INPUT} type="number" min="0" value={f.cost} onChange={set('cost')} /></div>
    </div>
    <FormActions onClose={onClose}><button className={BTN_PRIMARY} onClick={save}><Save size={14} />{edit ? 'Save Changes' : 'Add Product'}</button></FormActions>
  </div>;
};

const BeverageForm = ({ edit, category, onClose }: { edit?: BeverageProduct; category: 'beer' | 'soft-drinks'; onClose: () => void }) => {
  const add = useInventoryStore((s) => s.addBeverage);
  const update = useInventoryStore((s) => s.updateBeverage);
  const initial = edit
    ? { name: edit.name, packagingType: edit.packagingType, sizeLabel: edit.sizeLabel ?? '', stock: String(edit.currentStock), min: String(edit.minStock), cost: edit.costPerUnit === undefined ? '' : String(edit.costPerUnit), status: edit.status }
    : { name: '', packagingType: category === 'beer' ? 'btl' as const : 'btl' as const, sizeLabel: category === 'beer' ? '650ml' : '250ml', stock: '0', min: '', cost: '', status: 'active' as const };
  const [f, setF] = useState(initial);
  const set = (key: keyof typeof initial) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((v) => ({ ...v, [key]: e.target.value }));
  const save = () => {
    const stock = Number(f.stock), min = f.min === '' ? 0 : Number(f.min), cost = f.cost === '' ? undefined : Number(f.cost);
    if (!f.name.trim()) return toast.error('Name is required');
    if (!Number.isInteger(stock) || stock < 0 || !Number.isInteger(min) || min < 0) return toast.error('Unit stock values must be whole numbers');
    if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) return toast.error('Invalid cost');
    const data = { name: f.name.trim(), category, packagingType: f.packagingType as 'btl' | 'can' | 'pcs', sizeLabel: f.sizeLabel.trim() || undefined, currentStock: stock, minStock: min, costPerUnit: cost, status: f.status as 'active' | 'inactive' };
    if (edit) update(edit.id, data); else add(data);
    toast.success(edit ? 'Product updated' : 'Product added'); onClose();
  };
  return <div className={`${CARD} border-sky-500/15`}>
     <div className="border-b border-white/10 pb-4"><h3 className="text-base font-black text-white tracking-tight">{edit ? `Edit — ${edit.name}` : `Add ${CATEGORY_LABEL[category]} Product`}</h3><p className="text-xs text-zinc-400 mt-1">Set packaging, stock levels, and unit pricing.</p></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2"><label className={LABEL}>Product Name *</label><input className={INPUT} value={f.name} onChange={set('name')} autoFocus /></div>
      <div><label className={LABEL}>Packaging *</label><select className={SELECT} value={f.packagingType} onChange={set('packagingType')}><option value="btl">Bottle (btl)</option><option value="can">Can</option><option value="pcs">Pieces</option></select></div>
      <div><label className={LABEL}>Size Label</label><input className={INPUT} placeholder="650ml" value={f.sizeLabel} onChange={set('sizeLabel')} /></div>
      <div><label className={LABEL}>Current (units) *</label><input className={INPUT} type="number" min="0" step="1" value={f.stock} onChange={set('stock')} /></div>
      <div><label className={LABEL}>Min Alert (units)</label><input className={INPUT} type="number" min="0" step="1" value={f.min} onChange={set('min')} /></div>
      <div><label className={LABEL}>Cost/Unit</label><input className={INPUT} type="number" min="0" value={f.cost} onChange={set('cost')} /></div>
    </div>
     <p className="text-xs font-bold text-zinc-300 mt-2">Restocking is entered directly as individual bottles, cans, or pieces — no case multiplier.</p>
    <FormActions onClose={onClose}><button className={BTN_PRIMARY} onClick={save}><Save size={14} />{edit ? 'Save Changes' : 'Add Product'}</button></FormActions>
  </div>;
};

const CigaretteForm = ({ edit, onClose }: { edit?: CigaretteProduct; onClose: () => void }) => {
  const add = useInventoryStore((s) => s.addCigarette);
  const update = useInventoryStore((s) => s.updateCigarette);
  const initial = edit
    ? { name: edit.name, packetSize: String(edit.sticksPerPacket), stockPackets: String(edit.currentSticks / edit.sticksPerPacket), minPackets: String(edit.minSticks / edit.sticksPerPacket), cost: edit.costPerPacket === undefined ? '' : String(edit.costPerPacket), status: edit.status }
    : { name: '', packetSize: '20', stockPackets: '0', minPackets: '', cost: '', status: 'active' as const };
  const [f, setF] = useState(initial);
  const set = (key: keyof typeof initial) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((v) => ({ ...v, [key]: e.target.value }));
  const save = () => {
    const perPacket = Number(f.packetSize), stock = Number(f.stockPackets), min = f.minPackets === '' ? 0 : Number(f.minPackets), cost = f.cost === '' ? undefined : Number(f.cost);
    if (!f.name.trim()) return toast.error('Name is required');
    if (!Number.isInteger(perPacket) || perPacket <= 0 || stock < 0 || min < 0) return toast.error('Enter valid packet and stock values');
    const data = { name: f.name.trim(), sticksPerPacket: perPacket, currentSticks: stock * perPacket, minSticks: min * perPacket, costPerPacket: cost, status: f.status as 'active' | 'inactive' };
    if (edit) update(edit.id, data); else add(data);
    toast.success(edit ? 'Product updated' : 'Product added'); onClose();
  };
  return <div className={`${CARD} border-orange-500/15`}>
     <div className="border-b border-white/10 pb-4"><h3 className="text-base font-black text-white tracking-tight">{edit ? `Edit — ${edit.name}` : 'Add Cigarette Product'}</h3><p className="text-xs text-zinc-400 mt-1">Set packet sizing, stock levels, and cost information.</p></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2"><label className={LABEL}>Product Name *</label><input className={INPUT} value={f.name} onChange={set('name')} autoFocus /></div>
      <div><label className={LABEL}>Sticks/Packet</label><input className={INPUT} type="number" min="1" step="1" value={f.packetSize} onChange={set('packetSize')} /></div>
      <div><label className={LABEL}>Current (packets)</label><input className={INPUT} type="number" min="0" step="1" value={f.stockPackets} onChange={set('stockPackets')} /></div>
      <div><label className={LABEL}>Min Alert (packets)</label><input className={INPUT} type="number" min="0" step="1" value={f.minPackets} onChange={set('minPackets')} /></div>
      <div><label className={LABEL}>Cost/Packet</label><input className={INPUT} type="number" min="0" value={f.cost} onChange={set('cost')} /></div>
    </div>
     <p className="text-xs font-bold text-zinc-300 mt-2">Stock is stored in sticks. One packet converts to {f.packetSize || 20} sticks.</p>
    <FormActions onClose={onClose}><button className={BTN_PRIMARY} onClick={save}><Save size={14} />{edit ? 'Save Changes' : 'Add Product'}</button></FormActions>
  </div>;
};

const AlcoholPurchase = ({ p, onClose }: { p: AlcoholProduct; onClose: () => void }) => {
  const purchase = useInventoryStore((s) => s.purchaseAlcohol);
  const [qty, setQty] = useState(''), [cost, setCost] = useState(''), [supplier, setSupplier] = useState(''), [invoice, setInvoice] = useState('');
  const save = () => { const q = Number(qty); if (!q || q <= 0) return toast.error('Enter bottle quantity'); purchase({ productId: p.id, bottles: q, supplier: supplier || undefined, invoiceNo: invoice || undefined, costPerBottle: cost === '' ? undefined : Number(cost) }); toast.success(`+${(q * p.bottleSizeMl).toLocaleString()} ml added`); onClose(); };
  return <div className={`${CARD} border-green-500/15`}><h3 className="text-lg font-black text-white tracking-tight">Restock — {p.name} <span className="text-xs font-bold text-zinc-300">({p.bottleSizeMl}ml/btl)</span></h3><div className="grid grid-cols-2 sm:grid-cols-4 gap-3"><div><label className={LABEL}>Bottles *</label><input className={INPUT} type="number" min="0.01" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus /></div><div><label className={LABEL}>Cost/Bottle</label><input className={INPUT} type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} /></div><div><label className={LABEL}>Supplier</label><input className={INPUT} value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div><div><label className={LABEL}>Invoice #</label><input className={INPUT} value={invoice} onChange={(e) => setInvoice(e.target.value)} /></div></div><FormActions onClose={onClose}><button className={BTN_PRIMARY} onClick={save}><ShoppingCart size={14} />Confirm Restock</button></FormActions></div>;
};

const BeveragePurchase = ({ p, onClose }: { p: BeverageProduct; onClose: () => void }) => {
  const purchase = useInventoryStore((s) => s.purchaseBeverage);
  const [qty, setQty] = useState(''), [cost, setCost] = useState(''), [supplier, setSupplier] = useState(''), [invoice, setInvoice] = useState('');
  const save = () => { const q = Number(qty); if (!Number.isInteger(q) || q <= 0) return toast.error(`Enter whole ${p.packagingType} quantity`); purchase({ productId: p.id, qty: q, supplier: supplier || undefined, invoiceNo: invoice || undefined, cost: cost === '' ? undefined : Number(cost) }); toast.success(`+${q} ${p.packagingType} added`); onClose(); };
  return <div className={`${CARD} border-green-500/15`}><h3 className="text-lg font-black text-white tracking-tight">Restock — {p.name} <span className="text-xs font-bold text-zinc-300">({packagingLabel(p)})</span></h3><div className="grid grid-cols-2 sm:grid-cols-4 gap-3"><div><label className={LABEL}>Units ({p.packagingType}) *</label><input className={INPUT} type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus /></div><div><label className={LABEL}>Total Cost</label><input className={INPUT} type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} /></div><div><label className={LABEL}>Supplier</label><input className={INPUT} value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div><div><label className={LABEL}>Invoice #</label><input className={INPUT} value={invoice} onChange={(e) => setInvoice(e.target.value)} /></div></div><p className="text-xs font-bold text-zinc-300 mt-2">Direct unit restock — no crate or case calculation.</p><FormActions onClose={onClose}><button className={BTN_PRIMARY} onClick={save}><ShoppingCart size={14} />Confirm Restock</button></FormActions></div>;
};

const CigarettePurchase = ({ p, onClose }: { p: CigaretteProduct; onClose: () => void }) => {
  const purchase = useInventoryStore((s) => s.purchaseCigarette);
  const [qty, setQty] = useState(''), [cost, setCost] = useState(''), [supplier, setSupplier] = useState(''), [invoice, setInvoice] = useState('');
  const save = () => { const q = Number(qty); if (!Number.isInteger(q) || q <= 0) return toast.error('Enter whole packet quantity'); purchase({ productId: p.id, purchaseUnit: 'packet', qty: q, supplier: supplier || undefined, invoiceNo: invoice || undefined, cost: cost === '' ? undefined : Number(cost) }); toast.success(`+${q * p.sticksPerPacket} sticks added`); onClose(); };
  return <div className={`${CARD} border-green-500/15`}><h3 className="text-lg font-black text-white tracking-tight">Restock — {p.name} <span className="text-xs font-bold text-zinc-300">({p.sticksPerPacket} sticks/packet)</span></h3><div className="grid grid-cols-2 sm:grid-cols-4 gap-3"><div><label className={LABEL}>Packets *</label><input className={INPUT} type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus /></div><div><label className={LABEL}>Cost/Packet</label><input className={INPUT} type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} /></div><div><label className={LABEL}>Supplier</label><input className={INPUT} value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div><div><label className={LABEL}>Invoice #</label><input className={INPUT} value={invoice} onChange={(e) => setInvoice(e.target.value)} /></div></div><FormActions onClose={onClose}><button className={BTN_PRIMARY} onClick={save}><ShoppingCart size={14} />Confirm Restock</button></FormActions></div>;
};

const Adjustment = ({ p, kind, onClose }: { p: Product; kind: 'alcohol' | 'beverage' | 'cigarette'; onClose: () => void }) => {
  const adjustAlcohol = useInventoryStore((s) => s.adjustAlcohol);
  const adjustBeverage = useInventoryStore((s) => s.adjustBeverage);
  const adjustCigarette = useInventoryStore((s) => s.adjustCigarette);
  const [direction, setDirection] = useState<'add' | 'remove'>('add'), [amount, setAmount] = useState(''), [type, setType] = useState<InvMovementType>('Adjustment'), [reason, setReason] = useState('');
  const unit = kind === 'alcohol' ? 'ml' : kind === 'beverage' ? (p as BeverageProduct).packagingType : 'sticks';
  const save = () => {
    const q = Number(amount); if (!q || q <= 0 || !reason.trim()) return toast.error('Enter an amount and reason');
    const signed = direction === 'add' ? q : -q;
    if (kind === 'alcohol') adjustAlcohol({ productId: p.id, changeMl: signed, type, reason: reason.trim() });
    else if (kind === 'beverage') adjustBeverage({ productId: p.id, changePieces: signed, type, reason: reason.trim() });
    else adjustCigarette({ productId: p.id, changeSticks: signed, type, reason: reason.trim() });
    toast.success('Stock adjusted'); onClose();
  };
  return <div className={`${CARD} border-yellow-500/15`}><h3 className="text-lg font-black text-white tracking-tight">Adjust Stock — {p.name}</h3><div className="grid grid-cols-2 sm:grid-cols-4 gap-3"><div><label className={LABEL}>Direction</label><select className={SELECT} value={direction} onChange={(e) => setDirection(e.target.value as 'add' | 'remove')}><option value="add">Increase</option><option value="remove">Decrease</option></select></div><div><label className={LABEL}>Amount ({unit}) *</label><input className={INPUT} type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div><div><label className={LABEL}>Type</label><select className={SELECT} value={type} onChange={(e) => setType(e.target.value as InvMovementType)}><option value="Adjustment">Adjustment</option><option value="Waste">Waste</option><option value="Correction">Correction</option></select></div><div><label className={LABEL}>Reason *</label><input className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} /></div></div><FormActions onClose={onClose}><button className={BTN_PRIMARY} onClick={save}><Save size={14} />Apply Adjustment</button></FormActions></div>;
};

export const PackagedStockTab = () => {
  const alcohol = useInventoryStore((s) => s.alcoholProducts);
  const beverages = useInventoryStore((s) => s.beverageProducts);
  const cigarettes = useInventoryStore((s) => s.cigaretteProducts);
  const movements = useInventoryStore((s) => s.invMovements);
  const deleteAlcohol = useInventoryStore((s) => s.deleteAlcohol);
  const deleteBeverage = useInventoryStore((s) => s.deleteBeverage);
  const deleteCigarette = useInventoryStore((s) => s.deleteCigarette);
  const [activeTab, setActiveTab] = useState<InventoryCategory>('spirits');
  const [form, setForm] = useState<FormState | null>(null);
  const close = () => setForm(null);

  const products = useMemo(() => {
    const rows: Array<{ p: Product; kind: 'alcohol' | 'beverage' | 'cigarette'; category: InventoryCategory; primary: string; secondary: string; min: string; low: boolean; deficit: boolean }> = [];
    alcohol.forEach((p) => rows.push({ p, kind: 'alcohol', category: categoryForAlcohol(p), primary: mlDisplay(p.currentStockMl, p.bottleSizeMl), secondary: `${p.currentStockMl.toLocaleString()} ml total`, min: mlDisplay(p.minStockMl, p.bottleSizeMl), low: p.status === 'active' && (p.currentStockMl < 0 || (p.minStockMl > 0 && p.currentStockMl <= p.minStockMl)), deficit: p.currentStockMl < 0 }));
    beverages.forEach((p) => rows.push({ p, kind: 'beverage', category: categoryForBeverage(p), primary: unitDisplay(p, p.currentStock), secondary: p.sizeLabel ? `Size ${p.sizeLabel}` : 'Unit stock', min: unitDisplay(p, p.minStock), low: p.status === 'active' && (p.currentStock < 0 || (p.minStock > 0 && p.currentStock <= p.minStock)), deficit: p.currentStock < 0 }));
    cigarettes.forEach((p) => rows.push({ p, kind: 'cigarette', category: 'cigarettes', primary: cigaretteDisplay(p.currentSticks, p.sticksPerPacket), secondary: `${p.currentSticks.toLocaleString()} sticks total`, min: cigaretteDisplay(p.minSticks, p.sticksPerPacket), low: p.status === 'active' && (p.currentSticks < 0 || (p.minSticks > 0 && p.currentSticks <= p.minSticks)), deficit: p.currentSticks < 0 }));
    return rows.filter((r) => r.category === activeTab).sort((a, b) => Number(b.low) - Number(a.low) || a.p.name.localeCompare(b.p.name));
  }, [alcohol, beverages, cigarettes, activeTab]);

  const totalValue = useMemo(() => alcohol.reduce((s, p) => s + p.currentStockMl / p.bottleSizeMl * (p.costPerBottle ?? 0), 0) + beverages.reduce((s, p) => s + p.currentStock * (p.costPerUnit ?? (p.costPerCarton && p.piecesPerCarton ? p.costPerCarton / p.piecesPerCarton : 0)), 0) + cigarettes.reduce((s, p) => s + p.currentSticks / p.sticksPerPacket * (p.costPerPacket ?? 0), 0), [alcohol, beverages, cigarettes]);
   const lowCount = [...alcohol.filter((p) => p.status === 'active' && (p.currentStockMl < 0 || (p.minStockMl > 0 && p.currentStockMl <= p.minStockMl))), ...beverages.filter((p) => p.status === 'active' && (p.currentStock < 0 || (p.minStock > 0 && p.currentStock <= p.minStock))), ...cigarettes.filter((p) => p.status === 'active' && (p.currentSticks < 0 || (p.minSticks > 0 && p.currentSticks <= p.minSticks)))].length;
  const todaySales = movements.filter((m) => m.type === 'Sale' && m.timestamp >= new Date().setHours(0, 0, 0, 0)).length;
  const selected = form && 'p' in form ? form.p : undefined;

  const openAdd = () => setForm({ kind: 'add', category: activeTab });
  const edit = (p: Product, kind: string) => setForm({ kind: kind as never, p } as FormState);
  const remove = (row: typeof products[number]) => {
    if (!confirm(`Delete "${row.p.name}"? This also removes its POS mappings.`)) return;
    if (row.kind === 'alcohol') deleteAlcohol(row.p.id); else if (row.kind === 'beverage') deleteBeverage(row.p.id); else deleteCigarette(row.p.id);
    toast.success('Product deleted'); if (selected?.id === row.p.id) close();
  };

  return <div className="space-y-5">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
      <div className="p-5 rounded-2xl bg-[#13151F] border-2 border-sky-500/40 shadow-xl shadow-sky-500/5 flex flex-col justify-between min-h-[125px]">
        <p className="text-xs font-black uppercase tracking-wider text-sky-400">Tracked Products</p>
        <p className="text-3xl font-black text-white tracking-tight mt-1.5">{alcohol.length + beverages.length + cigarettes.length}</p>
      </div>
      <div className="p-5 rounded-2xl bg-[#181116] border-2 border-rose-500/40 shadow-xl shadow-rose-500/5 flex flex-col justify-between min-h-[125px]">
        <p className="text-xs font-black uppercase tracking-wider text-rose-400">Low Stock</p>
        <p className="text-3xl font-black text-rose-400 tracking-tight mt-1.5 drop-shadow-[0_0_12px_rgba(244,63,94,0.3)]">{lowCount}</p>
      </div>
      <div className="p-5 rounded-2xl bg-[#0F1916] border-2 border-emerald-500/40 shadow-xl shadow-emerald-500/5 flex flex-col justify-between min-h-[125px]">
        <p className="text-xs font-black uppercase tracking-wider text-emerald-400">Inventory Value</p>
        <p className="text-3xl font-black text-emerald-400 tracking-tight mt-1.5 drop-shadow-[0_0_12px_rgba(16,185,129,0.3)]">Rs. {Math.round(totalValue).toLocaleString()}</p>
      </div>
      <div className="p-5 rounded-2xl bg-[#13151F] border-2 border-amber-500/40 shadow-xl shadow-amber-500/5 flex flex-col justify-between min-h-[125px]">
        <p className="text-xs font-black uppercase tracking-wider text-amber-400">Today's Sales (Stock Deductions)</p>
        <p className="text-3xl font-black text-white tracking-tight mt-1.5">{todaySales}</p>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2.5 mt-6">
      {TAB_DEFS.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setActiveTab(id); close(); }} className={activeTab === id
        ? 'px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md shadow-amber-500/20 flex items-center gap-2 transition-all'
        : 'px-4 py-2 rounded-xl bg-[#13151F] border border-white/15 text-zinc-200 hover:text-white hover:bg-white/10 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2'}><Icon size={14} /><span>{label}</span><span className="text-[10px] opacity-70">({id === 'spirits' ? alcohol.filter((p) => categoryForAlcohol(p) === id).length : id === 'wine' ? alcohol.filter((p) => categoryForAlcohol(p) === id).length : id === 'beer' ? beverages.filter((p) => categoryForBeverage(p) === id).length : id === 'soft-drinks' ? beverages.filter((p) => categoryForBeverage(p) === id).length : cigarettes.length})</span></button>)}
    </div>
    <div className="flex items-center justify-between mt-6 mb-3 gap-3"><div><h2 className="text-lg font-black text-white tracking-wide">{CATEGORY_LABEL[activeTab]}</h2><p className="text-xs font-bold text-amber-400 ml-2 inline">{activeTab === 'spirits' || activeTab === 'wine' ? 'Stock tracked in ml' : activeTab === 'cigarettes' ? 'Stock tracked in sticks · 20 sticks per packet' : 'Stock tracked as individual units'}</p></div><button className={BTN_SM_PRIMARY} onClick={openAdd}><Plus size={14} />Add Product</button></div>
     {form && (
       <AppModal onClose={close} size="max-w-4xl" showHeader={false}>
         {form.kind === 'add' && (form.category === 'spirits' || form.category === 'wine') && <AlcoholForm category={form.category} onClose={close} />}
         {form.kind === 'add' && (form.category === 'beer' || form.category === 'soft-drinks') && <BeverageForm category={form.category} onClose={close} />}
         {form.kind === 'add' && form.category === 'cigarettes' && <CigaretteForm onClose={close} />}
         {form.kind === 'edit-alcohol' && <AlcoholForm edit={form.p} category={categoryForAlcohol(form.p)} onClose={close} />}
         {form.kind === 'edit-beverage' && <BeverageForm edit={form.p} category={categoryForBeverage(form.p)} onClose={close} />}
         {form.kind === 'edit-cigarette' && <CigaretteForm edit={form.p} onClose={close} />}
         {form.kind === 'buy-alcohol' && <AlcoholPurchase p={form.p} onClose={close} />}
         {form.kind === 'buy-beverage' && <BeveragePurchase p={form.p} onClose={close} />}
         {form.kind === 'buy-cigarette' && <CigarettePurchase p={form.p} onClose={close} />}
         {form.kind === 'adjust-alcohol' && <Adjustment p={form.p} kind="alcohol" onClose={close} />}
         {form.kind === 'adjust-beverage' && <Adjustment p={form.p} kind="beverage" onClose={close} />}
         {form.kind === 'adjust-cigarette' && <Adjustment p={form.p} kind="cigarette" onClose={close} />}
       </AppModal>
     )}
     <div className="bg-[#13151F] border border-white/15 rounded-3xl overflow-hidden shadow-2xl shadow-black/50">
       {products.length === 0 ? (
         <div className="py-14 text-center text-sm font-bold text-zinc-300">No {CATEGORY_LABEL[activeTab].toLowerCase()} products yet.</div>
       ) : (
         <table className="w-full text-sm">
           <thead>
             <tr className="bg-white/[0.04] border-b border-white/10">
               <th className={TH}>Product</th>
               <th className={`${TH} hidden sm:table-cell`}>Packaging</th>
               <th className={TH}>Current Stock</th>
               <th className={`${TH} hidden md:table-cell`}>Min Alert</th>
               <th className={`${TH} hidden sm:table-cell`}>Status</th>
               <th className={TH}>Actions</th>
             </tr>
           </thead>
           <tbody>
             {products.map((row) => (
               <tr key={row.p.id} className={`border-b border-white/10 last:border-0 hover:bg-white/[0.03] transition-colors ${row.low ? 'bg-rose-500/[0.04]' : ''}`}>
                 <td className={TD}>
                   <div className="flex items-center gap-2">
                     <span className={`text-base font-black tracking-wide ${row.low ? 'text-rose-300' : 'text-white'}`}>{row.p.name}</span>
                      {row.deficit ? <DeficitBadge /> : row.low && <LowBadge />}
                   </div>
                 </td>
                 <td className={`${TD} hidden sm:table-cell`}>
                   <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-mono font-black`}>
                     {row.kind === 'alcohol' ? `${(row.p as AlcoholProduct).bottleSizeMl}ml btl` : row.kind === 'beverage' ? packagingLabel(row.p as BeverageProduct) : `${(row.p as CigaretteProduct).sticksPerPacket} sticks/pkt`}
                   </span>
                 </td>
                 <td className={TD}>
                    <p className={`text-sm font-black font-mono tracking-wide ${row.deficit ? 'text-amber-400' : row.low ? 'text-rose-400' : 'text-zinc-100'}`}>{row.primary}</p>
                 </td>
                 <td className={`${TD} hidden md:table-cell text-xs font-bold text-zinc-300 font-mono`}>{row.min}</td>
                  <td className={`${TD} hidden sm:table-cell`}>{row.deficit ? <DeficitBadge /> : <StatusBadge status={row.p.status} />}</td>
                 <td className={TD}>
                   <div className="flex items-center gap-1.5">
                     <button className={BTN_BUY} title="Restock" onClick={() => edit(row.p, row.kind === 'alcohol' ? 'buy-alcohol' : row.kind === 'beverage' ? 'buy-beverage' : 'buy-cigarette')}><ShoppingCart size={14} /></button>
                     <button className={BTN_ADJUST} title="Adjust" onClick={() => edit(row.p, row.kind === 'alcohol' ? 'adjust-alcohol' : row.kind === 'beverage' ? 'adjust-beverage' : 'adjust-cigarette')}><SlidersHorizontal size={14} /></button>
                     <button className={BTN_EDIT} title="Edit" onClick={() => edit(row.p, row.kind === 'alcohol' ? 'edit-alcohol' : row.kind === 'beverage' ? 'edit-beverage' : 'edit-cigarette')}><Edit3 size={14} /></button>
                     <button className={BTN_DANGER} title="Delete" onClick={() => remove(row)}><Trash2 size={14} /></button>
                   </div>
                 </td>
               </tr>
             ))}
           </tbody>
         </table>
       )}
     </div>
  </div>;
};