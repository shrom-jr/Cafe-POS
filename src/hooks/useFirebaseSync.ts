import { useEffect, useRef } from "react";
import { usePOSStore } from "@/store/usePOSStore";
import { useStaffStore } from "@/store/useStaffStore";
import { useInventoryStore } from "@/store/useInventoryStore";
import { useKitchenPurchasesStore } from "@/store/useKitchenPurchasesStore";
import { useMeatTrackerStore } from "@/store/useMeatTrackerStore";
import { useMaintenanceStore } from "@/store/useMaintenanceStore";
import { db } from "@/storage/db";
import { CafeTable } from "@/types/pos";
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
  pushTablesToFirebase,
  pushSettingsToFirebase,
  pushAreaOrderToFirebase,
  pushGroceryPurchasesToFirebase,
  pushInvMovementsToFirebase,
  pushInvMappingsToFirebase,
  pushStaffToFirebase,
  pushKitchenPurchasesToFirebase,
  pushMeatEntriesToFirebase,
  pushMaintenanceExpensesToFirebase,
  writeTableRecord,
} from "@/utils/firebaseSync";
import {
  DEFAULT_TABLES,
} from "@/data/defaultSeeds";

/**
 * Merge inbound remote orders into current local state.
 * Protects active orders that have unsent draft items not yet reflected in
 * Firebase (the gap between a waiter adding items and sendToKitchen firing
 * the granular writeOrderRecord).
 */
function mergeRemoteOrders(
  currentOrders: ReturnType<typeof usePOSStore.getState>['orders'],
  remoteOrders: ReturnType<typeof usePOSStore.getState>['orders'],
): ReturnType<typeof usePOSStore.getState>['orders'] {
  const remoteById = new Map(remoteOrders.map((o) => [o.id, o]));

  // Start from remote, substituting the local copy when it has unsent items
  // that haven't propagated to Firebase yet (write-in-flight).
  const merged = remoteOrders.map((remote) => {
    const local = currentOrders.find((o) => o.id === remote.id);
    if (!local) return remote;
    const countDrafts = (items: typeof local.items) =>
      items.filter((i) => i.kitchenStatus !== 'sent' && !i.sentToKitchen && i.status !== 'paid').length;
    if (
      countDrafts(local.items) > countDrafts(remote.items) &&
      (local.status === 'active' || local.status === 'billed')
    ) {
      // Local has more unsent items — write is in-flight; protect local.
      return local;
    }
    return remote;
  });

  // Preserve locally-created active orders not yet visible in Firebase.
  for (const local of currentOrders) {
    if (!remoteById.has(local.id) && (local.status === 'active' || local.status === 'billed')) {
      merged.push(local);
    }
  }

  return merged;
}

/**
 * Preserve a locally active table when Firebase briefly reports the same
 * table as free while the granular table write is still in flight.
 */
type POSOrder = ReturnType<typeof usePOSStore.getState>['orders'][number];

function activeOrderForTable(orders: POSOrder[], tableId: string): POSOrder | undefined {
  return orders.find(
    (order) =>
      order.tableId === tableId &&
      (order.status === "active" || order.status === "billed"),
  );
}

function promoteFreeTablesForActiveOrders(
  tables: CafeTable[],
  orders: POSOrder[],
): CafeTable[] {
  return tables.map((table) => {
    if (table.status !== "free") return table;
    const activeOrder = activeOrderForTable(orders, table.id);
    if (!activeOrder) return table;

    return {
      ...table,
      status: activeOrder.status === "billed" ? "billing" : "occupied",
      orderId: activeOrder.id,
      orderStartTime: table.orderStartTime ?? activeOrder.createdAt,
    };
  });
}

function mergeRemoteTables(
  current: CafeTable[],
  remote: CafeTable[],
  currentOrders: POSOrder[],
): CafeTable[] {
  return remote.map((remoteTable) => {
    const local = current.find((table) => table.id === remoteTable.id);
    if (!local) return remoteTable;

    if (remoteTable.status === "free") {
      const activeOrder = activeOrderForTable(currentOrders, remoteTable.id);

      if (
        local.status === "occupied" ||
        local.status === "billed" ||
        local.status === "billing"
      ) {
        return local;
      }

      if (activeOrder) {
        return {
          ...remoteTable,
          status: activeOrder.status === "billed" ? "billing" : "occupied",
          orderId: activeOrder.id,
          orderStartTime: local.orderStartTime ?? activeOrder.createdAt,
        };
      }
    }

    return remoteTable;
  });
}

export function useFirebaseSync() {
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

  const isRemoteSettingsUpdate = useRef(false);
  const isRemoteAreaOrderUpdate = useRef(false);
  const isRemoteStaffUpdate = useRef(false);
  const isRemoteGroceryPurchasesUpdate = useRef(false);
  const isRemoteInvMovementsUpdate = useRef(false);
  const isRemoteInvMappingsUpdate = useRef(false);
  const isRemoteKitchenPurchasesUpdate = useRef(false);
  const isRemoteMeatEntriesUpdate = useRef(false);
  const isRemoteMaintenanceExpensesUpdate = useRef(false);
  const hasLoadedSettings = useRef(false);
  const hasLoadedAreaOrder = useRef(false);
  const hasLoadedStaff = useRef(false);
  const hasLoadedGroceryPurchases = useRef(false);
  const hasLoadedInvMovements = useRef(false);
  const hasLoadedInvMappings = useRef(false);
  const hasLoadedKitchenPurchases = useRef(false);
  const hasLoadedMeatEntries = useRef(false);
  const hasLoadedMaintenanceExpenses = useRef(false);

  // 1. Subscribe to Cloud Updates
  useEffect(() => {
    // Hard-reset menu state before subscriptions so stale browser data cannot
    // be pushed back after the Firebase menu nodes are intentionally wiped.
    db.clearMenuCache();
    setMenuItems([]);
    setCategories([]);
    setPillars([]);

    const unsubscribeOrders = subscribeToOrders((remoteOrders) => {
      const currentOrders = usePOSStore.getState().orders;

      // FIREWALL: never let an empty remote snapshot wipe non-empty local orders.
      // Still run table repair below so an active local order cannot remain
      // paired with a free table.
      const preserveLocalOrders = remoteOrders.length === 0 && currentOrders.length > 0;
      const merged = preserveLocalOrders
        ? currentOrders
        : mergeRemoteOrders(currentOrders, remoteOrders);
      if (!preserveLocalOrders && JSON.stringify(currentOrders) !== JSON.stringify(merged)) {
        setOrders(merged);
      }

      // Orders and tables arrive through separate Firebase listeners. If an
      // active order arrives before its table update, repair the local table
      // immediately and persist only the affected table record.
      const currentTables = usePOSStore.getState().tables;
      const repairedTables = promoteFreeTablesForActiveOrders(currentTables, merged);
      if (JSON.stringify(currentTables) !== JSON.stringify(repairedTables)) {
        setTables(repairedTables);
        repairedTables.forEach((table) => {
          const previous = currentTables.find((candidate) => candidate.id === table.id);
          if (previous?.status === "free" && table.status !== "free") {
            writeTableRecord(table);
          }
        });
      }
    });

    const unsubscribeTables = subscribeToTables((remoteTables) => {
      const currentTables = usePOSStore.getState().tables;
      const currentOrders = usePOSStore.getState().orders;

      if (remoteTables.length === 0) {
        if (currentTables.length > 0) {
          // Remote empty but local has tables — keep local silently.
          // Granular writeTableRecord calls will re-sync on the next table action.
          return;
        }
        // Both sides empty — one-time bulk seed with restaurant defaults.
        setTables(DEFAULT_TABLES);
        pushTablesToFirebase(DEFAULT_TABLES);
        return;
      }

      const merged = mergeRemoteTables(currentTables, remoteTables, currentOrders);
      if (JSON.stringify(currentTables) !== JSON.stringify(merged)) {
        setTables(merged);
        merged.forEach((table) => {
          const remote = remoteTables.find((candidate) => candidate.id === table.id);
          if (remote?.status === "free" && table.status !== "free") {
            writeTableRecord(table);
          }
        });
      }
    });

    const store = {
      setPayments: (remotePayments: Parameters<typeof setPayments>[0]) => {
        const currentPayments = usePOSStore.getState().payments;

        // FIREWALL: never wipe local payment history with an empty remote snapshot.
        // Granular writePaymentRecord writers keep Firebase current.
        if (remotePayments.length === 0 && currentPayments.length > 0) return;

        if (JSON.stringify(currentPayments) !== JSON.stringify(remotePayments)) {
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
        if (JSON.stringify(currentMenuItems) !== JSON.stringify(remoteMenuItems)) {
          setMenuItems(remoteMenuItems);
        }
      },

      setCategories: (remoteCategories: typeof categories) => {
        const currentCategories = usePOSStore.getState().categories;
        if (JSON.stringify(currentCategories) !== JSON.stringify(remoteCategories)) {
          setCategories(remoteCategories);
        }
      },

      setPillars: (remotePillars: typeof pillars) => {
        const currentPillars = usePOSStore.getState().pillars;
        if (JSON.stringify(currentPillars) !== JSON.stringify(remotePillars)) {
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
        const currentProducts = useInventoryStore.getState().alcoholProducts;
        if (JSON.stringify(currentProducts) !== JSON.stringify(remoteProducts)) {
          setAlcoholProducts(remoteProducts);
        }
      },

      setBeverageProducts: (remoteProducts: typeof beverageProducts) => {
        const currentProducts = useInventoryStore.getState().beverageProducts;
        if (JSON.stringify(currentProducts) !== JSON.stringify(remoteProducts)) {
          setBeverageProducts(remoteProducts);
        }
      },

      setCigaretteProducts: (remoteProducts: typeof cigaretteProducts) => {
        const currentProducts = useInventoryStore.getState().cigaretteProducts;
        if (JSON.stringify(currentProducts) !== JSON.stringify(remoteProducts)) {
          setCigaretteProducts(remoteProducts);
        }
      },

      setGroceryPurchases: (
        remotePurchases: typeof groceryPurchases,
        remoteExists = true,
      ) => {
        hasLoadedGroceryPurchases.current = true;
        const currentPurchases = useInventoryStore.getState().groceryPurchases;

        // An explicitly absent Firebase node is an intentional clean baseline,
        // not a transient empty snapshot to repopulate from localStorage.
        if (!remoteExists) {
          isRemoteGroceryPurchasesUpdate.current = true;
          setGroceryPurchases([]);
          return;
        }

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

    const unsubscribeKitchenPurchases = subscribeToKitchenPurchases((remote, remoteExists) => {
      hasLoadedKitchenPurchases.current = true;
      const current = useKitchenPurchasesStore.getState().purchases;

      if (!remoteExists) {
        isRemoteKitchenPurchasesUpdate.current = true;
        setKitchenPurchases([]);
        return;
      }

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

    const unsubscribeMeatEntries = subscribeToMeatEntries((remote, remoteExists) => {
      hasLoadedMeatEntries.current = true;
      const current = useMeatTrackerStore.getState().meatEntries;

      if (!remoteExists) {
        isRemoteMeatEntriesUpdate.current = true;
        setMeatEntries([]);
        return;
      }

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

    const unsubscribeMaintenanceExpenses = subscribeToMaintenanceExpenses((remote, remoteExists) => {
      hasLoadedMaintenanceExpenses.current = true;
      const current = useMaintenanceStore.getState().expenses;

      if (!remoteExists) {
        isRemoteMaintenanceExpensesUpdate.current = true;
        setMaintenanceExpenses([]);
        return;
      }

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

  // 2. Push Local Settings Changes to Cloud
  useEffect(() => {
    if (!hasLoadedSettings.current) return;
    if (isRemoteSettingsUpdate.current) {
      isRemoteSettingsUpdate.current = false;
      return;
    }
    pushSettingsToFirebase(settings);
  }, [settings]);

  // 6. Push Local Area Order Changes to Cloud
  useEffect(() => {
    if (!hasLoadedAreaOrder.current) return;
    if (isRemoteAreaOrderUpdate.current) {
      isRemoteAreaOrderUpdate.current = false;
      return;
    }
    pushAreaOrderToFirebase(areaOrder);
  }, [areaOrder]);

  // 7. Push Local Grocery Purchase Changes to Cloud
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
