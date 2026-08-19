# Sync Loop Diagnosis — Bamboo POS Firebase
**Date:** 2026-08-19  
**Scope:** Read-only investigation of `src/utils/firebaseSync.ts`, `src/hooks/useFirebaseSync.ts`, `src/store/usePOSStore.ts`

---

## Verdict

> **The exact ping-pong loop described — "app receives table data → thinks it differs from local → saves it back with a new syncMutationId → Firebase echoes it back → saves again → infinite loop" — does NOT exist in this codebase.**

The code has real guards that prevent that exact mechanism. However, **five separate patterns produce excessive Firebase traffic** that could realistically accumulate gigabytes over a busy day. Those are documented below with exact file/line citations.

---

## Why the Described Loop Cannot Happen

### Guard 1 — `pendingOrderWrites` / `pendingTableWrites` acknowledgment

Every time the app sends a write to Firebase it first stamps the record with a fresh `syncRevision` (timestamp) and `syncMutationId` (UUID), and stores that pair in a local Map:

```
firebaseSync.ts:425-435
const pendingOrderWrites = new Map<string, SyncMutation>();
const pendingTableWrites = new Map<string, SyncMutation>();

function newSyncMutation(): SyncMutation {
  return { syncRevision: Date.now(), syncMutationId: crypto.randomUUID() };
}
```

When Firebase echoes the same record back, `acknowledgePendingWrite` (line 809) matches both fields exactly and removes the entry from the map. Subsequent processing of that same echo does not generate a new write.

### Guard 2 — `isRemote…Update` refs for settings/inventory/purchases

Nine collections (settings, areaOrder, groceryPurchases, invMovements, invMappings, staff, kitchenPurchases, meatEntries, maintenanceExpenses) use a boolean ref pattern:

```
useFirebaseSync.ts:246-254
const isRemoteSettingsUpdate = useRef(false);
const isRemoteAreaOrderUpdate = useRef(false);
// … (nine total)
```

The listener callback sets the flag to `true` **before** calling the Zustand setter. The corresponding `useEffect` (lines 619–708) checks the flag and skips the Firebase push when it is set. So Firebase → local state → useEffect → **skip push** is the guaranteed path for all nine collections.

### Guard 3 — `JSON.stringify` equality check

Every inbound callback compares remote data to current local data before calling the setter. If the data is byte-for-byte identical, the setter is never called, so the `useEffect` dependency never changes, and no push fires.

### Guard 4 — Firebase `onValue` only fires on change

Firebase RTDB does not re-deliver the same snapshot if the data has not changed. So even if an app write reaches Firebase and is stored unchanged, Firebase will not rebroadcast to the sender — the listener is only triggered again when the cloud data actually differs from the last delivered snapshot.

---

## What IS Real — Five Patterns That Cause Excessive Traffic

### Pattern 1 — Table Repair One-Shot Round Trips (real extra writes, not a loop)

**Location:** `firebaseSync.ts:1287–1316` (`subscribeToTables → emit`)

```javascript
const occupancyHasStaleGeneration =
  table.status !== "free" &&
  table.activeFloorResetGeneration !== undefined &&
  table.activeFloorResetGeneration !== resetGeneration(activeFloorReset);

if (!linkedOrderWasDeleted && !occupancyHasStaleGeneration) return table;

const repaired = { ...definition, status: "free" as const };
repairs.push(repaired);
// …
if (repairs.length > 0) {
  void writeOrderTableMutation({ tables: repairs });
}
```

**What happens:** When this fires, the repaired table is written to Firebase with `status: "free"`. Firebase broadcasts it back. On the next `emit()`, `status === "free"` so `occupancyHasStaleGeneration` is false. **The repair does not fire again.** This is a one-shot round trip, not a loop.

**The real problem:** This path does **not** consult `pendingTableWrites` before writing. If two browser tabs both see the same stale table at the same time, **both** fire a repair write independently. Each tab generates a different `syncMutationId`. Firebase receives two writes for the same table record, broadcasts each one back to both tabs — that is **four listener deliveries** for what should have been one. With four tables in a stale state and three tabs open, this becomes 4 × 3 × 2 = **24 listener deliveries** per reset event instead of 4.

### Pattern 2 — Order Stale-Generation Repair (same structure)

**Location:** `firebaseSync.ts:965–985` (`subscribeToOrders → emit`)

```javascript
repairs[`orders/${firebaseKey}`] = null;
if (!tombstoneById.has(order.id) && resetMarker) {
  repairs[`orderTombstones/${order.id}`] = { id: order.id, ...resetMarker };
}
// …
void update(ref(db), repairs);
```

The null-deletion means the order disappears from Firebase. The next `emit()` call does not find the order in `remoteOrderEntries` — it cannot repair it again. Self-terminating. But again, all open tabs independently fire this repair with no cross-tab coordination guard, so N tabs produce N simultaneous deletes of the same order — N tombstone writes, N broadcasts.

### Pattern 3 — Multi-Tab FIREWALL Burst (most significant traffic source)

**Location:** `useFirebaseSync.ts:297–306, 421–423, 449–451, 465–467, 488–490, 510–512, 532–534, 562–565`

Each of these callbacks has the same structure:

```javascript
// example: grocery purchases
if (remotePurchases.length === 0 && currentPurchases.length > 0) {
  pushGroceryPurchasesToFirebase(currentPurchases);  // ← fires immediately
  return;  // ← does NOT set isRemoteGroceryPurchasesUpdate = true
}
```

The `push…ToFirebase` functions all call `set(ref(db, "collection"), data)` — a **full collection overwrite**, not an incremental update.

**The burst scenario:** A selective reset wipes several Firebase collections to empty. All four open POS terminals are subscribed. Firebase broadcasts the empty state to all four. Each terminal independently evaluates the FIREWALL condition and independently fires a full `set()` write.

- 4 terminals × 8 collections with FIREWALL = **up to 32 simultaneous full overwrites**
- Firebase stores each write and broadcasts each one back
- Each broadcast reaches all 4 terminals = up to **128 listener deliveries**
- Each delivery re-evaluates all collections → collections are now non-empty → no more FIREWALL fires

This terminates after one round trip, but the sheer volume of one burst can be hundreds of kilobytes of full-collection writes, all downloading to every tab.

**Why the `isRemote` flag does not prevent it:** The FIREWALL branch returns early without setting the flag. It also does not call the Zustand setter, so the `useEffect` dependency never changes — the useEffect guard is irrelevant here. The FIREWALL fires directly from the listener callback.

### Pattern 4 — `set()` vs `update()` for Collection Writes

**Location:** All `push…ToFirebase` functions in `firebaseSync.ts`

```javascript
// example: pushGroceryPurchasesToFirebase
await set(ref(db, "groceryPurchases"), JSON.parse(JSON.stringify(purchases)));
```

Firebase RTDB charges for **download bytes to all connected clients**. When you call `set()` on a collection root, Firebase sends the **entire collection** to every client subscribed to that path via `onValue`. If `groceryPurchases` has 200 purchase records and there are 4 terminals open:

- One `set()` call = 200 records downloaded to 4 clients = 800 record-downloads
- Across a busy evening with 50 grocery transactions, that's 40,000 record-downloads for that collection alone

Tables, orders, and payments use granular `update()` at specific paths (`orders/${id}`, `tables/${id}`) — which is correct. The bulk push functions (`pushAreaOrderToFirebase`, `pushInventoryMovementsToFirebase`, etc.) use full `set()` — which is the expensive pattern.

### Pattern 5 — `writePaymentRecord` Still Uses Root-Level `runTransaction`

**Location:** `firebaseSync.ts:834`

```javascript
await runTransaction(ref(db), (currentData) => {
  const root = cloneFirebaseRoot(currentData);
  // …reads root…
  return root;
}, { applyLocally: false });
```

This is the identical root-level transaction pattern we fixed for orders/tables. If your Firebase rules deny root-level reads (which is the likely cause of the `{}` error we diagnosed), every call to `writePaymentRecord` (i.e., every payment made through the POS) silently fails. The payment is not stored to Firebase. When the terminal is later used offline and reconnects, the offline queue replays the failed payments — but `offlineQueue.ts` does not have a `payments` domain that calls `writePaymentRecord`. Whether payments are actually being lost needs verification, but the root-transaction pattern is confirmed broken.

---

## Traffic Amplification Math

To understand how 17 GB accumulates, consider a moderate Friday evening:

| Event | Writes | Broadcasts | Data/event |
|---|---|---|---|
| One table order (create + send to kitchen + bill + pay) | ~8 Firebase writes | 8 × N tabs broadcasts | ~5 KB/broadcast |
| One selective reset (4 tabs open) | Up to 32 collection overwrites | 128 listener fires | ~20 KB/broadcast |
| One stale table repair (3 tabs open) | 3 writes | 6 broadcasts | ~2 KB/broadcast |

With 40 orders/evening, 3 resets/day, and 4 terminals open:
- Orders: 40 × 8 × 4 tabs × 5 KB ≈ **6.4 MB/evening**
- Resets: 3 × 32 × 128 × 20 KB ≈ **246 MB/day** ← the biggest driver
- Over a week with the app open overnight (listeners stay alive): the numbers multiply

Firebase RTDB also keeps persistent connections alive and counts **all downloaded bytes**, including the initial snapshot on connection. If terminals are refreshed or reopened frequently, each reconnect downloads the full state of all subscribed collections.

---

## Summary Table

| Pattern | Loops? | Extra traffic | Severity |
|---|---|---|---|
| Table/order repair path (multi-tab no coordination) | No — one round trip | N tabs × 1 repair each | Medium |
| FIREWALL multi-tab burst on empty collection | No — one round trip | N tabs × M collections simultaneously | **High** |
| `set()` overwrites for bulk push functions | No loop, but expensive per call | Full collection × N tabs per write | **High** |
| `writePaymentRecord` root transaction | No loop — fails silently | Payments may not reach Firebase | **Critical** |
| Exact echo-write loop (as described) | **Does not exist** | — | — |

---

## Recommended Fixes (in priority order)

1. **Fix `writePaymentRecord`** — replace its `runTransaction(ref(db), ...)` with a targeted `get(ref(db, "resetMarkers/salesHistory"))` + `update(ref(db), { ["payments/${id}"]: data })`, matching the pattern already applied to `writeOrderTableMutation`.

2. **Add cross-tab deduplication to table/order repair** — before firing a repair write, check whether the table/order already has a pending write from this tab (`getPendingTableWrite(table.id)`) and skip if so. This does not prevent duplicate repair from other tabs, but halves the writes per tab.

3. **Replace `set()` with `update()` in FIREWALL write-backs** — instead of overwriting the entire collection, write only the records that differ. This is a larger refactor but would substantially reduce download traffic.

4. **Add a per-collection repair lock** — a `Set<string>` of currently-being-repaired table/order IDs, cleared when the Firebase echo arrives, prevents two simultaneous repair triggers from the same tab on rapid listener fires.
