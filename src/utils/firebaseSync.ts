import { ref, onValue, set } from "firebase/database";
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

type FirebaseSyncStore = {
  setPayments: (payments: Payment[]) => void;
  setSettings: (settings: Settings) => void;
  setMenuItems: (menuItems: MenuItem[]) => void;
  setCategories: (categories: Category[]) => void;
  setPillars: (pillars: string[]) => void;
  setAreaOrder: (areaOrder: string[]) => void;
  setAlcoholProducts: (products: AlcoholProduct[]) => void;
  setBeverageProducts: (products: BeverageProduct[]) => void;
  setCigaretteProducts: (products: CigaretteProduct[]) => void;
  setGroceryPurchases: (purchases: GroceryPurchase[]) => void;
  setInvMovements: (movements: InventoryMovement[]) => void;
  setInvMappings: (mappings: InvMenuMapping[]) => void;
};

type StaffSyncStore = {
  setUsers: (users: StaffUser[]) => void;
};

/** Customer records are stored with their repayment ledger under one Firebase key. */
export type FirebaseCustomerRecord = Customer & {
  repayments: CustomerRepayment[];
};

// Safely converts Firebase keyed objects/arrays/nulls into clean JavaScript arrays
const toArray = (data: any) => {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean);
  if (typeof data === "object") return Object.values(data).filter(Boolean);
  return [];
};

const toFirebaseCustomerRecord = (customer: FirebaseCustomerRecord): FirebaseCustomerRecord => ({
  ...customer,
  repayments: Array.isArray(customer.repayments) ? customer.repayments : [],
});

/**
 * Write one customer and its complete repayment ledger.
 *
 * This intentionally writes the complete customer record rather than only the
 * changed field. That keeps each customer key self-contained and lets a new
 * device hydrate the balance and history in one read.
 */
export async function writeCustomer(customerData: FirebaseCustomerRecord) {
  try {
    await set(
      ref(db, `customers/${customerData.id}`),
      JSON.parse(JSON.stringify(toFirebaseCustomerRecord(customerData))),
    );
  } catch (error) {
    console.error("❌ [Firebase Customer Write FAILED]:", error);
  }
}

/** Seed or replace the complete customer collection during initial sync. */
export async function writeCustomersToFirebase(customers: FirebaseCustomerRecord[]) {
  try {
    const records = customers.reduce<Record<string, FirebaseCustomerRecord>>((result, customer) => {
      result[customer.id] = toFirebaseCustomerRecord(customer);
      return result;
    }, {});
    await set(ref(db, "customers"), JSON.parse(JSON.stringify(records)));
  } catch (error) {
    console.error("❌ [Firebase Customers Write FAILED]:", error);
  }
}

export async function deleteCustomerFirebase(customerId: string) {
  try {
    await set(ref(db, `customers/${customerId}`), null);
  } catch (error) {
    console.error("❌ [Firebase Customer Delete FAILED]:", error);
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
    return onValue(
      ref(db, "customers"),
      (snapshot) => {
        try {
          const rawData = snapshot.val();
          const records: FirebaseCustomerRecord[] = Array.isArray(rawData)
            ? rawData.filter(Boolean).map((record: any) => ({
                ...record,
                repayments: Array.isArray(record.repayments) ? record.repayments : [],
              }))
            : rawData && typeof rawData === "object"
              ? Object.entries(rawData)
                  .filter(([, record]) => Boolean(record))
                  .map(([id, record]) => ({
                    id,
                    ...(record as Omit<FirebaseCustomerRecord, "id">),
                    repayments: Array.isArray((record as any).repayments)
                      ? (record as any).repayments
                      : [],
                  }))
              : [];
          callback(records);
        } catch (error) {
          console.error("❌ [Firebase Customer Snapshot FAILED]:", error);
          onError?.(error);
        }
      },
      (error) => {
        console.error("❌ [Firebase Customer Listener FAILED]:", error);
        onError?.(error);
      },
    );
  } catch (error) {
    console.error("❌ [Firebase Customer Subscription FAILED]:", error);
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
    await set(ref(db, "orders"), JSON.parse(JSON.stringify(orders || [])));
  } catch (error) {
    console.error("❌ [Firebase Orders Push FAILED]:", error);
  }
}

// Push Tables Status
export async function pushTablesToFirebase(tables: CafeTable[]) {
  try {
    await set(ref(db, "tables"), JSON.parse(JSON.stringify(tables || [])));
  } catch (error) {
    console.error("❌ [Firebase Tables Push FAILED]:", error);
  }
}

// Push Payments
export async function pushPaymentsToFirebase(payments: Payment[]) {
  try {
    await set(ref(db, "payments"), JSON.parse(JSON.stringify(payments || [])));
  } catch (error) {
    console.error("❌ [Firebase Payments Push FAILED]:", error);
  }
}

// Push Settings
export async function pushSettingsToFirebase(settings: Settings) {
  try {
    await set(ref(db, "settings"), JSON.parse(JSON.stringify(settings || {})));
  } catch (error) {
    console.error("❌ [Firebase Settings Push FAILED]:", error);
  }
}

/** Keep the shared header logo available as a small, independently subscribable setting. */
export async function pushLogoToFirebase(logo: string | null) {
  try {
    await set(ref(db, "settings/logo"), logo || null);
  } catch (error) {
    console.error("❌ [Firebase Logo Push FAILED]:", error);
  }
}

// Push Area Order
export async function pushAreaOrderToFirebase(areaOrder: string[]) {
  try {
    await set(ref(db, "areaOrder"), JSON.parse(JSON.stringify(areaOrder || [])));
  } catch (error) {
    console.error("❌ [Firebase Area Order Push FAILED]:", error);
  }
}

// Push Alcohol Products
// Push Grocery Purchases
export async function pushGroceryPurchasesToFirebase(purchases: GroceryPurchase[]) {
  try {
    await set(ref(db, "groceryPurchases"), JSON.parse(JSON.stringify(purchases || [])));
  } catch (error) {
    console.error("❌ [Firebase Grocery Purchases Push FAILED]:", error);
  }
}

// Push Inventory Movements
export async function pushInvMovementsToFirebase(movements: InventoryMovement[]) {
  try {
    await set(ref(db, "invMovements"), JSON.parse(JSON.stringify(movements || [])));
  } catch (error) {
    console.error("❌ [Firebase Inventory Movements Push FAILED]:", error);
  }
}

// Push Inventory Mappings
export async function pushInvMappingsToFirebase(mappings: InvMenuMapping[]) {
  try {
    await set(ref(db, "invMappings"), JSON.parse(JSON.stringify(mappings || [])));
  } catch (error) {
    console.error("❌ [Firebase Inventory Mappings Push FAILED]:", error);
  }
}

// Push Staff Users
export async function pushStaffToFirebase(users: StaffUser[]) {
  try {
    await set(ref(db, "users"), JSON.parse(JSON.stringify(users || [])));
  } catch (error) {
    console.error("❌ [Firebase Staff Push FAILED]:", error);
  }
}

// Subscribe to Live Orders
export function subscribeToOrders(callback: (orders: Order[]) => void) {
  return onValue(ref(db, "orders"), (snapshot) => {
    const cleanOrders = toArray(snapshot.val()).map(sanitizeOrder);
    callback(cleanOrders);
  });
}

// Subscribe to Live Payments
export function subscribeToPayments(store: FirebaseSyncStore) {
  return onValue(ref(db, "payments"), (snapshot) => {
    store.setPayments(toArray(snapshot.val()) as Payment[]);
  });
}

// Subscribe to Live Settings
export function subscribeToSettings(store: FirebaseSyncStore) {
  return onValue(ref(db, "settings"), (snapshot) => {
    const rawData = snapshot.val();
    if (rawData) store.setSettings(rawData as Settings);
  });
}

/** Subscribe to the canonical cross-device header logo path. */
export function subscribeToLogo(callback: (logo: string | null) => void) {
  return onValue(ref(db, "settings/logo"), (snapshot) => {
    const value = snapshot.val();
    callback(typeof value === "string" && value.length > 0 ? value : null);
  });
}

// Subscribe to Live Menu Items
export function subscribeToMenuItems(store: FirebaseSyncStore) {
  return onValue(ref(db, "menu/items"), (snapshot) => {
    store.setMenuItems(toArray(snapshot.val()) as MenuItem[]);
  });
}

// Subscribe to Live Categories
export function subscribeToCategories(store: FirebaseSyncStore) {
  return onValue(ref(db, "menu/categories"), (snapshot) => {
    store.setCategories(toArray(snapshot.val()) as Category[]);
  });
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
    // When Firebase node is absent we pass [] so the hook marks hasLoaded=true
    // and the push-to-Firebase effect can fire, seeding the remote node.
    // The hook handler guards against overwriting non-empty local state with [].
    store.setAlcoholProducts(
      snapshot.exists() ? (toArray(snapshot.val()) as AlcoholProduct[]) : []
    );
  });
}

// Subscribe to Live Beverage Products
export function subscribeToBeverageProducts(store: FirebaseSyncStore) {
  return onValue(ref(db, "beverageProducts"), (snapshot) => {
    store.setBeverageProducts(
      snapshot.exists() ? (toArray(snapshot.val()) as BeverageProduct[]) : []
    );
  });
}

// Subscribe to Live Cigarette Products
export function subscribeToCigaretteProducts(store: FirebaseSyncStore) {
  return onValue(ref(db, "cigaretteProducts"), (snapshot) => {
    store.setCigaretteProducts(
      snapshot.exists() ? (toArray(snapshot.val()) as CigaretteProduct[]) : []
    );
  });
}

// Subscribe to Live Grocery Purchases
export function subscribeToGroceryPurchases(store: FirebaseSyncStore) {
  return onValue(ref(db, "groceryPurchases"), (snapshot) => {
    store.setGroceryPurchases(toArray(snapshot.val()) as GroceryPurchase[]);
  });
}

// Subscribe to Live Inventory Movements
export function subscribeToInvMovements(store: FirebaseSyncStore) {
  return onValue(ref(db, "invMovements"), (snapshot) => {
    store.setInvMovements(toArray(snapshot.val()) as InventoryMovement[]);
  });
}

// Subscribe to Live Inventory Mappings
export function subscribeToInvMappings(store: FirebaseSyncStore) {
  return onValue(ref(db, "invMappings"), (snapshot) => {
    store.setInvMappings(toArray(snapshot.val()) as InvMenuMapping[]);
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

    // Firebase stores arrays as keyed objects ({0: {...}, 1: {...}}) when pushed
    // as a JS array. Always normalise to a plain array before mapping.
    const userList: unknown[] = Array.isArray(rawData)
      ? rawData
      : Object.values(rawData);

    // Normalize each record:
    //  • spread the Firebase object first so any explicit `active` value wins
    //  • default `active` to true when the field is absent (legacy records)
    const parsedUsers: StaffUser[] = userList
      .filter(Boolean)
      .map((u: any) => ({
        active: true,
        ...u,
      })) as StaffUser[];

    store.setUsers(parsedUsers);
  });
}

// Write PIN Reset OTP to Firebase
export async function writePinReset(userId: string, otp: string, expiresAt: number) {
  try {
    await set(ref(db, `pinResets/${userId}`), { otp, expiresAt });
  } catch (error) {
    console.error("❌ [Firebase PIN Reset Write FAILED]:", error);
  }
}

// Subscribe to Live Table Statuses
export function subscribeToTables(callback: (tables: CafeTable[]) => void) {
  return onValue(ref(db, "tables"), (snapshot) => {
    const cleanTables = toArray(snapshot.val()) as CafeTable[];
    callback(cleanTables);
  });
}

// Push Kitchen Purchases
export async function pushKitchenPurchasesToFirebase(purchases: PurchaseEntry[]) {
  try {
    await set(ref(db, "kitchenPurchases"), JSON.parse(JSON.stringify(purchases || [])));
  } catch (error) {
    console.error("❌ [Firebase Kitchen Purchases Push FAILED]:", error);
  }
}

// Subscribe to Live Kitchen Purchases
export function subscribeToKitchenPurchases(callback: (purchases: PurchaseEntry[]) => void) {
  return onValue(ref(db, "kitchenPurchases"), (snapshot) => {
    callback(toArray(snapshot.val()) as PurchaseEntry[]);
  });
}

// Push Meat Entries
export async function pushMeatEntriesToFirebase(entries: MeatEntry[]) {
  try {
    await set(ref(db, "meatEntries"), JSON.parse(JSON.stringify(entries || [])));
  } catch (error) {
    console.error("❌ [Firebase Meat Entries Push FAILED]:", error);
  }
}

// Subscribe to Live Meat Entries
export function subscribeToMeatEntries(callback: (entries: MeatEntry[]) => void) {
  return onValue(ref(db, "meatEntries"), (snapshot) => {
    callback(toArray(snapshot.val()) as MeatEntry[]);
  });
}

// Push Maintenance Expenses
export async function pushMaintenanceExpensesToFirebase(expenses: MaintenanceExpense[]) {
  try {
    await set(ref(db, "maintenanceExpenses"), JSON.parse(JSON.stringify(expenses || [])));
  } catch (error) {
    console.error("❌ [Firebase Maintenance Expenses Push FAILED]:", error);
  }
}

// Subscribe to Live Maintenance Expenses
export function subscribeToMaintenanceExpenses(callback: (expenses: MaintenanceExpense[]) => void) {
  return onValue(ref(db, "maintenanceExpenses"), (snapshot) => {
    callback(toArray(snapshot.val()) as MaintenanceExpense[]);
  });
}
