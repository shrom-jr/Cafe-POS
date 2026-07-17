import { useState } from 'react';
import {
  LayoutDashboard, Wine, GlassWater, Cigarette,
  ShoppingBasket, Package, Activity,
} from 'lucide-react';
import { OverviewSection }   from './inventory/OverviewSection';
import { AlcoholSection }    from './inventory/AlcoholSection';
import { BeverageSection }   from './inventory/BeverageSection';
import { CigaretteSection }  from './inventory/CigaretteSection';
import { GrocerySection }    from './inventory/GrocerySection';
import { PurchasesSection }  from './inventory/PurchasesSection';
import { MovementsSection }  from './inventory/MovementsSection';

type InvTab =
  | 'overview'
  | 'alcohol'
  | 'beverages'
  | 'cigarettes'
  | 'groceries'
  | 'purchases'
  | 'movements';

interface TabDef {
  id:       InvTab;
  label:    string;
  subtitle: string;
  Icon:     React.ComponentType<{ size?: number; className?: string }>;
}

const TABS: TabDef[] = [
  { id: 'overview',   label: 'Overview',         subtitle: 'Stock summary and low stock alerts',         Icon: LayoutDashboard },
  { id: 'alcohol',    label: 'Alcohol',           subtitle: 'Manage spirits, wine and beer stock',        Icon: Wine            },
  { id: 'beverages',  label: 'Beverages',         subtitle: 'Soft drinks and packaged beverages',         Icon: GlassWater      },
  { id: 'cigarettes', label: 'Cigarettes',        subtitle: 'Cigarette stock by stick count',             Icon: Cigarette       },
  { id: 'groceries',  label: 'Groceries',         subtitle: 'Purchase ledger — expense tracking only',    Icon: ShoppingBasket  },
  { id: 'purchases',  label: 'Purchases',         subtitle: 'All purchase transactions across categories',Icon: Package         },
  { id: 'movements',  label: 'Stock Movements',   subtitle: 'Permanent log of all stock changes',         Icon: Activity        },
];

export const InventorySection = () => {
  const [activeTab, setActiveTab] = useState<InvTab>('overview');
  const active = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="flex gap-5">

      {/* ── Desktop left sub-nav ─────────────────────────── */}
      <nav className="hidden md:flex flex-col flex-shrink-0 w-40 gap-0.5 pt-0.5">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = id === activeTab;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left w-full ${
                isActive
                  ? 'bg-white/[0.07] text-foreground font-medium border border-white/[0.08]'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.03] font-normal border border-transparent'
              }`}
            >
              <Icon size={13} className={isActive ? 'text-blue-400' : ''} />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Content area ─────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-5">

        {/* Mobile horizontal tab scroll */}
        <div className="md:hidden overflow-x-auto pb-2">
          <div className="flex gap-1 min-w-max">
            {TABS.map(({ id, label, Icon }) => {
              const isActive = id === activeTab;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-white/50 hover:text-white/80 bg-white/[0.04] border border-white/[0.06]'
                  }`}
                >
                  <Icon size={11} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sub-section header (desktop) */}
        <div className="hidden md:block pb-4 border-b border-white/[0.06]">
          <h2 className="text-base font-semibold text-foreground">{active.label}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{active.subtitle}</p>
        </div>

        {/* Section content */}
        {activeTab === 'overview'   && <OverviewSection />}
        {activeTab === 'alcohol'    && <AlcoholSection />}
        {activeTab === 'beverages'  && <BeverageSection />}
        {activeTab === 'cigarettes' && <CigaretteSection />}
        {activeTab === 'groceries'  && <GrocerySection />}
        {activeTab === 'purchases'  && <PurchasesSection />}
        {activeTab === 'movements'  && <MovementsSection />}
      </div>
    </div>
  );
};
