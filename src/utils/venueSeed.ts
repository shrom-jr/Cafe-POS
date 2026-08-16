/**
 * Venue Seed: ensures the 21 canonical S Bamboo Cottage tables are present in
 * Firebase RTDB. Runs once per session on the first tables snapshot; safe to
 * re-run (idempotent — only adds missing tables, never wipes active orders).
 *
 * Also migrates any table whose `section` matches a legacy/phantom area name
 * (e.g. "ground-floor", "Ground Floor", "groundfloor") to the correct canonical
 * area, eliminating the orphan R2 filter-tab bug.
 */
import { CafeTable } from '@/types/pos';
import { pushTablesToFirebase, pushAreaOrderToFirebase } from '@/utils/firebaseSync';

// ── Canonical venue layout ────────────────────────────────────────────────────
export const VENUE_AREA_ORDER = [
  'First Floor (Huts & Hall)',
  'Sofa & Lounge',
  'Bar Counter',
  'Private Huts',
  'Private Cabins',
];

export const VENUE_TABLES: Array<{ number: string; section: string }> = [
  // Area 1 – First Floor (huts, deck tables, and hall)
  { number: 'H3-B', section: 'First Floor (Huts & Hall)' },
  { number: 'H3-A', section: 'First Floor (Huts & Hall)' },
  { number: 'T-1',  section: 'First Floor (Huts & Hall)' },
  { number: 'H2-B', section: 'First Floor (Huts & Hall)' },
  { number: 'H2-A', section: 'First Floor (Huts & Hall)' },
  { number: 'T-2',  section: 'First Floor (Huts & Hall)' },
  { number: 'H1',   section: 'First Floor (Huts & Hall)' },
  // Area 2 – Sofa & Lounge
  { number: 'Sofa', section: 'Sofa & Lounge' },
  { number: 'L4',   section: 'Sofa & Lounge' },
  { number: 'L3',   section: 'Sofa & Lounge' },
  { number: 'L2',   section: 'Sofa & Lounge' },
  { number: 'L1',   section: 'Sofa & Lounge' },
  // Area 3 – Bar Counter
  { number: 'Bar 1', section: 'Bar Counter' },
  { number: 'Bar 2', section: 'Bar Counter' },
  // Area 4 – Private Huts
  { number: 'R1', section: 'Private Huts' },
  { number: 'R2', section: 'Private Huts' },
  { number: 'R3', section: 'Private Huts' },
  { number: 'R4', section: 'Private Huts' },
  // Area 5 – Private Cabins
  { number: 'R5', section: 'Private Cabins' },
  { number: 'R6', section: 'Private Cabins' },
  { number: 'R7', section: 'Private Cabins' },
];

// Private hut/cabin table numbers (lowercase) — migrated to their canonical areas
const PRIVATE_HUT_NAMES = new Set(['r1','r2','r3','r4']);
const PRIVATE_CABIN_NAMES = new Set(['r5','r6','r7']);
const PRIVATE_TABLE_NAMES = new Set([...PRIVATE_HUT_NAMES, ...PRIVATE_CABIN_NAMES]);

// Legacy phantom section names that should never appear as filter tabs
const LEGACY_SECTIONS = new Set([
  'ground-floor',
  'ground floor',
  'groundfloor',
  'ground_floor',
  'default',
]);

// Old demo table names that should be replaced on first seed
const DEMO_TABLE_NAMES = new Set([
  'r1','r2','r3','r4','r5',
  'cabin 1','cabin 2','cabin 3','cabin 4','cabin 5',
  'h1','h2','h3','h4','h5',
  'table 1','table 2','table 3','table 4','table 5',
]);

function key(name: string) { return name.trim().toLowerCase(); }

/**
 * Returns the canonical section for a table by name, or undefined if the table
 * is not a known canonical venue table.
 */
function canonicalSection(tableNumber: string): string | undefined {
  const k = key(tableNumber);
  return VENUE_TABLES.find(v => key(v.number) === k)?.section;
}

/**
 * Checks whether all 21 venue tables are already present. If not, seeds the
 * missing ones. Active (occupied / billing) tables are always preserved.
 *
 * Also runs a one-shot migration: any table whose `section` is a legacy phantom
 * (e.g. "ground-floor") is re-assigned to the correct canonical area, and any
 * private hut/cabin table (R1–R7) in a non-canonical section is moved to its
 * dedicated canonical area.
 */
export async function ensureVenueSeed(currentTables: CafeTable[]): Promise<void> {
  let tables = [...currentTables];
  let dirty  = false;

  // ── Step 1: Migrate legacy / orphan sections ───────────────────────────────
  tables = tables.map(t => {
    const sectionKey = key(t.section ?? '');
    const tableKey   = key(t.number);

    // Fix tables in phantom legacy sections (ground-floor etc.)
    if (LEGACY_SECTIONS.has(sectionKey)) {
      const correct = canonicalSection(t.number);
      if (correct) {
        dirty = true;
        console.log(`[Venue Seed] Migrating "${t.number}" from legacy section "${t.section}" → "${correct}"`);
        return { ...t, section: correct };
      }
      // Unknown table in a legacy section — assign to bar/lounge catch-all
      if (PRIVATE_TABLE_NAMES.has(tableKey)) {
        dirty = true;
        return { ...t, section: canonicalSection(t.number) ?? 'Private Cabins' };
      }
    }

    // Fix known private hut/cabin tables that are in any non-canonical section
    const canonical = canonicalSection(t.number);
    if (PRIVATE_TABLE_NAMES.has(tableKey) && canonical && t.section !== canonical) {
      dirty = true;
      console.log(`[Venue Seed] Migrating private table "${t.number}" from "${t.section}" → "${canonical}"`);
      return { ...t, section: canonical };
    }

    return t;
  });

  // ── Step 2: Check whether all 21 venue tables are present ─────────────────
  const currentKeys = new Set(tables.map(t => key(t.number)));
  const venueKeys   = VENUE_TABLES.map(v => key(v.number));
  const allPresent  = venueKeys.every(k => currentKeys.has(k));

  if (allPresent && !dirty) return; // Nothing to do

  if (!allPresent) {
    // Determine whether we're looking at old demo data
    const activeTables = tables.filter(t => t.status !== 'free');
    const demoCount    = tables.filter(t => DEMO_TABLE_NAMES.has(key(t.number))).length;
    const isLikelyDemo = tables.length === 0 ||
      (tables.length <= 20 && demoCount >= Math.ceil(tables.length * 0.4));

    // Base: keep all active tables regardless; for demo data discard free demo rows
    const base: CafeTable[] = isLikelyDemo ? activeTables : tables;
    const existingKeys = new Set(base.map(t => key(t.number)));

    const toAdd: CafeTable[] = VENUE_TABLES
      .filter(v => !existingKeys.has(key(v.number)))
      .map(v => ({
        id:      crypto.randomUUID(),
        number:  v.number,
        section: v.section,
        status:  'free' as const,
      }));

    if (toAdd.length > 0) {
      tables = [...base, ...toAdd];
      dirty  = true;
      console.log(`[Venue Seed] ✅ Seeded ${toAdd.length} tables into Firebase.`);
    }
  }

  if (dirty) {
    await pushTablesToFirebase(tables);
    await pushAreaOrderToFirebase(VENUE_AREA_ORDER);
  }
}
