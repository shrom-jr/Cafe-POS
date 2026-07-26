import { useEffect, useRef } from "react";
import { usePOSStore } from "@/store/usePOSStore";
import { subscribeToOrders, pushOrdersToFirebase } from "@/utils/firebaseSync";

export function useFirebaseSync() {
  const orders = usePOSStore((s) => s.orders);
  const setOrders = usePOSStore((s) => s.setOrders);

  const isRemoteUpdate = useRef(false);
  const isInitialCloudSyncDone = useRef(false);

  // 1. Live stream active orders from Firebase Cloud to local device memory
  useEffect(() => {
    const unsubscribe = subscribeToOrders((remoteOrders) => {
      const currentOrders = usePOSStore.getState().orders;

      // Mark that this device has received the initial cloud dataset
      isInitialCloudSyncDone.current = true;

      // Only update local memory if remote data actually changed
      if (JSON.stringify(currentOrders) !== JSON.stringify(remoteOrders)) {
        isRemoteUpdate.current = true;
        setOrders(remoteOrders);
      }
    });

    return () => unsubscribe();
  }, [setOrders]);

  // 2. Push local device changes up to Firebase Cloud
  useEffect(() => {
    // Block pushes until initial cloud download completes (prevents fresh devices from wiping data)
    if (!isInitialCloudSyncDone.current) return;

    // Block echo pushes triggered by remote updates
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }

    pushOrdersToFirebase(orders);
  }, [orders]);
}
