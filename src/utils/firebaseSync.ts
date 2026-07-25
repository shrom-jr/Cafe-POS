import { ref, set, onValue, off } from "firebase/database";
import { db } from "@/firebase.js";
import type { Order } from "@/types/pos";

const ORDERS_PATH = "orders";

/**
 * Converts an orders array to a Firebase-friendly map keyed by order id.
 */
function ordersToMap(orders: Order[]): Record<string, Order> {
  return Object.fromEntries(orders.map((o) => [o.id, o]));
}

/**
 * Push the full orders list to Firebase Realtime Database.
 * Replaces the entire `orders/` node with the current snapshot.
 */
export function pushOrdersToFirebase(orders: Order[]): void {
  const ordersRef = ref(db, ORDERS_PATH);
  set(ordersRef, orders.length > 0 ? ordersToMap(orders) : null).catch((err) =>
    console.error("[Firebase] Failed to push orders:", err)
  );
}

/**
 * Subscribe to real-time order updates from Firebase.
 * Calls `callback` whenever the remote `orders/` node changes.
 * Returns an unsubscribe function.
 */
export function subscribeToOrders(callback: (orders: Order[]) => void): () => void {
  const ordersRef = ref(db, ORDERS_PATH);

  const listener = onValue(
    ordersRef,
    (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        callback([]);
        return;
      }
      // data is a map of id → Order; convert back to array.
      // Firebase drops empty arrays (stores them as null), so we must
      // guard every array field so downstream .reduce / .map calls never
      // receive undefined.
      const orders: Order[] = Object.values(data).map((raw) => {
        const o = raw as Order;
        return {
          ...o,
          items: Array.isArray(o.items) ? o.items : [],
          tablePayments: Array.isArray(o.tablePayments) ? o.tablePayments : undefined,
        };
      });
      callback(orders);
    },
    (err) => console.error("[Firebase] Orders subscription error:", err)
  );

  return () => off(ordersRef, "value", listener);
}
