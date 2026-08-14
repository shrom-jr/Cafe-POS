import { useEffect, useRef } from "react";
import { usePOSStore } from "@/store/usePOSStore";
import { useStaffStore } from "@/store/useStaffStore";
import { useInventoryStore } from "@/store/useInventoryStore";
import { useKitchenPurchasesStore } from "@/store/useKitchenPurchasesStore";
import { useMeatTrackerStore } from "@/store/useMeatTrackerStore";
import { useMaintenanceStore } from "@/store/useMaintenanceStore";
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
  subscribeToKitchenPurchases,
  subscribeToMeatEntries,
  subscribeToMaintenanceExpenses,
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
  pushKitchenPurchasesToFirebase,
  pushMeatEntriesToFirebase,
  pushMaintenanceExpensesToFirebase,
} from "@/utils/firebaseSync";
import {
  DEFAULT_TABLES,
  DEFAULT_PILLARS,
  DEFAULT_CATEGORIES,
  DEFAULT_MENU_ITEMS,
  DEFAULT_ALCOHOL_PRODUCTS,
  DEFAULT_BEVERAGE_PRODUCTS,
  DEFAULT_CIGARETTE_PRODUCTS,
} from "@/data/defaultSeeds";

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
  const kitchenPurchases = useKitchenPurchasesStore((s) => s.purchases);
  const meatEntries = useMeatTrackerStore((s) => s.meatEntries);
  const maintenanceExpenses = useMaintenanceStore((s) => s.expenses);
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
  const setKitchenPurchases = useKitchenPurchasesStore((s) => s.setPurchases);
  const setMeatEntries = useMeatTrackerStore((s) => s.setMeatEntries);
  const setMaintenanceExpenses = useMaintenanceStore((s) => s.setExpenses);

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
  const isRemoteKitchenPurchasesUpdate = useRef(false);
  const isRemoteMeatEntriesUpdate = useRef(false);
  const isRemoteMaintenanceExpensesUpdate = useRef(false);
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
  const hasLoadedKitchenPurchases = useRef(false);
  const hasLoadedMeatEntries = useRef(false);
  const hasLoadedMaintenanceExpenses = useRef(false);

  // 1. Subscribe to Cloud Updates
  useEffect(() => {
    const unsubscribeOrders = subscribeToOrders((remoteOrders) => {
      hasLoadedOrders.current = true;
      const currentOrders = usePOSStore.getState().orders;

      // FIREWALL: never let an empty remote snapshot wipe non-empty local orders
      if (remoteOrders.length === 0 && currentOrders.length > 0) {
        pushOrdersToFirebase(currentOrders);
        return;
      }

      if (JSON.stringify(currentOrders) !== JSON.stringify(remoteOrders)) {
        isRemoteOrderUpdate.current = true;
        setOrders(remoteOrders);
      }
    });

    const unsubscribeTables = subscribeToTables((remoteTables) => {
      hasLoadedTables.current = true;
      const currentTables = usePOSStore.getState().tables;

      // FIREWALL: never let an empty remote snapshot wipe non-empty local tables.
      // AUTO-HEAL: seed from defaults when both remote and local are empty.
      if (remoteTables.length === 0) {
        if (currentTables.length > 0) {
          pushTablesToFirebase(currentTables);
          return;
        }
        // Both empty — auto-seed with restaurant defaults
        isRemoteTableUpdate.current = true;
        setTables(DEFAULT_TABLES);
        pushTablesToFirebase(DEFAULT_TABLES);
        return;
      }

      if (JSON.stringify(currentTables) !== JSON.stringify(remoteTables)) {
        isRemoteTableUpdate.current = true;
        setTables(remoteTables);
      }
    });

    const store = {
      setPayments: (remotePayments: typeof payments) => {
        hasLoadedPayments.current = true;
        const currentPayments = usePOSStore.getState().payments;

        // Payments are transactional; empty remote means genuinely no payments —
        // preserve local history and seed Firebase if local has data.
        if (remotePayments.length === 0 && currentPayments.length > 0) {
          pushPaymentsToFirebase(currentPayments);
          return;
        }

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
        hasLoadedMenuItems.current = true;
        const currentMenuItems = usePOSStore.getState().menuItems;

        // FIREWALL: never wipe non-empty local menu with empty remote.
        // AUTO-HEAL: seed from full default catalog when both are empty.
        if (remoteMenuItems.length === 0) {
          if (currentMenuItems.length > 0) {
            pushMenuItemsToFirebase(currentMenuItems);
            return;
          }
          // Both empty — auto-seed from the full menu catalog
          isRemoteMenuItemsUpdate.current = true;
          setMenuItems(DEFAULT_MENU_ITEMS);
          pushMenuItemsToFirebase(DEFAULT_MENU_ITEMS);
          return;
        }

        if (JSON.stringify(currentMenuItems) !== JSON.stringify(remoteMenuItems)) {
          isRemoteMenuItemsUpdate.current = true;
          setMenuItems(remoteMenuItems);
        }
      },

      setCategories: (remoteCategories: typeof categories) => {
        hasLoadedCategories.current = true;
        const currentCategories = usePOSStore.getState().categories;

        // FIREWALL + AUTO-HEAL
        if (remoteCategories.length === 0) {
          if (currentCategories.length > 0) {
            pushCategoriesToFirebase(currentCategories);
            return;
          }
          isRemoteCategoriesUpdate.current = true;
          setCategories(DEFAULT_CATEGORIES);
          pushCategoriesToFirebase(DEFAULT_CATEGORIES);
          return;
        }

        if (JSON.stringify(currentCategories) !== JSON.stringify(remoteCategories)) {
          isRemoteCategoriesUpdate.current = true;
          setCategories(remoteCategories);
        }
      },

      setPillars: (remotePillars: typeof pillars) => {
        hasLoadedPillars.current = true;
        const currentPillars = usePOSStore.getState().pillars;

        // FIREWALL + AUTO-HEAL
        if (remotePillars.length === 0) {
          if (currentPillars.length > 0) {
            pushPillarsToFirebase(currentPillars);
            return;
          }
          isRemotePillarsUpdate.current = true;
          setPillars(DEFAULT_PILLARS);
          pushPillarsToFirebase(DEFAULT_PILLARS);
          return;
        }

        if (JSON.stringify(currentPillars) !== JSON.stringify(remotePillars)) {
          isRemotePillarsUpdate.current = true;
          setPillars(remotePillars);
        }
      },

      setAreaOrder: (remoteAreaOrder: typeof areaOrder) => {
        hasLoadedAreaOrder.current = true;
        const currentAreaOrder = usePOSStore.getState().areaOrder;

        // FIREWALL: preserve local area order if remote is empty.
        // No default seeding needed — area order derives from sections.
        if (remoteAreaOrder.length === 0 && currentAreaOrder.length > 0) {
          pushAreaOrderToFirebase(currentAreaOrder);
          return;
        }

        if (JSON.stringify(currentAreaOrder) !== JSON.stringify(remoteAreaOrder)) {
          isRemoteAreaOrderUpdate.current = true;
          setAreaOrder(remoteAreaOrder);
        }
      },

      setAlcoholProducts: (remoteProducts: typeof alcoholProducts) => {
        hasLoadedAlcoholProducts.current = true;
        const currentProducts = useInventoryStore.getState().alcoholProducts;

        // FIREWALL + AUTO-HEAL for master inventory catalog
        if (remoteProducts.length === 0) {
          if (currentProducts.length > 0) {
            pushAlcoholProductsToFirebase(currentProducts);
            return;
          }
          isRemoteAlcoholProductsUpdate.current = true;
          setAlcoholProducts(DEFAULT_ALCOHOL_PRODUCTS);
          pushAlcoholProductsToFirebase(DEFAULT_ALCOHOL_PRODUCTS);
          return;
        }

        if (JSON.stringify(currentProducts) !== JSON.stringify(remoteProducts)) {
          isRemoteAlcoholProductsUpdate.current = true;
          setAlcoholProducts(remoteProducts);
        }
      },

      setBeverageProducts: (remoteProducts: typeof beverageProducts) => {
        hasLoadedBeverageProducts.current = true;
        const currentProducts = useInventoryStore.getState().beverageProducts;

        // FIREWALL + AUTO-HEAL
        if (remoteProducts.length === 0) {
          if (currentProducts.length > 0) {
            pushBeverageProductsToFirebase(currentProducts);
            return;
          }
          isRemoteBeverageProductsUpdate.current = true;
          setBeverageProducts(DEFAULT_BEVERAGE_PRODUCTS);
          pushBeverageProductsToFirebase(DEFAULT_BEVERAGE_PRODUCTS);
          return;
        }

        if (JSON.stringify(currentProducts) !== JSON.stringify(remoteProducts)) {
          isRemoteBeverageProductsUpdate.current = true;
          setBeverageProducts(remoteProducts);
        }
      },

      setCigaretteProducts: (remoteProducts: typeof cigaretteProducts) => {
        hasLoadedCigaretteProducts.current = true;
        const currentProducts = useInventoryStore.getState().cigaretteProducts;

        // FIREWALL + AUTO-HEAL
        if (remoteProducts.length === 0) {
          if (currentProducts.length > 0) {
            pushCigaretteProductsToFirebase(currentProducts);
            return;
          }
          isRemoteCigaretteProductsUpdate.current = true;
          setCigaretteProducts(DEFAULT_CIGARETTE_PRODUCTS);
          pushCigaretteProductsToFirebase(DEFAULT_CIGARETTE_PRODUCTS);
          return;
        }

        if (JSON.stringify(currentProducts) !== JSON.stringify(remoteProducts)) {
          isRemoteCigaretteProductsUpdate.current = true;
          setCigaretteProducts(remoteProducts);
        }
      },

      setGroceryPurchases: (remotePurchases: typeof groceryPurchases) => {
        hasLoadedGroceryPurchases.current = true;
        const currentPurchases = useInventoryStore.getState().groceryPurchases;

        // FIREWALL: preserve local purchase history if remote is empty
        if (remotePurchases.length === 0 && currentPurchases.length > 0) {
          pushGroceryPurchasesToFirebase(currentPurchases);
          return;
        }

        if (JSON.stringify(currentPurchases) !== JSON.stringify(remotePurchases)) {
          isRemoteGroceryPurchasesUpdate.current = true;
          setGroceryPurchases(remotePurchases);
        }
      },

      setInvMovements: (remoteMovements: typeof invMovements) => {
        hasLoadedInvMovements.current = true;
        const currentMovements = useInventoryStore.getState().invMovements;

        // FIREWALL: preserve local movement history if remote is empty
        if (remoteMovements.length === 0 && currentMovements.length > 0) {
          pushInvMovementsToFirebase(currentMovements);
          return;
        }

        if (JSON.stringify(currentMovements) !== JSON.stringify(remoteMovements)) {
          isRemoteInvMovementsUpdate.current = true;
          setInvMovements(remoteMovements);
        }
      },

      setInvMappings: (remoteMappings: typeof invMappings) => {
        hasLoadedInvMappings.current = true;
        const currentMappings = useInventoryStore.getState().invMappings;

        // FIREWALL: preserve local mappings if remote is empty
        if (remoteMappings.length === 0 && currentMappings.length > 0) {
          pushInvMappingsToFirebase(currentMappings);
          return;
        }

        if (JSON.stringify(currentMappings) !== JSON.stringify(remoteMappings)) {
          isRemoteInvMappingsUpdate.current = true;
          setInvMappings(remoteMappings);
        }
      },
    };

    const unsubscribeKitchenPurchases = subscribeToKitchenPurchases((remote) => {
      hasLoadedKitchenPurchases.current = true;
      const current = useKitchenPurchasesStore.getState().purchases;

      // FIREWALL: preserve local purchase history if remote is empty
      if (remote.length === 0 && current.length > 0) {
        pushKitchenPurchasesToFirebase(current);
        return;
      }

      if (JSON.stringify(current) !== JSON.stringify(remote)) {
        isRemoteKitchenPurchasesUpdate.current = true;
        setKitchenPurchases(remote);
      }
    });

    const unsubscribeMeatEntries = subscribeToMeatEntries((remote) => {
      hasLoadedMeatEntries.current = true;
      const current = useMeatTrackerStore.getState().meatEntries;

      // FIREWALL: preserve local meat tracker history if remote is empty
      if (remote.length === 0 && current.length > 0) {
        pushMeatEntriesToFirebase(current);
        return;
      }

      if (JSON.stringify(current) !== JSON.stringify(remote)) {
        isRemoteMeatEntriesUpdate.current = true;
        setMeatEntries(remote);
      }
    });

    const unsubscribeMaintenanceExpenses = subscribeToMaintenanceExpenses((remote) => {
      hasLoadedMaintenanceExpenses.current = true;
      const current = useMaintenanceStore.getState().expenses;

      // FIREWALL: preserve local expense records if remote is empty
      if (remote.length === 0 && current.length > 0) {
        pushMaintenanceExpensesToFirebase(current);
        return;
      }

      if (JSON.stringify(current) !== JSON.stringify(remote)) {
        isRemoteMaintenanceExpensesUpdate.current = true;
        setMaintenanceExpenses(remote);
      }
    });

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

        // FIREWALL: never wipe non-empty local staff with empty remote.
        // Staff are critical for login — if Firebase loses them, keep local cache.
        if (remoteUsers.length === 0 && currentUsers.length > 0) {
          pushStaffToFirebase(currentUsers);
          hasLoadedStaff.current = true;
          return;
        }

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
      unsubscribeKitchenPurchases();
      unsubscribeMeatEntries();
      unsubscribeMaintenanceExpenses();
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
    setKitchenPurchases,
    setMeatEntries,
    setMaintenanceExpenses,
  ]);

  // 2. Push Local Order Changes to Cloud
  // Guard: only after first remote snapshot (hasLoaded) AND skip if the change
  // came from Firebase itself (isRemoteUpdate).  Also never push an empty
  // orders array — the subscription firewall already handles re-seeding.
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
    // Never push empty tables — protects against a cold-start race where
    // localStorage is also empty before the seed fires.
    if (tables.length === 0) return;
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
    // Never push empty menu — subscription firewall handles seeding
    if (menuItems.length === 0) return;
    pushMenuItemsToFirebase(menuItems);
  }, [menuItems]);

  // 7. Push Local Category Changes to Cloud
  useEffect(() => {
    if (!hasLoadedCategories.current) return;
    if (isRemoteCategoriesUpdate.current) {
      isRemoteCategoriesUpdate.current = false;
      return;
    }
    if (categories.length === 0) return;
    pushCategoriesToFirebase(categories);
  }, [categories]);

  // 8. Push Local Pillar Changes to Cloud
  useEffect(() => {
    if (!hasLoadedPillars.current) return;
    if (isRemotePillarsUpdate.current) {
      isRemotePillarsUpdate.current = false;
      return;
    }
    if (pillars.length === 0) return;
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
    if (alcoholProducts.length === 0) return;
    pushAlcoholProductsToFirebase(alcoholProducts);
  }, [alcoholProducts]);

  // 11. Push Local Beverage Product Changes to Cloud
  useEffect(() => {
    if (!hasLoadedBeverageProducts.current) return;
    if (isRemoteBeverageProductsUpdate.current) {
      isRemoteBeverageProductsUpdate.current = false;
      return;
    }
    if (beverageProducts.length === 0) return;
    pushBeverageProductsToFirebase(beverageProducts);
  }, [beverageProducts]);

  // 12. Push Local Cigarette Product Changes to Cloud
  useEffect(() => {
    if (!hasLoadedCigaretteProducts.current) return;
    if (isRemoteCigaretteProductsUpdate.current) {
      isRemoteCigaretteProductsUpdate.current = false;
      return;
    }
    if (cigaretteProducts.length === 0) return;
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
    // Never push empty staff list — protects login capability
    if (users.length === 0) return;
    pushStaffToFirebase(users);
  }, [users]);

  // 17. Push Local Kitchen Purchases to Cloud
  useEffect(() => {
    if (!hasLoadedKitchenPurchases.current) return;
    if (isRemoteKitchenPurchasesUpdate.current) {
      isRemoteKitchenPurchasesUpdate.current = false;
      return;
    }
    pushKitchenPurchasesToFirebase(kitchenPurchases);
  }, [kitchenPurchases]);

  // 18. Push Local Meat Entries to Cloud
  useEffect(() => {
    if (!hasLoadedMeatEntries.current) return;
    if (isRemoteMeatEntriesUpdate.current) {
      isRemoteMeatEntriesUpdate.current = false;
      return;
    }
    pushMeatEntriesToFirebase(meatEntries);
  }, [meatEntries]);

  // 19. Push Local Maintenance Expenses to Cloud
  useEffect(() => {
    if (!hasLoadedMaintenanceExpenses.current) return;
    if (isRemoteMaintenanceExpensesUpdate.current) {
      isRemoteMaintenanceExpensesUpdate.current = false;
      return;
    }
    pushMaintenanceExpensesToFirebase(maintenanceExpenses);
  }, [maintenanceExpenses]);
}
