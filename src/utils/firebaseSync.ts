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

type FirebaseSyncStore = {
  setPayments: (payments: Payment[]) => void;
  setSettings: (settings: Settings) => void;
  setMenuItems: (menuItems: MenuItem[]) => void;
  setCategories: (categories: Category[]) => void;
  setPillars: (pillars: string[]) => void;
  setAreaOrder: (areaOrder: string[]) => void;
};

// Safely converts Firebase objects/arrays/nulls into clean JavaScript arrays
const safeArray = <T>(val: any): T[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === "object") return Object.values(val).filter(Boolean) as T[];
  return [];
};

// Deeply sanitizes raw Firebase data
export function sanitizeOrder(rawOrder: any): Order {
  if (!rawOrder) return rawOrder;

  const items = safeArray(rawOrder.items);
  const tablePayments = safeArray(rawOrder.tablePayments).map((pay: any) => ({
    ...pay,
    itemIds: safeArray(pay?.itemIds),
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

// Push Menu Items
export async function pushMenuItemsToFirebase(menuItems: MenuItem[]) {
  try {
    await set(ref(db, "menuItems"), JSON.parse(JSON.stringify(menuItems || [])));
  } catch (error) {
    console.error("❌ [Firebase Menu Items Push FAILED]:", error);
  }
}

// Push Categories
export async function pushCategoriesToFirebase(categories: Category[]) {
  try {
    await set(ref(db, "categories"), JSON.parse(JSON.stringify(categories || [])));
  } catch (error) {
    console.error("❌ [Firebase Categories Push FAILED]:", error);
  }
}

// Push Pillars
export async function pushPillarsToFirebase(pillars: string[]) {
  try {
    await set(ref(db, "pillars"), JSON.parse(JSON.stringify(pillars || [])));
  } catch (error) {
    console.error("❌ [Firebase Pillars Push FAILED]:", error);
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

// Subscribe to Live Orders
export function subscribeToOrders(callback: (orders: Order[]) => void) {
  return onValue(ref(db, "orders"), (snapshot) => {
    const rawData = snapshot.val();
    if (!rawData) {
      callback([]);
      return;
    }
    const cleanOrders = safeArray(rawData).map(sanitizeOrder);
    callback(cleanOrders);
  });
}

// Subscribe to Live Payments
export function subscribeToPayments(store: FirebaseSyncStore) {
  return onValue(ref(db, "payments"), (snapshot) => {
    const rawData = snapshot.val();
    store.setPayments(safeArray<Payment>(rawData));
  });
}

// Subscribe to Live Settings
export function subscribeToSettings(store: FirebaseSyncStore) {
  return onValue(ref(db, "settings"), (snapshot) => {
    const rawData = snapshot.val();
    if (rawData) store.setSettings(rawData as Settings);
  });
}

// Subscribe to Live Menu Items
export function subscribeToMenuItems(store: FirebaseSyncStore) {
  return onValue(ref(db, "menuItems"), (snapshot) => {
    store.setMenuItems(safeArray<MenuItem>(snapshot.val()));
  });
}

// Subscribe to Live Categories
export function subscribeToCategories(store: FirebaseSyncStore) {
  return onValue(ref(db, "categories"), (snapshot) => {
    store.setCategories(safeArray<Category>(snapshot.val()));
  });
}

// Subscribe to Live Pillars
export function subscribeToPillars(store: FirebaseSyncStore) {
  return onValue(ref(db, "pillars"), (snapshot) => {
    store.setPillars(safeArray<string>(snapshot.val()));
  });
}

// Subscribe to Live Area Order
export function subscribeToAreaOrder(store: FirebaseSyncStore) {
  return onValue(ref(db, "areaOrder"), (snapshot) => {
    store.setAreaOrder(safeArray<string>(snapshot.val()));
  });
}

// Subscribe to Live Table Statuses
export function subscribeToTables(callback: (tables: CafeTable[]) => void) {
  return onValue(ref(db, "tables"), (snapshot) => {
    const rawData = snapshot.val();
    if (!rawData) {
      callback([]);
      return;
    }
    const cleanTables = safeArray<CafeTable>(rawData);
    callback(cleanTables);
  });
}
