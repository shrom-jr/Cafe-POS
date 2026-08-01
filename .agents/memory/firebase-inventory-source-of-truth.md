---
name: Firebase Inventory Source of Truth
description: Architecture for Firebase RTDB as single authority for alcohol/beverage/cigarette products and invMovements. localStorage must not initialize or shadow these.
---

# Firebase Inventory Source of Truth

## Rule
`/alcoholProducts`, `/beverageProducts`, `/cigaretteProducts`, and `/invMovements` in Firebase RTDB are the single master authority. These must never be initialized from localStorage or written to localStorage.

## How to apply
- `useInventoryStore.ts`: These four arrays initialize as `[]`. Seed constants (`SEED_ALCOHOL`, `SEED_BEVERAGES`, `SEED_CIGARETTES`) are exported for use by the sync layer only.
- `useFirebaseSync.ts`: When a subscription returns an empty array (wiped/fresh DB), immediately push the seed data to Firebase AND set Zustand state. Mark `isRemote*Update.current = true` first to prevent the push-effect from double-writing.
- All `add*`, `update*`, `delete*`, `purchase*`, `adjust*`, and `deductInventoryForSale` actions must NOT call `setLS` for product arrays or movements. Firebase push effects in `useFirebaseSync` handle persistence.
- Grocery purchases (`inv_grocery`) and mappings (`inv_mappings`) still use localStorage as a secondary cache.

**Why:** Firebase was being wiped (fresh DB) but localStorage seeds would prevent seeding Firebase because (a) the subscription guard returned early on empty remote, and (b) the push effects only fire on state *changes*, not on initial load when state was already seeded from localStorage.
