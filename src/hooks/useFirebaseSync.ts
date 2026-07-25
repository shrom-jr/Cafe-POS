import { useEffect, useRef } from "react";
import { usePOSStore } from "@/store/usePOSStore";
import { db as localDb } from "@/storage/db";
import { pushOrdersToFirebase, subscribeToOrders } from "@/utils/firebaseSync";
import type { Order } from "@/types/pos";

/**
 * Mounts once at the app root. Bidirectional Firebase ↔ Zustand order sync.
 *
 * STRICT INITIALIZATION & ECHO PREVENTION:
 *  - isFirstLoad remains TRUE until the FIRST snapshot from Firebase completes.
 *  - Store subscriber STRICTLY BLOCKS pushes while isFirstLoad is TRUE.
 *  - Firebase is strictly treated as the Source of Truth on startup.
 */
export function useFirebaseSync() {
  const isFirstLoad = useRef(true);
  const isRemoteUpdate = useRef(false);

  useEffect(() => {
    // ── LOCAL → FIREBASE ─────────────────────────────────────────────────────
    const unsubscribeStore = usePOSStore.subscribe((state) => {
      // STRICT GATE: Block outgoing pushes until initial cloud load finishes
      // AND skip if the state change originated from Firebase itself.
      if (isFirstLoad.current || isRemoteUpdate.current) return;

      pushOrdersToFirebase(state.orders);
    });

    // ── FIREBASE → LOCAL ─────────────────────────────────────────────────────
    const unsubscribeFirebase = subscribeToOrders((remoteOrders: Order[]) => {
      // ── Startup Hydration ──────────────────────────────────────────────────
      if (isFirstLoad.current) {
        // 1. Force local state to mirror Firebase cloud data
        isRemoteUpdate.current = true;
        localDb.saveOrders(remoteOrders);
        usePOSStore.setState({ orders: remoteOrders });
        isRemoteUpdate.current = false;

        // 2. NOW unblock outgoing local pushes
        isFirstLoad.current = false;
        return;
      }

      // ── Live Sync ──────────────────────────────────────────────────────────
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
