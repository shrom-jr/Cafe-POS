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

const TableOverview = () => {
  const { tables } = useTables();
  const { orders } = useOrders();
  const settings = usePOSStore((s) => s.settings);
  const navigate = useNavigate();
  const clock = useClock();
  const [panelHovered, setPanelHovered] = useState(false);
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
    const preferredOrder = ['Ground Floor', 'Cabins', '1st Floor'];
    const uniqueSections = Array.from(new Set(
      tables.map((table) => table.section?.trim() || 'Ground Floor')
    ));
    return uniqueSections.sort((a, b) => {
      const aIndex = preferredOrder.indexOf(a);
      const bIndex = preferredOrder.indexOf(b);
      if (aIndex !== -1 || bIndex !== -1) {
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      }
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [tables]);
  const visibleTables = useMemo(() => (
    tables
      .filter((table) => selectedSection === 'All' || (table.section?.trim() || 'Ground Floor') === selectedSection)
      .slice()
      .sort((a, b) => compareTableNames(a.number, b.number))
  ), [tables, selectedSection]);

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
      {/* Single scroll container — no nested scrollers */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 pb-20">
        {tables.length === 0 ? (
          <div className="text-center text-muted-foreground py-20">
            <p className="text-lg">No tables configured.</p>
            <p className="text-sm mt-1">Go to Admin → Tables to add tables.</p>
          </div>
        ) : (
          <div>
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Table sections">
              {['All', ...sections].map((section) => {
                const count = section === 'All'
                  ? tables.length
                  : tables.filter((table) => (table.section?.trim() || 'Ground Floor') === section).length;
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
          <div
            onMouseEnter={() => setPanelHovered(true)}
            onMouseLeave={() => setPanelHovered(false)}
            className="rounded-2xl p-3 sm:p-4 transition-all duration-500"
            style={{
              background: 'linear-gradient(180deg, rgba(15,23,42,0.85) 0%, rgba(2,6,23,0.75) 100%)',
              border: '1px solid rgba(59,130,246,0.12)',
              boxShadow: '0 12px 48px -8px rgba(0,0,0,0.65), inset 0 1px 0 0 rgba(255,255,255,0.04)',
              filter: panelHovered ? 'brightness(1.03)' : 'brightness(1)',
            }}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {visibleTables
                .map((table) => {
                  const data = tableOrderData[table.id] || { itemCount: 0 };
                  return (
                    <TableCard
                      key={table.id}
                      table={table}
                      itemCount={data.itemCount}
                      showSection={selectedSection === 'All'}
                      onClick={() => handleTableClick(table)}
                    />
                  );
                })}
            </div>
          </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default TableOverview;
