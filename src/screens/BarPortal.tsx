import { useState, useMemo, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { GlassWater, PackagePlus, Trash2, TrendingDown, TrendingUp, BarChart3, ShoppingBag, Plus, X } from 'lucide-react';
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
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl flex-1 min-w-0"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div
        className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg"
        style={{ background: `${color}20`, border: `1px solid ${color}40` }}
      >
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-white/45 uppercase tracking-wide truncate">{label}</p>
        <p className="text-lg font-bold text-white/90 leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-white/35 truncate">{sub}</p>}
      </div>
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
  const [showAddModal, setShowAddModal] = useState(false);

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
      if (!p?.costPerCarton || p.piecesPerCarton <= 0) return null;
      return p.costPerCarton / p.piecesPerCarton;  // cost per piece (qty unit is pieces)
    }
    if (selectedProduct.productType === 'cigarette') {
      return cigaretteProducts.find((p) => p.id === productId)?.costPerPacket ?? null;
    }
    return null;
  }, [selectedProduct, productId, alcoholProducts, beverageProducts, cigaretteProducts]);

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
    if (selectedProduct.productType === 'alcohol') {
      const prod = alcoholProducts.find((p) => p.id === productId);
      if (!prod) return;
      baseUnitChange = qtyNum * prod.bottleSizeMl;
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
      containerUnit:  selectedProduct.qtyUnit,
      baseUnitChange,
      totalCost:      entryType === 'Restock' ? (Number(totalCost) || 0) : 0,
      supplier:       supplier.trim(),
      loggedBy:       currentUser?.name ?? 'Staff',
    });

    toast.success(`${entryType} logged — ${selectedProduct.name} ×${qtyNum}`);
    setQty('');
    setTotalCost('');
    setSupplier('');
  };

  // ── Delete (reverses stock via deleteBarMovement) ──
  const handleDelete = (m: InventoryMovement) => {
    deleteBarMovement(m.id);
    toast.success('Entry removed and stock corrected');
  };

  // ── Input style ──
  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: 'rgba(255,255,255,0.85)',
    outline: 'none',
    width: '100%',
    padding: '8px 12px',
    fontSize: 14,
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    colorScheme: 'dark',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 6,
    display: 'block',
  };

  // ── Render ──
  return (
    <AppLayout title="Bar Portal">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── Stat Cards ── */}
        <div className="flex gap-3 flex-wrap">
          <StatCard
            label="Today's Entries"
            value={todayEntries.length}
            sub={todayEntries.length === 1 ? '1 log entry' : `${todayEntries.length} log entries`}
            icon={BarChart3}
            color="#818cf8"
          />
          <StatCard
            label="Total Spend Today"
            value={`Rs. ${fmt(totalSpend)}`}
            sub="Restocks only"
            icon={ShoppingBag}
            color="#34d399"
          />
          <StatCard
            label="Items Updated"
            value={uniqueItems}
            sub={uniqueItems === 1 ? 'unique product' : 'unique products'}
            icon={GlassWater}
            color="#60a5fa"
          />
        </div>

        {/* ── Main Content: Form + Ledger ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-start">

          {/* ── Log Entry Form ── */}
          <div
            className="rounded-xl p-5 space-y-4 flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-2">
              <div
                className="flex items-center justify-center w-7 h-7 rounded-lg"
                style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.35)' }}
              >
                <PackagePlus size={14} style={{ color: '#818cf8' }} />
              </div>
              <span className="text-sm font-semibold text-white/80">Log Bar Entry</span>
            </div>

            {/* Product select */}
            <div>
              <label style={labelStyle}>Product</label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                style={selectStyle}
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
              <div className="flex items-center justify-between mt-1.5">
                {allProducts.length === 0 ? (
                  <p className="text-xs text-white/30">
                    No active products yet — add one below.
                  </p>
                ) : <span />}
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1 text-xs font-semibold transition-colors"
                  style={{ color: '#818cf8' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#a5b4fc')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#818cf8')}
                >
                  <Plus size={11} />
                  New Item
                </button>
              </div>
            </div>

            {/* Entry type toggle */}
            <div>
              <label style={labelStyle}>Entry Type</label>
              <div
                className="flex rounded-lg p-1 gap-1"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {(['Restock', 'Spill/Loss'] as const).map((t) => {
                  const active = entryType === t;
                  const m = ENTRY_TYPE_META[t];
                  const Icon = m.icon;
                  return (
                    <button
                      key={t}
                      onClick={() => setEntryType(t)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-all"
                      style={active ? {
                        background: m.bg,
                        border: `1px solid ${m.border}`,
                        color: m.text,
                      } : {
                        color: 'rgba(255,255,255,0.35)',
                      }}
                    >
                      <Icon size={13} />
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label style={labelStyle}>
                Quantity
                {selectedProduct && (
                  <span className="ml-1.5 text-white/30 normal-case font-normal tracking-normal">
                    ({selectedProduct.qtyUnit})
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
                  // Auto-fill Total Cost when unit cost is available
                  if (unitCost !== null && entryType === 'Restock') {
                    const qtyNum = parseFloat(newQty);
                    setTotalCost(!isNaN(qtyNum) && qtyNum > 0
                      ? String(Math.round(qtyNum * unitCost))
                      : '');
                  }
                }}
                style={inputStyle}
              />
            </div>

            {/* Cost + Supplier — only for Restock */}
            {entryType === 'Restock' && (
              <>
                <div>
                  <label style={labelStyle}>Total Cost (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={totalCost}
                    onChange={(e) => setTotalCost(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>
                    Supplier / Payment Source
                    <span className="ml-1 text-white/25 font-normal tracking-normal normal-case">optional</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Cash, Credit, Supplier name…"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              className="w-full py-2.5 rounded-lg text-sm font-bold transition-all active:scale-95 hover:brightness-110"
              style={{
                background: entryType === 'Restock'
                  ? 'linear-gradient(135deg, rgba(16,185,129,0.8) 0%, rgba(5,150,105,0.8) 100%)'
                  : 'linear-gradient(135deg, rgba(239,68,68,0.8) 0%, rgba(185,28,28,0.8) 100%)',
                color: '#fff',
                border: entryType === 'Restock'
                  ? '1px solid rgba(16,185,129,0.5)'
                  : '1px solid rgba(239,68,68,0.5)',
              }}
            >
              + Log {entryType}
            </button>
          </div>

          {/* ── Today's Ledger ── */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {/* Ledger header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              <span className="text-sm font-semibold text-white/70">Today's Restocks</span>
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}
              >
                {today}
              </span>
            </div>

            {/* Ledger body */}
            {todayEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <GlassWater size={32} className="text-white/15" />
                <p className="text-sm text-white/30 font-medium">No entries logged today</p>
                <p className="text-xs text-white/20">Use the form to log restocks or losses</p>
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
      inv.addBeverage({ name: displayName, piecesPerCarton: itemsPerUnit, currentStock: 0, minStock: 0, status: 'active' });
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

  // ── Shared styles ──
  const fieldStyle: React.CSSProperties = {
    background: '#1e293b',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color: '#f1f5f9',
    outline: 'none',
    width: '100%',
    padding: '8px 12px',
    fontSize: 14,
    colorScheme: 'dark',
  };
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, display: 'block',
  };
  const optStyle: React.CSSProperties = { background: '#1e293b', color: '#f1f5f9' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 space-y-5"
        style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg"
              style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.35)' }}
            >
              <Plus size={15} style={{ color: '#818cf8' }} />
            </div>
            <div>
              <p className="text-sm font-bold text-white/90">Add New Product</p>
              <p className="text-[11px] text-white/35">Item will be added to inventory immediately</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
            style={{ color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.05)' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Product Name */}
        <div>
          <label style={lbl}>Product Name</label>
          <input
            ref={nameRef}
            type="text"
            placeholder="e.g. Tuborg Beer"
            value={rawName}
            onChange={(e) => setRawName(e.target.value)}
            style={{
              ...fieldStyle,
              borderColor: isDuplicate ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.12)',
            }}
          />
          {isDuplicate && (
            <p className="mt-1.5 text-xs font-medium" style={{ color: '#f87171' }}>
              ⚠ <strong>{dupMatch}</strong> already exists — select it from the dropdown.
            </p>
          )}
          {!isDuplicate && displayName.length > 0 && (
            <p className="mt-1.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Will be saved as: <span style={{ color: '#a5b4fc' }}>{displayName}</span>
            </p>
          )}
        </div>

        {/* Category */}
        <div>
          <label style={lbl}>Category</label>
          <select
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value as InvProductType)}
            style={fieldStyle}
          >
            <option value="alcohol"   style={optStyle}>Alcohol</option>
            <option value="beverage"  style={optStyle}>Beverage</option>
            <option value="cigarette" style={optStyle}>Cigarette</option>
          </select>
        </div>

        {/* Unit Type + Items per Unit — side by side */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={lbl}>Unit Type</label>
            <select
              value={unitType}
              onChange={(e) => setUnitType(e.target.value)}
              style={fieldStyle}
            >
              {CATEGORY_UNITS[category].map((u) => (
                <option key={u.value} value={u.value} style={optStyle}>{u.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>{ITEMS_META[category].label}</label>
            <input
              type="number"
              min="1"
              step="1"
              placeholder={ITEMS_META[category].placeholder}
              value={itemsPerUnit}
              onChange={(e) => setItemsPerUnit(Math.max(1, Number(e.target.value) || 1))}
              style={fieldStyle}
            />
          </div>
        </div>

        {/* Initial Restock (optional) */}
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Initial Restock <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={lbl}>Opening Qty</label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={initQty}
                onChange={(e) => setInitQty(e.target.value)}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={lbl}>Total Cost (Rs.)</label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={initCost}
                onChange={(e) => setInitCost(e.target.value)}
                style={fieldStyle}
              />
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSubmit}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all active:scale-95"
            style={canSubmit ? {
              background: 'linear-gradient(135deg, rgba(99,102,241,0.9) 0%, rgba(79,70,229,0.9) 100%)',
              border: '1px solid rgba(99,102,241,0.5)',
              color: '#fff',
            } : {
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.2)',
              cursor: 'not-allowed',
            }}
          >
            Add to Inventory
          </button>
        </div>
      </div>
    </div>
  );
}

export default BarPortal;
