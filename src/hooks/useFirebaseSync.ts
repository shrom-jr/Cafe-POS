import { useEffect, useRef } from "react";
import { usePOSStore } from "@/store/usePOSStore";
import { subscribeToOrders, pushOrdersToFirebase } from "@/utils/firebaseSync";

export function useFirebaseSync() {
  const orders = usePOSStore((s) => s.orders);
  const isRemoteUpdate = useRef(false);
  const hasLoadedFromCloud = useRef(false);

  // 1. Listen for cloud updates from Firebase
  useEffect(() => {
    const unsubscribe = subscribeToOrders((remoteOrders) => {
      const currentOrders = usePOSStore.getState().orders;

      // Mark that initial cloud fetch has completed
      hasLoadedFromCloud.current = true;

      // Only update local store if cloud data is different
      if (JSON.stringify(currentOrders) !== JSON.stringify(remoteOrders)) {
        isRemoteUpdate.current = true;
        usePOSStore.getState().setOrders(remoteOrders);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Push local updates to cloud
  useEffect(() => {
    // Block pushes until initial cloud fetch has finished (prevents fresh sessions from wiping database)
    if (!hasLoadedFromCloud.current) return;

    // Block echo pushes from remote updates
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }

    pushOrdersToFirebase(orders);
  }, [orders]);
}
