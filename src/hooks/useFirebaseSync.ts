import { useEffect, useRef } from "react";

// ─── Per-tab FIREWALL debounce ────────────────────────────────────────────────
// When Firebase delivers an empty snapshot for a collection that has local data,
// every open tab fires a bulk push simultaneously. This module-level map ensures
// each tab waits at least FIREWALL_DEBOUNCE_MS before re-firing a push for the
// same collection key, preventing rapid-fire bursts within one tab on volatile
// connectivity and reducing the window for duplicate cross-tab pushes.
const firewallLastPush = new Map<string, number>();
const FIREWALL_DEBOUNCE_MS = 5_000;

function firewallPush(key: string, pushFn: () => void): void {
  const now = Date.now();
  if ((firewallLastPush.get(key) ?? 0) + FIREWALL_DEBOUNCE_MS > now) return;
  firewallLastPush.set(key, now);
  pushFn();
}
// ─────────────────────────────────────────────────────────────────────────────
import { usePOSStore } from "@/store/usePOSStore";
import { useStaffStore } from "@/store/useStaffStore";
import { useInventoryStore } from "@/store/useInventoryStore";
import { useKitchenPurchasesStore } from "@/store/useKitchenPurchasesStore";
import { useMeatTrackerStore } from "@/store/useMeatTrackerStore";
import { useMaintenanceStore } from "@/store/useMaintenanceStore";
import { db } from "@/storage/db";
import { isTrainingSandboxReconciling } from "@/utils/trainingSandbox";
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
  deleteStaffUserFromFirebase,
  pushKitchenPurchasesToFirebase,
  pushMeatEntriesToFirebase,
  pushMaintenanceExpensesToFirebase,
  deleteAlcoholProductFromFirebase,
  deleteBeverageProductFromFirebase,
  deleteCigaretteProductFromFirebase,
  deleteInvMappingFromFirebase,
  writeAlcoholProductToFirebase,
  writeBeverageProductToFirebase,
  writeCigaretteProductToFirebase,
  writeInvMappingToFirebase,
  getPendingOrderWrite,
  getPendingTableWrite,
  subscribeToSelectiveResetMarkers,
  subscribeToConnectivity,
  replayOfflineMutations,
  type OrderTombstone,
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
  tombstones: OrderTombstone[] = [],
): ReturnType<typeof usePOSStore.getState>['orders'] {
  const remoteById = new Map(remoteOrders.map((o) => [o.id, o]));
  const tombstoneById = new Map(tombstones.map((tombstone) => [tombstone.id, tombstone]));
  const compare = (
    left: { syncRevision?: number; syncMutationId?: string } | undefined,
    right: { syncRevision?: number; syncMutationId?: string } | undefined,
  ) => {
    const revisionDifference = (left?.syncRevision ?? 0) - (right?.syncRevision ?? 0);
    if (revisionDifference !== 0) return revisionDifference;
    return (left?.syncMutationId ?? "").localeCompare(right?.syncMutationId ?? "");
  };

  // Start from remote, substituting the local copy when it has unsent items
  // that haven't propagated to Firebase yet (write-in-flight).
  const merged = remoteOrders.map((remote) => {
    const local = currentOrders.find((o) => o.id === remote.id);
    if (!local) return remote;
    if (compare(local, remote) > 0) return local;

    const pendingWrite = getPendingOrderWrite(remote.id);
    if (pendingWrite && compare(remote, pendingWrite) < 0) return local;

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

  // Preserve only locally-created orders whose write is still pending. A
  // missing remote record without a pending write is a legitimate delete from
  // another tab and must not be resurrected.
  for (const local of currentOrders) {
    if (remoteById.has(local.id)) continue;
    const pendingWrite = getPendingOrderWrite(local.id);
    const tombstone = tombstoneById.get(local.id);
    const pendingCreateIsNewer =
      Boolean(pendingWrite) && !tombstone;

    if (
      pendingCreateIsNewer &&
      (local.status === 'active' || local.status === 'billed')
    ) {
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

    const compareRevision =
      (local.syncRevision ?? 0) - (remoteTable.syncRevision ?? 0);
    if (
      compareRevision > 0 ||
      (compareRevision === 0 &&
        (local.syncMutationId ?? "").localeCompare(remoteTable.syncMutationId ?? "") > 0)
    ) {
      return local;
    }

    const pendingWrite = getPendingTableWrite(remoteTable.id);
    if (
      pendingWrite &&
      ((remoteTable.syncRevision ?? 0) < pendingWrite.syncRevision ||
        ((remoteTable.syncRevision ?? 0) === pendingWrite.syncRevision &&
          (remoteTable.syncMutationId ?? "").localeCompare(pendingWrite.syncMutationId) < 0))
    ) {
      return local;
    }

    if (remoteTable.status === "free") {
      const activeOrder = activeOrderForTable(currentOrders, remoteTable.id);
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

function releaseTablesWithoutActiveOrders(
  tables: CafeTable[],
  orders: POSOrder[],
): CafeTable[] {
  return tables.map((table) => {
    if (table.status === "free" || !table.orderId) return table;
    if (activeOrderForTable(orders, table.id)) return table;
    if (getPendingTableWrite(table.id)) return table;

    return {
      ...table,
      status: "free",
      orderId: undefined,
      orderStartTime: undefined,
      pax: undefined,
    };
  });
}

export function useFirebaseSync(enabled = true) {
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
  const isRemoteAlcoholProductsUpdate = useRef(false);
  const isRemoteBeverageProductsUpdate = useRef(false);
  const isRemoteCigaretteProductsUpdate = useRef(false);
  const isRemoteKitchenPurchasesUpdate = useRef(false);
  const isRemoteMeatEntriesUpdate = useRef(false);
  const isRemoteMaintenanceExpensesUpdate = useRef(false);
  const hasLoadedSettings = useRef(false);
  const hasLoadedAreaOrder = useRef(false);
  const hasLoadedStaff = useRef(false);
  const previousStaffIds = useRef<Set<string> | null>(null);
  const hasLoadedGroceryPurchases = useRef(false);
  const hasLoadedInvMovements = useRef(false);
  const hasLoadedInvMappings = useRef(false);
  const hasLoadedAlcoholProducts = useRef(false);
  const hasLoadedBeverageProducts = useRef(false);
  const hasLoadedCigaretteProducts = useRef(false);
  const previousAlcoholProducts = useRef<typeof alcoholProducts | null>(null);
  const previousBeverageProducts = useRef<typeof beverageProducts | null>(null);
  const previousCigaretteProducts = useRef<typeof cigaretteProducts | null>(null);
  const previousInvMappings = useRef<typeof invMappings | null>(null);
  const hasLoadedKitchenPurchases = useRef(false);
  const hasLoadedMeatEntries = useRef(false);
  const hasLoadedMaintenanceExpenses = useRef(false);

  // 1. Subscribe to Cloud Updates
  useEffect(() => {
    if (!enabled) return;

    // Hard-reset menu state before subscriptions so stale browser data cannot
    // be pushed back after the Firebase menu nodes are intentionally wiped.
    db.clearMenuCache();
    setMenuItems([]);
    setCategories([]);
    setPillars([]);

    const unsubscribeOrders = subscribeToOrders((remoteOrders, tombstones) => {
      if (isTrainingSandboxReconciling()) {
        setOrders(remoteOrders);
        return;
      }
      const currentOrders = usePOSStore.getState().orders;

      const merged = mergeRemoteOrders(currentOrders, remoteOrders, tombstones);
      if (JSON.stringify(currentOrders) !== JSON.stringify(merged)) {
        setOrders(merged);
      }

      // Orders and tables arrive through separate Firebase listeners. If an
      // active order arrives before its table update, repair the local table
      // immediately and persist only the affected table record.
      const currentTables = usePOSStore.getState().tables;
      const releasedTables = releaseTablesWithoutActiveOrders(currentTables, merged);
      const repairedTables = promoteFreeTablesForActiveOrders(releasedTables, merged);
      if (JSON.stringify(currentTables) !== JSON.stringify(repairedTables)) {
        setTables(repairedTables);
      }
    });

    const unsubscribeTables = subscribeToTables((remoteTables) => {
      const currentTables = usePOSStore.getState().tables;
      const currentOrders = usePOSStore.getState().orders;

      if (remoteTables.length === 0) {
        if (isTrainingSandboxReconciling()) {
          setTables([]);
          return;
        }
        if (currentTables.length > 0) {
          // Preserve the existing table catalog while Firebase is being
          // bootstrapped, but do not apply the old occupied-state guard.
          return;
        }
        // Both sides empty — one-time bulk seed with restaurant defaults.
        setTables(DEFAULT_TABLES);
        firewallPush("tables", () => pushTablesToFirebase(DEFAULT_TABLES));
        return;
      }

      const merged = mergeRemoteTables(currentTables, remoteTables, currentOrders);
      if (JSON.stringify(currentTables) !== JSON.stringify(merged)) {
        setTables(merged);
      }
    });

    const store = {
      setPayments: (
        remotePayments: Parameters<typeof setPayments>[0],
        remoteExists = true,
      ) => {
        const currentPayments = usePOSStore.getState().payments;

        // An absent node is the authoritative result of a selective reset.
        if (!remoteExists) {
          setPayments([]);
          return;
        }

        // Preserve a local offline cache for a present-but-empty legacy node.
        if (remotePayments.length === 0 && currentPayments.length > 0 && !isTrainingSandboxReconciling()) return;

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
        if (remoteAreaOrder.length === 0 && currentAreaOrder.length > 0 && !isTrainingSandboxReconciling()) {
          firewallPush("areaOrder", () => pushAreaOrderToFirebase(currentAreaOrder));
          return;
        }

        if (JSON.stringify(currentAreaOrder) !== JSON.stringify(remoteAreaOrder)) {
          isRemoteAreaOrderUpdate.current = true;
          setAreaOrder(remoteAreaOrder);
        }
      },

      setAlcoholProducts: (remoteProducts: typeof alcoholProducts) => {
        hasLoadedAlcoholProducts.current = true;
        previousAlcoholProducts.current = remoteProducts;
        const currentProducts = useInventoryStore.getState().alcoholProducts;
        if (JSON.stringify(currentProducts) !== JSON.stringify(remoteProducts)) {
          isRemoteAlcoholProductsUpdate.current = true;
          setAlcoholProducts(remoteProducts);
        }
      },

      setBeverageProducts: (remoteProducts: typeof beverageProducts) => {
        hasLoadedBeverageProducts.current = true;
        previousBeverageProducts.current = remoteProducts;
        const currentProducts = useInventoryStore.getState().beverageProducts;
        if (JSON.stringify(currentProducts) !== JSON.stringify(remoteProducts)) {
          isRemoteBeverageProductsUpdate.current = true;
          setBeverageProducts(remoteProducts);
        }
      },

      setCigaretteProducts: (remoteProducts: typeof cigaretteProducts) => {
        hasLoadedCigaretteProducts.current = true;
        previousCigaretteProducts.current = remoteProducts;
        const currentProducts = useInventoryStore.getState().cigaretteProducts;
        if (JSON.stringify(currentProducts) !== JSON.stringify(remoteProducts)) {
          isRemoteCigaretteProductsUpdate.current = true;
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
        if (remotePurchases.length === 0 && currentPurchases.length > 0 && !isTrainingSandboxReconciling()) {
          firewallPush("groceryPurchases", () => pushGroceryPurchasesToFirebase(currentPurchases));
          return;
        }

        if (JSON.stringify(currentPurchases) !== JSON.stringify(remotePurchases)) {
          isRemoteGroceryPurchasesUpdate.current = true;
          setGroceryPurchases(remotePurchases);
        }
      },

      setInvMovements: (
        remoteMovements: typeof invMovements,
        remoteExists = true,
      ) => {
        hasLoadedInvMovements.current = true;
        const currentMovements = useInventoryStore.getState().invMovements;

        // An absent node is the authoritative result of a selective reset.
        // Apply it locally and mark it as remote so the push effect cannot
        // immediately recreate the deleted movement history.
        if (!remoteExists) {
          isRemoteInvMovementsUpdate.current = true;
          setInvMovements([]);
          return;
        }

        // FIREWALL: preserve local movement history if remote is empty
        if (remoteMovements.length === 0 && currentMovements.length > 0 && !isTrainingSandboxReconciling()) {
          firewallPush("invMovements", () => pushInvMovementsToFirebase(currentMovements));
          return;
        }

        if (JSON.stringify(currentMovements) !== JSON.stringify(remoteMovements)) {
          isRemoteInvMovementsUpdate.current = true;
          setInvMovements(remoteMovements);
        }
      },

      setInvMappings: (remoteMappings: typeof invMappings, remoteExists = true) => {
        hasLoadedInvMappings.current = true;
        previousInvMappings.current = remoteMappings;
        const currentMappings = useInventoryStore.getState().invMappings;

        // Firebase owns mappings during migration. An absent or intentionally
        // empty remote node must not be recreated from a stale browser cache.
        if (!remoteExists) {
          isRemoteInvMappingsUpdate.current = true;
          setInvMappings([]);
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
      if (remote.length === 0 && current.length > 0 && !isTrainingSandboxReconciling()) {
        firewallPush("kitchenPurchases", () => pushKitchenPurchasesToFirebase(current));
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
      if (remote.length === 0 && current.length > 0 && !isTrainingSandboxReconciling()) {
        firewallPush("meatEntries", () => pushMeatEntriesToFirebase(current));
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
      if (remote.length === 0 && current.length > 0 && !isTrainingSandboxReconciling()) {
        firewallPush("maintenanceExpenses", () => pushMaintenanceExpensesToFirebase(current));
        return;
      }

      if (JSON.stringify(current) !== JSON.stringify(remote)) {
        isRemoteMaintenanceExpensesUpdate.current = true;
        setMaintenanceExpenses(remote);
      }
    });

    const unsubscribePayments = subscribeToPayments(store);
    const unsubscribeResetMarkers = subscribeToSelectiveResetMarkers();
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
        if (remoteUsers.length === 0 && currentUsers.length > 0 && !isTrainingSandboxReconciling()) {
          firewallPush("staff", () => pushStaffToFirebase(currentUsers));
          hasLoadedStaff.current = true;
           previousStaffIds.current = new Set(currentUsers.map((user) => user.id));
          return;
        }

        if (JSON.stringify(currentUsers) !== JSON.stringify(remoteUsers)) {
          isRemoteStaffUpdate.current = true;
          setUsers(remoteUsers);
        }
        hasLoadedStaff.current = true;
         previousStaffIds.current = new Set(remoteUsers.map((user) => user.id));
      },
    });

    return () => {
      unsubscribeOrders();
      unsubscribeTables();
      unsubscribePayments();
      unsubscribeResetMarkers();
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
    enabled,
  ]);

  // 2. Push Local Settings Changes to Cloud
  useEffect(() => {
    if (!enabled || !hasLoadedSettings.current) return;
    if (isRemoteSettingsUpdate.current) {
      isRemoteSettingsUpdate.current = false;
      return;
    }
    pushSettingsToFirebase(settings);
  }, [settings, enabled]);

  // Firebase is the authority for product catalogs. Local changes are persisted
  // per child so a stale or empty client can never replace a whole collection.
  useEffect(() => {
    if (!enabled || !hasLoadedAlcoholProducts.current || !previousAlcoholProducts.current) return;
    if (isRemoteAlcoholProductsUpdate.current) {
      isRemoteAlcoholProductsUpdate.current = false;
      previousAlcoholProducts.current = alcoholProducts;
      return;
    }
    const previous = new Map(previousAlcoholProducts.current.map((product) => [product.id, product]));
    const current = new Map(alcoholProducts.map((product) => [product.id, product]));
    void Promise.all([
      ...alcoholProducts
        .filter((product) => JSON.stringify(previous.get(product.id)) !== JSON.stringify(product))
        .map((product) => writeAlcoholProductToFirebase(product)),
      ...[...previous.keys()]
        .filter((id) => !current.has(id))
        .map((id) => deleteAlcoholProductFromFirebase(id)),
    ]);
    previousAlcoholProducts.current = alcoholProducts;
  }, [alcoholProducts, enabled]);

  useEffect(() => {
    if (!enabled || !hasLoadedBeverageProducts.current || !previousBeverageProducts.current) return;
    if (isRemoteBeverageProductsUpdate.current) {
      isRemoteBeverageProductsUpdate.current = false;
      previousBeverageProducts.current = beverageProducts;
      return;
    }
    const previous = new Map(previousBeverageProducts.current.map((product) => [product.id, product]));
    const current = new Map(beverageProducts.map((product) => [product.id, product]));
    void Promise.all([
      ...beverageProducts
        .filter((product) => JSON.stringify(previous.get(product.id)) !== JSON.stringify(product))
        .map((product) => writeBeverageProductToFirebase(product)),
      ...[...previous.keys()]
        .filter((id) => !current.has(id))
        .map((id) => deleteBeverageProductFromFirebase(id)),
    ]);
    previousBeverageProducts.current = beverageProducts;
  }, [beverageProducts, enabled]);

  useEffect(() => {
    if (!enabled || !hasLoadedCigaretteProducts.current || !previousCigaretteProducts.current) return;
    if (isRemoteCigaretteProductsUpdate.current) {
      isRemoteCigaretteProductsUpdate.current = false;
      previousCigaretteProducts.current = cigaretteProducts;
      return;
    }
    const previous = new Map(previousCigaretteProducts.current.map((product) => [product.id, product]));
    const current = new Map(cigaretteProducts.map((product) => [product.id, product]));
    void Promise.all([
      ...cigaretteProducts
        .filter((product) => JSON.stringify(previous.get(product.id)) !== JSON.stringify(product))
        .map((product) => writeCigaretteProductToFirebase(product)),
      ...[...previous.keys()]
        .filter((id) => !current.has(id))
        .map((id) => deleteCigaretteProductFromFirebase(id)),
    ]);
    previousCigaretteProducts.current = cigaretteProducts;
  }, [cigaretteProducts, enabled]);

  // 6. Push Local Area Order Changes to Cloud
  useEffect(() => {
    if (!enabled || !hasLoadedAreaOrder.current) return;
    if (isRemoteAreaOrderUpdate.current) {
      isRemoteAreaOrderUpdate.current = false;
      return;
    }
    pushAreaOrderToFirebase(areaOrder);
  }, [areaOrder, enabled]);

  // 7. Push Local Grocery Purchase Changes to Cloud
  useEffect(() => {
    if (!enabled || !hasLoadedGroceryPurchases.current) return;
    if (isRemoteGroceryPurchasesUpdate.current) {
      isRemoteGroceryPurchasesUpdate.current = false;
      return;
    }
    pushGroceryPurchasesToFirebase(groceryPurchases);
  }, [groceryPurchases, enabled]);

  // 14. Push Local Inventory Movement Changes to Cloud
  useEffect(() => {
    if (!enabled || !hasLoadedInvMovements.current) return;
    if (isRemoteInvMovementsUpdate.current) {
      isRemoteInvMovementsUpdate.current = false;
      return;
    }
    pushInvMovementsToFirebase(invMovements);
  }, [invMovements, enabled]);

  // 15. Persist local inventory mapping changes per child.
  useEffect(() => {
    if (!enabled || !hasLoadedInvMappings.current || !previousInvMappings.current) return;
    if (isRemoteInvMappingsUpdate.current) {
      isRemoteInvMappingsUpdate.current = false;
      previousInvMappings.current = invMappings;
      return;
    }
    const previous = new Map(previousInvMappings.current.map((mapping) => [mapping.id, mapping]));
    const current = new Map(invMappings.map((mapping) => [mapping.id, mapping]));
    void Promise.all([
      ...invMappings
        .filter((mapping) => JSON.stringify(previous.get(mapping.id)) !== JSON.stringify(mapping))
        .map((mapping) => writeInvMappingToFirebase(mapping)),
      ...[...previous.keys()]
        .filter((id) => !current.has(id))
        .map((id) => deleteInvMappingFromFirebase(id)),
    ]);
    previousInvMappings.current = invMappings;
  }, [invMappings, enabled]);

  // 16. Push Local Staff Changes to Cloud
  useEffect(() => {
    if (!enabled || !hasLoadedStaff.current) return;
    const currentIds = new Set(users.map((user) => user.id));
    if (isRemoteStaffUpdate.current) {
      isRemoteStaffUpdate.current = false;
      previousStaffIds.current = currentIds;
      return;
    }
    // Never push empty staff list — protects login capability
    if (users.length === 0) {
      previousStaffIds.current = currentIds;
      return;
    }
    pushStaffToFirebase(users);
    for (const previousId of previousStaffIds.current ?? []) {
      if (!currentIds.has(previousId)) void deleteStaffUserFromFirebase(previousId);
    }
    previousStaffIds.current = currentIds;
  }, [users, enabled]);

  // 17. Push Local Kitchen Purchases to Cloud
  useEffect(() => {
    if (!enabled || !hasLoadedKitchenPurchases.current) return;
    if (isRemoteKitchenPurchasesUpdate.current) {
      isRemoteKitchenPurchasesUpdate.current = false;
      return;
    }
    pushKitchenPurchasesToFirebase(kitchenPurchases);
  }, [kitchenPurchases, enabled]);

  // 18. Push Local Meat Entries to Cloud
  useEffect(() => {
    if (!enabled || !hasLoadedMeatEntries.current) return;
    if (isRemoteMeatEntriesUpdate.current) {
      isRemoteMeatEntriesUpdate.current = false;
      return;
    }
    pushMeatEntriesToFirebase(meatEntries);
  }, [meatEntries, enabled]);

  // 19. Push Local Maintenance Expenses to Cloud
  useEffect(() => {
    if (!enabled || !hasLoadedMaintenanceExpenses.current) return;
    if (isRemoteMaintenanceExpensesUpdate.current) {
      isRemoteMaintenanceExpensesUpdate.current = false;
      return;
    }
    pushMaintenanceExpensesToFirebase(maintenanceExpenses);
  }, [maintenanceExpenses, enabled]);

  // 20. Offline mutation queue — drain on reconnect
  //
  // Two triggers fire a drain:
  //   a) The browser `online` event (device-level network restoration)
  //   b) Firebase `.info/connected` becoming true (Firebase-level reconnect,
  //      which may lag the browser event on slow networks or reconnects)
  //
  // A module-level singleton lock inside replayOfflineMutations prevents
  // concurrent drain loops when both signals fire in quick succession.
  useEffect(() => {
    if (!enabled) return;

    async function drainQueue() {
      await replayOfflineMutations();
    }

    const handleOnline = () => { void drainQueue(); };
    window.addEventListener('online', handleOnline);

    const unsubConn = subscribeToConnectivity((connected) => {
      if (connected) void drainQueue();
    });

    // Drain on mount — catches items enqueued in a previous offline session
    // that survived a page refresh.
    void drainQueue();

    return () => {
      window.removeEventListener('online', handleOnline);
      unsubConn();
    };
  }, [enabled]);
}
