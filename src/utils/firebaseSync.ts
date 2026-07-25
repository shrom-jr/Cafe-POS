import { ref, set, onValue, off } from "firebase/database";
import { db } from "@/firebase.js";
import type { Order } from "@/types/pos";

const ORDERS_PATH = "orders";

/**
 * Push the full orders list to Firebase Realtime Database.
 * Sanitizes via JSON round-trip to strip any undefined values — Firebase RTDB
 * rejects writes that contain undefined in any property.
 */
export function pushOrdersToFirebase(orders: Order[]): void {
  const ordersRef = ref(db, ORDERS_PATH);

  let payload: Record<string, Order> | null = null;
  if (orders.length > 0) {
    // Keyed map: { [orderId]: Order }
    const map: Record<string, Order> = {};
    for (const o of orders) { map[o.id] = o; }
    // Strip every undefined field so Firebase never rejects the write.
    payload = JSON.parse(JSON.stringify(map));
  }

  console.log("[Firebase Push] pushing", orders.length, "order(s) to Firebase");

  set(ordersRef, payload).catch((err) => {
    console.error("[Firebase Push] FAILED — check permissions or data shape:", err);
  });
}

/**
 * Subscribe to real-time order updates from Firebase.
 * Normalises array fields that Firebase may return as null (empty arrays)
 * or as numeric-keyed objects (non-empty arrays written via set()).
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

      // data is { [id]: Order }. Firebase may return arrays as objects with
      // numeric keys — Object.values() normalises both cases.
      const orders: Order[] = Object.values(data).map((raw) => {
        const o = raw as Order;
        return {
          ...o,
          // Firebase drops empty arrays (stores as null); guard both fields.
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
