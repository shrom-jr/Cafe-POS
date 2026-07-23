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

// ── Area container box ────────────────────────────────────────────────────────
interface AreaBoxProps {
  areaName: string;
  tables: CafeTable[];
  tableOrderData: Record<string, { itemCount: number }>;
  onTableClick: (table: CafeTable) => void;
}

const AreaBox = ({ areaName, tables, tableOrderData, onTableClick }: AreaBoxProps) => {
  const freeCount     = tables.filter((t) => t.status === 'free').length;
  const occupiedCount = tables.filter((t) => t.status !== 'free').length;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(15,23,42,0.88) 0%, rgba(2,6,23,0.78) 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 4px 16px -4px rgba(0,0,0,0.40)',
      }}
    >
      {/* Area header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.025)',
        }}
      >
        <span className="text-sm font-semibold text-white/85 tracking-wide">{areaName}</span>
        <div className="flex items-center gap-2 text-[11px] font-medium">
          {freeCount > 0 && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(16,185,129,0.10)', color: 'rgba(52,211,153,0.85)' }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: '#10b981', boxShadow: '0 0 5px 1px rgba(16,185,129,0.5)' }}
              />
              {freeCount} free
            </span>
          )}
          {occupiedCount > 0 && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={{ background: 'hsl(32 90% 50% / 0.11)', color: 'hsl(32 90% 65%)' }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: 'hsl(32 90% 55%)', boxShadow: '0 0 5px 1px hsl(32 90% 50% / 0.5)' }}
              />
              {occupiedCount} active
            </span>
          )}
          <span className="text-white/25 text-[10px]">{tables.length} tables</span>
        </div>
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
    active:    tables.filter((t) => t.status === 'occupied').length,
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

  const headerRight = (
    <>
      <div className="flex items-center gap-2 text-xs font-medium">
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: '#10b981', boxShadow: '0 0 6px 2px rgba(16,185,129,0.55)' }}
        />
        <span style={{ color: '#10b981' }}>{counts.available} Available</span>
        <span className="text-white/20 mx-0.5">•</span>
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: 'hsl(var(--warning))', boxShadow: '0 0 6px 2px hsl(32 90% 50% / 0.55)' }}
        />
        <span style={{ color: 'hsl(32 90% 65%)' }}>{counts.active} Active</span>
      </div>
      <div className="h-5 w-px bg-white/10" />
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
            {/* Section tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Table sections">
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
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? 'border-accent/50 bg-accent/15 text-accent'
                        : 'border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.06] hover:text-white/75'
                    }`}
                  >
                    {section} <span className="ml-1 opacity-70">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Area boxes */}
            {visibleSections.map((section) => (
              <AreaBox
                key={section}
                areaName={section}
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
