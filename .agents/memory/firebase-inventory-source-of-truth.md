---
name: Firebase Inventory Source of Truth
description: Architecture for Firebase RTDB as single authority for alcohol/beverage/cigarette products and invMovements. localStorage must not initialize or shadow these.
---

# Firebase Inventory Source of Truth

## Rule
`/alcoholProducts`, `/beverageProducts`, `/cigaretteProducts`, and `/invMovements` in Firebase RTDB are the single master authority. These must never be initialized from localStorage or written to localStorage.

## How to apply
- `useInventoryStore.ts`: These four arrays initialize as `[]`. Seed constants (`SEED_ALCOHOL`, `SEED_BEVERAGES`, `SEED_CIGARETTES`) are exported as empty arrays (no default data).
- `useFirebaseSync.ts`: Subscription handlers treat an empty array from Firebase as a clean slate — do NOT re-seed. Just compare and set like any other collection.
- All `add*`, `update*`, `delete*`, `purchase*`, `adjust*`, and `deductInventoryForSale` actions must NOT call `setLS` for product arrays or movements. Firebase push effects in `useFirebaseSync` handle persistence.
- Grocery purchases (`inv_grocery`) and mappings (`inv_mappings`) still use localStorage as a secondary cache.

**Why:** The old "seed on empty" logic in `useFirebaseSync.ts` caused a delete loop: deleting the last product wrote `[]` to Firebase → Firebase fired back `[]` → handler re-seeded with defaults → product came back. Removing seed-on-empty breaks the loop and lets deletions persist permanently. App starts with a clean slate; users add their own products.
