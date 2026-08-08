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
  { text: 'text-slate-200',  bg: 'bg-slate-300',  glow: 'shadow-slate-300/50',  border: 'border-slate-300/30'  },
];

// ── Area section box ──────────────────────────────────────────────────────────
interface AreaBoxProps {
  areaName: string;
  areaIndex: number;
  tables: CafeTable[];
  tableOrderData: Record<string, { itemCount: number }>;
  onTableClick: (table: CafeTable) => void;
}

const AreaBox = ({ areaName, areaIndex, tables, tableOrderData, onTableClick }: AreaBoxProps) => {
  const freeCount     = tables.filter((t) => t.status === 'free').length;
  const occupiedCount = tables.filter((t) => t.status !== 'free').length;
  const theme         = AREA_COLORS[areaIndex % AREA_COLORS.length];

  return (
    <div>
      {/* Section header — no outer card, just a clean divider row */}
      <div className="flex items-center gap-3 px-1 mb-3">
        {/* Colored accent bar */}
        <span className={`flex-shrink-0 w-[3px] h-5 rounded-full ${theme.bg} shadow-sm ${theme.glow}`} />

        {/* Area name */}
        <span className={`text-sm font-bold tracking-widest uppercase ${theme.text}`}>
          {areaName}
        </span>

        {/* Status chips */}
        {freeCount > 0 && (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.28)', color: '#34d399' }}>
            🟢 {freeCount} Free
          </span>
        )}
        {occupiedCount > 0 && (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
            style={{ background: 'hsl(32 90% 50% / 0.12)', border: '1px solid hsl(32 90% 50% / 0.30)', color: 'hsl(32 90% 68%)' }}>
            🟠 {occupiedCount} Active
          </span>
        )}
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
    const map: Record<string, { itemCount: number }> = {};
    orders.forEach((order) => {
      if (order.status === 'active' || order.status === 'billed') {
        const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
        map[order.tableId] = { itemCount };
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
      <span
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold flex-shrink-0"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.10)',
          color: 'rgba(255,255,255,0.85)',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: '#34d399' }}>🟢</span>
        <span style={{ color: '#34d399' }}>{counts.available}</span>
        <span className="text-white/25 mx-0.5">|</span>
        <span style={{ color: 'hsl(32 90% 65%)' }}>🟠</span>
        <span style={{ color: 'hsl(32 90% 65%)' }}>{counts.active}</span>
      </span>
      <span className="font-mono text-xs font-medium text-white/40 tabular-nums flex-shrink-0 hidden sm:inline">
        {clock}
      </span>
    </>
  );

  return (
    <AppLayout title={settings.cafeName || 'S Bamboo Cottage & Sekuwa Corner'} headerRight={headerRight}>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 pb-20">
        {tables.length === 0 ? (
          <div className="text-center text-muted-foreground py-20">
            <p className="text-lg">No tables configured.</p>
            <p className="text-sm mt-1">Go to Admin → Tables to add tables.</p>
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
                    className="shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-150"
                    style={active ? {
                      background: 'rgba(59,130,246,0.85)',
                      color: '#ffffff',
                      border: '1px solid rgba(59,130,246,0.5)',
                      boxShadow: '0 1px 8px -2px rgba(59,130,246,0.5)',
                    } : {
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(100,116,139,0.45)',
                      color: 'rgb(226,232,240)',
                    }}
                  >
                    {section} <span className="opacity-60">({count})</span>
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
