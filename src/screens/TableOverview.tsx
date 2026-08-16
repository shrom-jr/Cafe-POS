import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePOSStore } from '@/store/usePOSStore';
import { useTables } from '@/hooks/useTables';
import { useOrders } from '@/hooks/useOrders';
import TableCard from '@/components/tables/TableCard';
import AppLayout from '@/components/ui/AppLayout';
import { CafeTable } from '@/types/pos';
import { compareTableNames } from '@/utils/tableName';
import { VENUE_AREA_ORDER } from '@/utils/venueSeed';
import { AREA_COLORS } from '@/utils/venueColors';

// ── Clock ─────────────────────────────────────────────────────────────────────
function useClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Known venue area names ────────────────────────────────────────────────────
const AREA_FIRST_FLOOR = 'First Floor (Huts & Hall)';
const AREA_LOUNGE      = 'Sofa & Lounge';
const AREA_BAR         = 'Bar Counter';
const AREA_CABINS      = 'Private Cabins';
const KNOWN_VENUE_AREAS = new Set([AREA_FIRST_FLOOR, AREA_LOUNGE, AREA_BAR, AREA_CABINS]);

// Canonical table names per area (lowercase for membership check)
const KNOWN_FIRST_FLOOR = new Set(['h3-b','h3-a','t-1','h2-b','h2-a','t-2','h1']);
const KNOWN_LOUNGE      = new Set(['sofa','l4','l3','l2','l1']);
const KNOWN_BAR         = new Set(['bar 1','bar 2']);
const KNOWN_CABINS      = new Set(['r1','r2','r3','r4','r5','r6','r7']);

// ── Helpers ───────────────────────────────────────────────────────────────────
function findTable(tables: CafeTable[], name: string): CafeTable | undefined {
  const k = name.trim().toLowerCase();
  return tables.find(t => t.number.trim().toLowerCase() === k);
}

function overflowTables(tables: CafeTable[], known: Set<string>): CafeTable[] {
  return tables.filter(t => !known.has(t.number.trim().toLowerCase()));
}

type OrderData = Record<string, { itemCount: number; customerName?: string }>;

// ── Sub-components ────────────────────────────────────────────────────────────

/** Non-interactive landmark badge (TV area, parking, gate, etc.) */
const LandmarkTile = ({ label }: { label: string }) => (
  <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2 py-1.5 text-center text-[10px] font-bold text-slate-400 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-600">
    {label}
  </div>
);

/** Section heading with colored accent bar */
const AreaHeader = ({ label, areaIndex }: { label: string; areaIndex: number }) => {
  const theme = AREA_COLORS[areaIndex % AREA_COLORS.length];
  return (
    <div className="mb-2 flex items-center gap-2 px-0.5">
      <span className={`flex-shrink-0 w-[3px] h-4 rounded-full ${theme.bg} shadow-sm ${theme.glow}`} />
      <span className="text-[11px] font-black tracking-wider uppercase text-slate-700 dark:text-emerald-400">
        {label}
      </span>
    </div>
  );
};

/** Renders a single TableCard slot — renders nothing if table is undefined. */
const Slot = ({
  table, orderData, onTableClick, className,
}: { table: CafeTable | undefined; orderData: OrderData; onTableClick: (t: CafeTable) => void; className?: string }) => {
  if (!table) return null;
  const d = orderData[table.id] || { itemCount: 0 };
  return (
    <TableCard
      table={table}
      itemCount={d.itemCount}
      customerName={d.customerName}
      showSection={false}
      onClick={() => onTableClick(table)}
      className={className}
    />
  );
};

/** Generic responsive grid fallback for custom/admin-added tables. */
const OverflowGrid = ({
  tables, orderData, onTableClick,
}: { tables: CafeTable[]; orderData: OrderData; onTableClick: (t: CafeTable) => void }) => {
  if (tables.length === 0) return null;
  return (
    <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
      {tables.map(t => (
        <Slot key={t.id} table={t} orderData={orderData} onTableClick={onTableClick} className="h-14" />
      ))}
    </div>
  );
};

// ── Area-specific blueprint sections ─────────────────────────────────────────

/**
 * First Floor (Huts & Hall) — proportional 12-column deck blueprint
 *
 *  Col 1 │ H3-B 75px │
 *         │ H3-A 75px │
 *         │ T-1  75px │
 *  Col 2 │ H2-B 75px │
 *         │ H2-A 75px │
 *         │ T-2  75px │
 *  Col 3 │ H1 full-height hall │
 */
const FirstFloorBlueprint = ({
  tables, orderData, onTableClick,
}: { tables: CafeTable[]; orderData: OrderData; onTableClick: (t: CafeTable) => void }) => {
  const h3b = findTable(tables, 'H3-B');
  const h3a = findTable(tables, 'H3-A');
  const t1  = findTable(tables, 'T-1');
  const h2b = findTable(tables, 'H2-B');
  const h2a = findTable(tables, 'H2-A');
  const t2  = findTable(tables, 'T-2');
  const h1  = findTable(tables, 'H1');
  const overflow = overflowTables(tables, KNOWN_FIRST_FLOOR);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-12 items-stretch gap-4">
        {/* Hut 3 */}
        <div className="col-span-4 flex flex-col gap-2">
          <Slot table={h3b} orderData={orderData} onTableClick={onTableClick} className="h-[75px] flex-none" />
          <Slot table={h3a} orderData={orderData} onTableClick={onTableClick} className="h-[75px] flex-none" />
          <Slot table={t1} orderData={orderData} onTableClick={onTableClick} className="h-[75px] flex-none" />
        </div>
        {/* Hut 2 */}
        <div className="col-span-4 flex flex-col gap-2">
          <Slot table={h2b} orderData={orderData} onTableClick={onTableClick} className="h-[75px] flex-none" />
          <Slot table={h2a} orderData={orderData} onTableClick={onTableClick} className="h-[75px] flex-none" />
          <Slot table={t2} orderData={orderData} onTableClick={onTableClick} className="h-[75px] flex-none" />
        </div>
        {/* Hall – full column height */}
        <div className="col-span-4 flex min-h-[235px] flex-col">
          <Slot table={h1} orderData={orderData} onTableClick={onTableClick} className="h-full min-h-[235px] flex-1" />
        </div>
      </div>
      <OverflowGrid tables={overflow} orderData={orderData} onTableClick={onTableClick} />
    </div>
  );
};

/**
 * Ground Floor 3-column composite blueprint.
 *
 *  LEFT (Sofa & Lounge) │ MIDDLE (Bar Counter) │ RIGHT (Private Cabins)
 *  Sofa h-70px          │ Bar 1 │ Bar 2 h-70px  │ R3 │ R1  h-75px
 *  L4 │ L3  h-75px      │ 🅿️ Parking badge     │ R4 │ R2  h-75px
 *  L2 │ L1               │ ⛩️ Main Gate badge    │ R5 │ R6 │ R7 h-70px
 *  📺 TV Area            │                       │
 */
const GroundFloorBlueprint = ({
  loungeTs, barTs, cabinTs, orderData, onTableClick,
}: {
  loungeTs: CafeTable[];
  barTs:    CafeTable[];
  cabinTs:  CafeTable[];
  orderData: OrderData;
  onTableClick: (t: CafeTable) => void;
}) => {
  const sofa = findTable(loungeTs, 'Sofa');
  const l4   = findTable(loungeTs, 'L4');
  const l3   = findTable(loungeTs, 'L3');
  const l2   = findTable(loungeTs, 'L2');
  const l1   = findTable(loungeTs, 'L1');
  const overflowLounge = overflowTables(loungeTs, KNOWN_LOUNGE);

  const bar1 = findTable(barTs, 'Bar 1');
  const bar2 = findTable(barTs, 'Bar 2');
  const overflowBar = overflowTables(barTs, KNOWN_BAR);

  const r1 = findTable(cabinTs, 'R1');
  const r2 = findTable(cabinTs, 'R2');
  const r3 = findTable(cabinTs, 'R3');
  const r4 = findTable(cabinTs, 'R4');
  const r5 = findTable(cabinTs, 'R5');
  const r6 = findTable(cabinTs, 'R6');
  const r7 = findTable(cabinTs, 'R7');
  const overflowCabins = overflowTables(cabinTs, KNOWN_CABINS);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {/* ── LEFT: Sofa & Lounge ── */}
      <div className="flex flex-col gap-2">
        <AreaHeader label="Sofa & Lounge" areaIndex={1} />
        {/* Sofa — wide single h-12 card */}
        <Slot table={sofa} orderData={orderData} onTableClick={onTableClick} className="h-[70px]" />
        {/* 2×2 grid */}
        <div className="grid grid-cols-2 gap-2">
          <Slot table={l4} orderData={orderData} onTableClick={onTableClick} className="h-[75px]" />
          <Slot table={l3} orderData={orderData} onTableClick={onTableClick} className="h-[75px]" />
          <Slot table={l2} orderData={orderData} onTableClick={onTableClick} className="h-[75px]" />
          <Slot table={l1} orderData={orderData} onTableClick={onTableClick} className="h-[75px]" />
        </div>
        <LandmarkTile label="📺  TV Area" />
        <OverflowGrid tables={overflowLounge} orderData={orderData} onTableClick={onTableClick} />
      </div>

      {/* ── MIDDLE: Bar Counter + Landmarks ── */}
      <div className="flex flex-col gap-2">
        <AreaHeader label="Bar Counter" areaIndex={2} />
        <div className="grid grid-cols-2 gap-2">
          <Slot table={bar1} orderData={orderData} onTableClick={onTableClick} className="h-[70px]" />
          <Slot table={bar2} orderData={orderData} onTableClick={onTableClick} className="h-[70px]" />
        </div>
        <LandmarkTile label="🅿️  Parking Area" />
        <LandmarkTile label="⛩️  Main Gate" />
        <OverflowGrid tables={overflowBar} orderData={orderData} onTableClick={onTableClick} />
      </div>

      {/* ── RIGHT: Private Cabins ── */}
      <div className="flex flex-col gap-2">
        <AreaHeader label="Private Cabins" areaIndex={3} />
        {/* Back Quad: R3/R1 top row, R4/R2 bottom row */}
        <div className="grid grid-cols-2 gap-2">
          <Slot table={r3} orderData={orderData} onTableClick={onTableClick} className="h-[75px]" />
          <Slot table={r1} orderData={orderData} onTableClick={onTableClick} className="h-[75px]" />
          <Slot table={r4} orderData={orderData} onTableClick={onTableClick} className="h-[75px]" />
          <Slot table={r2} orderData={orderData} onTableClick={onTableClick} className="h-[75px]" />
        </div>
        {/* Front Strip: all three cabins in one row */}
        <div className="grid grid-cols-3 gap-2">
          <Slot table={r5} orderData={orderData} onTableClick={onTableClick} className="h-[70px]" />
          <Slot table={r6} orderData={orderData} onTableClick={onTableClick} className="h-[70px]" />
          <Slot table={r7} orderData={orderData} onTableClick={onTableClick} className="h-[70px]" />
        </div>
        <OverflowGrid tables={overflowCabins} orderData={orderData} onTableClick={onTableClick} />
      </div>
    </div>
  );
};

/**
 * Full venue 2-D blueprint — shown when "All" filter is active.
 * Unknown areas fall back to a generic grid below the blueprint.
 */
const VenueBlueprintRenderer = ({
  sections, tablesByArea, tableOrderData, onTableClick,
}: {
  sections:       string[];
  tablesByArea:   Record<string, CafeTable[]>;
  tableOrderData: OrderData;
  onTableClick:   (t: CafeTable) => void;
}) => {
  const unknownSections = sections.filter(s => !KNOWN_VENUE_AREAS.has(s));
  const firstFloorTs    = tablesByArea[AREA_FIRST_FLOOR] ?? [];
  const loungeTs        = tablesByArea[AREA_LOUNGE]      ?? [];
  const barTs           = tablesByArea[AREA_BAR]         ?? [];
  const cabinTs         = tablesByArea[AREA_CABINS]      ?? [];
  const groundFloorVisible = loungeTs.length > 0 || barTs.length > 0 || cabinTs.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4">
      {/* ── First Floor ── */}
      {firstFloorTs.length > 0 && (
        <section>
          <AreaHeader label={AREA_FIRST_FLOOR} areaIndex={0} />
          <FirstFloorBlueprint
            tables={firstFloorTs}
            orderData={tableOrderData}
            onTableClick={onTableClick}
          />
        </section>
      )}

      {/* ── Ground Floor divider ── */}
      {groundFloorVisible && (
        <section>
          <div className="mb-3 flex items-center gap-2 px-0.5">
            <span className="flex-shrink-0 w-[3px] h-4 rounded-full bg-slate-400 dark:bg-zinc-600" />
            <span className="text-[10px] font-black tracking-widest uppercase text-slate-400 dark:text-zinc-500">
              Ground Floor & Courtyard
            </span>
          </div>
          <GroundFloorBlueprint
            loungeTs={loungeTs}
            barTs={barTs}
            cabinTs={cabinTs}
            orderData={tableOrderData}
            onTableClick={onTableClick}
          />
        </section>
      )}

      {/* ── Unknown / custom areas ── */}
      {unknownSections.map((section, i) => {
        const theme = AREA_COLORS[(4 + i) % AREA_COLORS.length];
        return (
          <section key={section}>
            <div className="mb-2 flex items-center gap-2 px-0.5">
              <span className={`flex-shrink-0 w-[3px] h-4 rounded-full ${theme.bg} shadow-sm ${theme.glow}`} />
              <span className="text-[11px] font-black tracking-wider uppercase text-slate-700 dark:text-emerald-400">
                {section}
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-2">
              {(tablesByArea[section] ?? []).map(t => (
                <Slot key={t.id} table={t} orderData={tableOrderData} onTableClick={onTableClick} className="h-14" />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

/**
 * Single-section renderer used when a filter pill is active.
 */
const SectionRenderer = ({
  section, tables, tableOrderData, onTableClick, tablesByArea,
}: {
  section:        string;
  tables:         CafeTable[];
  tableOrderData: OrderData;
  onTableClick:   (t: CafeTable) => void;
  tablesByArea:   Record<string, CafeTable[]>;
}) => {
  if (section === AREA_FIRST_FLOOR) {
    return (
      <div>
        <AreaHeader label={AREA_FIRST_FLOOR} areaIndex={0} />
        <FirstFloorBlueprint tables={tables} orderData={tableOrderData} onTableClick={onTableClick} />
      </div>
    );
  }

  if (section === AREA_LOUNGE || section === AREA_BAR || section === AREA_CABINS) {
    return (
      <GroundFloorBlueprint
        loungeTs={section === AREA_LOUNGE ? tables : (tablesByArea[AREA_LOUNGE] ?? [])}
        barTs={section === AREA_BAR ? tables : (tablesByArea[AREA_BAR] ?? [])}
        cabinTs={section === AREA_CABINS ? tables : (tablesByArea[AREA_CABINS] ?? [])}
        orderData={tableOrderData}
        onTableClick={onTableClick}
      />
    );
  }

  // Generic grid for custom areas
  return (
    <div>
      <AreaHeader label={section} areaIndex={4} />
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {tables.map(t => (
          <Slot key={t.id} table={t} orderData={tableOrderData} onTableClick={onTableClick} className="h-14" />
        ))}
      </div>
    </div>
  );
};

// ── Main screen ───────────────────────────────────────────────────────────────
const TableOverview = () => {
  const { tables }  = useTables();
  const { orders }  = useOrders();
  const settings    = usePOSStore(s => s.settings);
  const areaOrder   = usePOSStore(s => s.areaOrder);
  const navigate    = useNavigate();
  const clock       = useClock();
  const [selectedSection, setSelectedSection] = useState('All');

  // Build per-table order data (itemCount + attached customer name)
  const tableOrderData = useMemo<OrderData>(() => {
    const map: OrderData = {};
    orders.forEach(order => {
      if (order.status === 'active' || order.status === 'billed') {
        map[order.tableId] = {
          itemCount:    order.items.reduce((s, i) => s + i.quantity, 0),
          customerName: order.attachedCustomer?.name,
        };
      }
    });
    return map;
  }, [orders]);

  const counts = useMemo(() => ({
    available: tables.filter(t => t.status === 'free').length,
    active:    tables.filter(t => t.status !== 'free').length,
  }), [tables]);

  // Section order: preferred venue areas first, then areaOrder, then orphans
  const sections = useMemo(() => {
    const tableSections = tables.map(t => t.section?.trim() || 'Ground Floor');
    const seen   = new Set<string>();
    const result: string[] = [];
    const preferred = [...VENUE_AREA_ORDER, ...areaOrder];
    for (const name of [...preferred, ...tableSections]) {
      if (name && !seen.has(name) && tableSections.includes(name)) {
        seen.add(name);
        result.push(name);
      }
    }
    return result;
  }, [tables, areaOrder]);

  // Tables grouped by area, sorted by name within each area
  const tablesByArea = useMemo(() => {
    const map: Record<string, CafeTable[]> = {};
    for (const section of sections) {
      map[section] = tables
        .filter(t => (t.section?.trim() || 'Ground Floor') === section)
        .sort((a, b) => compareTableNames(a.number, b.number));
    }
    return map;
  }, [tables, sections]);

  const handleTableClick = (table: CafeTable) => navigate(`/order/${table.id}`);

  // Reset section filter if it no longer exists
  useEffect(() => {
    if (selectedSection !== 'All' && !sections.includes(selectedSection)) {
      setSelectedSection('All');
    }
  }, [sections, selectedSection]);

  // ── Status bar + clock ───────────────────────────────────────────────────
  const statusBar = (
    <div className="flex flex-shrink-0 items-center gap-2">
      <span className="flex items-center gap-2.5 rounded-xl border border-slate-300/80 bg-white px-3 py-1.5 text-[11px] font-bold shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 dark:bg-emerald-400" />
          {counts.available} Free
        </span>
        <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
          {counts.active} Active
        </span>
      </span>
      <span className="rounded-xl border border-slate-300/80 bg-white px-2.5 py-1.5 font-mono text-[11px] font-bold tabular-nums text-slate-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-slate-200">
        {clock}
      </span>
    </div>
  );

  return (
    <AppLayout title={settings.cafeName || 'S Bamboo Cottage & Sekuwa Corner'}>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3 pb-16">
        {tables.length === 0 ? (
          <div className="py-20 text-center text-foreground">
            <p className="text-lg">No tables configured.</p>
            <p className="mt-1 text-sm text-foreground/70">Go to Admin → Tables to add tables.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* ── Section filter pills + status bar ── */}
            <div className="flex w-full items-center justify-between gap-2" role="tablist" aria-label="Table sections">
              <div className="inline-flex min-w-0 shrink items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1 no-scrollbar dark:border-zinc-800 dark:bg-zinc-900/90">
                {['All', ...sections].map(section => {
                  const count = section === 'All'
                    ? tables.length
                    : tables.filter(t => (t.section?.trim() || 'Ground Floor') === section).length;
                  const active = selectedSection === section;
                  return (
                    <button
                      key={section}
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSelectedSection(section)}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors duration-150 active:scale-[0.98] ${
                        active
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-transparent text-slate-700 hover:bg-white/60 hover:text-slate-950 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white'
                      }`}
                    >
                      {section} ({count})
                    </button>
                  );
                })}
              </div>
              {statusBar}
            </div>

            {/* ── Blueprint / area renderer ── */}
            {selectedSection === 'All' ? (
              <VenueBlueprintRenderer
                sections={sections}
                tablesByArea={tablesByArea}
                tableOrderData={tableOrderData}
                onTableClick={handleTableClick}
              />
            ) : (
              <SectionRenderer
                section={selectedSection}
                tables={tablesByArea[selectedSection] ?? []}
                tableOrderData={tableOrderData}
                onTableClick={handleTableClick}
                tablesByArea={tablesByArea}
              />
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default TableOverview;
