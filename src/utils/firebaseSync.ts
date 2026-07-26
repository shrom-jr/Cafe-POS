import { ref, onValue, set } from "firebase/database";
import { db } from "../firebase";
import type { Order } from "../types/pos";

// Safely converts Firebase objects/arrays/nulls into clean JavaScript arrays
const safeArray = <T>(val: any): T[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === "object") return Object.values(val).filter(Boolean) as T[];
  return [];
};

// Deeply sanitizes raw Firebase data so nested arrays never crash any screen
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

// Pushes order state changes to Firebase Cloud
export async function pushOrdersToFirebase(orders: Order[]) {
  try {
    const ordersRef = ref(db, "orders");
    const sanitizedOrders = JSON.parse(JSON.stringify(orders || []));
    await set(ordersRef, sanitizedOrders);
  } catch (error) {
    console.error("❌ [Firebase Push Error]:", error);
  }
}

// Subscribes all devices to blistering-fast real-time updates
export function subscribeToOrders(callback: (orders: Order[]) => void) {
  const ordersRef = ref(db, "orders");

  return onValue(
    ordersRef,
    (snapshot) => {
      const rawData = snapshot.val();

      if (!rawData) {
        callback([]);
        return;
      }

      const rawOrdersArray = safeArray(rawData);
      const cleanOrders = rawOrdersArray.map(sanitizeOrder);

      callback(cleanOrders);
    },
    (error) => {
      console.error("❌ [Firebase Realtime Listener Error]:", error);
    }
  );
}
