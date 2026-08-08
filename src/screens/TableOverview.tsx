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
  return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Per-area color palette ────────────────────────────────────────────────────
export const AREA_COLORS = [
  // 0 — Electric Sky Blue
  { text: '#38bdf8', bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.25)', dot: '#38bdf8', glow: 'rgba(56,189,248,0.35)' },
  // 1 — Vivid Purple
  { text: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.25)', dot: '#a78bfa', glow: 'rgba(167,139,250,0.35)' },
  // 2 — Seafoam Teal
  { text: '#2dd4bf', bg: 'rgba(45,212,191,0.12)', border: 'rgba(45,212,191,0.25)', dot: '#2dd4bf', glow: 'rgba(45,212,191,0.35)' },
  // 3 — Soft Gold
  { text: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.25)', dot: '#fbbf24', glow: 'rgba(251,191,36,0.35)' },
  // 4 — Royal Indigo
  { text: '#818cf8', bg: 'rgba(129,140,248,0.12)', border: 'rgba(129,140,248,0.25)', dot: '#818cf8', glow: 'rgba(129,140,248,0.35)' },
  // 5 — Pearl Silver
  { text: '#cbd5e1', bg: 'rgba(203,213,225,0.10)', border: 'rgba(203,213,225,0.22)', dot: '#cbd5e1', glow: 'rgba(203,213,225,0.28)' },
];

// ── Area container box ────────────────────────────────────────────────────────
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
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(10,18,36,0.55)',
        border: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* Area header */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{
          background: theme.bg,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        {/* Accent pill */}
        <span
          className="flex-shrink-0 w-[3px] h-5 rounded-full"
          style={{ background: theme.dot, boxShadow: `0 0 8px 2px ${theme.glow}` }}
        />

        {/* Area name */}
        <span className="text-sm font-bold tracking-wide" style={{ color: theme.text }}>
          {areaName}
        </span>

        {/* Stats */}
        {freeCount > 0 && (
          <span
            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
            style={{
              background: 'rgba(16,185,129,0.12)',
              color: '#34d399',
              border: '1px solid rgba(16,185,129,0.22)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            {freeCount} free
          </span>
        )}
        {occupiedCount > 0 && (
          <span
            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
            style={{
              background: 'hsl(32 90% 50% / 0.10)',
              color: 'hsl(32 90% 65%)',
              border: '1px solid hsl(32 90% 50% / 0.22)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'hsl(32 90% 55%)' }} />
            {occupiedCount} active
          </span>
        )}

        {/* Table count */}
        <span className="ml-auto text-xs font-medium" style={{ color: 'rgba(255,255,255,0.28)' }}>
          {tables.length} tables
        </span>
      </div>

      {/* Table grid */}
      <div className="p-3 sm:p-4">
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
    </div>
  );
};

// ── Main screen ───────────────────────────────────────────────────────────────
const TableOverview = () => {
  const { tables } = useTables();
  const { orders } = useOrders();
  const settings   = usePOSStore((s) => s.settings);
  const areaOrder  = usePOSStore((s) => s.areaOrder);
  const navigate   = useNavigate();
  const clock      = useClock();
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
    active:    tables.filter((t) => t.status === 'occupied').length,
  }), [tables]);

  const sections = useMemo(() => {
    const tableSections = tables.map((t) => t.section?.trim() || 'Ground Floor');
    const seen = new Set<string>();
    const result: string[] = [];
    for (const name of [...areaOrder, ...tableSections]) {
      if (name && !seen.has(name) && tableSections.includes(name)) {
        seen.add(name); result.push(name);
      }
    }
    return result;
  }, [tables, areaOrder]);

  const tablesByArea = useMemo(() => {
    const map: Record<string, CafeTable[]> = {};
    for (const section of sections) {
      map[section] = tables
        .filter((t) => (t.section?.trim() || 'Ground Floor') === section)
        .sort((a, b) => compareTableNames(a.number, b.number));
    }
    return map;
  }, [tables, sections]);

  const visibleSections = selectedSection === 'All' ? sections : [selectedSection];

  const handleTableClick = (table: CafeTable) => navigate(`/order/${table.id}`);

  const headerRight = (
    <>
      <div className="flex items-center gap-2 text-xs font-medium">
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: '#10b981', boxShadow: '0 0 6px 2px rgba(16,185,129,0.55)' }}
        />
        <span style={{ color: '#10b981' }}>{counts.available} Available</span>
        <span className="text-white/20 mx-0.5">·</span>
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: 'hsl(var(--warning))', boxShadow: '0 0 6px 2px hsl(32 90% 50% / 0.55)' }}
        />
        <span style={{ color: 'hsl(32 90% 65%)' }}>{counts.active} Active</span>
      </div>
      <div className="h-4 w-px bg-white/10" />
      <span className="font-mono text-xs font-medium text-white/35 tabular-nums min-w-[76px] text-right">
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
          <div className="flex flex-col gap-4">
            {/* ── Section filter pills ───────────────────────────────────────── */}
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar" role="tablist" aria-label="Table sections">
              {['All', ...sections].map((section, idx) => {
                const count   = section === 'All'
                  ? tables.length
                  : tables.filter((t) => (t.section?.trim() || 'Ground Floor') === section).length;
                const active  = selectedSection === section;
                // 'All' pill uses the accent blue; area pills use area color
                const isAll   = section === 'All';
                const theme   = isAll ? null : AREA_COLORS[(idx - 1) % AREA_COLORS.length];

                return (
                  <button
                    key={section}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedSection(section)}
                    className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95 select-none"
                    style={active ? {
                      background: isAll ? 'rgba(59,130,246,0.20)' : theme!.bg,
                      color: isAll ? '#93c5fd' : theme!.text,
                      border: `1px solid ${isAll ? 'rgba(59,130,246,0.35)' : theme!.border}`,
                      boxShadow: `0 2px 10px -3px ${isAll ? 'rgba(59,130,246,0.35)' : theme!.glow}`,
                    } : {
                      background: 'rgba(255,255,255,0.04)',
                      color: 'rgba(255,255,255,0.42)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {section}
                    <span className="ml-1.5 opacity-60">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* ── Area boxes ────────────────────────────────────────────────── */}
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
        )}
      </div>
    </AppLayout>
  );
};

export default TableOverview;
