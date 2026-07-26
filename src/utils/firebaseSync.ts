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

// Reads orders from Firebase and converts them into a clean array
export function subscribeToOrders(callback: (orders: Order[]) => void) {
  const ordersRef = ref(db, "orders");

  return onValue(ordersRef, (snapshot) => {
    const rawData = snapshot.val();

    if (!rawData) {
      callback([]);
      return;
    }

    // Convert Firebase dictionary object into a standard list array
    const ordersArray = Array.isArray(rawData)
      ? rawData
      : Object.values(rawData);

    const cleanOrders = ordersArray.filter(Boolean) as Order[];
    callback(cleanOrders);
  });
}
