import { useEffect, useRef } from "react";
import { usePOSStore } from "@/store/usePOSStore";
import { db as localDb } from "@/storage/db";
import { pushOrdersToFirebase, subscribeToOrders } from "@/utils/firebaseSync";
import type { Order } from "@/types/pos";

/**
 * Mounts once at the app root to sync orders bidirectionally with Firebase.
 *
 * STARTUP LOGIC (first Firebase callback):
 *   • Firebase empty  + local has orders  → seed Firebase with local data.
 *   • Firebase has orders                 → load Firebase data into local store.
 *
 * ONGOING SYNC:
 *   • LOCAL → FIREBASE: Zustand subscriber pushes whenever the orders reference changes.
 *   • FIREBASE → LOCAL: onValue updates the store + localStorage in real time.
 *     Any browser tab that has the app open stays in sync automatically.
 */
export function useFirebaseSync() {
  // True until the first Firebase onValue callback has been handled.
  const isFirstLoad = useRef(true);
  // Prevents re-pushing data that just arrived from Firebase (echo guard).
  const isRemoteUpdate = useRef(false);
  // Tracks the last orders reference we pushed so we skip no-op writes.
  const prevOrdersRef = useRef<Order[] | null>(null);

  useEffect(() => {
    // ── LOCAL → FIREBASE ─────────────────────────────────────────────────────
    const unsubscribeStore = usePOSStore.subscribe((state) => {
      if (isRemoteUpdate.current) return;
      if (state.orders === prevOrdersRef.current) return;
      prevOrdersRef.current = state.orders;
      pushOrdersToFirebase(state.orders);
    });

    // ── FIREBASE → LOCAL (+ startup seed) ────────────────────────────────────
    const unsubscribeFirebase = subscribeToOrders((remoteOrders: Order[]) => {
      // ── First callback: decide seed vs load ────────────────────────────────
      if (isFirstLoad.current) {
        isFirstLoad.current = false;

        if (remoteOrders.length === 0) {
          // Firebase is empty — seed it with whatever is in the local store.
          const localOrders = usePOSStore.getState().orders;
          if (localOrders.length > 0) {
            prevOrdersRef.current = localOrders;
            pushOrdersToFirebase(localOrders);
          }
          // Nothing to load; local state is already correct.
          return;
        }

        // Firebase has data — load it into local store (Firebase is source of truth).
        isRemoteUpdate.current = true;
        prevOrdersRef.current = remoteOrders;
        localDb.saveOrders(remoteOrders);
        usePOSStore.setState({ orders: remoteOrders });
        setTimeout(() => { isRemoteUpdate.current = false; }, 0);
        return;
      }

      // ── Subsequent callbacks: live bidirectional sync ──────────────────────
      const currentOrders = usePOSStore.getState().orders;
      if (JSON.stringify(currentOrders) === JSON.stringify(remoteOrders)) return;

      isRemoteUpdate.current = true;
      prevOrdersRef.current = remoteOrders;
      localDb.saveOrders(remoteOrders);
      usePOSStore.setState({ orders: remoteOrders });
      setTimeout(() => { isRemoteUpdate.current = false; }, 0);
    });

    return () => {
      unsubscribeStore();
      unsubscribeFirebase();
    };
  }, []);
}
