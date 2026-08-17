import { useState } from 'react';
import { Package, Receipt, Activity, X, ClipboardList } from 'lucide-react';
import { PackagedStockTab } from './inventory/PackagedStockTab';
import { PurchasesSection } from './inventory/PurchasesSection';
import { MovementsSection } from './inventory/MovementsSection';
import { BarRestockAudit } from './inventory/BarRestockAudit';

// ── Types ─────────────────────────────────────────────────────────────────────

type PillarTab = 'bar-stock';
type SecondaryView = 'purchases' | 'movements' | 'bar-audit' | null;

interface PillarDef {
  id:    PillarTab;
  label: string;
  Icon:  React.ComponentType<any>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PILLARS: PillarDef[] = [
  { id: 'bar-stock', label: 'Packaged & Bar Stock', Icon: Package },
];

// ── Slide-over drawer wrapper ─────────────────────────────────────────────────

interface DrawerProps {
  title:       string;
  description: string;
  onClose:     () => void;
  children:    React.ReactNode;
}

const Drawer = ({ title, description, onClose, children }: DrawerProps) => (
    <div className="fixed inset-0 z-50">
    {/* Backdrop */}
    <div
      className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    />
    {/* Panel */}
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col text-slate-100 overflow-hidden">
      {/* Drawer header */}
      <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-slate-800/80 flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <p className="text-slate-400 text-xs font-medium mt-1">{description}</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
          aria-label={`Close ${title}`}
        >
          <X size={17} />
        </button>
      </div>
      {/* Drawer content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {children}
      </div>
    </div>
  </div>
);

// ── Secondary button helper ───────────────────────────────────────────────────

interface SecBtnProps {
  id: SecondaryView;
  active: SecondaryView;
  label: string;
  Icon: React.ComponentType<any>;
  activeStyle?: React.CSSProperties;
  onClick: (id: SecondaryView) => void;
}

const SecBtn = ({ id, active, label, Icon, activeStyle, onClick }: SecBtnProps) => {
  const isActive = active === id;
  return (
    <button
      onClick={() => onClick(isActive ? null : id)}
      className={isActive
        ? 'px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all flex items-center gap-2 active:scale-95'
        : 'px-5 py-2.5 rounded-xl bg-[#13151F] text-zinc-300 hover:text-white border border-white/15 hover:border-white/30 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95'}
    >
      <Icon size={13} />
      {label}
    </button>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

export const InventorySection = () => {
  const [activePillar,        setActivePillar]        = useState<PillarTab>('bar-stock');
  const [activeSecondaryView, setActiveSecondaryView] = useState<SecondaryView>(null);

  const closeSecondary = () => setActiveSecondaryView(null);

  return (
    <div className="space-y-5">

      {/* ── Section header: pillar tabs + secondary action buttons ─────────── */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Pillar tab bar */}
        <div
          className="flex flex-wrap items-center gap-2"
        >
          {PILLARS.map(({ id, label, Icon }) => {
            const isActive = id === activePillar;
            return (
              <button
                key={id}
                onClick={() => setActivePillar(id)}
                className={isActive
                  ? 'px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all flex items-center gap-2 active:scale-95'
                  : 'px-5 py-2.5 rounded-xl bg-[#13151F] text-zinc-300 hover:text-white border border-white/15 hover:border-white/30 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95'}
              >
                <Icon size={14} />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden text-xs">{label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Secondary action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <SecBtn
            id="purchases"
            active={activeSecondaryView}
            label="Purchases Ledger"
            Icon={Receipt}
            activeStyle={{ background: 'rgba(249,115,22,0.18)', border: '1px solid rgba(249,115,22,0.35)', color: '#fb923c' }}
            onClick={setActiveSecondaryView}
          />
          <SecBtn
            id="movements"
            active={activeSecondaryView}
            label="Stock Movements"
            Icon={Activity}
            activeStyle={{ background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc' }}
            onClick={setActiveSecondaryView}
          />
          <SecBtn
            id="bar-audit"
            active={activeSecondaryView}
            label="Bar Restock Audit"
            Icon={ClipboardList}
            activeStyle={{ background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }}
            onClick={setActiveSecondaryView}
          />
        </div>
      </div>

      {/* ── Pillar content ────────────────────────────────────────────────── */}
      {activePillar === 'bar-stock' && <PackagedStockTab />}

      {/* ── Secondary slide-over drawers ──────────────────────────────────── */}
      {activeSecondaryView === 'purchases' && (
        <Drawer
          title="Purchases Ledger"
          description="Every purchase and restock recorded across your inventory."
          onClose={closeSecondary}
        >
          <PurchasesSection />
        </Drawer>
      )}

      {activeSecondaryView === 'movements' && (
        <Drawer
          title="Stock Movements"
          description="A live audit trail of stock flowing in, out, and through corrections."
          onClose={closeSecondary}
        >
          <MovementsSection />
        </Drawer>
      )}

      {activeSecondaryView === 'bar-audit' && (
        <Drawer
          title="Bar Restock Audit"
          description="Review, correct, and reconcile bar restocks, spills, and losses."
          onClose={closeSecondary}
        >
          <BarRestockAudit />
        </Drawer>
      )}
    </div>
  );
};
