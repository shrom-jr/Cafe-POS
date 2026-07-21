---
name: Dynamic Pillars Architecture
description: Pillars (main categories) are now a persisted string[] in state/db, not a hardcoded union type.
---

## Rule
`CategoryPillar` is now `type CategoryPillar = string` — a plain string alias, not a union.
The canonical list of pillar names lives in `usePOSStore.pillars: string[]`, persisted under `pos_pillars` in localStorage.

**Why:** User needs to add new top-level pillars (e.g. "Desserts") at runtime without a code deploy.

## How to apply
- Any place that previously hardcoded `['Foods', 'Beverages', 'Cigarettes', 'Hukkah']` must now read from `usePOSStore((s) => s.pillars)`.
- To add a pillar: call `usePOSStore.addPillar(name)` — deduplicates automatically.
- db.ts methods: `db.getPillars()` / `db.savePillars(p)`. Key: `pos_pillars`.
- Seed/migration: `db.seed()` now seeds pillars on fresh install and backfills missing key on existing installs.
- `MENU_VERSION` bumped to `bamboo-v5` when this was introduced.
- `importData` and `factoryReset` in the store both restore `pillars` from db.

## Admin Panel inline add form
- Has a two-mode toggle: **Sub-Category** (default) | **Main Pillar**.
- Sub-Category mode: name + pillar dropdown (populated from `pillars`) → calls `addCategory`.
- Main Pillar mode: name only → calls `addPillar`, then auto-switches the active filter tab to the new pillar.
