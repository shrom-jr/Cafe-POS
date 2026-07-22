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
              {tables
                .slice().sort((a, b) => compareTableNames(a.number, b.number))
                .map((table) => {
                  const data = tableOrderData[table.id] || { itemCount: 0 };
                  return (
                    <TableCard
                      key={table.id}
                      table={table}
                      itemCount={data.itemCount}
                      onClick={() => handleTableClick(table)}
                    />
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default TableOverview;
