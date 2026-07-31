import { useState } from 'react';
import { Package, ShoppingCart, UtensilsCrossed, Receipt, Activity, X } from 'lucide-react';
import { PackagedStockTab } from './inventory/PackagedStockTab';
import { KitchenGroceriesTab } from './inventory/KitchenGroceriesTab';
import { PurchasesSection } from './inventory/PurchasesSection';
import { MovementsSection } from './inventory/MovementsSection';
import { MeatPrepLogsTab } from './inventory/MeatPrepLogsTab';

// ── Types ─────────────────────────────────────────────────────────────────────

type PillarTab = 'bar-stock' | 'kitchen' | 'meat-prep';
type SecondaryView = 'purchases' | 'movements' | null;

interface PillarDef {
  id:    PillarTab;
  label: string;
  Icon:  React.ComponentType<{ size?: number; className?: string }>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PILLARS: PillarDef[] = [
  { id: 'bar-stock', label: 'Packaged & Bar Stock', Icon: Package          },
  { id: 'kitchen',   label: 'Kitchen Groceries',    Icon: ShoppingCart     },
  { id: 'meat-prep', label: 'Meat Prep Logs',        Icon: UtensilsCrossed },
];

// ── Shared card style (matches KitchenPortal / AdminPanel dark theme) ─────────

const CARD_STYLE: React.CSSProperties = {
  background: 'linear-gradient(160deg, #0f1929 0%, #0b1220 100%)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '1rem',
  padding: '2rem',
};


// ── Slide-over drawer wrapper ─────────────────────────────────────────────────

interface DrawerProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

const Drawer = ({ title, onClose, children }: DrawerProps) => (
  <div className="fixed inset-0 z-50 flex justify-end">
    {/* Backdrop */}
    <div
      className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    />
    {/* Panel */}
    <div
      className="relative flex flex-col w-full max-w-2xl h-full overflow-hidden shadow-2xl"
      style={{ background: 'linear-gradient(160deg, #0d1626 0%, #080f1a 100%)', borderLeft: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Drawer header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07] flex-shrink-0">
        <h2 className="text-base font-semibold text-white/90">{title}</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <X size={16} />
        </button>
      </div>
      {/* Drawer content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {children}
      </div>
    </div>
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────────

export const InventorySection = () => {
  const [activePillar,       setActivePillar]       = useState<PillarTab>('bar-stock');
  const [activeSecondaryView, setActiveSecondaryView] = useState<SecondaryView>(null);

  const openSecondary  = (v: SecondaryView) => setActiveSecondaryView(v);
  const closeSecondary = () => setActiveSecondaryView(null);

  return (
    <div className="space-y-5">

      {/* ── Section header: pillar tabs + secondary action buttons ─────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">

        {/* Pillar tab bar */}
        <div
          className="flex items-center gap-1 p-1 rounded-xl flex-1"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {PILLARS.map(({ id, label, Icon }) => {
            const isActive = id === activePillar;
            return (
              <button
                key={id}
                onClick={() => setActivePillar(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                  isActive
                    ? 'text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                }`}
                style={isActive ? {
                  background: 'linear-gradient(135deg, rgba(249,115,22,0.22) 0%, rgba(234,88,12,0.15) 100%)',
                  border: '1px solid rgba(249,115,22,0.35)',
                  color: '#fb923c',
                } : undefined}
              >
                <Icon size={14} />
                <span className="hidden sm:inline">{label}</span>
                {/* Mobile: icon-only label */}
                <span className="sm:hidden text-xs">{label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Secondary action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => openSecondary(activeSecondaryView === 'purchases' ? null : 'purchases')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeSecondaryView === 'purchases'
                ? 'text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            style={activeSecondaryView === 'purchases'
              ? { background: 'rgba(249,115,22,0.18)', border: '1px solid rgba(249,115,22,0.35)', color: '#fb923c' }
              : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }
            }
          >
            <Receipt size={13} />
            Purchases Ledger
          </button>
          <button
            onClick={() => openSecondary(activeSecondaryView === 'movements' ? null : 'movements')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeSecondaryView === 'movements'
                ? 'text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            style={activeSecondaryView === 'movements'
              ? { background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc' }
              : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }
            }
          >
            <Activity size={13} />
            Stock Movements
          </button>
        </div>
      </div>

      {/* ── Pillar content ────────────────────────────────────────────────── */}
      {activePillar === 'bar-stock' && (
        <PackagedStockTab />
      )}

      {activePillar === 'kitchen' && (
        <KitchenGroceriesTab />
      )}

      {activePillar === 'meat-prep' && (
        <MeatPrepLogsTab />
      )}

      {/* ── Secondary slide-over drawers ──────────────────────────────────── */}
      {activeSecondaryView === 'purchases' && (
        <Drawer title="Purchases Ledger" onClose={closeSecondary}>
          <PurchasesSection />
        </Drawer>
      )}

      {activeSecondaryView === 'movements' && (
        <Drawer title="Stock Movements" onClose={closeSecondary}>
          <MovementsSection />
        </Drawer>
      )}
    </div>
  );
};
