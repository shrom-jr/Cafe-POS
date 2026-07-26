import { useEffect, useRef } from "react";
import { usePOSStore } from "@/store/usePOSStore";
import { useStaffStore } from "@/store/useStaffStore";
import { useInventoryStore } from "@/store/useInventoryStore";
import {
  subscribeToOrders,
  subscribeToTables,
  subscribeToPayments,
  subscribeToSettings,
  subscribeToMenuItems,
  subscribeToCategories,
  subscribeToPillars,
  subscribeToAreaOrder,
  subscribeToAlcoholProducts,
  subscribeToBeverageProducts,
  subscribeToCigaretteProducts,
  subscribeToGroceryPurchases,
  subscribeToInvMovements,
  subscribeToInvMappings,
  subscribeToStaff,
  pushOrdersToFirebase,
  pushTablesToFirebase,
  pushPaymentsToFirebase,
  pushSettingsToFirebase,
  pushMenuItemsToFirebase,
  pushCategoriesToFirebase,
  pushPillarsToFirebase,
  pushAreaOrderToFirebase,
  pushAlcoholProductsToFirebase,
  pushBeverageProductsToFirebase,
  pushCigaretteProductsToFirebase,
  pushGroceryPurchasesToFirebase,
  pushInvMovementsToFirebase,
  pushInvMappingsToFirebase,
  pushStaffToFirebase,
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
  const users = useStaffStore((s) => s.users);
  const alcoholProducts = useInventoryStore((s) => s.alcoholProducts);
  const beverageProducts = useInventoryStore((s) => s.beverageProducts);
  const cigaretteProducts = useInventoryStore((s) => s.cigaretteProducts);
  const groceryPurchases = useInventoryStore((s) => s.groceryPurchases);
  const invMovements = useInventoryStore((s) => s.invMovements);
  const invMappings = useInventoryStore((s) => s.invMappings);
  const setOrders = usePOSStore((s) => s.setOrders);
  const setTables = usePOSStore((s) => s.setTables);
  const setPayments = usePOSStore((s) => s.setPayments);
  const setSettings = usePOSStore((s) => s.setSettings);
  const setMenuItems = usePOSStore((s) => s.setMenuItems);
  const setCategories = usePOSStore((s) => s.setCategories);
  const setPillars = usePOSStore((s) => s.setPillars);
  const setAreaOrder = usePOSStore((s) => s.setAreaOrder);
  const setUsers = useStaffStore((s) => s.setUsers);
  const setAlcoholProducts = useInventoryStore((s) => s.setAlcoholProducts);
  const setBeverageProducts = useInventoryStore((s) => s.setBeverageProducts);
  const setCigaretteProducts = useInventoryStore((s) => s.setCigaretteProducts);
  const setGroceryPurchases = useInventoryStore((s) => s.setGroceryPurchases);
  const setInvMovements = useInventoryStore((s) => s.setInvMovements);
  const setInvMappings = useInventoryStore((s) => s.setInvMappings);

  const isRemoteOrderUpdate = useRef(false);
  const isRemoteTableUpdate = useRef(false);
  const isRemotePaymentUpdate = useRef(false);
  const isRemoteSettingsUpdate = useRef(false);
  const isRemoteMenuItemsUpdate = useRef(false);
  const isRemoteCategoriesUpdate = useRef(false);
  const isRemotePillarsUpdate = useRef(false);
  const isRemoteAreaOrderUpdate = useRef(false);
  const isRemoteStaffUpdate = useRef(false);
  const isRemoteAlcoholProductsUpdate = useRef(false);
  const isRemoteBeverageProductsUpdate = useRef(false);
  const isRemoteCigaretteProductsUpdate = useRef(false);
  const isRemoteGroceryPurchasesUpdate = useRef(false);
  const isRemoteInvMovementsUpdate = useRef(false);
  const isRemoteInvMappingsUpdate = useRef(false);
  const hasLoadedOrders = useRef(false);
  const hasLoadedTables = useRef(false);
  const hasLoadedPayments = useRef(false);
  const hasLoadedSettings = useRef(false);
  const hasLoadedMenuItems = useRef(false);
  const hasLoadedCategories = useRef(false);
  const hasLoadedPillars = useRef(false);
  const hasLoadedAreaOrder = useRef(false);
  const hasLoadedStaff = useRef(false);
  const hasLoadedAlcoholProducts = useRef(false);
  const hasLoadedBeverageProducts = useRef(false);
  const hasLoadedCigaretteProducts = useRef(false);
  const hasLoadedGroceryPurchases = useRef(false);
  const hasLoadedInvMovements = useRef(false);
  const hasLoadedInvMappings = useRef(false);

  // 1. Subscribe to Cloud Updates (Orders + Tables + Payments + Settings)
  useEffect(() => {
    const unsubscribeOrders = subscribeToOrders((remoteOrders) => {
      const currentOrders = usePOSStore.getState().orders;
      hasLoadedOrders.current = true;

      if (JSON.stringify(currentOrders) !== JSON.stringify(remoteOrders)) {
        isRemoteOrderUpdate.current = true;
        setOrders(remoteOrders);
      }
    });

    const unsubscribeTables = subscribeToTables((remoteTables) => {
      const currentTables = usePOSStore.getState().tables;
      hasLoadedTables.current = true;

      if (JSON.stringify(currentTables) !== JSON.stringify(remoteTables)) {
        isRemoteTableUpdate.current = true;
        setTables(remoteTables);
      }
    });

    const store = {
      setPayments: (remotePayments: typeof payments) => {
        const currentPayments = usePOSStore.getState().payments;
        hasLoadedPayments.current = true;

        if (JSON.stringify(currentPayments) !== JSON.stringify(remotePayments)) {
          isRemotePaymentUpdate.current = true;
          setPayments(remotePayments);
        }
      },
      setSettings: (remoteSettings: typeof settings) => {
        const currentSettings = usePOSStore.getState().settings;
        hasLoadedSettings.current = true;

        if (JSON.stringify(currentSettings) !== JSON.stringify(remoteSettings)) {
          isRemoteSettingsUpdate.current = true;
          setSettings(remoteSettings);
        }
      },
      setMenuItems: (remoteMenuItems: typeof menuItems) => {
        const currentMenuItems = usePOSStore.getState().menuItems;
        hasLoadedMenuItems.current = true;

        if (JSON.stringify(currentMenuItems) !== JSON.stringify(remoteMenuItems)) {
          isRemoteMenuItemsUpdate.current = true;
          setMenuItems(remoteMenuItems);
        }
      },
      setCategories: (remoteCategories: typeof categories) => {
        const currentCategories = usePOSStore.getState().categories;
        hasLoadedCategories.current = true;

        if (JSON.stringify(currentCategories) !== JSON.stringify(remoteCategories)) {
          isRemoteCategoriesUpdate.current = true;
          setCategories(remoteCategories);
        }
      },
      setPillars: (remotePillars: typeof pillars) => {
        const currentPillars = usePOSStore.getState().pillars;
        hasLoadedPillars.current = true;

        if (JSON.stringify(currentPillars) !== JSON.stringify(remotePillars)) {
          isRemotePillarsUpdate.current = true;
          setPillars(remotePillars);
        }
      },
      setAreaOrder: (remoteAreaOrder: typeof areaOrder) => {
        const currentAreaOrder = usePOSStore.getState().areaOrder;
        hasLoadedAreaOrder.current = true;

        if (JSON.stringify(currentAreaOrder) !== JSON.stringify(remoteAreaOrder)) {
          isRemoteAreaOrderUpdate.current = true;
          setAreaOrder(remoteAreaOrder);
        }
      },
      setAlcoholProducts: (remoteProducts: typeof alcoholProducts) => {
        const currentProducts = useInventoryStore.getState().alcoholProducts;
        hasLoadedAlcoholProducts.current = true;

        if (JSON.stringify(currentProducts) !== JSON.stringify(remoteProducts)) {
          isRemoteAlcoholProductsUpdate.current = true;
          setAlcoholProducts(remoteProducts);
        }
      },
      setBeverageProducts: (remoteProducts: typeof beverageProducts) => {
        const currentProducts = useInventoryStore.getState().beverageProducts;
        hasLoadedBeverageProducts.current = true;

        if (JSON.stringify(currentProducts) !== JSON.stringify(remoteProducts)) {
          isRemoteBeverageProductsUpdate.current = true;
          setBeverageProducts(remoteProducts);
        }
      },
      setCigaretteProducts: (remoteProducts: typeof cigaretteProducts) => {
        const currentProducts = useInventoryStore.getState().cigaretteProducts;
        hasLoadedCigaretteProducts.current = true;

        if (JSON.stringify(currentProducts) !== JSON.stringify(remoteProducts)) {
          isRemoteCigaretteProductsUpdate.current = true;
          setCigaretteProducts(remoteProducts);
        }
      },
      setGroceryPurchases: (remotePurchases: typeof groceryPurchases) => {
        const currentPurchases = useInventoryStore.getState().groceryPurchases;
        hasLoadedGroceryPurchases.current = true;

        if (JSON.stringify(currentPurchases) !== JSON.stringify(remotePurchases)) {
          isRemoteGroceryPurchasesUpdate.current = true;
          setGroceryPurchases(remotePurchases);
        }
      },
      setInvMovements: (remoteMovements: typeof invMovements) => {
        const currentMovements = useInventoryStore.getState().invMovements;
        hasLoadedInvMovements.current = true;

        if (JSON.stringify(currentMovements) !== JSON.stringify(remoteMovements)) {
          isRemoteInvMovementsUpdate.current = true;
          setInvMovements(remoteMovements);
        }
      },
      setInvMappings: (remoteMappings: typeof invMappings) => {
        const currentMappings = useInventoryStore.getState().invMappings;
        hasLoadedInvMappings.current = true;

        if (JSON.stringify(currentMappings) !== JSON.stringify(remoteMappings)) {
          isRemoteInvMappingsUpdate.current = true;
          setInvMappings(remoteMappings);
        }
      },
    };

    const unsubscribePayments = subscribeToPayments(store);
    const unsubscribeSettings = subscribeToSettings(store);
    const unsubscribeMenuItems = subscribeToMenuItems(store);
    const unsubscribeCategories = subscribeToCategories(store);
    const unsubscribePillars = subscribeToPillars(store);
    const unsubscribeAreaOrder = subscribeToAreaOrder(store);
    const unsubscribeAlcoholProducts = subscribeToAlcoholProducts(store);
    const unsubscribeBeverageProducts = subscribeToBeverageProducts(store);
    const unsubscribeCigaretteProducts = subscribeToCigaretteProducts(store);
    const unsubscribeGroceryPurchases = subscribeToGroceryPurchases(store);
    const unsubscribeInvMovements = subscribeToInvMovements(store);
    const unsubscribeInvMappings = subscribeToInvMappings(store);
    const unsubscribeStaff = subscribeToStaff({
      setUsers: (remoteUsers) => {
        const currentUsers = useStaffStore.getState().users;

        if (JSON.stringify(currentUsers) !== JSON.stringify(remoteUsers)) {
          isRemoteStaffUpdate.current = true;
          setUsers(remoteUsers);
        }
        hasLoadedStaff.current = true;
      },
    });

    return () => {
      unsubscribeOrders();
      unsubscribeTables();
      unsubscribePayments();
      unsubscribeSettings();
      unsubscribeMenuItems();
      unsubscribeCategories();
      unsubscribePillars();
      unsubscribeAreaOrder();
      unsubscribeAlcoholProducts();
      unsubscribeBeverageProducts();
      unsubscribeCigaretteProducts();
      unsubscribeGroceryPurchases();
      unsubscribeInvMovements();
      unsubscribeInvMappings();
      unsubscribeStaff();
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
    setUsers,
    setAlcoholProducts,
    setBeverageProducts,
    setCigaretteProducts,
    setGroceryPurchases,
    setInvMovements,
    setInvMappings,
  ]);

  // 2. Push Local Order Changes to Cloud
  useEffect(() => {
    if (!hasLoadedOrders.current) return;
    if (isRemoteOrderUpdate.current) {
      isRemoteOrderUpdate.current = false;
      return;
    }
    pushOrdersToFirebase(orders);
  }, [orders]);

  // 3. Push Local Table Status Changes to Cloud
  useEffect(() => {
    if (!hasLoadedTables.current) return;
    if (isRemoteTableUpdate.current) {
      isRemoteTableUpdate.current = false;
      return;
    }
    pushTablesToFirebase(tables);
  }, [tables]);

  // 4. Push Local Payment Changes to Cloud
  useEffect(() => {
    if (!hasLoadedPayments.current) return;
    if (isRemotePaymentUpdate.current) {
      isRemotePaymentUpdate.current = false;
      return;
    }
    pushPaymentsToFirebase(payments);
  }, [payments]);

  // 5. Push Local Settings Changes to Cloud
  useEffect(() => {
    if (!hasLoadedSettings.current) return;
    if (isRemoteSettingsUpdate.current) {
      isRemoteSettingsUpdate.current = false;
      return;
    }
    pushSettingsToFirebase(settings);
  }, [settings]);

  // 6. Push Local Menu Item Changes to Cloud
  useEffect(() => {
    if (!hasLoadedMenuItems.current) return;
    if (isRemoteMenuItemsUpdate.current) {
      isRemoteMenuItemsUpdate.current = false;
      return;
    }
    pushMenuItemsToFirebase(menuItems);
  }, [menuItems]);

  // 7. Push Local Category Changes to Cloud
  useEffect(() => {
    if (!hasLoadedCategories.current) return;
    if (isRemoteCategoriesUpdate.current) {
      isRemoteCategoriesUpdate.current = false;
      return;
    }
    pushCategoriesToFirebase(categories);
  }, [categories]);

  // 8. Push Local Pillar Changes to Cloud
  useEffect(() => {
    if (!hasLoadedPillars.current) return;
    if (isRemotePillarsUpdate.current) {
      isRemotePillarsUpdate.current = false;
      return;
    }
    pushPillarsToFirebase(pillars);
  }, [pillars]);

  // 9. Push Local Area Order Changes to Cloud
  useEffect(() => {
    if (!hasLoadedAreaOrder.current) return;
    if (isRemoteAreaOrderUpdate.current) {
      isRemoteAreaOrderUpdate.current = false;
      return;
    }
    pushAreaOrderToFirebase(areaOrder);
  }, [areaOrder]);

  // 10. Push Local Alcohol Product Changes to Cloud
  useEffect(() => {
    if (!hasLoadedAlcoholProducts.current) return;
    if (isRemoteAlcoholProductsUpdate.current) {
      isRemoteAlcoholProductsUpdate.current = false;
      return;
    }
    pushAlcoholProductsToFirebase(alcoholProducts);
  }, [alcoholProducts]);

  // 11. Push Local Beverage Product Changes to Cloud
  useEffect(() => {
    if (!hasLoadedBeverageProducts.current) return;
    if (isRemoteBeverageProductsUpdate.current) {
      isRemoteBeverageProductsUpdate.current = false;
      return;
    }
    pushBeverageProductsToFirebase(beverageProducts);
  }, [beverageProducts]);

  // 12. Push Local Cigarette Product Changes to Cloud
  useEffect(() => {
    if (!hasLoadedCigaretteProducts.current) return;
    if (isRemoteCigaretteProductsUpdate.current) {
      isRemoteCigaretteProductsUpdate.current = false;
      return;
    }
    pushCigaretteProductsToFirebase(cigaretteProducts);
  }, [cigaretteProducts]);

  // 13. Push Local Grocery Purchase Changes to Cloud
  useEffect(() => {
    if (!hasLoadedGroceryPurchases.current) return;
    if (isRemoteGroceryPurchasesUpdate.current) {
      isRemoteGroceryPurchasesUpdate.current = false;
      return;
    }
    pushGroceryPurchasesToFirebase(groceryPurchases);
  }, [groceryPurchases]);

  // 14. Push Local Inventory Movement Changes to Cloud
  useEffect(() => {
    if (!hasLoadedInvMovements.current) return;
    if (isRemoteInvMovementsUpdate.current) {
      isRemoteInvMovementsUpdate.current = false;
      return;
    }
    pushInvMovementsToFirebase(invMovements);
  }, [invMovements]);

  // 15. Push Local Inventory Mapping Changes to Cloud
  useEffect(() => {
    if (!hasLoadedInvMappings.current) return;
    if (isRemoteInvMappingsUpdate.current) {
      isRemoteInvMappingsUpdate.current = false;
      return;
    }
    pushInvMappingsToFirebase(invMappings);
  }, [invMappings]);

  // 16. Push Local Staff Changes to Cloud
  useEffect(() => {
    if (!hasLoadedStaff.current) return;
    if (isRemoteStaffUpdate.current) {
      isRemoteStaffUpdate.current = false;
      return;
    }
    pushStaffToFirebase(users);
  }, [users]);
}
