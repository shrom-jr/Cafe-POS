---
name: Menu Firebase Write Pattern
description: menuItems and categories have no auto-push effects — all writes must be done explicitly via push helpers AND store setters
---

# Menu Firebase Write Pattern

## The Gap
Unlike orders, tables, payments, settings, and inventory — `menuItems` and `categories` have **no push effects** in `useFirebaseSync.ts`. The sync hook only subscribes (Firebase → store), but never pushes back (store → Firebase) for these nodes.

## How to Write Menu Data
Every mutation in Menu Management must:
1. **Update the local Zustand store** via `setMenuItems(updated)` or `setCategories(updated)` (directly, not via `addMenuItem`/`updateMenuItem` store actions — those only call `db.saveMenuItems` which targets localStorage).
2. **Push to Firebase** immediately via:
   - `pushMenuItemsToFirebase(items)` → `set(ref(db, 'menu/items'), ...)`
   - `pushCategoriesToFirebase(categories)` → `set(ref(db, 'menu/categories'), ...)`

Both helpers are in `src/utils/firebaseSync.ts`.

## MenuItem Type Extensions (added in Phase 3)
- `available?: boolean` — false = sold out; defaults to true when absent
- `variants?: { label: string; price: number }[]` — multi-tier pricing (e.g. peg sizes, portions)

**Why:** The original Firebase sync for menu was read-only (Firebase seeds from scripts, not pushed from the app). Phase 3 added live admin editing, which required explicit write helpers. Without calling both the store setter AND the Firebase push, changes are visible only on the current device and lost on refresh.

**How to apply:** Whenever editing menu data from any admin screen, always pair `setMenuItems(updated) + pushMenuItemsToFirebase(updated)`.
