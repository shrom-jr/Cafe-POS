import { useMemo } from 'react';
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

// ── Known venue area names ────────────────────────────────────────────────────
const AREA_FIRST_FLOOR = 'First Floor (Huts & Hall)';
const AREA_LOUNGE      = 'Sofa & Lounge';
const AREA_BAR         = 'Bar Counter';
const AREA_HUTS        = 'Private Huts';
const AREA_CABINS      = 'Private Cabins';
const KNOWN_VENUE_AREAS = new Set([AREA_FIRST_FLOOR, AREA_LOUNGE, AREA_BAR, AREA_HUTS, AREA_CABINS]);

// Canonical table names per area (lowercase for membership check)
const KNOWN_FIRST_FLOOR = new Set(['h3-b','h3-a','t-1','h2-b','h2-a','t-2','h1']);
const KNOWN_LOUNGE      = new Set(['sofa','l4','l3','l2','l1']);
const KNOWN_BAR         = new Set(['bar 1','bar 2']);
const KNOWN_HUTS        = new Set(['r1','r2','r3','r4']);
const KNOWN_CABINS      = new Set(['r5','r6','r7']);

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
 * First Floor (Huts) — proportional 12-column deck blueprint
 *
 *  Col 1 │ H3-B 98px │
 *         │ H3-A 98px │
 *         │ T-1  98px │
 *  Col 2 │ H2-B 98px │
 *         │ H2-A 98px │
 *         │ T-2  98px │
 *  Col 3 │ H1 full-height hut │
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
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-12 items-stretch gap-5">
        {/* Hut 3 */}
        <div className="col-span-4 flex h-full flex-col gap-3">
          <Slot table={h3b} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
          <Slot table={h3a} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
          <Slot table={t1} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
        </div>
        {/* Hut 2 */}
        <div className="col-span-4 flex h-full flex-col gap-3">
          <Slot table={h2b} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
          <Slot table={h2a} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
          <Slot table={t2} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
        </div>
        {/* Hut 1 */}
        <div className="col-span-4 flex h-full flex-col">
          <Slot table={h1} orderData={orderData} onTableClick={onTableClick} className="h-full min-h-[320px]" />
        </div>
      </div>
      <OverflowGrid tables={overflow} orderData={orderData} onTableClick={onTableClick} />
    </div>
  );
};

/**
 * Ground Floor 3-column composite blueprint.
 *
 *  LEFT (Sofa & Lounge) │ MIDDLE (Bar Counter) │ RIGHT (Private Huts + Cabins)
 *  Sofa h-70px          │ Bar 1 │ Bar 2 h-70px  │ R3 │ R1  h-75px
 *  L4 │ L3  h-75px      │ 🅿️ Parking badge     │ R4 │ R2  h-75px
 *  L2 │ L1               │ ⛩️ Main Gate badge    │ R5 │ R6
 *  📺 TV Area            │                       │ R7
 *  📺 TV Area            │                       │
 */
const GroundFloorBlueprint = ({
  loungeTs, barTs, hutTs, cabinTs, orderData, onTableClick,
}: {
  loungeTs: CafeTable[];
  barTs:    CafeTable[];
  hutTs:    CafeTable[];
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

  const r1 = findTable(hutTs, 'R1');
  const r2 = findTable(hutTs, 'R2');
  const r3 = findTable(hutTs, 'R3');
  const r4 = findTable(hutTs, 'R4');
  const r5 = findTable(cabinTs, 'R5');
  const r6 = findTable(cabinTs, 'R6');
  const r7 = findTable(cabinTs, 'R7');
  const overflowHuts = overflowTables(hutTs, KNOWN_HUTS);
  const overflowCabins = overflowTables(cabinTs, KNOWN_CABINS);

  return (
    <div className="grid grid-cols-12 items-stretch gap-5">
      {/* ── LEFT: Sofa & Lounge ── */}
      <div className="col-span-4 flex flex-col gap-3">
        <AreaHeader label="Sofa & Lounge" areaIndex={1} />
        {/* Sofa — wide single card */}
        <Slot table={sofa} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
        {/* 2×2 grid */}
        <div className="grid grid-cols-2 gap-3">
          <Slot table={l4} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
          <Slot table={l3} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
          <Slot table={l2} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
          <Slot table={l1} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
        </div>
        <div className="flex min-h-[38px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-3 py-2 transition-all dark:border-zinc-800/80 dark:bg-zinc-900/20">
          <span className="text-xs font-bold tracking-widest text-slate-500 dark:text-zinc-400" aria-hidden="true">📺</span>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">TV AREA</span>
        </div>
        <OverflowGrid tables={overflowLounge} orderData={orderData} onTableClick={onTableClick} />
      </div>

      {/* ── MIDDLE: Bar Counter + Landmarks ── */}
      <div className="col-span-4 flex h-full flex-col gap-3">
        <AreaHeader label="Bar Counter" areaIndex={2} />
        <div className="grid grid-cols-2 gap-3">
          <Slot table={bar1} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
          <Slot table={bar2} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
        </div>
        <div className="flex min-h-[130px] flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-3 transition-all dark:border-zinc-800/80 dark:bg-zinc-900/20">
          <span className="text-xl leading-none" aria-hidden="true">🅿️</span>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">PARKING AREA</span>
        </div>
        <div className="flex min-h-[50px] items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-4 py-2.5 transition-all dark:border-zinc-800/80 dark:bg-zinc-900/20">
          <span className="text-lg leading-none" aria-hidden="true">⛩️</span>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">MAIN GATE</span>
        </div>
        <OverflowGrid tables={overflowBar} orderData={orderData} onTableClick={onTableClick} />
      </div>

      {/* ── RIGHT: Private Huts + Private Cabins ── */}
      <div className="col-span-4 flex flex-col gap-3">
        <AreaHeader label="Private Huts" areaIndex={3} />
        {/* Private Huts: R3/R1 top row, R4/R2 bottom row */}
        <div className="grid grid-cols-2 gap-3">
          <Slot table={r3} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
          <Slot table={r1} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
          <Slot table={r4} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
          <Slot table={r2} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
        </div>
        <OverflowGrid tables={overflowHuts} orderData={orderData} onTableClick={onTableClick} />

        <AreaHeader label="Private Cabins" areaIndex={4} />
        {/* Private Cabins: R5/R6 top row, R7 on the lower-left */}
        <div className="grid grid-cols-2 gap-3">
          <Slot table={r5} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
          <Slot table={r6} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
          <Slot table={r7} orderData={orderData} onTableClick={onTableClick} className="min-h-[98px]" />
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
  const hutTs           = tablesByArea[AREA_HUTS]        ?? [];
  const cabinTs         = tablesByArea[AREA_CABINS]      ?? [];
  const groundFloorVisible = loungeTs.length > 0 || barTs.length > 0 || hutTs.length > 0 || cabinTs.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col space-y-8 px-4 py-6">
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
          <div className="mb-2 flex items-center gap-2 px-0.5">
            <span className="flex-shrink-0 w-[3px] h-4 rounded-full bg-slate-400 dark:bg-zinc-600" />
            <span className="text-[10px] font-black tracking-widest uppercase text-slate-400 dark:text-zinc-500">
              Ground Floor & Courtyard
            </span>
          </div>
          <GroundFloorBlueprint
            loungeTs={loungeTs}
            barTs={barTs}
            hutTs={hutTs}
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

// ── Main screen ───────────────────────────────────────────────────────────────
const TableOverview = () => {
  const { tables }  = useTables();
  const { orders }  = useOrders();
  const settings    = usePOSStore(s => s.settings);
  const areaOrder   = usePOSStore(s => s.areaOrder);
  const navigate    = useNavigate();

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

  return (
    <AppLayout title={settings.cafeName || 'S Bamboo Cottage & Sekuwa Corner'}>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-0 pb-16 sm:px-4">
        {tables.length === 0 ? (
          <div className="py-20 text-center text-foreground">
            <p className="text-lg">No tables configured.</p>
            <p className="mt-1 text-sm text-foreground/70">Go to Admin → Tables to add tables.</p>
          </div>
        ) : (
          <VenueBlueprintRenderer
            sections={sections}
            tablesByArea={tablesByArea}
            tableOrderData={tableOrderData}
            onTableClick={handleTableClick}
          />
        )}
      </div>
    </AppLayout>
  );
};

export default TableOverview;
