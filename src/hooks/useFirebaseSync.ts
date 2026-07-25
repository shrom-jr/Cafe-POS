import { useEffect, useRef } from "react";
import { usePOSStore } from "@/store/usePOSStore";
import { db as localDb } from "@/storage/db";
import { pushOrdersToFirebase, subscribeToOrders } from "@/utils/firebaseSync";
import type { Order } from "@/types/pos";

/**
 * Mounts once at the app root to sync orders bidirectionally with Firebase:
 *
 * LOCAL → FIREBASE
 *   Subscribes to the Zustand store; whenever `orders` changes locally
 *   the updated list is pushed to Firebase.
 *
 * FIREBASE → LOCAL
 *   Subscribes to the Firebase `orders/` node; on remote change the store
 *   and localStorage are updated so all devices stay in sync.
 */
export function useFirebaseSync() {
  // Prevent re-pushing data we just received from Firebase
  const isRemoteUpdate = useRef(false);
  // Track previous orders reference to avoid pushing on unrelated state changes
  const prevOrdersRef = useRef<Order[] | null>(null);

  useEffect(() => {
    // ── LOCAL → FIREBASE ─────────────────────────────────────────────────────
    const unsubscribeStore = usePOSStore.subscribe((state) => {
      if (isRemoteUpdate.current) return;
      // Only push when the orders array reference actually changed
      if (state.orders === prevOrdersRef.current) return;
      prevOrdersRef.current = state.orders;
      pushOrdersToFirebase(state.orders);
    });

    // ── FIREBASE → LOCAL ─────────────────────────────────────────────────────
    const unsubscribeFirebase = subscribeToOrders((remoteOrders: Order[]) => {
      const currentOrders = usePOSStore.getState().orders;

      // Skip if nothing has changed
      if (JSON.stringify(currentOrders) === JSON.stringify(remoteOrders)) return;

      isRemoteUpdate.current = true;
      prevOrdersRef.current = remoteOrders;
      localDb.saveOrders(remoteOrders);
      usePOSStore.setState({ orders: remoteOrders });

      // Reset flag after Zustand subscriber runs
      setTimeout(() => {
        isRemoteUpdate.current = false;
      }, 0);
    });

    return () => {
      unsubscribeStore();
      unsubscribeFirebase();
    };
  }, []);
}
