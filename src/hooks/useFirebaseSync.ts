import { useEffect, useRef } from "react";
import { usePOSStore } from "@/store/usePOSStore";
import {
  subscribeToOrders,
  subscribeToTables,
  pushOrdersToFirebase,
  pushTablesToFirebase,
} from "@/utils/firebaseSync";

export function useFirebaseSync() {
  const orders = usePOSStore((s) => s.orders);
  const tables = usePOSStore((s) => s.tables);
  const setOrders = usePOSStore((s) => s.setOrders);
  const setTables = usePOSStore((s) => s.setTables);

  const isRemoteOrderUpdate = useRef(false);
  const isRemoteTableUpdate = useRef(false);
  const isInitialCloudSyncDone = useRef(false);

  // 1. Subscribe to Cloud Updates (Orders + Tables)
  useEffect(() => {
    const unsubscribeOrders = subscribeToOrders((remoteOrders) => {
      const currentOrders = usePOSStore.getState().orders;
      isInitialCloudSyncDone.current = true;

      if (JSON.stringify(currentOrders) !== JSON.stringify(remoteOrders)) {
        isRemoteOrderUpdate.current = true;
        setOrders(remoteOrders);
      }
    });

    const unsubscribeTables = subscribeToTables((remoteTables) => {
      const currentTables = usePOSStore.getState().tables;

      if (JSON.stringify(currentTables) !== JSON.stringify(remoteTables)) {
        isRemoteTableUpdate.current = true;
        setTables(remoteTables);
      }
    });

    return () => {
      unsubscribeOrders();
      unsubscribeTables();
    };
  }, [setOrders, setTables]);

  // 2. Push Local Order Changes to Cloud
  useEffect(() => {
    if (!isInitialCloudSyncDone.current) return;
    if (isRemoteOrderUpdate.current) {
      isRemoteOrderUpdate.current = false;
      return;
    }
    pushOrdersToFirebase(orders);
  }, [orders]);

  // 3. Push Local Table Status Changes to Cloud
  useEffect(() => {
    if (!isInitialCloudSyncDone.current) return;
    if (isRemoteTableUpdate.current) {
      isRemoteTableUpdate.current = false;
      return;
    }
    pushTablesToFirebase(tables);
  }, [tables]);
}
