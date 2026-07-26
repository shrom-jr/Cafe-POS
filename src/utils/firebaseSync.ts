import { ref, onValue, set } from "firebase/database";
import { db } from "../firebase";
import type { Order, CafeTable } from "../types/pos";

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
