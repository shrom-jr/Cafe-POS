import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePOSStore } from '@/store/usePOSStore';
import { useTables } from '@/hooks/useTables';
import { useOrders } from '@/hooks/useOrders';
import TableCard from '@/components/tables/TableCard';
import AppLayout from '@/components/ui/AppLayout';
import { CafeTable } from '@/types/pos';
import { compareTableNames } from '@/utils/tableName';

function useClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Per-area color palette — non-status hues only ──────────────────────────
export const AREA_COLORS = [
  // Slot 0 - Ground Floor (Electric Sky Blue)
  { text: 'text-sky-400',    bg: 'bg-sky-500',    glow: 'shadow-sky-500/50',    border: 'border-sky-500/30'    },
  // Slot 1 - Cabins (Vivid Purple)
  { text: 'text-purple-400', bg: 'bg-purple-500', glow: 'shadow-purple-500/50', border: 'border-purple-500/30' },
  // Slot 2 - 1st Floor (Seafoam Teal)
  { text: 'text-teal-400',   bg: 'bg-teal-500',   glow: 'shadow-teal-500/50',   border: 'border-teal-500/30'   },
  // Slot 3 - Soft Gold
  { text: 'text-amber-300',  bg: 'bg-amber-400',  glow: 'shadow-amber-400/50',  border: 'border-amber-400/30'  },
  // Slot 4 - Royal Indigo
  { text: 'text-indigo-400', bg: 'bg-indigo-500', glow: 'shadow-indigo-500/50', border: 'border-indigo-500/30' },
  // Slot 5 - Silver
  { text: 'text-foreground', bg: 'bg-foreground', glow: 'shadow-foreground/40', border: 'border-border' },
];

// ── Area section box ──────────────────────────────────────────────────────────
interface AreaBoxProps {
  areaName: string;
  areaIndex: number;
  tables: CafeTable[];
  tableOrderData: Record<string, { itemCount: number; customerName?: string }>;
  onTableClick: (table: CafeTable) => void;
}

const AreaBox = ({ areaName, areaIndex, tables, tableOrderData, onTableClick }: AreaBoxProps) => {
  const theme         = AREA_COLORS[areaIndex % AREA_COLORS.length];

  return (
    <div>
      {/* Section header — clean and intentionally free of occupancy chips */}
      <div className="mb-3 flex items-center gap-3 px-1">
        {/* Colored accent bar */}
        <span className={`flex-shrink-0 w-[3px] h-5 rounded-full ${theme.bg} shadow-sm ${theme.glow}`} />

        {/* Area name */}
        <span className={`text-sm font-bold tracking-widest uppercase ${theme.text}`}>
          {areaName}
        </span>

      </div>

      {/* Table grid — cards float on the page background */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
        {tables.map((table) => {
          const data = tableOrderData[table.id] || { itemCount: 0 };
          return (
            <TableCard
              key={table.id}
              table={table}
              itemCount={data.itemCount}
              customerName={data.customerName}
              showSection={false}
              onClick={() => onTableClick(table)}
            />
          );
        })}
      </div>
    </div>
  );
};

// ── Main screen ───────────────────────────────────────────────────────────────
const TableOverview = () => {
  const { tables } = useTables();
  const { orders } = useOrders();
  const settings = usePOSStore((s) => s.settings);
  const areaOrder = usePOSStore((s) => s.areaOrder);
  const navigate = useNavigate();
  const clock = useClock();
  const [selectedSection, setSelectedSection] = useState('All');

  const tableOrderData = useMemo(() => {
    const map: Record<string, { itemCount: number; customerName?: string }> = {};
    orders.forEach((order) => {
      if (order.status === 'active' || order.status === 'billed') {
        const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
        map[order.tableId] = {
          itemCount,
          customerName: order.attachedCustomer?.name,
        };
      }
    });
    return map;
  }, [orders]);

  const counts = useMemo(() => ({
    available: tables.filter((t) => t.status === 'free').length,
    active:    tables.filter((t) => t.status !== 'free').length,
  }), [tables]);

  // Ordered section list: areaOrder first, then any orphaned sections
  const sections = useMemo(() => {
    const tableSections = tables.map((t) => t.section?.trim() || 'Ground Floor');
    const seen = new Set<string>();
    const result: string[] = [];
    for (const name of [...areaOrder, ...tableSections]) {
      if (name && !seen.has(name) && tableSections.includes(name)) {
        seen.add(name);
        result.push(name);
      }
    }
    return result;
  }, [tables, areaOrder]);

  // Tables per area, sorted by name within each area
  const tablesByArea = useMemo(() => {
    const map: Record<string, CafeTable[]> = {};
    for (const section of sections) {
      map[section] = tables
        .filter((t) => (t.section?.trim() || 'Ground Floor') === section)
        .sort((a, b) => compareTableNames(a.number, b.number));
    }
    return map;
  }, [tables, sections]);

  // Which areas to render based on selected tab
  const visibleSections = selectedSection === 'All' ? sections : [selectedSection];

  const handleTableClick = (table: CafeTable) => {
    navigate(`/order/${table.id}`);
  };

  // Compact combined status badge + clock
  const headerRight = (
    <>
      <span className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-secondary px-3 py-1 text-sm font-semibold text-foreground">
        <span className="text-emerald-700 dark:text-emerald-300">Available {counts.available}</span>
        <span className="text-foreground/50" aria-hidden="true">·</span>
        <span className="text-orange-700 dark:text-orange-300">Active {counts.active}</span>
      </span>
      <span className="hidden flex-shrink-0 font-mono text-sm font-medium tabular-nums text-foreground/70 sm:inline">
        {clock}
      </span>
    </>
  );

  return (
    <AppLayout title={settings.cafeName || 'S Bamboo Cottage & Sekuwa Corner'} headerRight={headerRight}>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 pb-20">
        {tables.length === 0 ? (
          <div className="py-20 text-center text-foreground">
            <p className="text-lg">No tables configured.</p>
            <p className="mt-1 text-sm text-foreground/70">Go to Admin → Tables to add tables.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* ── Section filter pills ── */}
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar" role="tablist" aria-label="Table sections">
              {['All', ...sections].map((section) => {
                const count = section === 'All'
                  ? tables.length
                  : tables.filter((t) => (t.section?.trim() || 'Ground Floor') === section).length;
                const active = selectedSection === section;
                return (
                  <button
                    key={section}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedSection(section)}
                    className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-[0.98] ${
                      active
                        ? 'border-accent/50 bg-accent text-accent-foreground shadow-[0_1px_8px_-2px_hsl(var(--accent)/0.5)]'
                        : 'border-border bg-secondary text-secondary-foreground hover:border-primary/50 hover:text-foreground'
                    }`}
                  >
                    {section} <span className="text-foreground/70">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* ── Area sections — table cards float on the page background ── */}
            <div className="flex flex-col gap-8">
              {visibleSections.map((section) => (
                <AreaBox
                  key={section}
                  areaName={section}
                  areaIndex={Math.max(0, sections.indexOf(section))}
                  tables={tablesByArea[section] ?? []}
                  tableOrderData={tableOrderData}
                  onTableClick={handleTableClick}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default TableOverview;
