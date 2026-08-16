import { useState, useMemo, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { GlassWater, PackagePlus, Trash2, TrendingDown, TrendingUp, Plus, X } from 'lucide-react';
import AppLayout from '@/components/ui/AppLayout';
import { useInventoryStore } from '@/store/useInventoryStore';
import { useStaffStore } from '@/store/useStaffStore';
import { InventoryMovement, InvProductType } from '@/types/pos';
import { fmt } from '@/utils/format';

// ── Helpers ───────────────────────────────────────────────────────────────────

const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const fmtTime  = (ts: number) => format(new Date(ts), 'hh:mm a');

// ── Unified product descriptor ────────────────────────────────────────────────

interface BarProduct {
  id: string;
  name: string;
  productType: InvProductType;
  qtyUnit: string;    // 'bottles' | 'pcs' | 'packets'
}

// ── Category styling ──────────────────────────────────────────────────────────

const TYPE_META: Record<InvProductType, { label: string; bg: string; border: string; text: string }> = {
  alcohol:   { label: 'Alcohol',   bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.3)',   text: '#f87171' },
  beverage:  { label: 'Beverage',  bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.3)',  text: '#60a5fa' },
  cigarette: { label: 'Cigarette', bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.3)',  text: '#fbbf24' },
};

const ENTRY_TYPE_META = {
  'Restock':    { icon: TrendingUp,   bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.3)',  text: '#34d399' },
  'Spill/Loss': { icon: TrendingDown, bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.3)',   text: '#f87171' },
};

// ── Alcohol portion sizes ─────────────────────────────────────────────────────

type PortionKey = 'liter' | 'full' | 'half' | 'quarter' | 'mini';

interface PortionOption {
  label: string;
  factor: number | null; // null = fixed ml
  mlFixed?: number;      // fixed ml regardless of bottle size (mini, liter)
  containerUnit: string;
}

const ALCOHOL_PORTIONS: Record<PortionKey, PortionOption> = {
  liter:   { label: '1 Liter',   factor: null, mlFixed: 1000, containerUnit: '1L btl'   },
  full:    { label: 'Full Btl',  factor: 1.0,  containerUnit: 'bottles'                 },
  half:    { label: 'Half Btl',  factor: 0.5,  containerUnit: 'half btl'                },
  quarter: { label: '¼ Bottle',  factor: 0.25, containerUnit: 'qtr btl'                 },
  mini:    { label: 'Mini',      factor: null, mlFixed: 330,  containerUnit: 'mini'      },
};

const PORTION_KEYS: PortionKey[] = ['liter', 'full', 'half', 'quarter', 'mini'];

// ── Quick-Add helpers ─────────────────────────────────────────────────────────

const toTitleCase = (str: string): string =>
  str.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

const CATEGORY_UNITS: Record<InvProductType, { value: string; label: string }[]> = {
  alcohol:   [{ value: 'Bottles (btl)', label: 'Bottles (btl)' }, { value: 'Cans', label: 'Cans' }, { value: 'Crates', label: 'Crates' }],
  beverage:  [{ value: 'Pcs', label: 'Pcs' }, { value: 'Cans', label: 'Cans' }, { value: 'Crates', label: 'Crates' }],
  cigarette: [{ value: 'Packets', label: 'Packets' }],
};

const ITEMS_META: Record<InvProductType, { label: string; placeholder: string; default: number }> = {
  alcohol:   { label: 'Bottle / Can Size (ml)', placeholder: 'e.g. 650',  default: 650 },
  beverage:  { label: 'Pieces per Carton',       placeholder: 'e.g. 1',    default: 1   },
  cigarette: { label: 'Sticks per Packet',        placeholder: 'e.g. 20',   default: 20  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, color,
}: {
  label: string; value: string | number; color: string;
}) {
  const isSpend = color === '#34d399';
  return (
    <div className={isSpend
      ? 'p-6 rounded-2xl bg-[#0F1916] border border-emerald-500/50 shadow-xl shadow-emerald-500/10'
      : 'p-6 rounded-2xl bg-[#13151F] border border-white/15 shadow-xl shadow-black/40'
    }>
      <p className={`text-xs font-black uppercase tracking-widest ${isSpend ? 'text-emerald-400' : 'text-amber-400'}`}>{label}</p>
      <p className={`text-3xl font-black mt-1.5 tracking-tight ${isSpend
        ? 'text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.3)]'
        : 'text-white'
      }`}>{value}</p>
    </div>
  );
}

function CategoryBadge({ productType }: { productType: InvProductType }) {
  const m = TYPE_META[productType];
  return (
    <span
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
      style={{ background: m.bg, border: `1px solid ${m.border}`, color: m.text }}
    >
      {m.label}
    </span>
  );
}

function EntryTypeBadge({ entryType }: { entryType: 'Restock' | 'Spill/Loss' }) {
  const m = ENTRY_TYPE_META[entryType];
  return (
    <span
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
      style={{ background: m.bg, border: `1px solid ${m.border}`, color: m.text }}
    >
      {entryType}
    </span>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

const BarPortal = () => {
  // ── Store data ──
  const alcoholProducts    = useInventoryStore((s) => s.alcoholProducts);
  const beverageProducts   = useInventoryStore((s) => s.beverageProducts);
  const cigaretteProducts  = useInventoryStore((s) => s.cigaretteProducts);
  const invMovements       = useInventoryStore((s) => s.invMovements);
  const addBarMovement     = useInventoryStore((s) => s.addBarMovement);
  const deleteBarMovement  = useInventoryStore((s) => s.deleteBarMovement);
  const currentUser        = useStaffStore((s) => s.currentUser);

  // ── Form state ──
  const [productId,    setProductId]    = useState('');
  const [entryType,    setEntryType]    = useState<'Restock' | 'Spill/Loss'>('Restock');
  const [qty,          setQty]          = useState('');
  const [totalCost,    setTotalCost]    = useState('');
  const [supplier,     setSupplier]     = useState('');
  const [portionKey,          setPortionKey]          = useState<PortionKey>('full');
  const [isCostEditedByUser,  setIsCostEditedByUser]  = useState(false);
  const [showAddModal,        setShowAddModal]         = useState(false);

  // ── Quick-add callback ──
  const handleProductCreated = (newId: string) => {
    setProductId(newId);
    setShowAddModal(false);
  };

  // ── Unified product list (active only) ──
  const allProducts = useMemo<BarProduct[]>(() => [
    ...alcoholProducts
      .filter((p) => p.status === 'active')
      .map((p) => ({ id: p.id, name: p.name, productType: 'alcohol'   as InvProductType, qtyUnit: 'bottles' })),
    ...beverageProducts
      .filter((p) => p.status === 'active')
      .map((p) => ({ id: p.id, name: p.name, productType: 'beverage'  as InvProductType, qtyUnit: 'pcs'     })),
    ...cigaretteProducts
      .filter((p) => p.status === 'active')
      .map((p) => ({ id: p.id, name: p.name, productType: 'cigarette' as InvProductType, qtyUnit: 'packets' })),
  ], [alcoholProducts, beverageProducts, cigaretteProducts]);

  const selectedProduct = allProducts.find((p) => p.id === productId) ?? null;

  // ── Unit cost for auto-calculating Total Cost as user types qty ──
  const unitCost = useMemo<number | null>(() => {
    if (!selectedProduct) return null;
    if (selectedProduct.productType === 'alcohol') {
      return alcoholProducts.find((p) => p.id === productId)?.costPerBottle ?? null;
    }
    if (selectedProduct.productType === 'beverage') {
      const p = beverageProducts.find((p) => p.id === productId);
      return p?.costPerUnit ?? (p?.costPerCarton && p.piecesPerCarton ? p.costPerCarton / p.piecesPerCarton : null);
    }
    if (selectedProduct.productType === 'cigarette') {
      return cigaretteProducts.find((p) => p.id === productId)?.costPerPacket ?? null;
    }
    return null;
  }, [selectedProduct, productId, alcoholProducts, beverageProducts, cigaretteProducts]);

  // ── Reset portion + dirty flag when product changes ──
  useEffect(() => {
    setPortionKey('full');
    setIsCostEditedByUser(false);
  }, [productId]);

  // ── Portion-aware ml per container unit ──
  const portionMl = useMemo<number>(() => {
    if (selectedProduct?.productType !== 'alcohol') return 0;
    const prod = alcoholProducts.find((p) => p.id === productId);
    if (!prod) return 0;
    const portion = ALCOHOL_PORTIONS[portionKey];
    if (portion.mlFixed !== undefined) return portion.mlFixed;
    return Math.round(prod.bottleSizeMl * (portion.factor ?? 1));
  }, [selectedProduct, productId, portionKey, alcoholProducts]);

  // ── Cost per one container unit (portion-adjusted for alcohol) ──
  const effectiveUnitCost = useMemo<number | null>(() => {
    if (!selectedProduct || unitCost === null) return null;
    if (selectedProduct.productType !== 'alcohol') return unitCost;
    const prod = alcoholProducts.find((p) => p.id === productId);
    if (!prod || prod.bottleSizeMl <= 0) return unitCost;
    return unitCost * (portionMl / prod.bottleSizeMl);
  }, [selectedProduct, productId, unitCost, portionMl, alcoholProducts]);

  // ── Re-auto-fill total cost when portion changes (only when user hasn't overridden) ──
  useEffect(() => {
    if (isCostEditedByUser || effectiveUnitCost === null || entryType !== 'Restock' || !qty) return;
    const qtyNum = parseFloat(qty);
    if (!isNaN(qtyNum) && qtyNum > 0) {
      setTotalCost(String(Math.round(qtyNum * effectiveUnitCost)));
    }
  }, [effectiveUnitCost]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Today's bar movements ──
  const today        = todayStr();
  const todayEntries = useMemo(
    () => invMovements.filter(
      (m) => m.source === 'bar' && format(new Date(m.timestamp), 'yyyy-MM-dd') === today
    ),
    [invMovements, today],
  );

  // ── Stats ──
  const totalSpend  = useMemo(
    () => todayEntries.filter((m) => m.quantity >= 0).reduce((s, m) => s + (m.totalCost ?? 0), 0),
    [todayEntries],
  );
  const uniqueItems = useMemo(
    () => new Set(todayEntries.map((m) => m.productId)).size,
    [todayEntries],
  );

  // ── Submit ──
  const handleSubmit = () => {
    if (!selectedProduct) { toast.error('Select a product first'); return; }
    const qtyNum = Number(qty);
    if (!qty || qtyNum <= 0) { toast.error('Enter a valid quantity'); return; }

    // Compute signed base-unit change
    let baseUnitChange = 0;
    let resolvedContainerUnit = selectedProduct.qtyUnit;

    // sizeMultiplier = ratio of this portion's ml to one full bottle's ml.
    // Used by the store to normalize costPerBottle back to a full-bottle basis.
    let sizeMultiplier = 1;

    if (selectedProduct.productType === 'alcohol') {
      const alcProd = alcoholProducts.find((p) => p.id === productId);
      if (!alcProd) return;
      baseUnitChange = qtyNum * portionMl;
      resolvedContainerUnit = ALCOHOL_PORTIONS[portionKey].containerUnit;
      if (alcProd.bottleSizeMl > 0) {
        sizeMultiplier = portionMl / alcProd.bottleSizeMl;
      }
    } else if (selectedProduct.productType === 'beverage') {
      baseUnitChange = qtyNum;           // qty is already in pieces
    } else {
      const prod = cigaretteProducts.find((p) => p.id === productId);
      if (!prod) return;
      baseUnitChange = qtyNum * prod.sticksPerPacket;
    }
    if (entryType === 'Spill/Loss') baseUnitChange = -baseUnitChange;

    addBarMovement({
      productType:    selectedProduct.productType,
      productId,
      productName:    selectedProduct.name,
      entryType,
      containerQty:   qtyNum,
      containerUnit:  resolvedContainerUnit,
      baseUnitChange,
      totalCost:      entryType === 'Restock' ? (Number(totalCost) || 0) : 0,
      supplier:       supplier.trim(),
      loggedBy:       currentUser?.name ?? 'Staff',
      sizeMultiplier,
    });

    toast.success(`${entryType} logged — ${selectedProduct.name} ×${qtyNum}`);
    setQty('');
    setTotalCost('');
    setSupplier('');
    setIsCostEditedByUser(false);
  };

  // ── Delete (reverses stock via deleteBarMovement) ──
  const handleDelete = (m: InventoryMovement) => {
    deleteBarMovement(m.id);
    toast.success('Entry removed and stock corrected');
  };

  const barInputClass = 'w-full bg-[#181B26] border-2 border-white/20 focus:border-amber-400 text-white font-bold rounded-xl px-4 py-3.5 text-sm placeholder:text-zinc-500 outline-none transition-all shadow-inner';
  const barSelectClass = `${barInputClass} appearance-none cursor-pointer`;
  const barLabelClass = 'text-xs font-black uppercase tracking-wider text-amber-400 mb-1.5 block';

  // ── Render ──
  return (
    <AppLayout title="Bar Portal">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6">
          <StatCard
            label="Today's Entries"
            value={todayEntries.length}
            color="#818cf8"
          />
          <StatCard
            label="Total Spend Today"
            value={`Rs. ${fmt(totalSpend)}`}
            color="#34d399"
          />
          <StatCard
            label="Items Updated"
            value={uniqueItems}
            color="#60a5fa"
          />
        </div>

        {/* ── Main Content: Form + Ledger ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-start">

          {/* ── Log Entry Form ── */}
          <div className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl flex flex-col gap-4 flex-shrink-0">
            {/* Header */}
            <div className="flex items-center gap-2">
              <PackagePlus size={17} className="text-amber-400" />
              <span className="text-base font-black text-white">Log Bar Entry</span>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="text-xs font-black text-amber-400 hover:text-amber-300 uppercase tracking-wider transition-colors ml-auto cursor-pointer flex items-center gap-1"
              >
                <Plus size={12} /> New Item
              </button>
            </div>

            {/* Product select */}
            <div>
              <label className={barLabelClass}>Product</label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className={barSelectClass}
              >
                <option value="" style={{ background: '#1e293b', color: '#e2e8f0' }}>
                  — Select a product —
                </option>
                {(['alcohol', 'beverage', 'cigarette'] as InvProductType[]).map((type) => {
                  const items = allProducts.filter((p) => p.productType === type);
                  if (items.length === 0) return null;
                  return (
                    <optgroup
                      key={type}
                      label={TYPE_META[type].label}
                      style={{ background: '#0f172a', color: '#94a3b8' }}
                    >
                      {items.map((p) => (
                        <option
                          key={p.id}
                          value={p.id}
                          style={{ background: '#1e293b', color: '#f1f5f9' }}
                        >
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
              {allProducts.length === 0 && (
                <p className="text-xs font-bold text-zinc-300 mt-1.5">No active products yet — add one above.</p>
              )}
            </div>

            {/* Entry type toggle */}
            <div>
              <label className={barLabelClass}>Entry Type</label>
              <div className="flex rounded-xl p-1 gap-1 bg-black/30 border border-white/10">
                {(['Restock', 'Spill/Loss'] as const).map((t) => {
                  const active = entryType === t;
                  const m = ENTRY_TYPE_META[t];
                  const Icon = m.icon;
                  return (
                    <button
                      key={t}
                      onClick={() => setEntryType(t)}
                      className={active
                        ? t === 'Restock'
                          ? 'flex-1 py-3 rounded-xl bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider border-2 border-amber-400 shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-1.5'
                          : 'flex-1 py-3 rounded-xl bg-rose-500 text-white font-black text-xs uppercase tracking-wider border-2 border-rose-400 shadow-md shadow-rose-500/20 transition-all flex items-center justify-center gap-1.5'
                        : 'flex-1 py-3 rounded-xl bg-white/5 text-zinc-300 hover:text-white border border-white/15 text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5'}
                    >
                      <Icon size={13} />
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Size / Portion — only for alcohol */}
            {selectedProduct?.productType === 'alcohol' && (
              <div>
                <label className={barLabelClass}>Size / Portion</label>
                <div
                  className="grid grid-cols-5 gap-1 rounded-lg p-1"
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  {PORTION_KEYS.map((key) => {
                    const p = ALCOHOL_PORTIONS[key];
                    const active = portionKey === key;
                    const alcProd = alcoholProducts.find((ap) => ap.id === productId);
                    const mlDisplay = p.mlFixed !== undefined
                      ? `${p.mlFixed} ml`
                      : alcProd
                        ? `${Math.round(alcProd.bottleSizeMl * (p.factor ?? 1))} ml`
                        : `×${p.factor ?? ''}`;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPortionKey(key)}
                        className="flex flex-col items-center justify-center py-2 rounded-md text-center transition-all"
                        style={active ? {
                          background: 'rgba(129,140,248,0.2)',
                          border: '1px solid rgba(129,140,248,0.4)',
                          color: '#a5b4fc',
                        } : {
                          color: 'rgba(255,255,255,0.35)',
                          border: '1px solid transparent',
                        }}
                      >
                        <span className="text-[11px] font-semibold leading-tight">{p.label}</span>
                        <span className="text-[10px] font-normal mt-0.5 opacity-70 leading-tight">{mlDisplay}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div>
              <label className={barLabelClass}>
                Quantity
                {selectedProduct && (
                  <span className="ml-1.5 text-white/30 normal-case font-normal tracking-normal">
                    ({selectedProduct.productType === 'alcohol'
                      ? ALCOHOL_PORTIONS[portionKey].containerUnit
                      : selectedProduct.qtyUnit})
                  </span>
                )}
              </label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={qty}
                onChange={(e) => {
                  const newQty = e.target.value;
                  setQty(newQty);
                  // Auto-fill Total Cost only when user hasn't manually overridden it
                  if (!isCostEditedByUser && effectiveUnitCost !== null && entryType === 'Restock') {
                    const qtyNum = parseFloat(newQty);
                    setTotalCost(!isNaN(qtyNum) && qtyNum > 0
                      ? String(Math.round(qtyNum * effectiveUnitCost))
                      : '');
                  }
                }}
                className={barInputClass}
              />
              {/* Volume preview — only for alcohol with a valid qty */}
              {selectedProduct?.productType === 'alcohol' && Number(qty) > 0 && portionMl > 0 && (
                <p className="text-[11px] mt-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {entryType === 'Restock' ? 'Adding' : 'Removing'}{' '}
                  <span style={{ color: '#a5b4fc' }}>
                    {Number(qty)}× {ALCOHOL_PORTIONS[portionKey].label}
                  </span>
                  {' = '}
                  <span style={{ color: '#34d399' }}>
                    {Number(qty) * portionMl} ml
                  </span>
                  {' total stock'}
                </p>
              )}
            </div>

            {/* Cost + Supplier — only for Restock */}
            {entryType === 'Restock' && (
              <>
                <div>
                   <label className={barLabelClass}>Total Cost (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={totalCost}
                    onChange={(e) => {
                      setTotalCost(e.target.value);
                      setIsCostEditedByUser(true);
                    }}
                     className={`${barInputClass} ${isCostEditedByUser ? 'border-amber-400/60' : ''}`}
                  />
                  {totalCost !== '' && (
                    <p className="mt-1.5 text-[11px] leading-snug" style={{
                      color: isCostEditedByUser
                        ? 'rgba(251,191,36,0.75)'
                        : 'rgba(255,255,255,0.3)',
                    }}>
                      {isCostEditedByUser
                        ? '✏️ Custom cost entered. This will update the item\'s master base price upon saving.'
                        : '💡 Auto-filled from last unit price. Override if today\'s bill is different.'}
                    </p>
                  )}
                </div>
                <div>
                   <label className={barLabelClass}>
                    Supplier / Payment Source
                  </label>
                  <input
                    type="text"
                    placeholder="Cash, Credit, Supplier name…"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                     className={barInputClass}
                  />
                </div>
              </>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
               className="w-full py-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all active:scale-[0.98] mt-2"
            >
              + Log {entryType}
            </button>
          </div>

          {/* ── Today's Ledger ── */}
          <div className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl flex-1 flex flex-col">
            {/* Ledger header */}
            <div
              className="flex items-center justify-between mb-4"
            >
              <span className="text-base font-black text-white tracking-wide">Today's Restocks</span>
              <span className="px-3 py-1 rounded-lg bg-white/10 border border-white/15 text-xs font-black font-mono text-zinc-200">
                {today}
              </span>
            </div>

            {/* Ledger body */}
            {todayEntries.length === 0 ? (
              <div className="flex-1 min-h-[300px] flex flex-col items-center justify-center text-center gap-2 p-8 border-2 border-dashed border-white/10 rounded-2xl bg-white/[0.02] mt-4">
                <GlassWater size={36} className="text-4xl text-zinc-400 mb-1" />
                <p className="text-sm font-black text-white">No restock entries recorded today.</p>
                <p className="text-xs font-bold text-zinc-300">Use the form on the left to record incoming stock or loss.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {/* Table header */}
                <div
                  className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-3 px-4 py-2"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                >
                  {['Item', 'Type', 'Qty', 'Cost', 'Logged By', ''].map((h) => (
                    <span key={h} className="text-[10px] font-semibold text-white/30 uppercase tracking-wide">{h}</span>
                  ))}
                </div>

                {todayEntries.map((m) => (
                  <LedgerRow key={m.id} entry={m} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick-Add Product Modal ── */}
      {showAddModal && (
        <QuickAddModal
          existingNames={allProducts.map((p) => p.name)}
          currentUser={currentUser}
          onClose={() => setShowAddModal(false)}
          onCreated={handleProductCreated}
        />
      )}
    </AppLayout>
  );
};

// ── Ledger Row ────────────────────────────────────────────────────────────────

function LedgerRow({
  entry,
  onDelete,
}: {
  entry: InventoryMovement;
  onDelete: (m: InventoryMovement) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const entryType = entry.quantity >= 0 ? 'Restock' : 'Spill/Loss';
  const displayQty  = entry.containerQty !== undefined ? Math.abs(entry.containerQty) : Math.abs(entry.quantity);
  const displayUnit = entry.containerUnit ?? entry.unit;

  const handleDeleteClick = () => {
    if (!confirming) { setConfirming(true); setTimeout(() => setConfirming(false), 3000); return; }
    onDelete(entry);
  };

  return (
    <div className="px-4 py-3">
      {/* Mobile layout */}
      <div className="sm:hidden space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-white/85">{entry.productName}</span>
            <CategoryBadge productType={entry.productType} />
            <EntryTypeBadge entryType={entryType} />
          </div>
          <button
            onClick={handleDeleteClick}
            className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-all active:scale-95"
            style={confirming ? {
              background: 'rgba(239,68,68,0.2)',
              border: '1px solid rgba(239,68,68,0.4)',
              color: '#f87171',
            } : {
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.35)',
            }}
          >
            <Trash2 size={11} />
            {confirming ? 'Confirm?' : ''}
          </button>
        </div>
        <div className="flex gap-3 text-xs text-white/45">
          <span>{displayQty} {displayUnit}</span>
          {(entry.totalCost ?? 0) > 0 && <span>Rs. {fmt(entry.totalCost!)}</span>}
          {entry.supplier && <span>· {entry.supplier}</span>}
          <span>· {entry.loggedBy ?? 'Staff'}</span>
          <span>· {fmtTime(entry.timestamp)}</span>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-3 items-center">
        {/* Item */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white/85 truncate">{entry.productName}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <CategoryBadge productType={entry.productType} />
              {entry.supplier && (
                <span className="text-[10px] text-white/30">{entry.supplier}</span>
              )}
            </div>
          </div>
        </div>

        {/* Entry type */}
        <EntryTypeBadge entryType={entryType} />

        {/* Qty */}
        <span className="text-sm text-white/70 text-right whitespace-nowrap">
          {displayQty} <span className="text-white/35 text-xs">{displayUnit}</span>
        </span>

        {/* Cost */}
        <span className="text-sm text-white/70 text-right whitespace-nowrap min-w-[80px]">
          {(entry.totalCost ?? 0) > 0 ? `Rs. ${fmt(entry.totalCost!)}` : <span className="text-white/25">—</span>}
        </span>

        {/* Logged by + time */}
        <div className="text-right">
          <p className="text-xs text-white/55 font-medium">{entry.loggedBy ?? 'Staff'}</p>
          <p className="text-[10px] text-white/30">{fmtTime(entry.timestamp)}</p>
        </div>

        {/* Delete */}
        <button
          onClick={handleDeleteClick}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-all active:scale-95 whitespace-nowrap"
          style={confirming ? {
            background: 'rgba(239,68,68,0.2)',
            border: '1px solid rgba(239,68,68,0.4)',
            color: '#f87171',
          } : {
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          <Trash2 size={11} />
          {confirming ? 'Confirm?' : 'Remove'}
        </button>
      </div>
    </div>
  );
}

// ── Quick-Add Product Modal ───────────────────────────────────────────────────

function QuickAddModal({
  existingNames,
  currentUser,
  onClose,
  onCreated,
}: {
  existingNames: string[];
  currentUser: { id: string; name: string; role?: string } | null;
  onClose: () => void;
  onCreated: (newProductId: string) => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);

  // ── Form state ──
  const [rawName,      setRawName]      = useState('');
  const [category,     setCategory]     = useState<InvProductType>('alcohol');
  const [unitType,     setUnitType]     = useState(CATEGORY_UNITS.alcohol[0].value);
  const [itemsPerUnit, setItemsPerUnit] = useState(ITEMS_META.alcohol.default);
  const [initQty,      setInitQty]      = useState('');
  const [initCost,     setInitCost]     = useState('');

  useEffect(() => { nameRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleCategoryChange = (cat: InvProductType) => {
    setCategory(cat);
    setUnitType(CATEGORY_UNITS[cat][0].value);
    setItemsPerUnit(ITEMS_META[cat].default);
  };

  const displayName = toTitleCase(rawName.trim());
  const dupMatch    = displayName.length > 0
    ? existingNames.find((n) => n.toLowerCase() === displayName.toLowerCase())
    : undefined;
  const isDuplicate = Boolean(dupMatch);
  const canSubmit   = displayName.length > 0 && !isDuplicate && itemsPerUnit > 0;

  // ── Save ──
  const handleSave = () => {
    if (!canSubmit) return;

    const now = Date.now();
    const inv = useInventoryStore.getState();

    let newId = '';

    if (category === 'alcohol') {
      inv.addAlcohol({ name: displayName, bottleSizeMl: itemsPerUnit, currentStockMl: 0, minStockMl: 0, status: 'active' });
      newId = useInventoryStore.getState().alcoholProducts.find((p) => p.name === displayName)?.id ?? '';
    } else if (category === 'beverage') {
      inv.addBeverage({ name: displayName, category: 'soft-drinks', packagingType: 'pcs', currentStock: 0, minStock: 0, status: 'active' });
      newId = useInventoryStore.getState().beverageProducts.find((p) => p.name === displayName)?.id ?? '';
    } else {
      inv.addCigarette({ name: displayName, sticksPerPacket: itemsPerUnit, currentSticks: 0, minSticks: 0, status: 'active' });
      newId = useInventoryStore.getState().cigaretteProducts.find((p) => p.name === displayName)?.id ?? '';
    }

    if (!newId) { toast.error('Failed to create product — please try again'); return; }

    // Optional initial restock via unified bar movement
    const initQtyNum  = Number(initQty);
    const initCostNum = Number(initCost) || 0;

    if (initQtyNum > 0) {
      const qtyUnitMap: Record<InvProductType, string> = { alcohol: 'bottles', beverage: 'pcs', cigarette: 'packets' };

      let baseUnitChange = 0;
      if (category === 'alcohol') {
        baseUnitChange = initQtyNum * itemsPerUnit;
      } else if (category === 'beverage') {
        baseUnitChange = initQtyNum;
      } else {
        baseUnitChange = initQtyNum * itemsPerUnit;
      }

      useInventoryStore.getState().addBarMovement({
        productType:   category,
        productId:     newId,
        productName:   displayName,
        entryType:     'Restock',
        containerQty:  initQtyNum,
        containerUnit: qtyUnitMap[category],
        baseUnitChange,
        totalCost:     initCostNum,
        supplier:      '',
        loggedBy:      currentUser?.name ?? 'Staff',
      });
    }

    toast.success(`${displayName} added to inventory`);
    onCreated(newId);
  };

  // ── Shared modal styles ──
  const mInput = 'bg-[#181B26] border-2 border-white/20 focus:border-amber-400 text-white font-bold rounded-xl px-4 py-3 text-sm placeholder:text-zinc-500 outline-none w-full';
  const mSelect = `${mInput} appearance-none cursor-pointer`;
  const mLabel = 'text-xs font-black uppercase tracking-wider text-amber-400 mb-1.5 block';
  const optStyle: React.CSSProperties = { background: '#181B26', color: '#f1f5f9' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="max-w-md w-full p-7 rounded-[28px] bg-[#0E1017] border border-white/20 shadow-2xl shadow-black text-white relative flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-lg font-black text-white tracking-tight flex items-center gap-2">
            <Plus size={18} className="text-amber-400" />
            Add New Product
          </p>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all"
          >
            <X size={15} />
          </button>
        </div>

        {/* Product Name */}
        <div>
          <label className={mLabel}>Product Name</label>
          <input
            ref={nameRef}
            type="text"
            placeholder="e.g. Tuborg Beer"
            value={rawName}
            onChange={(e) => setRawName(e.target.value)}
            className={`${mInput} ${isDuplicate ? 'border-rose-500/60' : ''}`}
          />
          {isDuplicate && (
            <p className="mt-1.5 text-xs font-bold text-rose-400">
              ⚠ <strong>{dupMatch}</strong> already exists — select it from the dropdown.
            </p>
          )}
          {!isDuplicate && displayName.length > 0 && (
            <p className="mt-1.5 text-[11px] text-zinc-400">
              Will be saved as: <span className="text-amber-400 font-bold">{displayName}</span>
            </p>
          )}
        </div>

        {/* Category */}
        <div>
          <label className={mLabel}>Category</label>
          <select
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value as InvProductType)}
            className={mSelect}
          >
            <option value="alcohol"   style={optStyle}>Alcohol</option>
            <option value="beverage"  style={optStyle}>Beverage</option>
            <option value="cigarette" style={optStyle}>Cigarette</option>
          </select>
        </div>

        {/* Unit Type + Items per Unit — side by side */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={mLabel}>Unit Type</label>
            <select
              value={unitType}
              onChange={(e) => setUnitType(e.target.value)}
              className={mSelect}
            >
              {CATEGORY_UNITS[category].map((u) => (
                <option key={u.value} value={u.value} style={optStyle}>{u.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={mLabel}>{ITEMS_META[category].label}</label>
            <input
              type="number"
              min="1"
              step="1"
              placeholder={ITEMS_META[category].placeholder}
              value={itemsPerUnit}
              onChange={(e) => setItemsPerUnit(Math.max(1, Number(e.target.value) || 1))}
              className={mInput}
            />
          </div>
        </div>

        {/* Initial Restock (optional) */}
        <div className="rounded-2xl p-4 space-y-3 bg-white/[0.03] border border-white/10">
          <p className="text-xs font-black uppercase tracking-wider text-zinc-400">
            Initial Restock <span className="text-zinc-600 font-normal normal-case tracking-normal">(optional)</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={mLabel}>Opening Qty</label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={initQty}
                onChange={(e) => setInitQty(e.target.value)}
                className={mInput}
              />
            </div>
            <div>
              <label className={mLabel}>Total Cost</label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={initCost}
                onChange={(e) => setInitCost(e.target.value)}
                className={mInput}
              />
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-black text-xs uppercase tracking-wider transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSubmit}
            className={canSubmit
              ? 'flex-1 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all'
              : 'flex-1 py-3.5 rounded-xl bg-white/5 text-white/20 font-black text-xs uppercase tracking-wider cursor-not-allowed'}
          >
            Add to Inventory
          </button>
        </div>
      </div>
    </div>
  );
}

export default BarPortal;
