import { useEffect, useRef } from "react";
import { usePOSStore } from "@/store/usePOSStore";
import {
  subscribeToOrders,
  subscribeToTables,
  subscribeToPayments,
  subscribeToSettings,
  pushOrdersToFirebase,
  pushTablesToFirebase,
  pushPaymentsToFirebase,
  pushSettingsToFirebase,
} from "@/utils/firebaseSync";

export function useFirebaseSync() {
  const orders = usePOSStore((s) => s.orders);
  const tables = usePOSStore((s) => s.tables);
  const payments = usePOSStore((s) => s.payments);
  const settings = usePOSStore((s) => s.settings);
  const setOrders = usePOSStore((s) => s.setOrders);
  const setTables = usePOSStore((s) => s.setTables);
  const setPayments = usePOSStore((s) => s.setPayments);
  const setSettings = usePOSStore((s) => s.setSettings);

  const isRemoteOrderUpdate = useRef(false);
  const isRemoteTableUpdate = useRef(false);
  const isRemotePaymentUpdate = useRef(false);
  const isRemoteSettingsUpdate = useRef(false);
  const isInitialCloudSyncDone = useRef(false);

  // 1. Subscribe to Cloud Updates (Orders + Tables + Payments + Settings)
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

    const store = {
      setPayments: (remotePayments: typeof payments) => {
        const currentPayments = usePOSStore.getState().payments;

        if (JSON.stringify(currentPayments) !== JSON.stringify(remotePayments)) {
          isRemotePaymentUpdate.current = true;
          setPayments(remotePayments);
        }
      },
      setSettings: (remoteSettings: typeof settings) => {
        const currentSettings = usePOSStore.getState().settings;

        if (JSON.stringify(currentSettings) !== JSON.stringify(remoteSettings)) {
          isRemoteSettingsUpdate.current = true;
          setSettings(remoteSettings);
        }
      },
    };

    const unsubscribePayments = subscribeToPayments(store);
    const unsubscribeSettings = subscribeToSettings(store);

    return () => {
      unsubscribeOrders();
      unsubscribeTables();
      unsubscribePayments();
      unsubscribeSettings();
    };
  }, [setOrders, setTables, setPayments, setSettings]);

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

  // 4. Push Local Payment Changes to Cloud
  useEffect(() => {
    if (!isInitialCloudSyncDone.current) return;
    if (isRemotePaymentUpdate.current) {
      isRemotePaymentUpdate.current = false;
      return;
    }
    pushPaymentsToFirebase(payments);
  }, [payments]);

  // 5. Push Local Settings Changes to Cloud
  useEffect(() => {
    if (!isInitialCloudSyncDone.current) return;
    if (isRemoteSettingsUpdate.current) {
      isRemoteSettingsUpdate.current = false;
      return;
    }
    pushSettingsToFirebase(settings);
  }, [settings]);
}
