import {
  get as firebaseGet,
  ref,
  onValue as firebaseOnValue,
  query,
  orderByChild,
  equalTo,
  runTransaction as firebaseRunTransaction,
  set as firebaseSet,
  update as firebaseUpdate,
} from "firebase/database";
import { db } from "../firebase";
import type {
  Order,
  CafeTable,
  Payment,
  Settings,
  MenuItem,
  Category,
} from "../types/pos";
import type { StaffUser } from "../types/staff";
import { hashPin } from "./cryptoPin";
import type {
  AlcoholProduct,
  BeverageProduct,
  CigaretteProduct,
  GroceryPurchase,
  InvMenuMapping,
  InventoryMovement,
} from "../types/pos";
import type { PurchaseEntry } from "../store/useKitchenPurchasesStore";
import type { MeatEntry } from "../store/useMeatTrackerStore";
import type { MaintenanceExpense } from "../types/pos";
import type { Customer, CustomerRepayment } from "../types/pos";
import type { SelectiveResetSelection } from "../types/selectiveReset";
import type { OfflineMutation } from "../types/offlineQueue";
import {
  getAllPendingMutations,
  dequeueMutation,
  incrementRetry,
  dropExhaustedMutations,
} from "./offlineQueue";
import {
  BAR_INVENTORY_RESET_META_KEY,
  readFirebaseIdRecords,
  toFirebaseIdRecordMap,
} from "./firebaseSchema";
import { normalizeSettingsLogos, sanitizeLogoSource } from "./logo";
import { normalizeMenuCategoriesSnapshot, normalizeMenuItemsSnapshot } from "./menuSchema";
import { isTrainingSandboxActive, isTrainingSandboxReconciling } from "./trainingSandbox";

// Keep Firebase listeners mounted during Staff Practice so ending a session does
// not reconnect or refetch. Their latest snapshots are retained while the
// sandbox owns Zustand, then replayed synchronously during exit reconciliation.
const latestListenerSnapshots = new Map<(snapshot: unknown) => void, unknown>();

const onValue = ((queryRef: unknown, callback: (snapshot: unknown) => void, ...rest: unknown[]) => {
  const unsubscribe = firebaseOnValue(
    queryRef as Parameters<typeof firebaseOnValue>[0],
    ((snapshot: unknown) => {
      latestListenerSnapshots.set(callback, snapshot);
      if (!isTrainingSandboxActive() || isTrainingSandboxReconciling()) callback(snapshot);
    }) as Parameters<typeof firebaseOnValue>[1],
    ...(rest as []),
  );

  return () => {
    latestListenerSnapshots.delete(callback);
    unsubscribe();
  };
}) as typeof firebaseOnValue;

/** Reconcile from existing listener snapshots without reconnecting Firebase. */
export function reconcileTrainingFirebaseSnapshots(): void {
  for (const [callback, snapshot] of latestListenerSnapshots) {
    callback(snapshot);
  }
}

const get = ((...args: unknown[]) => {
  if (isTrainingSandboxActive()) {
    return Promise.resolve({ val: () => null, exists: () => false });
  }
  return firebaseGet(...(args as Parameters<typeof firebaseGet>));
}) as typeof firebaseGet;

const set = ((...args: unknown[]) => {
  if (isTrainingSandboxActive()) return Promise.resolve();
  return firebaseSet(...(args as Parameters<typeof firebaseSet>));
}) as typeof firebaseSet;

const update = ((...args: unknown[]) => {
  if (isTrainingSandboxActive()) return Promise.resolve();
  return firebaseUpdate(...(args as Parameters<typeof firebaseUpdate>));
}) as typeof firebaseUpdate;

const runTransaction = ((...args: unknown[]) => {
  if (isTrainingSandboxActive()) return Promise.resolve({ committed: false });
  return firebaseRunTransaction(...(args as Parameters<typeof firebaseRunTransaction>));
}) as typeof firebaseRunTransaction;

type FirebaseSyncStore = {
  setPayments: (payments: Payment[], exists?: boolean) => void;
  setSettings: (settings: Settings) => void;
  setMenuItems: (menuItems: MenuItem[]) => void;
  setCategories: (categories: Category[]) => void;
  setPillars: (pillars: string[]) => void;
  setAreaOrder: (areaOrder: string[]) => void;
  setAlcoholProducts: (products: AlcoholProduct[]) => void;
  setBeverageProducts: (products: BeverageProduct[]) => void;
  setCigaretteProducts: (products: CigaretteProduct[]) => void;
  setGroceryPurchases: (purchases: GroceryPurchase[], exists?: boolean) => void;
  setInvMovements: (movements: InventoryMovement[], exists?: boolean) => void;
  setInvMappings: (mappings: InvMenuMapping[], exists?: boolean) => void;
};

type StaffSyncStore = {
  setUsers: (users: StaffUser[]) => void;
};

/** Customer records are stored with their repayment ledger under one Firebase key. */
export type FirebaseCustomerRecord = Customer & {
  repayments: CustomerRepayment[];
  /** Reset generation that authorized this record to be written. */
  customerCreditResetGeneration?: string;
};

// Safely converts Firebase keyed objects/arrays/nulls into clean JavaScript arrays
const toArray = (data: any) => {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean);
  if (typeof data === "object") return Object.values(data).filter(Boolean);
  return [];
};

type FirebaseEntry = [key: string, value: Record<string, unknown>];

function toFirebaseEntries(data: unknown): FirebaseEntry[] {
  if (!data || typeof data !== "object") return [];
  return Object.entries(data as Record<string, unknown>)
    .filter(([, value]) => Boolean(value) && typeof value === "object")
    .map(([key, value]) => [key, value as Record<string, unknown>]);
}

function cloneFirebaseRoot(data: unknown): Record<string, any> {
  if (!data || typeof data !== "object") return {};
  return JSON.parse(JSON.stringify(data)) as Record<string, any>;
}

function toFirebaseRecordMap(data: unknown): Record<string, Record<string, any>> {
  return Object.fromEntries(toFirebaseEntries(data));
}

function recordKeyForId(
  records: Record<string, Record<string, any>>,
  id: string,
): string {
  return Object.entries(records).find(([, record]) => record.id === id)?.[0] ?? id;
}

function assignFirebaseCollection(
  root: Record<string, any>,
  path: string,
  records: Record<string, Record<string, any>>,
): void {
  if (Object.keys(records).length === 0) {
    delete root[path];
  } else {
    root[path] = records;
  }
}

/**
 * Log a structured Firebase error so that `code`, `message`, and `name` are
 * always visible in the console instead of collapsing to `{}` when the browser
 * serialises the Error object.
 *
 * @param context - A short human-readable label for where the error occurred
 *   (e.g. "Firebase Order/Table Mutation"). Do NOT include leading "❌ [" — the
 *   helper adds that formatting.
 * @param error - The caught value (may be any type).
 */
function logStructuredFirebaseError(context: string, error: unknown): void {
  const e = error as Record<string, unknown> | null | undefined;
  console.error(`❌ [${context} FAILED]:`, {
    code: e?.code,
    message: e?.message,
    name: e?.name,
    serverMessage: e?.serverMessage,
    details: e?.details,
  });
}

function isRunningOrderRecord(order: Record<string, unknown>): boolean {
  return order.status === "active" || order.status === "billed";
}

const toFirebaseCustomerRecord = (customer: FirebaseCustomerRecord): FirebaseCustomerRecord => ({
  ...customer,
  repayments: Array.isArray(customer.repayments) ? customer.repayments : [],
});

function customerAfterCreditResetMarker(
  customer: FirebaseCustomerRecord,
  marker: SyncMutation | undefined,
): FirebaseCustomerRecord {
  const normalized = Array.isArray(customer.repayments)
    ? customer
    : { ...customer, repayments: [] };
  if (!marker || normalized.creditResetMutationId === marker.syncMutationId) {
    return normalized;
  }
  return {
    ...normalized,
    currentDue: 0,
    repayments: [],
    creditResetRevision: marker.syncRevision,
    creditResetMutationId: marker.syncMutationId,
  };
}

/**
 * Write one customer and its complete repayment ledger.
 *
 * This intentionally writes the complete customer record rather than only the
 * changed field. That keeps each customer key self-contained and lets a new
 * device hydrate the balance and history in one read.
 */
export async function writeCustomer(customerData: FirebaseCustomerRecord) {
  try {
    const markersWereHydrated = isSelectiveResetMarkersHydrated();
    await ensureResetMarkersHydrated();
    // Fail closed while this client is still learning the current generation.
    // Otherwise, a stale cached customer could be written during startup after
    // another terminal has already reset the customer directory.
    if (!markersWereHydrated) return;

    const expectedGeneration =
      getObservedResetGeneration("customerCredit") ?? BASELINE_RESET_GENERATION;
    const latestMarker = (await get(ref(db, "resetMarkers/customerCredit"))).val() as
      | SyncMutation
      | undefined;
    if (expectedGeneration !== resetGeneration(latestMarker)) return;

    await update(ref(db), {
      [`customers/${customerData.id}`]: recordData({
        ...customerAfterCreditResetMarker(customerData, undefined),
        customerCreditResetGeneration: expectedGeneration,
      }),
    });
  } catch (error) {
    logStructuredFirebaseError("Firebase Customer Write", error);
  }
}

/** Write customer records only when this terminal has the current reset generation. */
export async function writeCustomersToFirebase(customers: FirebaseCustomerRecord[]) {
  try {
    const markersWereHydrated = isSelectiveResetMarkersHydrated();
    await ensureResetMarkersHydrated();
    if (!markersWereHydrated) return;

    const expectedGeneration =
      getObservedResetGeneration("customerCredit") ?? BASELINE_RESET_GENERATION;
    const latestMarker = (await get(ref(db, "resetMarkers/customerCredit"))).val() as
      | SyncMutation
      | undefined;
    if (expectedGeneration !== resetGeneration(latestMarker)) return;

    const updates = Object.fromEntries(
      customers.map((customer) => [
        `customers/${customer.id}`,
        recordData({
          ...customerAfterCreditResetMarker(customer, undefined),
          customerCreditResetGeneration: expectedGeneration,
        }),
      ]),
    );
    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
    }
  } catch (error) {
    logStructuredFirebaseError("Firebase Customers Write", error);
  }
}

export async function deleteCustomerFirebase(customerId: string) {
  try {
    await set(ref(db, `customers/${customerId}`), null);
  } catch (error) {
    logStructuredFirebaseError("Firebase Customer Delete", error);
  }
}

/**
 * Subscribe to all customer records. Firebase may return either an object
 * keyed by customer ID or an array from older writes, so normalize both.
 */
export function subscribeToCustomers(
  callback: (customers: FirebaseCustomerRecord[]) => void,
  onError?: (error: unknown) => void,
) {
  try {
    let rawCustomers: unknown = null;
    let legacyResetMarkers: Record<string, SyncMutation> = {};
    let customerCreditReset: SyncMutation | undefined;
    let customersReady = false;
    let legacyMarkersReady = false;
    let customerCreditResetReady = false;

    const emit = () => {
      if (!customersReady || !legacyMarkersReady || !customerCreditResetReady) return;
      const records = toFirebaseEntries(rawCustomers).map(([firebaseKey, record]) => {
        const id = typeof record.id === "string" ? record.id : firebaseKey;
        return {
          firebaseKey,
          record: {
            ...record,
            id,
            repayments: Array.isArray(record.repayments) ? record.repayments : [],
          } as FirebaseCustomerRecord,
        };
      });

      const repairs: Record<string, unknown> = {};
      const safeRecords = records.flatMap(({ firebaseKey, record }) => {
        const recordGeneration =
          record.customerCreditResetGeneration ?? BASELINE_RESET_GENERATION;
        if (recordGeneration !== resetGeneration(customerCreditReset)) {
          repairs[`customers/${firebaseKey}`] = null;
          return [];
        }

        const marker = legacyResetMarkers[record.id];
        const safeRecord = customerAfterCreditResetMarker(record, marker);
        if (safeRecord !== record && marker) {
          repairs[`customers/${firebaseKey}/currentDue`] = 0;
          repairs[`customers/${firebaseKey}/repayments`] = null;
          repairs[`customers/${firebaseKey}/creditResetRevision`] = marker.syncRevision;
          repairs[`customers/${firebaseKey}/creditResetMutationId`] = marker.syncMutationId;
        }
        return [safeRecord];
      });

      callback(safeRecords);
      if (Object.keys(repairs).length > 0) {
        void update(ref(db), repairs).catch((error) => {
          logStructuredFirebaseError("Firebase Customer Credit Repair", error);
        });
      }
    };

    const unsubscribeCustomers = onValue(
      ref(db, "customers"),
      (snapshot) => {
        try {
          rawCustomers = snapshot.val();
          customersReady = true;
          emit();
        } catch (error) {
          logStructuredFirebaseError("Firebase Customer Snapshot", error);
          onError?.(error);
        }
      },
      (error) => {
        logStructuredFirebaseError("Firebase Customer Listener", error);
        onError?.(error);
      },
    );
    const unsubscribeMarkers = onValue(
      ref(db, "customerCreditResetTombstones"),
      (snapshot) => {
        legacyResetMarkers = snapshot.val() ?? {};
        legacyMarkersReady = true;
        emit();
      },
      (error) => {
        logStructuredFirebaseError("Firebase Customer Credit Marker Listener", error);
        onError?.(error);
      },
    );
    const unsubscribeCustomerCreditReset = onValue(
      ref(db, "resetMarkers/customerCredit"),
      (snapshot) => {
        customerCreditReset = snapshot.val() ?? undefined;
        customerCreditResetReady = true;
        emit();
      },
      (error) => {
        logStructuredFirebaseError("Firebase Customer Credit Reset Listener", error);
        onError?.(error);
      },
    );
    return () => {
      unsubscribeCustomers();
      unsubscribeMarkers();
      unsubscribeCustomerCreditReset();
    };
  } catch (error) {
    logStructuredFirebaseError("Firebase Customer Subscription", error);
    onError?.(error);
    return () => {};
  }
}

// Deeply sanitizes raw Firebase data
export function sanitizeOrder(rawOrder: any): Order {
  if (!rawOrder) return rawOrder;

  const items = toArray(rawOrder.items);
  const tablePayments = toArray(rawOrder.tablePayments).map((pay: any) => ({
    ...pay,
    itemIds: toArray(pay?.itemIds),
  }));

  return {
    ...rawOrder,
    items,
    tablePayments,
  };
}

// Push Orders
export async function pushOrdersToFirebase(orders: Order[]) {
  try {
    const uuidKeyedOrders = Object.fromEntries(
      (orders || [])
        .filter((order) => order && order.id)
        .map((order) => [order.id, order]),
    );
    await update(ref(db), {
      orders: JSON.parse(JSON.stringify(uuidKeyedOrders)),
    });
  } catch (error) {
    logStructuredFirebaseError("Firebase Orders Push", error);
  }
}

// Push Tables Status
export async function pushTablesToFirebase(tables: CafeTable[]) {
  try {
    // Write as a UUID-keyed object, not an array. Using an array causes Firebase
    // to store records under integer keys (0, 1, 2…) which then coexist with the
    // UUID-keyed records written by writeOrderTableMutation, creating duplicate
    // entries per table that drive infinite repair loops in subscribeToTables.
    const uuidKeyedMap = Object.fromEntries((tables || []).map((t) => [t.id, t]));
    await set(ref(db, "tables"), JSON.parse(JSON.stringify(uuidKeyedMap)));
  } catch (error) {
    logStructuredFirebaseError("Firebase Tables Push", error);
  }
}

// Push Payments
export async function pushPaymentsToFirebase(payments: Payment[]) {
  try {
    // Kept for compatibility with legacy callers. Never replace /payments as an
    // array: individual payment writes retain concurrent settlements and apply
    // sales-history reset generation checks.
    const canonicalPayments = Object.values(
      toFirebaseIdRecordMap(payments || [], "payments"),
    );
    await Promise.all(canonicalPayments.map((payment) => writePaymentRecord(payment)));
  } catch (error) {
    logStructuredFirebaseError("Firebase Payments Push", error);
  }
}

// ── Granular single-record writers ────────────────────────────────────────────
// These write directly to a child path so a single device update never
// replaces the entire root array — safe for concurrent multi-device use.

export type SyncMutation = {
  syncRevision: number;
  syncMutationId: string;
};

export type OrderTombstone = SyncMutation & {
  id: string;
};

type ResetMarkerModule =
  | "activeFloor"
  | "salesHistory"
  | "kitchenOperations"
  | "barInventory"
  | "maintenanceExpenses"
  | "customerCredit";

let observedResetMarkers: Partial<Record<ResetMarkerModule, SyncMutation>> | null = null;
let resetMarkerHydration: Promise<void> | null = null;
const unsafeFirebaseCollections = new Set<string>();

export function setFirebaseCollectionSchemaSafety(path: string, isSafe: boolean): void {
  if (isSafe) unsafeFirebaseCollections.delete(path);
  else unsafeFirebaseCollections.add(path);
}

export function canWriteFirebaseCollection(path: string): boolean {
  return !unsafeFirebaseCollections.has(path);
}

function assertFirebaseCollectionIsSafeToWrite(path: string): void {
  if (!canWriteFirebaseCollection(path)) {
    throw new Error(
      `Firebase ${path} contains malformed or duplicate IDs. Run the schema migration before writing this collection.`,
    );
  }
}

export const BASELINE_RESET_GENERATION = "baseline";

function resetGeneration(marker: Partial<SyncMutation> | undefined): string {
  return marker?.syncMutationId ?? BASELINE_RESET_GENERATION;
}

export function getObservedResetGeneration(module: ResetMarkerModule): string | undefined {
  if (!observedResetMarkers) return undefined;
  return resetGeneration(observedResetMarkers[module]);
}

export function isSelectiveResetMarkersHydrated(): boolean {
  return observedResetMarkers !== null;
}

async function ensureResetMarkersHydrated(): Promise<void> {
  if (observedResetMarkers) return;
  if (!resetMarkerHydration) {
    resetMarkerHydration = get(ref(db, "resetMarkers"))
      .then((snapshot) => {
        // A realtime listener may have delivered a newer snapshot while this
        // one-off read was in flight. Never overwrite that newer observation.
        if (!observedResetMarkers) {
          observedResetMarkers = snapshot.val() ?? {};
        }
      })
      .finally(() => {
        resetMarkerHydration = null;
      });
  }
  await resetMarkerHydration;
}

export function subscribeToSelectiveResetMarkers(): () => void {
  return onValue(ref(db, "resetMarkers"), (snapshot) => {
    observedResetMarkers = snapshot.val() ?? {};
  });
}

async function pushCollectionWithResetGuard(
  path: string,
  value: Array<{ id?: unknown }>,
  module: ResetMarkerModule,
): Promise<void> {
  await ensureResetMarkersHydrated();
  assertFirebaseCollectionIsSafeToWrite(path);
  const expectedMarker = observedResetMarkers?.[module];
  const canonical = value.length > 0 ? recordData(toFirebaseIdRecordMap(value, path)) : null;

  const latestMarker = (await get(ref(db, `resetMarkers/${module}`))).val() as SyncMutation | undefined;
  if (resetGeneration(expectedMarker) !== resetGeneration(latestMarker)) return;
  await runTransaction(ref(db, path), () => canonical, { applyLocally: false });
}

function currentBarInventoryGeneration(value: unknown): string {
  if (!value || typeof value !== "object") return BASELINE_RESET_GENERATION;
  const sentinel = (value as Record<string, unknown>)[BAR_INVENTORY_RESET_META_KEY];
  if (!sentinel || typeof sentinel !== "object") return BASELINE_RESET_GENERATION;
  const generation = (sentinel as Record<string, unknown>).generation;
  return typeof generation === "string" ? generation : BASELINE_RESET_GENERATION;
}

/**
 * Product catalogs and menu mappings are reset-sensitive. The reset writes its
 * generation into every surviving record, so this transaction can compare that
 * generation atomically at the collection path without requiring root write
 * permission. A stale client cannot restore pre-reset stock or mappings.
 */
async function pushBarCatalogCollection(
  path: "alcoholProducts" | "beverageProducts" | "cigaretteProducts" | "invMappings",
  value: Array<{ id?: unknown }>,
): Promise<void> {
  await ensureResetMarkersHydrated();
  assertFirebaseCollectionIsSafeToWrite(path);
  const expectedGeneration = getObservedResetGeneration("barInventory") ?? BASELINE_RESET_GENERATION;
  const records = toFirebaseIdRecordMap(value, path);
  const canonical = Object.fromEntries(
    [
      ...Object.entries(records),
      [BAR_INVENTORY_RESET_META_KEY, { generation: expectedGeneration }],
    ],
  );

  await runTransaction(ref(db, path), (currentValue) => {
    const currentGeneration = currentBarInventoryGeneration(currentValue);
    if (currentGeneration !== expectedGeneration) {
      return currentValue;
    }
    return recordData(canonical);
  }, { applyLocally: false });
}

const pendingOrderWrites = new Map<string, SyncMutation>();
const pendingTableWrites = new Map<string, SyncMutation>();
const pendingOrderDeletes = new Map<string, SyncMutation>();

function newSyncMutation(): SyncMutation {
  return {
    // A monotonic local clock is enough for acknowledging this tab's own
    // write. The mutation ID breaks ties between two writes in one tick.
    syncRevision: Date.now(),
    syncMutationId: crypto.randomUUID(),
  };
}

function withSyncMutation<T extends object>(record: T, mutation: SyncMutation): T & SyncMutation {
  return {
    ...record,
    ...mutation,
  };
}

function sameMutation(left: SyncMutation | undefined, right: SyncMutation): boolean {
  return Boolean(
    left &&
      left.syncRevision === right.syncRevision &&
      left.syncMutationId === right.syncMutationId,
  );
}

function recordData<T>(record: T): T {
  return JSON.parse(JSON.stringify(record));
}

function shouldDeleteOrderForReset(
  order: Pick<Order, "status"> | Record<string, unknown>,
  selection: Pick<SelectiveResetSelection, "salesHistory" | "activeFloor">,
): boolean {
  const running = isRunningOrderRecord(order as Record<string, unknown>);
  return (selection.activeFloor && running) || (selection.salesHistory && !running);
}

/**
 * Apply one selective reset as an allowlisted Firebase multi-location update.
 *
 * Protected master records are never replaced. Tables keep their identity and
 * layout fields, customer profiles keep their identity/lifetime metrics, and
 * bar products keep their definitions; only transactional child fields are
 * normalized.
 */
export async function applySelectiveResetToFirebase({
  selection,
  localOrders = [],
}: {
  selection: SelectiveResetSelection;
  localOrders?: Order[];
}): Promise<void> {
  const mutation = newSyncMutation();
  const deletedOrderIds = new Set<string>();
  const resetTableIds = new Set<string>();

  try {
    await runTransaction(ref(db), (currentData) => {
      const root = cloneFirebaseRoot(currentData);

      if (selection.salesHistory || selection.activeFloor) {
        const orders = toFirebaseRecordMap(root.orders);
        for (const [firebaseKey, order] of Object.entries(orders)) {
          if (!shouldDeleteOrderForReset(order, selection)) continue;
          const orderId = typeof order.id === "string" ? order.id : firebaseKey;
          deletedOrderIds.add(orderId);
          delete orders[firebaseKey];
        }
        for (const order of localOrders) {
          if (!shouldDeleteOrderForReset(order, selection)) continue;
          deletedOrderIds.add(order.id);
          delete orders[recordKeyForId(orders, order.id)];
        }
        assignFirebaseCollection(root, "orders", orders);

        const tombstones = toFirebaseRecordMap(root.orderTombstones);
        for (const orderId of deletedOrderIds) {
          pendingOrderWrites.delete(orderId);
          pendingOrderDeletes.set(orderId, mutation);
          tombstones[orderId] = { id: orderId, ...mutation };
        }
        assignFirebaseCollection(root, "orderTombstones", tombstones);
      }

      if (selection.salesHistory) {
        delete root.payments;
        root.settings = {
          ...(root.settings ?? {}),
          billCounter: 1000,
          kotCounter: 100,
        };
        delete root.settings.kotLastResetDate;
        root.resetMarkers = {
          ...(root.resetMarkers ?? {}),
          salesHistory: mutation,
        };
      }

      if (selection.activeFloor) {
        const tables = toFirebaseRecordMap(root.tables);
        for (const [firebaseKey, table] of Object.entries(tables)) {
          const tableId = typeof table.id === "string" ? table.id : firebaseKey;
          resetTableIds.add(tableId);
          pendingTableWrites.delete(tableId);
          pendingTableWrites.set(tableId, mutation);
          const {
            orderId: _orderId,
            orderStartTime: _orderStartTime,
            pax: _pax,
            ...definition
          } = table;
          tables[firebaseKey] = {
            ...definition,
            status: "free",
            activeFloorResetGeneration: mutation.syncMutationId,
            ...mutation,
          };
        }
        assignFirebaseCollection(root, "tables", tables);
        root.resetMarkers = {
          ...(root.resetMarkers ?? {}),
          activeFloor: mutation,
        };
      }

      if (selection.customerCredit) {
        // Approach A: complete wipe — delete the entire /customers collection
        // so stale offline tabs cannot resurrect deleted profiles via re-sync.
        delete root.customers;
        // Also clear any credit-reset tombstones from the previous partial-reset era.
        delete root.customerCreditResetTombstones;
        root.resetMarkers = {
          ...(root.resetMarkers ?? {}),
          customerCredit: mutation,
        };
      }

      if (selection.kitchenOperations) {
        delete root.kitchenPurchases;
        delete root.meatEntries;
        delete root.groceryPurchases;
        root.resetMarkers = {
          ...(root.resetMarkers ?? {}),
          kitchenOperations: mutation,
        };
      }

      if (selection.barInventory) {
        const alcoholProducts = toFirebaseRecordMap(root.alcoholProducts);
        const beverageProducts = toFirebaseRecordMap(root.beverageProducts);
        const cigaretteProducts = toFirebaseRecordMap(root.cigaretteProducts);
        const invMappings = toFirebaseRecordMap(root.invMappings);
        delete alcoholProducts[BAR_INVENTORY_RESET_META_KEY];
        delete beverageProducts[BAR_INVENTORY_RESET_META_KEY];
        delete cigaretteProducts[BAR_INVENTORY_RESET_META_KEY];
        delete invMappings[BAR_INVENTORY_RESET_META_KEY];
        for (const product of Object.values(alcoholProducts)) {
          product.currentStockMl = 0;
        }
        for (const product of Object.values(beverageProducts)) {
          product.currentStock = 0;
        }
        for (const product of Object.values(cigaretteProducts)) {
          product.currentSticks = 0;
        }
        alcoholProducts[BAR_INVENTORY_RESET_META_KEY] = { generation: mutation.syncMutationId };
        beverageProducts[BAR_INVENTORY_RESET_META_KEY] = { generation: mutation.syncMutationId };
        cigaretteProducts[BAR_INVENTORY_RESET_META_KEY] = { generation: mutation.syncMutationId };
        invMappings[BAR_INVENTORY_RESET_META_KEY] = { generation: mutation.syncMutationId };
        assignFirebaseCollection(root, "alcoholProducts", alcoholProducts);
        assignFirebaseCollection(root, "beverageProducts", beverageProducts);
        assignFirebaseCollection(root, "cigaretteProducts", cigaretteProducts);
        assignFirebaseCollection(root, "invMappings", invMappings);
        delete root.invMovements;
        root.resetMarkers = {
          ...(root.resetMarkers ?? {}),
          barInventory: mutation,
        };
      }

      if (selection.maintenanceExpenses) {
        delete root.maintenanceExpenses;
        root.resetMarkers = {
          ...(root.resetMarkers ?? {}),
          maintenanceExpenses: mutation,
        };
      }

      return root;
    }, { applyLocally: false });
  } catch (error) {
    for (const orderId of deletedOrderIds) {
      if (sameMutation(pendingOrderDeletes.get(orderId), mutation)) {
        pendingOrderDeletes.delete(orderId);
      }
    }
    for (const tableId of resetTableIds) {
      if (sameMutation(pendingTableWrites.get(tableId), mutation)) {
        pendingTableWrites.delete(tableId);
      }
    }
    logStructuredFirebaseError("Firebase Selective Reset", error);
    throw error;
  }
}

/**
 * Write related order/table records as an atomic multi-location update.
 *
 * Uses `update(ref(db), paths)` targeting only the affected record paths
 * (`orders/{id}`, `tables/{id}`, `orderTombstones/{id}`) instead of a
 * root-level `runTransaction`. This avoids the root-read permission requirement
 * that caused the repeated "Firebase Order/Table Mutation FAILED" errors, while
 * preserving reset-generation filtering, tombstone awareness, sync-revision
 * metadata, and pending-write tracking.
 *
 * Generation checks use the locally-observed reset markers kept up to date by
 * `subscribeToSelectiveResetMarkers()`. A one-off `get("orderTombstones")` is
 * used to resolve tombstoned order IDs without touching the database root.
 *
 * Returns `{ success: true }` when the write is confirmed or silently skipped,
 * or `{ success: false, error }` when Firebase rejects the write. Existing
 * callers that do not inspect the return value continue to work unchanged.
 */
export async function writeOrderTableMutation({
  orders = [],
  tables = [],
  deletedOrderIds = [],
}: {
  orders?: Order[];
  tables?: CafeTable[];
  deletedOrderIds?: string[];
}): Promise<{ success: boolean; error?: unknown }> {
  if (!orders.length && !tables.length && !deletedOrderIds.length) {
    return { success: true };
  }

  const markersWereHydrated = isSelectiveResetMarkersHydrated();
  await ensureResetMarkersHydrated();
  const hasAmbiguousUngeneratedWrite =
    !markersWereHydrated &&
    (orders.some((order) =>
      isRunningOrderRecord(order as unknown as Record<string, unknown>)
        ? !order.activeFloorResetGeneration
        : !order.salesHistoryResetGeneration,
    ) ||
      tables.some((table) =>
        table.status !== "free" && !table.activeFloorResetGeneration,
      ));
  if (hasAmbiguousUngeneratedWrite) return { success: true };

  const mutation = newSyncMutation();
  const expectedActiveFloorGeneration =
    getObservedResetGeneration("activeFloor") ?? BASELINE_RESET_GENERATION;
  const expectedSalesHistoryGeneration =
    getObservedResetGeneration("salesHistory") ?? BASELINE_RESET_GENERATION;
  const writtenOrderIds = new Set<string>();
  const writtenTableIds = new Set<string>();

  try {
    // Fetch only the tombstones collection — this avoids the root-level read
    // that the previous runTransaction required and works within narrower rules.
    const tombstoneSnap = await get(ref(db, "orderTombstones"));
    const tombstonedOrderIds = new Set(
      Object.keys((tombstoneSnap.val() ?? {}) as Record<string, unknown>),
    );

    const updates: Record<string, unknown> = {};
    const blockedOrderIds = new Set<string>();

    for (const order of orders) {
      const running = isRunningOrderRecord(order as unknown as Record<string, unknown>);
      const incomingGeneration = running
        ? order.activeFloorResetGeneration ?? expectedActiveFloorGeneration
        : order.salesHistoryResetGeneration ?? expectedSalesHistoryGeneration;
      const currentGeneration = running
        ? expectedActiveFloorGeneration
        : expectedSalesHistoryGeneration;
      const blocked =
        tombstonedOrderIds.has(order.id) ||
        incomingGeneration !== currentGeneration;
      if (blocked) {
        blockedOrderIds.add(order.id);
        continue;
      }
      pendingOrderWrites.set(order.id, mutation);
      writtenOrderIds.add(order.id);
      const generationFields = running
        ? { activeFloorResetGeneration: expectedActiveFloorGeneration }
        : { salesHistoryResetGeneration: expectedSalesHistoryGeneration };
      updates[`orders/${order.id}`] = recordData(
        withSyncMutation({ ...order, ...generationFields }, mutation),
      );
    }

    for (const table of tables) {
      const linkedOrderWasReset =
        Boolean(table.orderId) &&
        (tombstonedOrderIds.has(table.orderId as string) ||
          blockedOrderIds.has(table.orderId as string));
      const occupancyHasStaleGeneration =
        table.status !== "free" &&
        (table.activeFloorResetGeneration ?? expectedActiveFloorGeneration) !==
          expectedActiveFloorGeneration;
      const safeTable =
        linkedOrderWasReset || occupancyHasStaleGeneration
          ? (() => {
              const {
                orderId: _orderId,
                orderStartTime: _orderStartTime,
                pax: _pax,
                ...definition
              } = table;
              return { ...definition, status: "free" as const };
            })()
          : {
              ...table,
              activeFloorResetGeneration: expectedActiveFloorGeneration,
            };
      pendingTableWrites.set(table.id, mutation);
      writtenTableIds.add(table.id);
      updates[`tables/${table.id}`] = recordData(
        withSyncMutation(safeTable, mutation),
      );
    }

    for (const orderId of deletedOrderIds) {
      pendingOrderWrites.delete(orderId);
      pendingOrderDeletes.set(orderId, mutation);
      updates[`orders/${orderId}`] = null;
      updates[`orderTombstones/${orderId}`] = recordData({ id: orderId, ...mutation });
    }

    // Nothing to write — all orders were blocked by generation/tombstone guards.
    if (Object.keys(updates).length === 0) {
      return { success: true };
    }

    await update(ref(db), updates);
    return { success: true };
  } catch (error) {
    for (const orderId of writtenOrderIds) {
      if (sameMutation(pendingOrderWrites.get(orderId), mutation)) {
        pendingOrderWrites.delete(orderId);
      }
    }
    for (const tableId of writtenTableIds) {
      if (sameMutation(pendingTableWrites.get(tableId), mutation)) {
        pendingTableWrites.delete(tableId);
      }
    }
    for (const orderId of deletedOrderIds) {
      if (sameMutation(pendingOrderDeletes.get(orderId), mutation)) {
        pendingOrderDeletes.delete(orderId);
      }
    }
    logStructuredFirebaseError("Firebase Order/Table Mutation", error);
    return { success: false, error };
  }
}

/** Write (or overwrite) one table record at `tables/${table.id}`. */
export async function writeTableRecord(table: CafeTable): Promise<void> {
  await writeOrderTableMutation({ tables: [table] });
}

/** Delete one table record by writing `null` to `tables/${tableId}`. */
export async function deleteTableRecord(tableId: string): Promise<void> {
  try {
    await update(ref(db), { [`tables/${tableId}`]: null });
  } catch (error) {
    logStructuredFirebaseError("Firebase Table Delete", error);
  }
}

/** Write (or overwrite) one order record at `orders/${order.id}`. */
export async function writeOrderRecord(order: Order): Promise<void> {
  await writeOrderTableMutation({ orders: [order] });
}

/** Delete one order record and publish a durable tombstone. */
export async function deleteOrderRecord(orderId: string): Promise<void> {
  await writeOrderTableMutation({ deletedOrderIds: [orderId] });
}

export function getPendingOrderWrite(orderId: string): SyncMutation | undefined {
  return pendingOrderWrites.get(orderId);
}

export function getPendingTableWrite(tableId: string): SyncMutation | undefined {
  return pendingTableWrites.get(tableId);
}

export function getPendingOrderDelete(orderId: string): SyncMutation | undefined {
  return pendingOrderDeletes.get(orderId);
}

function acknowledgePendingWrite(
  pending: Map<string, SyncMutation>,
  id: string,
  remote: Partial<SyncMutation> | undefined,
) {
  const local = pending.get(id);
  if (
    local &&
    remote?.syncRevision === local.syncRevision &&
    remote?.syncMutationId === local.syncMutationId
  ) {
    pending.delete(id);
  }
}

/**
 * Write (or overwrite) one payment record at `payments/${payment.id}`.
 *
 * Uses a targeted `get("resetMarkers/salesHistory")` + `update()` instead of
 * a root-level `runTransaction`. The root transaction required root read/write
 * permission that production Firebase rules deny, causing every payment write
 * to silently fail with an empty error object. This matches the pattern
 * already applied to `writeOrderTableMutation`.
 *
 * Returns `{ success: true }` on success or silent skip, or
 * `{ success: false, error }` when Firebase rejects the write. Existing
 * callers that do not inspect the return value continue to work unchanged.
 */
export async function writePaymentRecord(payment: Payment): Promise<{ success: boolean; error?: unknown }> {
  try {
    assertFirebaseCollectionIsSafeToWrite("payments");
    toFirebaseIdRecordMap([payment], "payments");
    const markersWereHydrated = isSelectiveResetMarkersHydrated();
    await ensureResetMarkersHydrated();
    if (!markersWereHydrated && !payment.salesHistoryResetGeneration) return { success: true };

    const expectedGeneration =
      payment.salesHistoryResetGeneration ??
      getObservedResetGeneration("salesHistory") ??
      BASELINE_RESET_GENERATION;

    // Read only the marker we need — no root-level read required.
    const markerSnap = await get(ref(db, "resetMarkers/salesHistory"));
    const marker = markerSnap.val() as SyncMutation | null;
    const currentGeneration = resetGeneration(marker ?? undefined);

    // Generation mismatch means a selective reset happened after this payment
    // was created — discard without writing to avoid polluting the new period.
    if (expectedGeneration !== currentGeneration) return { success: true };

    await update(ref(db), {
      [`payments/${payment.id}`]: recordData({
        ...payment,
        salesHistoryResetGeneration: currentGeneration,
      }),
    });
    return { success: true };
  } catch (error) {
    logStructuredFirebaseError("Firebase Payment Write", error);
    return { success: false, error };
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// Push Settings
export async function pushSettingsToFirebase(settings: Settings) {
  try {
    const { adminPin: _legacyAdminPin, ...settingsWithoutLegacyPin } =
      settings as Settings & { adminPin?: unknown };
    void _legacyAdminPin;
    await set(
      ref(db, "settings"),
      JSON.parse(JSON.stringify(normalizeSettingsLogos(settingsWithoutLegacyPin || {}))),
    );
  } catch (error) {
    logStructuredFirebaseError("Firebase Settings Push", error);
  }
}

/** Keep the shared header logo available as a small, independently subscribable setting. */
export async function pushLogoToFirebase(logo: string | null) {
  try {
    await set(ref(db, "settings/logo"), sanitizeLogoSource(logo));
  } catch (error) {
    logStructuredFirebaseError("Firebase Logo Push", error);
  }
}

// Push Area Order
export async function pushAreaOrderToFirebase(areaOrder: string[]) {
  try {
    await set(ref(db, "areaOrder"), JSON.parse(JSON.stringify(areaOrder || [])));
  } catch (error) {
    logStructuredFirebaseError("Firebase Area Order Push", error);
  }
}

// Push Alcohol Products
// Push Grocery Purchases
export async function pushGroceryPurchasesToFirebase(purchases: GroceryPurchase[]) {
  try {
    await pushCollectionWithResetGuard(
      "groceryPurchases",
      purchases || [],
      "kitchenOperations",
    );
  } catch (error) {
    logStructuredFirebaseError("Firebase Grocery Purchases Push", error);
  }
}

// Push Inventory Movements
export async function pushInvMovementsToFirebase(movements: InventoryMovement[]) {
  try {
    await pushCollectionWithResetGuard(
      "invMovements",
      movements || [],
      "barInventory",
    );
  } catch (error) {
    logStructuredFirebaseError("Firebase Inventory Movements Push", error);
  }
}

// Push Inventory Mappings
export async function pushInvMappingsToFirebase(mappings: InvMenuMapping[]) {
  try {
    await pushBarCatalogCollection("invMappings", mappings || []);
  } catch (error) {
    logStructuredFirebaseError("Firebase Inventory Mappings Push", error);
  }
}

export async function writeInvMappingToFirebase(mapping: InvMenuMapping): Promise<void> {
  try {
    assertFirebaseCollectionIsSafeToWrite("invMappings");
    await firebaseSet(ref(db, `invMappings/${mapping.id}`), JSON.parse(JSON.stringify(mapping)));
  } catch (error) {
    logStructuredFirebaseError("Firebase Inventory Mapping Write", error);
    throw error;
  }
}

export async function deleteInvMappingFromFirebase(id: string): Promise<void> {
  try {
    assertFirebaseCollectionIsSafeToWrite("invMappings");
    await firebaseSet(ref(db, `invMappings/${id}`), null);
  } catch (error) {
    logStructuredFirebaseError("Firebase Inventory Mapping Delete", error);
    throw error;
  }
}

export async function pushAlcoholProductsToFirebase(products: AlcoholProduct[]) {
  try {
    await pushBarCatalogCollection("alcoholProducts", products || []);
  } catch (error) {
    logStructuredFirebaseError("Firebase Alcohol Products Push", error);
  }
}

export async function pushBeverageProductsToFirebase(products: BeverageProduct[]) {
  try {
    await pushBarCatalogCollection("beverageProducts", products || []);
  } catch (error) {
    logStructuredFirebaseError("Firebase Beverage Products Push", error);
  }
}

export async function pushCigaretteProductsToFirebase(products: CigaretteProduct[]) {
  try {
    await pushBarCatalogCollection("cigaretteProducts", products || []);
  } catch (error) {
    logStructuredFirebaseError("Firebase Cigarette Products Push", error);
  }
}

export async function writeStaffUserToFirebase(user: StaffUser): Promise<void> {
  try {
    assertFirebaseCollectionIsSafeToWrite("users");
    toFirebaseIdRecordMap([user], "users");
    await set(ref(db, `users/${user.id}`), JSON.parse(JSON.stringify(user)));
  } catch (error) {
    logStructuredFirebaseError("Firebase Staff User Write", error);
  }
}

export async function deleteStaffUserFromFirebase(userId: string): Promise<void> {
  try {
    await set(ref(db, `users/${userId}`), null);
  } catch (error) {
    logStructuredFirebaseError("Firebase Staff User Delete", error);
  }
}

// Upsert Staff Users without ever replacing the /users collection.
export async function pushStaffToFirebase(users: StaffUser[]) {
  try {
    assertFirebaseCollectionIsSafeToWrite("users");
    toFirebaseIdRecordMap(users || [], "users");
    await Promise.all((users || []).map((user) => writeStaffUserToFirebase(user)));
  } catch (error) {
    logStructuredFirebaseError("Firebase Staff Push", error);
  }
}

// Subscribe to Live Orders and durable delete tombstones.
export function subscribeToOrders(
  callback: (orders: Order[], tombstones: OrderTombstone[]) => void,
) {
  const ordersByStatus = new Map<"active" | "billed", Array<{ firebaseKey: string; order: Order }>>();
  let tombstones: OrderTombstone[] = [];
  let ordersReady = false;
  let tombstonesReady = false;
  let resetMarkersReady = false;
  let resetMarkers: {
    activeFloor?: SyncMutation;
    salesHistory?: SyncMutation;
  } = {};

  const emit = () => {
    if (!ordersReady || !tombstonesReady || !resetMarkersReady) return;

    const remoteOrderEntries = [...(ordersByStatus.get("active") ?? []), ...(ordersByStatus.get("billed") ?? [])];
    for (const { order } of remoteOrderEntries) {
      acknowledgePendingWrite(pendingOrderWrites, order.id, order);
    }

    const tombstoneById = new Map(tombstones.map((tombstone) => [tombstone.id, tombstone]));
    const repairs: Record<string, unknown> = {};
    const cleanOrdersById = new Map<string, Order>();
    for (const { firebaseKey, order } of remoteOrderEntries) {
      const isIntegerKey = /^\d+$/.test(firebaseKey);
      const isLegacyKey = isIntegerKey || firebaseKey !== order.id;
      if (isLegacyKey) {
        // Keep the order data in memory under its canonical id, but remove the
        // legacy storage key so it cannot create duplicate records or trigger
        // repeated stale-order repairs.
        repairs[`orders/${firebaseKey}`] = null;
      }

      const resetMarker = isRunningOrderRecord(order as unknown as Record<string, unknown>)
        ? resetMarkers.activeFloor
        : resetMarkers.salesHistory;
      const recordGeneration = isRunningOrderRecord(order as unknown as Record<string, unknown>)
        ? order.activeFloorResetGeneration
        : order.salesHistoryResetGeneration;
      const wasReset =
        tombstoneById.has(order.id) ||
        (recordGeneration !== undefined &&
          recordGeneration !== resetGeneration(resetMarker));
      if (!wasReset) {
        // Prefer the canonical UUID-keyed record when a legacy duplicate and
        // its UUID-keyed counterpart are both present.
        if (!cleanOrdersById.has(order.id) || !isLegacyKey) {
          cleanOrdersById.set(order.id, sanitizeOrder(order));
        }
        continue;
      }

      // Convergence guard for a legacy tab that does not use the transaction
      // writer: remove the stale record and add a permanent tombstone.
      //
      // Cross-tab dedup: if this tab already sent a delete for this order and
      // the tombstone has not yet arrived, skip re-sending — another tab (or
      // this one) already owns the repair.
      if (pendingOrderDeletes.has(order.id)) continue;
      repairs[`orders/${firebaseKey}`] = null;
      if (!tombstoneById.has(order.id) && resetMarker) {
        repairs[`orderTombstones/${order.id}`] = {
          id: order.id,
          ...resetMarker,
        };
      }
    }

    const cleanOrders = Array.from(cleanOrdersById.values());
    for (const tombstone of tombstones) {
      acknowledgePendingWrite(pendingOrderDeletes, tombstone.id, tombstone);
    }

    callback(cleanOrders, tombstones);
    if (Object.keys(repairs).length > 0) {
      void update(ref(db), repairs).catch((error) => {
        logStructuredFirebaseError("Firebase Stale Order Repair", error);
      });
    }
  };

  const subscribeToRunningStatus = (status: "active" | "billed") => onValue(
    query(ref(db, "orders"), orderByChild("status"), equalTo(status)),
    (snapshot) => {
      ordersByStatus.set(
        status,
        toFirebaseEntries(snapshot.val()).map(([firebaseKey, rawOrder]) => ({
          firebaseKey,
          order: sanitizeOrder({
            ...rawOrder,
            id: typeof rawOrder.id === "string" ? rawOrder.id : firebaseKey,
          }),
        })),
      );
      ordersReady = ordersByStatus.has("active") && ordersByStatus.has("billed");
      emit();
    },
    (error) => logStructuredFirebaseError(`Firebase ${status} Orders Listener`, error),
  );
  const unsubscribeActiveOrders = subscribeToRunningStatus("active");
  const unsubscribeBilledOrders = subscribeToRunningStatus("billed");

  const unsubscribeTombstones = onValue(ref(db, "orderTombstones"), (snapshot) => {
    tombstones = Object.entries(snapshot.val() ?? {})
      .filter(([, value]) => Boolean(value))
      .map(([id, value]) => ({
        id,
        ...(value as Omit<OrderTombstone, "id">),
      }));
    tombstonesReady = true;
    emit();
  });
  const unsubscribeResetMarkers = onValue(ref(db, "resetMarkers"), (snapshot) => {
    resetMarkers = snapshot.val() ?? {};
    resetMarkersReady = true;
    emit();
  });

  return () => {
    unsubscribeActiveOrders();
    unsubscribeBilledOrders();
    unsubscribeTombstones();
    unsubscribeResetMarkers();
  };
}

// Subscribe to Live Payments
export function subscribeToPayments(store: FirebaseSyncStore) {
  let paymentEntries: Array<{ firebaseKey: string; payment: Payment }> = [];
  let paymentsExist = false;
  let salesReset: SyncMutation | undefined;
  let paymentsReady = false;
  let resetReady = false;

  const emit = () => {
    if (!paymentsReady || !resetReady) return;
    const currentGeneration = resetGeneration(salesReset);
    const staleEntries = paymentEntries.filter(({ payment }) =>
      payment.salesHistoryResetGeneration !== undefined &&
      payment.salesHistoryResetGeneration !== currentGeneration,
    );
    const cleanPayments = paymentEntries
      .filter(({ payment }) =>
        payment.salesHistoryResetGeneration === undefined ||
        payment.salesHistoryResetGeneration === currentGeneration,
      )
      .map(({ payment }) => payment);
    const authoritativeExists =
      paymentsExist && (cleanPayments.length > 0 || !salesReset);
    store.setPayments(cleanPayments, authoritativeExists);
    if (staleEntries.length > 0) {
      const repairs = Object.fromEntries(
        staleEntries.map(({ firebaseKey }) => [`payments/${firebaseKey}`, null]),
      );
      void update(ref(db), repairs).catch((error) => {
        logStructuredFirebaseError("Firebase Stale Payment Repair", error);
      });
    }
  };

  const unsubscribePayments = onValue(ref(db, "payments"), (snapshot) => {
    const normalized = readFirebaseIdRecords<Payment>(snapshot.val(), "payments");
    setFirebaseCollectionSchemaSafety("payments", normalized.isSafe);
    if (!normalized.isSafe) {
      console.error("[Firebase Payments] Migration required before duplicate or malformed records can be repaired.", normalized.issues);
    }
    paymentEntries = normalized.entries.map(({ firebaseKey, record: rawPayment }) => ({
      firebaseKey,
      payment: {
        ...rawPayment,
        id: rawPayment.id,
      } as unknown as Payment,
    }));
    paymentsExist = snapshot.exists();
    paymentsReady = true;
    emit();
  });
  const unsubscribeReset = onValue(ref(db, "resetMarkers/salesHistory"), (snapshot) => {
    salesReset = snapshot.val() ?? undefined;
    resetReady = true;
    emit();
  });

  return () => {
    unsubscribePayments();
    unsubscribeReset();
  };
}

// Subscribe to Live Settings
export function subscribeToSettings(store: FirebaseSyncStore) {
  return onValue(ref(db, "settings"), (snapshot) => {
    const rawData = snapshot.val();
    if (rawData && typeof rawData === "object") {
      store.setSettings(normalizeSettingsLogos(rawData as Settings));
    }
  });
}

/** Subscribe to the canonical cross-device header logo path. */
export function subscribeToLogo(callback: (logo: string | null) => void) {
  return onValue(ref(db, "settings/logo"), (snapshot) => {
    const value = snapshot.val();
    callback(sanitizeLogoSource(value));
  });
}

// Subscribe to Live Menu Items
export function subscribeToMenuItems(store: FirebaseSyncStore) {
  return onValue(ref(db, "menu/items"), (snapshot) => {
    const normalized = normalizeMenuItemsSnapshot(snapshot.val());
    setFirebaseCollectionSchemaSafety("menu/items", normalized.isSafe);
    if (!normalized.isSafe) {
      console.error("[Firebase Menu Items] Migration required before malformed records can be written.", normalized.issues);
      return;
    }
    store.setMenuItems(normalized.records);
  });
}

/** Legacy bulk helper retained for seed tooling; UI mutations must use child writers below. */
export async function pushMenuItemsToFirebase(items: MenuItem[]) {
  try {
    assertFirebaseCollectionIsSafeToWrite("menu/items");
    const keyed = toFirebaseIdRecordMap(items || [], "menu/items");
    await Promise.all(Object.values(keyed).map((item) => writeMenuItemToFirebase(item)));
  } catch (error) {
    logStructuredFirebaseError("Firebase Menu Items Push", error);
  }
}

export async function writeMenuItemToFirebase(item: MenuItem): Promise<void> {
  try {
    assertFirebaseCollectionIsSafeToWrite("menu/items");
    toFirebaseIdRecordMap([item], "menu/items");
    await set(ref(db, `menu/items/${item.id}`), JSON.parse(JSON.stringify(item)));
  } catch (error) {
    logStructuredFirebaseError("Firebase Menu Item Write", error);
    throw error;
  }
}

export async function setMenuItemAvailabilityInFirebase(id: string, available: boolean): Promise<void> {
  try {
    assertFirebaseCollectionIsSafeToWrite("menu/items");
    await set(ref(db, `menu/items/${id}/available`), available);
  } catch (error) {
    logStructuredFirebaseError("Firebase Menu Item Availability", error);
    throw error;
  }
}

export async function deleteMenuItemFromFirebase(id: string): Promise<void> {
  try {
    assertFirebaseCollectionIsSafeToWrite("menu/items");
    await set(ref(db, `menu/items/${id}`), null);
  } catch (error) {
    logStructuredFirebaseError("Firebase Menu Item Delete", error);
    throw error;
  }
}

export function subscribeToCategories(store: FirebaseSyncStore) {
  return onValue(ref(db, "menu/categories"), (snapshot) => {
    const normalized = normalizeMenuCategoriesSnapshot(snapshot.val());
    setFirebaseCollectionSchemaSafety("menu/categories", normalized.isSafe);
    if (!normalized.isSafe) {
      console.error("[Firebase Categories] Migration required before malformed records can be written.", normalized.issues);
      return;
    }
    store.setCategories(normalized.records);
  });
}

/** Legacy bulk helper retained for seed tooling; UI mutations must use child writers below. */
export async function pushCategoriesToFirebase(categories: Category[]) {
  try {
    assertFirebaseCollectionIsSafeToWrite("menu/categories");
    const keyed = toFirebaseIdRecordMap(categories || [], "menu/categories");
    await Promise.all(Object.values(keyed).map((category) => writeCategoryToFirebase(category)));
  } catch (error) {
    logStructuredFirebaseError("Firebase Categories Push", error);
  }
}

export async function writeCategoryToFirebase(category: Category): Promise<void> {
  try {
    assertFirebaseCollectionIsSafeToWrite("menu/categories");
    toFirebaseIdRecordMap([category], "menu/categories");
    await set(ref(db, `menu/categories/${category.id}`), JSON.parse(JSON.stringify(category)));
  } catch (error) {
    logStructuredFirebaseError("Firebase Category Write", error);
    throw error;
  }
}

export async function deleteCategoryFromFirebase(id: string): Promise<void> {
  try {
    assertFirebaseCollectionIsSafeToWrite("menu/categories");
    await set(ref(db, `menu/categories/${id}`), null);
  } catch (error) {
    logStructuredFirebaseError("Firebase Category Delete", error);
    throw error;
  }
}

// Subscribe to Live Pillars
export function subscribeToPillars(store: FirebaseSyncStore) {
  return onValue(ref(db, "menu/pillars"), (snapshot) => {
    store.setPillars(toArray(snapshot.val()) as string[]);
  });
}

// Subscribe to Live Area Order
export function subscribeToAreaOrder(store: FirebaseSyncStore) {
  return onValue(ref(db, "areaOrder"), (snapshot) => {
    store.setAreaOrder(toArray(snapshot.val()) as string[]);
  });
}

// Subscribe to Live Alcohol Products
export function subscribeToAlcoholProducts(store: FirebaseSyncStore) {
  return onValue(ref(db, "alcoholProducts"), (snapshot) => {
    const normalized = readFirebaseIdRecords<AlcoholProduct>(snapshot.val(), "alcoholProducts");
    setFirebaseCollectionSchemaSafety("alcoholProducts", normalized.isSafe);
    if (!normalized.isSafe) console.error("[Firebase Inventory] Alcohol migration required.", normalized.issues);
    store.setAlcoholProducts(normalized.entries.map(({ record }) => record));
  });
}

// Subscribe to Live Beverage Products
export function subscribeToBeverageProducts(store: FirebaseSyncStore) {
  return onValue(ref(db, "beverageProducts"), (snapshot) => {
    const normalized = readFirebaseIdRecords<BeverageProduct>(snapshot.val(), "beverageProducts");
    setFirebaseCollectionSchemaSafety("beverageProducts", normalized.isSafe);
    if (!normalized.isSafe) console.error("[Firebase Inventory] Beverage migration required.", normalized.issues);
    store.setBeverageProducts(normalized.entries.map(({ record }) => record));
  });
}

// Subscribe to Live Cigarette Products
export function subscribeToCigaretteProducts(store: FirebaseSyncStore) {
  return onValue(ref(db, "cigaretteProducts"), (snapshot) => {
    const normalized = readFirebaseIdRecords<CigaretteProduct>(snapshot.val(), "cigaretteProducts");
    setFirebaseCollectionSchemaSafety("cigaretteProducts", normalized.isSafe);
    if (!normalized.isSafe) console.error("[Firebase Inventory] Cigarette migration required.", normalized.issues);
    store.setCigaretteProducts(normalized.entries.map(({ record }) => record));
  });
}

// Subscribe to Live Grocery Purchases
export function subscribeToGroceryPurchases(store: FirebaseSyncStore) {
  return onValue(ref(db, "groceryPurchases"), (snapshot) => {
    store.setGroceryPurchases(
      toArray(snapshot.val()) as GroceryPurchase[],
      snapshot.exists(),
    );
  });
}

// Subscribe to Live Inventory Movements
export function subscribeToInvMovements(store: FirebaseSyncStore) {
  return onValue(ref(db, "invMovements"), (snapshot) => {
    store.setInvMovements(
      toArray(snapshot.val()) as InventoryMovement[],
      snapshot.exists(),
    );
  });
}

// Subscribe to Live Inventory Mappings
export function subscribeToInvMappings(store: FirebaseSyncStore) {
  return onValue(ref(db, "invMappings"), (snapshot) => {
    const normalized = readFirebaseIdRecords<InvMenuMapping>(snapshot.val(), "invMappings");
    setFirebaseCollectionSchemaSafety("invMappings", normalized.isSafe);
    if (!normalized.isSafe) console.error("[Firebase Inventory] Mapping migration required.", normalized.issues);
    store.setInvMappings(normalized.entries.map(({ record }) => record), snapshot.exists());
  });
}

// Subscribe to Live Staff Users
export function subscribeToStaff(store: StaffSyncStore) {
  return onValue(ref(db, "users"), (snapshot) => {
    const rawData = snapshot.val();
    console.log("[Firebase Staff Sync] Raw snapshot:", rawData);

    if (!rawData) {
      // Firebase returned null / empty — do NOT seed defaults, just clear state.
      store.setUsers([]);
      return;
    }

    const normalized = readFirebaseIdRecords<StaffUser>(rawData, "users");
    setFirebaseCollectionSchemaSafety("users", normalized.isSafe);
    if (!normalized.isSafe) {
      console.error("[Firebase Staff Sync] Staff migration required.", normalized.issues);
    }

    // Normalize each record:
    //  • spread the Firebase object first so any explicit `active` value wins
    //  • default `active` to true when the field is absent (legacy records)
    const parsedUsers: StaffUser[] = normalized.entries.map(({ record }) => ({
        active: true,
        ...record,
      })) as StaffUser[];

    // ── Plaintext-PIN migration ──────────────────────────────────────────────
    // If any record still carries a raw `pin` field (pre-migration), hash every
    // straggler, strip the plaintext, and push the sanitised list back to
    // Firebase atomically. The async work runs inside a fire-and-forget IIFE so
    // we don't block the synchronous onValue callback.
    const hasStragglers = parsedUsers.some((u) => u.pin && !u.pinHash);

    if (hasStragglers) {
      void (async () => {
        let didMigrate = false;
        const migratedUsers: StaffUser[] = await Promise.all(
          parsedUsers.map(async (u) => {
            if (u.pin && !u.pinHash) {
              const { hash, salt } = await hashPin(u.pin);
              const { pin: _removed, ...rest } = u;
              void _removed;
              didMigrate = true;
              return {
                ...rest,
                pinHash: hash,
                salt,
                pinLength: u.pin.length,
                // 4-digit legacy accounts must set a new 6-digit PIN on next login.
                mustChangePin: u.pin.length === 4,
              } as StaffUser;
            }
            return u;
          }),
        );
        if (didMigrate && normalized.isSafe) {
          // Push sanitised records — zero plaintext pins remain in Firebase.
          await pushStaffToFirebase(migratedUsers);
        }
        store.setUsers(migratedUsers);
      })();
    } else {
      store.setUsers(parsedUsers);
    }
  });
}

// Write PIN Reset OTP to Firebase
export async function writePinReset(userId: string, otp: string, expiresAt: number) {
  try {
    await set(ref(db, `pinResets/${userId}`), { otp, expiresAt });
  } catch (error) {
    logStructuredFirebaseError("Firebase PIN Reset Write", error);
  }
}

// Subscribe to Live Table Statuses
export function subscribeToTables(callback: (tables: CafeTable[]) => void) {
  // Track {firebaseKey, table} pairs so we can detect and delete orphaned
  // integer-keyed records (created when pushTablesToFirebase used set() with an
  // array) that coexist with UUID-keyed records from writeOrderTableMutation.
  let tableEntries: Array<{ firebaseKey: string; table: CafeTable }> = [];
  let tombstonedOrderIds = new Set<string>();
  let activeFloorReset: SyncMutation | undefined;
  let tablesReady = false;
  let tombstonesReady = false;
  let resetReady = false;

  const emit = () => {
    if (!tablesReady || !tombstonesReady || !resetReady) return;
    const repairs: CafeTable[] = [];
    // Keys to delete: integer (or otherwise non-UUID) firebase keys that differ
    // from the table's canonical UUID id.  These orphaned records are the root
    // cause of the infinite repair loop: emit() sees them as occupied/stale,
    // repairs them to the UUID-keyed path, but never removes the old key — so
    // the next snapshot still contains the stale record and triggers another repair.
    const staleKeyDeletions: Record<string, null> = {};

    const seenIds = new Set<string>();
    const cleanTables: CafeTable[] = [];

    for (const { firebaseKey, table } of tableEntries) {
      acknowledgePendingWrite(pendingTableWrites, table.id, table);

      // If this firebase key is not the table's canonical UUID key, schedule
      // deletion.  Skip if a write is already in flight for this table (the
      // pending write will settle the state; we'll clean up on the next emit).
      if (firebaseKey !== table.id && !pendingTableWrites.has(table.id)) {
        staleKeyDeletions[`tables/${firebaseKey}`] = null;
      }

      // Deduplicate: when both an integer-keyed and a UUID-keyed record exist
      // for the same table.id, prefer the UUID-keyed one (processed first when
      // Firebase returns keys in natural order, or use the free/newer one).
      const isDuplicate = seenIds.has(table.id);
      seenIds.add(table.id);

      const linkedOrderWasDeleted =
        Boolean(table.orderId) && tombstonedOrderIds.has(table.orderId as string);
      const occupancyHasStaleGeneration =
        table.status !== "free" &&
        table.activeFloorResetGeneration !== undefined &&
        table.activeFloorResetGeneration !== resetGeneration(activeFloorReset);

      if (!linkedOrderWasDeleted && !occupancyHasStaleGeneration) {
        // Only add to the output array once per table id.
        if (!isDuplicate) cleanTables.push(table);
        continue;
      }

      const {
        orderId: _orderId,
        orderStartTime: _orderStartTime,
        pax: _pax,
        ...definition
      } = table;
      const repaired = { ...definition, status: "free" as const };
      // Cross-tab dedup: if this tab already has a write in flight for this
      // table, skip queueing another repair — the in-flight write will resolve
      // the stale state when Firebase echoes it back.
      if (!pendingTableWrites.has(table.id)) {
        repairs.push(repaired);
      }
      if (!isDuplicate) cleanTables.push(repaired);
    }

    callback(cleanTables);

    // This is not a guessed occupancy repair: the durable order tombstone is
    // authoritative. Persisting the free state makes stale legacy tabs
    // converge instead of leaving Firebase occupied after the order is gone.
    if (repairs.length > 0) {
      void writeOrderTableMutation({ tables: repairs });
    }

    // Remove orphaned integer-keyed (or other non-UUID-keyed) table records.
    // Fire-and-forget: a failure is non-critical because the key will be
    // re-attempted on the next emit() cycle until it is gone.
    if (Object.keys(staleKeyDeletions).length > 0) {
      void update(ref(db), staleKeyDeletions).catch((err: unknown) => {
        logStructuredFirebaseError("Firebase stale table key cleanup", err);
      });
    }
  };

  const unsubscribeTables = onValue(ref(db, "tables"), (snapshot) => {
    // Use toFirebaseEntries (not toArray) to preserve firebase keys alongside
    // the table data — keys are needed to detect and delete integer-keyed orphans.
    tableEntries = toFirebaseEntries(snapshot.val()).map(([firebaseKey, rawTable]) => ({
      firebaseKey,
      table: {
        ...rawTable,
        // If the record lacks an id field (legacy integer-keyed record), fall
        // back to the firebase key so table.id is always a non-empty string.
        id: typeof rawTable.id === "string" && rawTable.id ? rawTable.id : firebaseKey,
      } as CafeTable,
    }));
    tablesReady = true;
    emit();
  });
  const unsubscribeTombstones = onValue(ref(db, "orderTombstones"), (snapshot) => {
    tombstonedOrderIds = new Set(Object.keys(snapshot.val() ?? {}));
    tombstonesReady = true;
    emit();
  });
  const unsubscribeReset = onValue(ref(db, "resetMarkers/activeFloor"), (snapshot) => {
    activeFloorReset = snapshot.val() ?? undefined;
    resetReady = true;
    emit();
  });

  return () => {
    unsubscribeTables();
    unsubscribeTombstones();
    unsubscribeReset();
  };
}

// Push Kitchen Purchases
export async function pushKitchenPurchasesToFirebase(purchases: PurchaseEntry[]) {
  try {
    await pushCollectionWithResetGuard(
      "kitchenPurchases",
      purchases || [],
      "kitchenOperations",
    );
  } catch (error) {
    logStructuredFirebaseError("Firebase Kitchen Purchases Push", error);
  }
}

// Subscribe to Live Kitchen Purchases
export function subscribeToKitchenPurchases(
  callback: (purchases: PurchaseEntry[], exists: boolean) => void,
) {
  return onValue(ref(db, "kitchenPurchases"), (snapshot) => {
    callback(toArray(snapshot.val()) as PurchaseEntry[], snapshot.exists());
  });
}

// Push Meat Entries
export async function pushMeatEntriesToFirebase(entries: MeatEntry[]) {
  try {
    await pushCollectionWithResetGuard(
      "meatEntries",
      entries || [],
      "kitchenOperations",
    );
  } catch (error) {
    logStructuredFirebaseError("Firebase Meat Entries Push", error);
  }
}

// Subscribe to Live Meat Entries
export function subscribeToMeatEntries(
  callback: (entries: MeatEntry[], exists: boolean) => void,
) {
  return onValue(ref(db, "meatEntries"), (snapshot) => {
    callback(toArray(snapshot.val()) as MeatEntry[], snapshot.exists());
  });
}

// Push Maintenance Expenses
export async function pushMaintenanceExpensesToFirebase(expenses: MaintenanceExpense[]) {
  try {
    await pushCollectionWithResetGuard(
      "maintenanceExpenses",
      expenses || [],
      "maintenanceExpenses",
    );
  } catch (error) {
    logStructuredFirebaseError("Firebase Maintenance Expenses Push", error);
  }
}

// Subscribe to Live Maintenance Expenses
export function subscribeToMaintenanceExpenses(
  callback: (expenses: MaintenanceExpense[], exists: boolean) => void,
) {
  return onValue(ref(db, "maintenanceExpenses"), (snapshot) => {
    callback(toArray(snapshot.val()) as MaintenanceExpense[], snapshot.exists());
  });
}

// ── Connectivity & offline mutation queue replay ───────────────────────────────

/**
 * Subscribe to Firebase's own connectivity indicator (`.info/connected`).
 * Returns an unsubscribe function. The callback fires immediately with the
 * current connected state and again whenever it changes.
 */
export function subscribeToConnectivity(
  callback: (connected: boolean) => void,
): () => void {
  return onValue(ref(db, ".info/connected"), (snapshot) => {
    callback(snapshot.val() === true);
  });
}

/**
 * Module-level singleton replay lock.
 * Prevents concurrent drain loops when both the `online` window event and the
 * Firebase `.info/connected` listener fire in quick succession.
 */
let isReplaying = false;

/**
 * Drain the offline mutation outbox in strict FIFO order.
 *
 * For each queued mutation:
 *  - Orders / tables / payments: delegates to existing Firebase write functions
 *    which validate reset generations inside their own transactions.
 *  - Customers: checks the customerCredit reset generation before writing so
 *    that a complete directory wipe (Approach A) cannot be resurrected by a
 *    stale queued customer mutation.
 *
 * Always dequeues after calling the Firebase function. The Firebase SDK's own
 * in-session retry handles transient network errors; this queue specifically
 * covers the "page refreshed while offline" gap.
 *
 * Masters (menu, tables layout, bar product catalog, staff PINs, printer
 * config) are never touched — the queue only covers the four transactional
 * domains: orders, tables, payments, customers.
 */
export async function replayOfflineMutations(): Promise<void> {
  if (isTrainingSandboxActive()) return;
  if (isReplaying) return;
  const mutations = getAllPendingMutations();
  if (mutations.length === 0) return;

  isReplaying = true;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('offline-replay-status', { detail: { active: true } }),
    );
  }

  try {
    await ensureResetMarkersHydrated();

    for (const mutation of mutations) {
      try {
        await dispatchMutation(mutation);
        dequeueMutation(mutation.id);
      } catch (error) {
        // Stop on first error to preserve FIFO order; retry next reconnect.
        incrementRetry(mutation.id);
        console.warn(
          `[Offline Queue] Replay failed for ${mutation.id} (${mutation.action}):`,
          error,
        );
        break;
      }
    }

    dropExhaustedMutations();
  } finally {
    isReplaying = false;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('offline-replay-status', { detail: { active: false } }),
      );
      // Signal a clean drain so the UI can show a "synced" confirmation.
      if (getAllPendingMutations().length === 0) {
        window.dispatchEvent(new Event('offline-sync-complete'));
      }
    }
  }
}

async function dispatchMutation(mutation: OfflineMutation): Promise<void> {
  switch (mutation.action) {
    case "create_order":
    case "update_order": {
      const order = mutation.payload.order as Order;
      const table = mutation.payload.table as CafeTable | undefined;
      await writeOrderTableMutation({
        orders: [order],
        tables: table ? [table] : [],
      });
      break;
    }
    case "delete_order": {
      const orderId = mutation.payload.orderId as string;
      await writeOrderTableMutation({ deletedOrderIds: [orderId] });
      break;
    }
    case "update_table": {
      const table = mutation.payload.table as CafeTable;
      await writeOrderTableMutation({ tables: [table] });
      break;
    }
    case "add_payment": {
      const payment = mutation.payload.payment as Payment;
      await writePaymentRecord(payment);
      break;
    }
    case "write_customer":
    case "update_customer_due":
    case "record_repayment": {
      // Validate against the current customer-credit reset generation.
      // If a full directory wipe happened after this mutation was enqueued,
      // discard it so deleted customer profiles cannot be resurrected.
      const currentGen =
        getObservedResetGeneration("customerCredit") ?? BASELINE_RESET_GENERATION;
      if (mutation.resetGeneration !== currentGen) {
        dequeueMutation(mutation.id);
        console.info(
          `[Offline Queue] Discarded stale customer mutation (${mutation.id}): ` +
          `generation ${mutation.resetGeneration} → ${currentGen}`,
        );
        return;
      }
      const customer = mutation.payload.customer as Customer & {
        repayments: CustomerRepayment[];
      };
      await writeCustomer(customer);
      break;
    }
    default:
      // Unknown action from a future schema version — discard safely.
      console.warn(
        `[Offline Queue] Unknown action "${(mutation as OfflineMutation).action}" — discarding.`,
      );
  }
}
