import { useEffect, useRef } from "react";
import { usePOSStore } from "@/store/usePOSStore";
import { db as localDb } from "@/storage/db";
import { pushOrdersToFirebase, subscribeToOrders } from "@/utils/firebaseSync";
import type { Order } from "@/types/pos";

/**
 * Mounts once at the app root. Bidirectional Firebase ↔ Zustand order sync.
 *
 * ECHO PREVENTION:
 *   isRemoteUpdate is set to true immediately before applying a Firebase
 *   snapshot to Zustand state, and back to false right after. Because Zustand
 *   notifies subscribers synchronously inside setState, the store subscriber
 *   sees isRemoteUpdate === true for that update and skips the push. All local
 *   mutations see isRemoteUpdate === false and push immediately.
 *
 * STARTUP:
 *   First onValue callback decides direction:
 *     Firebase empty + local orders exist  → seed Firebase from local.
 *     Firebase has orders                  → load Firebase as source of truth.
 */
export function useFirebaseSync() {
  const isFirstLoad = useRef(true);
  const isRemoteUpdate = useRef(false);

  useEffect(() => {
    // ── LOCAL → FIREBASE ─────────────────────────────────────────────────────
    // Fires on every Zustand state change. Skip only when the change itself
    // came from Firebase (echo guard). Push the full sanitized orders list.
    const unsubscribeStore = usePOSStore.subscribe((state) => {
      if (isRemoteUpdate.current) return;
      pushOrdersToFirebase(state.orders);
    });

    // ── FIREBASE → LOCAL ─────────────────────────────────────────────────────
    const unsubscribeFirebase = subscribeToOrders((remoteOrders: Order[]) => {
      // ── Startup: seed or load ──────────────────────────────────────────────
      if (isFirstLoad.current) {
        isFirstLoad.current = false;

        if (remoteOrders.length === 0) {
          // Firebase is empty — push local orders to seed the database.
          const localOrders = usePOSStore.getState().orders;
          if (localOrders.length > 0) {
            pushOrdersToFirebase(localOrders);
          }
          return;
        }

        // Firebase has data — it is the source of truth.
        isRemoteUpdate.current = true;
        localDb.saveOrders(remoteOrders);
        usePOSStore.setState({ orders: remoteOrders });
        isRemoteUpdate.current = false;
        return;
      }

      // ── Live sync: apply remote snapshot locally ───────────────────────────
      isRemoteUpdate.current = true;
      localDb.saveOrders(remoteOrders);
      usePOSStore.setState({ orders: remoteOrders });
      isRemoteUpdate.current = false;
    });

    return () => {
      unsubscribeStore();
      unsubscribeFirebase();
    };
  }, []);
}
