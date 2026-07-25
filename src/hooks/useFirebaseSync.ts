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
 *   • LOCAL → FIREBASE: Zustand subscriber pushes whenever orders data changes.
 *   • FIREBASE → LOCAL: onValue updates the store + localStorage in real time.
 *
 * ECHO PREVENTION (no timing flags):
 *   When a Firebase update arrives, prevOrdersRef is set to remoteOrders BEFORE
 *   calling setState. Zustand then stores that exact reference as state.orders,
 *   so the store subscriber's reference check (`state.orders === prevOrdersRef`)
 *   passes and the echo is silently skipped — no setTimeout, no isRemoteUpdate flag.
 *
 *   For the reverse direction, the store subscriber also deep-compares content
 *   via JSON so that identical payloads coming back from Firebase never trigger
 *   a redundant push.
 */
export function useFirebaseSync() {
  const isFirstLoad = useRef(true);
  // Tracks the last orders reference written to or received from Firebase.
  const prevOrdersRef = useRef<Order[] | null>(null);

  useEffect(() => {
    // ── LOCAL → FIREBASE ─────────────────────────────────────────────────────
    const unsubscribeStore = usePOSStore.subscribe((state) => {
      // Nothing changed — same reference (includes echoes set by Firebase path below).
      if (state.orders === prevOrdersRef.current) return;

      // Same content but different reference (e.g. Firebase echo returned, was
      // applied via setState, Zustand re-boxed it). Update ref, skip push.
      if (
        prevOrdersRef.current !== null &&
        JSON.stringify(state.orders) === JSON.stringify(prevOrdersRef.current)
      ) {
        prevOrdersRef.current = state.orders;
        return;
      }

      // Genuine local change — push to Firebase.
      prevOrdersRef.current = state.orders;
      pushOrdersToFirebase(state.orders);
    });

    // ── FIREBASE → LOCAL (+ startup seed) ────────────────────────────────────
    const unsubscribeFirebase = subscribeToOrders((remoteOrders: Order[]) => {
      // ── First callback: seed or load ───────────────────────────────────────
      if (isFirstLoad.current) {
        isFirstLoad.current = false;

        if (remoteOrders.length === 0) {
          // Firebase is empty — seed with local data.
          const localOrders = usePOSStore.getState().orders;
          if (localOrders.length > 0) {
            prevOrdersRef.current = localOrders;
            pushOrdersToFirebase(localOrders);
          }
          return;
        }

        // Firebase has data — it is the source of truth.
        // Set prevOrdersRef BEFORE setState so the store subscriber skips the echo.
        prevOrdersRef.current = remoteOrders;
        localDb.saveOrders(remoteOrders);
        usePOSStore.setState({ orders: remoteOrders });
        return;
      }

      // ── Subsequent callbacks: live sync ────────────────────────────────────
      // Skip if content hasn't actually changed (avoids needless re-renders).
      const currentOrders = usePOSStore.getState().orders;
      if (JSON.stringify(currentOrders) === JSON.stringify(remoteOrders)) return;

      // Set prevOrdersRef BEFORE setState — the store subscriber will see
      // state.orders === prevOrdersRef and skip the echo push automatically.
      prevOrdersRef.current = remoteOrders;
      localDb.saveOrders(remoteOrders);
      usePOSStore.setState({ orders: remoteOrders });
    });

    return () => {
      unsubscribeStore();
      unsubscribeFirebase();
    };
  }, []);
}
