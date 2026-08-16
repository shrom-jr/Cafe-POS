---
name: Venue Blueprint & Seed
description: Phase 2 spatial floor blueprint, seed logic, and layout constraints for S Bamboo Cottage
---

## Venue Seed (`src/utils/venueSeed.ts`)
- 21 canonical tables across 5 areas; First Floor includes deck tables T-1 and T-2, with Private Huts and Private Cabins separate.
- `ensureVenueSeed(currentTables)` is idempotent: only adds missing tables, never wipes active orders.
- Detects old demo data (R1-R5, Cabin 1-5, H1-H5, etc.) by checking >40% overlap; if demo, wipes free demo rows and preserves active ones before seeding.
- Called once in `App.tsx` via a one-shot `subscribeToTables` callback (fires on first Firebase snapshot then unsubscribes).

**Why:** Firebase RTDB `/tables` is the single source of truth; the seed ensures the venue's physical layout is always present without overwriting active orders.

## Area Order
`VENUE_AREA_ORDER = ['First Floor (Huts & Hall)', 'Sofa & Lounge', 'Bar Counter', 'Private Huts', 'Private Cabins']`
Pushed to `/areaOrder` during seed.

## Blueprint Layout (`src/screens/TableOverview.tsx`)
- **All filter** → `VenueBlueprintRenderer`: First Floor section on top, then Ground Floor Courtyard composite.
- **First Floor**: max-width 12-column grid (Hut 3 stacked H3-B/H3-A/T-1 | Hut 2 stacked H2-B/H2-A/T-2 | H1 tall hall).
- **Ground Floor composite**: 3-col CSS grid (Sofa&Lounge left | Bar+Landmarks middle | Private Cabins right).
  - Lounge: Sofa (wide) → 2×2 grid (L4,L3,L2,L1) → TV Area landmark
  - Bar: Bar 1, Bar 2, 🅿️ Parking, ⛩️ Main Gate landmarks
  - Private Huts: Back Quad (R3/R1 top, R4/R2 bottom)
  - Private Cabins: Front Strip (R5, R6, R7)
- **Filtered section** → `SectionRenderer`: uses area-specific sub-renderers (ground floor areas still shown via `GroundFloorBlueprint`).
- **Unknown/admin areas**: fall back to generic responsive grid below the blueprint.
- Overflow tables (admin-added beyond canonical 21) appended in a grid per area.

## LandmarkTile
Non-interactive dashed-border badge. Not a `CafeTable`; purely presentational. No Firebase entry.

## TableCard className prop
`TableCard` accepts optional `className` forwarded to the root `<button>`. Used for fixed proportional heights on blueprint slots, including the full-height H1 hall.

**How to apply:** Only pass `className="h-full"` (or similar height override) when the card must stretch to fill a flex/grid parent.
