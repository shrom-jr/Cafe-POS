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

// Safely converts Firebase keyed objects/arrays/nulls into clean JavaScript arrays
const toArray = (data: any) => {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean);
  if (typeof data === "object") return Object.values(data).filter(Boolean);
  return [];
};

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

// Push Alcohol Products
export async function pushAlcoholProductsToFirebase(products: AlcoholProduct[]) {
  try {
    await set(ref(db, "alcoholProducts"), JSON.parse(JSON.stringify(products || [])));
  } catch (error) {
    console.error("❌ [Firebase Alcohol Products Push FAILED]:", error);
  }
}

// Push Beverage Products
export async function pushBeverageProductsToFirebase(products: BeverageProduct[]) {
  try {
    await set(ref(db, "beverageProducts"), JSON.parse(JSON.stringify(products || [])));
  } catch (error) {
    console.error("❌ [Firebase Beverage Products Push FAILED]:", error);
  }
}

// Push Cigarette Products
export async function pushCigaretteProductsToFirebase(products: CigaretteProduct[]) {
  try {
    await set(ref(db, "cigaretteProducts"), JSON.parse(JSON.stringify(products || [])));
  } catch (error) {
    console.error("❌ [Firebase Cigarette Products Push FAILED]:", error);
  }
}

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

// Subscribe to Live Menu Items
export function subscribeToMenuItems(store: FirebaseSyncStore) {
  return onValue(ref(db, "menuItems"), (snapshot) => {
    store.setMenuItems(toArray(snapshot.val()) as MenuItem[]);
  });
}

// Subscribe to Live Categories
export function subscribeToCategories(store: FirebaseSyncStore) {
  return onValue(ref(db, "categories"), (snapshot) => {
    store.setCategories(toArray(snapshot.val()) as Category[]);
  });
}

// Subscribe to Live Pillars
export function subscribeToPillars(store: FirebaseSyncStore) {
  return onValue(ref(db, "pillars"), (snapshot) => {
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
    store.setAlcoholProducts(toArray(snapshot.val()) as AlcoholProduct[]);
  });
}

// Subscribe to Live Beverage Products
export function subscribeToBeverageProducts(store: FirebaseSyncStore) {
  return onValue(ref(db, "beverageProducts"), (snapshot) => {
    store.setBeverageProducts(toArray(snapshot.val()) as BeverageProduct[]);
  });
}

// Subscribe to Live Cigarette Products
export function subscribeToCigaretteProducts(store: FirebaseSyncStore) {
  return onValue(ref(db, "cigaretteProducts"), (snapshot) => {
    store.setCigaretteProducts(toArray(snapshot.val()) as CigaretteProduct[]);
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
    const raw = toArray(snapshot.val());

    if (raw.length === 0) {
      // Firebase returned null / empty — do NOT seed defaults, just clear state.
      store.setUsers([]);
      return;
    }

    // Normalize each record:
    //  • spread the Firebase object first so any explicit `active` value wins
    //  • default `active` to true when the field is absent (legacy records)
    const users: StaffUser[] = raw.map((u: Record<string, unknown>) => ({
      active: true,
      ...u,
    })) as StaffUser[];

    store.setUsers(users);
  });
}

// Subscribe to Live Table Statuses
export function subscribeToTables(callback: (tables: CafeTable[]) => void) {
  return onValue(ref(db, "tables"), (snapshot) => {
    const cleanTables = toArray(snapshot.val()) as CafeTable[];
    callback(cleanTables);
  });
}
