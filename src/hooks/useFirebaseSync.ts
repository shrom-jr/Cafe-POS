import { useEffect, useRef } from "react";
import { usePOSStore } from "@/store/usePOSStore";
import {
  subscribeToOrders,
  subscribeToTables,
  subscribeToPayments,
  subscribeToSettings,
  subscribeToMenuItems,
  subscribeToCategories,
  subscribeToPillars,
  subscribeToAreaOrder,
  pushOrdersToFirebase,
  pushTablesToFirebase,
  pushPaymentsToFirebase,
  pushSettingsToFirebase,
  pushMenuItemsToFirebase,
  pushCategoriesToFirebase,
  pushPillarsToFirebase,
  pushAreaOrderToFirebase,
} from "@/utils/firebaseSync";

export function useFirebaseSync() {
  const orders = usePOSStore((s) => s.orders);
  const tables = usePOSStore((s) => s.tables);
  const payments = usePOSStore((s) => s.payments);
  const settings = usePOSStore((s) => s.settings);
  const menuItems = usePOSStore((s) => s.menuItems);
  const categories = usePOSStore((s) => s.categories);
  const pillars = usePOSStore((s) => s.pillars);
  const areaOrder = usePOSStore((s) => s.areaOrder);
  const setOrders = usePOSStore((s) => s.setOrders);
  const setTables = usePOSStore((s) => s.setTables);
  const setPayments = usePOSStore((s) => s.setPayments);
  const setSettings = usePOSStore((s) => s.setSettings);
  const setMenuItems = usePOSStore((s) => s.setMenuItems);
  const setCategories = usePOSStore((s) => s.setCategories);
  const setPillars = usePOSStore((s) => s.setPillars);
  const setAreaOrder = usePOSStore((s) => s.setAreaOrder);

  const isRemoteOrderUpdate = useRef(false);
  const isRemoteTableUpdate = useRef(false);
  const isRemotePaymentUpdate = useRef(false);
  const isRemoteSettingsUpdate = useRef(false);
  const isRemoteMenuItemsUpdate = useRef(false);
  const isRemoteCategoriesUpdate = useRef(false);
  const isRemotePillarsUpdate = useRef(false);
  const isRemoteAreaOrderUpdate = useRef(false);
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
      setMenuItems: (remoteMenuItems: typeof menuItems) => {
        const currentMenuItems = usePOSStore.getState().menuItems;

        if (JSON.stringify(currentMenuItems) !== JSON.stringify(remoteMenuItems)) {
          isRemoteMenuItemsUpdate.current = true;
          setMenuItems(remoteMenuItems);
        }
      },
      setCategories: (remoteCategories: typeof categories) => {
        const currentCategories = usePOSStore.getState().categories;

        if (JSON.stringify(currentCategories) !== JSON.stringify(remoteCategories)) {
          isRemoteCategoriesUpdate.current = true;
          setCategories(remoteCategories);
        }
      },
      setPillars: (remotePillars: typeof pillars) => {
        const currentPillars = usePOSStore.getState().pillars;

        if (JSON.stringify(currentPillars) !== JSON.stringify(remotePillars)) {
          isRemotePillarsUpdate.current = true;
          setPillars(remotePillars);
        }
      },
      setAreaOrder: (remoteAreaOrder: typeof areaOrder) => {
        const currentAreaOrder = usePOSStore.getState().areaOrder;

        if (JSON.stringify(currentAreaOrder) !== JSON.stringify(remoteAreaOrder)) {
          isRemoteAreaOrderUpdate.current = true;
          setAreaOrder(remoteAreaOrder);
        }
      },
    };

    const unsubscribePayments = subscribeToPayments(store);
    const unsubscribeSettings = subscribeToSettings(store);
    const unsubscribeMenuItems = subscribeToMenuItems(store);
    const unsubscribeCategories = subscribeToCategories(store);
    const unsubscribePillars = subscribeToPillars(store);
    const unsubscribeAreaOrder = subscribeToAreaOrder(store);

    return () => {
      unsubscribeOrders();
      unsubscribeTables();
      unsubscribePayments();
      unsubscribeSettings();
      unsubscribeMenuItems();
      unsubscribeCategories();
      unsubscribePillars();
      unsubscribeAreaOrder();
    };
  }, [
    setOrders,
    setTables,
    setPayments,
    setSettings,
    setMenuItems,
    setCategories,
    setPillars,
    setAreaOrder,
  ]);

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

  // 6. Push Local Menu Item Changes to Cloud
  useEffect(() => {
    if (!isInitialCloudSyncDone.current) return;
    if (isRemoteMenuItemsUpdate.current) {
      isRemoteMenuItemsUpdate.current = false;
      return;
    }
    pushMenuItemsToFirebase(menuItems);
  }, [menuItems]);

  // 7. Push Local Category Changes to Cloud
  useEffect(() => {
    if (!isInitialCloudSyncDone.current) return;
    if (isRemoteCategoriesUpdate.current) {
      isRemoteCategoriesUpdate.current = false;
      return;
    }
    pushCategoriesToFirebase(categories);
  }, [categories]);

  // 8. Push Local Pillar Changes to Cloud
  useEffect(() => {
    if (!isInitialCloudSyncDone.current) return;
    if (isRemotePillarsUpdate.current) {
      isRemotePillarsUpdate.current = false;
      return;
    }
    pushPillarsToFirebase(pillars);
  }, [pillars]);

  // 9. Push Local Area Order Changes to Cloud
  useEffect(() => {
    if (!isInitialCloudSyncDone.current) return;
    if (isRemoteAreaOrderUpdate.current) {
      isRemoteAreaOrderUpdate.current = false;
      return;
    }
    pushAreaOrderToFirebase(areaOrder);
  }, [areaOrder]);
}
