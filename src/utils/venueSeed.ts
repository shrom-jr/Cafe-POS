/**
 * Venue Seed: ensures the 19 canonical S Bamboo Cottage tables are present in
 * Firebase RTDB. Runs once per session on the first tables snapshot; safe to
 * re-run (idempotent — only adds missing tables, never wipes active orders).
 */
import { CafeTable } from '@/types/pos';
import { pushTablesToFirebase, pushAreaOrderToFirebase } from '@/utils/firebaseSync';

// ── Canonical venue layout ────────────────────────────────────────────────────
export const VENUE_AREA_ORDER = [
  'First Floor (Huts & Hall)',
  'Sofa & Lounge',
  'Bar Counter',
  'Private Cabins',
];

export const VENUE_TABLES: Array<{ number: string; section: string }> = [
  // Area 1 – First Floor
  { number: 'H3-B', section: 'First Floor (Huts & Hall)' },
  { number: 'H3-A', section: 'First Floor (Huts & Hall)' },
  { number: 'H2-B', section: 'First Floor (Huts & Hall)' },
  { number: 'H2-A', section: 'First Floor (Huts & Hall)' },
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
  // Area 4 – Private Cabins
  { number: 'R1', section: 'Private Cabins' },
  { number: 'R2', section: 'Private Cabins' },
  { number: 'R3', section: 'Private Cabins' },
  { number: 'R4', section: 'Private Cabins' },
  { number: 'R5', section: 'Private Cabins' },
  { number: 'R6', section: 'Private Cabins' },
  { number: 'R7', section: 'Private Cabins' },
];

// Old demo table names that should be replaced on first seed
const DEMO_TABLE_NAMES = new Set([
  'r1','r2','r3','r4','r5',
  'cabin 1','cabin 2','cabin 3','cabin 4','cabin 5',
  'h1','h2','h3','h4','h5',
  'table 1','table 2','table 3','table 4','table 5',
]);

function key(name: string) { return name.trim().toLowerCase(); }

/**
 * Checks whether all 19 venue tables are already present. If not, seeds the
 * missing ones. Active (occupied / billing) tables are always preserved.
 */
export async function ensureVenueSeed(currentTables: CafeTable[]): Promise<void> {
  const currentKeys = new Set(currentTables.map(t => key(t.number)));
  const venueKeys   = VENUE_TABLES.map(v => key(v.number));
  const allPresent  = venueKeys.every(k => currentKeys.has(k));
  if (allPresent) return; // Nothing to do

  // Determine whether we're looking at old demo data
  const activeTables   = currentTables.filter(t => t.status !== 'free');
  const demoCount      = currentTables.filter(t => DEMO_TABLE_NAMES.has(key(t.number))).length;
  const isLikelyDemo   = currentTables.length === 0 ||
    (currentTables.length <= 20 && demoCount >= Math.ceil(currentTables.length * 0.4));

  // Base: keep all active tables regardless; for demo data discard free demo rows
  const base: CafeTable[] = isLikelyDemo
    ? activeTables                  // wipe free demo tables, keep active
    : currentTables;                // keep everything, just fill gaps

  const existingKeys = new Set(base.map(t => key(t.number)));
  const toAdd: CafeTable[] = VENUE_TABLES
    .filter(v => !existingKeys.has(key(v.number)))
    .map(v => ({
      id:      crypto.randomUUID(),
      number:  v.number,
      section: v.section,
      status:  'free' as const,
    }));

  if (toAdd.length === 0) return;

  const merged = [...base, ...toAdd];
  await pushTablesToFirebase(merged);
  await pushAreaOrderToFirebase(VENUE_AREA_ORDER);
  console.log(`[Venue Seed] ✅ Seeded ${toAdd.length} tables into Firebase.`);
}
