---
name: Integer-keyed table loop
description: Root cause and fix for the ~5-6s infinite Firebase table write loop observed on free tables at night.
---

## The Bug

`pushTablesToFirebase(tables)` called `set(ref(db, "tables"), JSON.parse(JSON.stringify(tables)))` with an **array** argument. Firebase stores arrays as integer-keyed objects: `{"0": t0, "1": t1, ..., "20": T2, ...}`.

`writeOrderTableMutation` writes tables to `tables/${table.id}` (UUID keys): `{"deb30639...": T2, ...}`.

Result: Firebase ends up with **both** `tables/20` (integer key, may hold old occupied/stale state) AND `tables/deb30639...` (UUID key, current free state) for the same table.

## The Loop

`subscribeToTables.emit()` used `toArray(snapshot.val())` which discards Firebase keys — it sees both records as plain `CafeTable` objects. The integer-keyed copy often has a stale `activeFloorResetGeneration` or occupied `status`. `emit()` detects it as needing repair, calls `writeOrderTableMutation({tables:[T2_free]})` which writes to `tables/deb30639...` (UUID). Firebase broadcasts. `emit()` fires again. `tables/20` is **still there** — never deleted. Repair fires again → loop forever at ~5–6s intervals (bounded by Firebase round-trip).

## The Fix (both parts required)

**Part A — `pushTablesToFirebase`** (`src/utils/firebaseSync.ts`):
Write a UUID-keyed object, not an array:
```js
const uuidKeyedMap = Object.fromEntries((tables || []).map((t) => [t.id, t]));
await set(ref(db, "tables"), JSON.parse(JSON.stringify(uuidKeyedMap)));
```
Prevents future integer-keyed orphans.

**Part B — `subscribeToTables`** (`src/utils/firebaseSync.ts`):
Switch from `toArray(snapshot.val())` to `toFirebaseEntries(snapshot.val())` to preserve Firebase keys alongside table data. In `emit()`, when `firebaseKey !== table.id` (integer key vs UUID), collect the stale key for deletion and fire `update(ref(db), staleKeyDeletions)` after the repair write. Also deduplicates the callback output so the same `table.id` is not returned twice when both entries exist.

**Why:** The stale integer-keyed record persists across all repair cycles unless explicitly deleted with its original Firebase key. Writing to the UUID key path never removes the integer key.
