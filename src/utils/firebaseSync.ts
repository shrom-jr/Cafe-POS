import { ref, onValue, set } from "firebase/database";
import { db } from "../firebase";
import type { Order } from "../types/pos";

// Sends order updates to Firebase safely
export function pushOrdersToFirebase(orders: Order[]) {
  try {
    const ordersRef = ref(db, "orders");
    const sanitizedOrders = JSON.parse(JSON.stringify(orders || []));
    set(ordersRef, sanitizedOrders);
  } catch (error) {
    console.error("[Firebase Push Error]:", error);
  }
}

// Reads orders from Firebase and GUARANTEES every order has a valid items array
export function subscribeToOrders(callback: (orders: Order[]) => void) {
  const ordersRef = ref(db, "orders");

  return onValue(ordersRef, (snapshot) => {
    const rawData = snapshot.val();

    if (!rawData) {
      callback([]);
      return;
    }

    // 1. Convert Firebase dictionary object into a list array
    const rawOrdersArray = Array.isArray(rawData)
      ? rawData
      : Object.values(rawData);

    // 2. Fix missing/undefined items on every order so .reduce() never fails
    const cleanOrders = rawOrdersArray
      .filter(Boolean)
      .map((order: any) => ({
        ...order,
        items: Array.isArray(order?.items)
          ? order.items
          : order?.items
          ? Object.values(order.items)
          : [],
      })) as Order[];

    callback(cleanOrders);
  });
}
