import type {
  AlcoholProduct,
  BeverageProduct,
  CafeTable,
  CigaretteProduct,
  Customer,
  Order,
  Settings,
} from '@/types/pos';
import type { SelectiveResetSelection } from '@/types/selectiveReset';
import { applySelectiveResetToFirebase } from '@/utils/firebaseSync';
import { clearQueueForDomains } from '@/utils/offlineQueue';
import type { OfflineMutationDomain } from '@/types/offlineQueue';
import { db } from '@/storage/db';
import { usePOSStore } from '@/store/usePOSStore';
import { useCustomerStore } from '@/store/useCustomerStore';
import { useKitchenPurchasesStore } from '@/store/useKitchenPurchasesStore';
import { useMeatTrackerStore } from '@/store/useMeatTrackerStore';
import { useMaintenanceStore } from '@/store/useMaintenanceStore';
import { useInventoryStore } from '@/store/useInventoryStore';
import { useBarRestockStore } from '@/store/useBarRestockStore';

export const RESET_BILL_COUNTER = 1000;
export const RESET_KOT_COUNTER = 100;

export function isRunningOrder(order: Pick<Order, 'status'>): boolean {
  return order.status === 'active' || order.status === 'billed';
}

export function ordersAfterSelectiveReset(
  orders: Order[],
  selection: Pick<SelectiveResetSelection, 'salesHistory' | 'activeFloor'>,
): Order[] {
  return orders.filter((order) => {
    if (selection.activeFloor && isRunningOrder(order)) return false;
    if (selection.salesHistory && order.status === 'paid') return false;
    return true;
  });
}

export function tablesAfterActiveFloorReset(tables: CafeTable[]): CafeTable[] {
  return tables.map((table) => {
    const {
      orderId: _orderId,
      orderStartTime: _orderStartTime,
      pax: _pax,
      ...definition
    } = table;
    return {
      ...definition,
      status: 'free',
    };
  });
}

export function settingsAfterSalesReset(settings: Settings): Settings {
  const {
    kotLastResetDate: _kotLastResetDate,
    ...protectedSettings
  } = settings;
  return {
    ...protectedSettings,
    billCounter: RESET_BILL_COUNTER,
    kotCounter: RESET_KOT_COUNTER,
  };
}

export function customersAfterCreditReset(customers: Customer[]): Customer[] {
  return customers.map((customer) => ({
    ...customer,
    currentDue: 0,
  }));
}

export function alcoholAfterStockReset(products: AlcoholProduct[]): AlcoholProduct[] {
  return products.map((product) => ({
    ...product,
    currentStockMl: 0,
  }));
}

export function beveragesAfterStockReset(products: BeverageProduct[]): BeverageProduct[] {
  return products.map((product) => ({
    ...product,
    currentStock: 0,
  }));
}

export function cigarettesAfterStockReset(products: CigaretteProduct[]): CigaretteProduct[] {
  return products.map((product) => ({
    ...product,
    currentSticks: 0,
  }));
}

function applySelectiveResetLocally(selection: SelectiveResetSelection): void {
  // ── Drop queued offline mutations for any domain being reset ─────────────
  // If the device had pending writes that haven't reached Firebase yet, they
  // must not be replayed after the reset wipes that data.
  const resetDomains = new Set<OfflineMutationDomain>();
  if (selection.salesHistory)   { resetDomains.add('orders'); resetDomains.add('payments'); }
  if (selection.activeFloor)    { resetDomains.add('orders'); resetDomains.add('tables'); }
  if (selection.customerCredit) { resetDomains.add('customers'); }
  if (resetDomains.size > 0) clearQueueForDomains(resetDomains);

  const pos = usePOSStore.getState();
  const nextOrders = ordersAfterSelectiveReset(pos.orders, selection);

  if (selection.salesHistory || selection.activeFloor) {
    pos.setOrders(nextOrders);
  }

  if (selection.activeFloor) {
    pos.setTables(tablesAfterActiveFloorReset(pos.tables));
  }

  if (selection.salesHistory) {
    const nextSettings = settingsAfterSalesReset(pos.settings);
    db.savePayments([]);
    db.saveSettings(nextSettings);
    pos.setPayments([]);
    pos.setSettings(nextSettings);
  }

  if (selection.customerCredit) {
    // Approach A: complete directory wipe — remove every profile, visit history,
    // outstanding due, and repayment record from both the Zustand store and
    // localStorage so no stale offline tab can resurrect deleted data.
    localStorage.removeItem('pos_customers');
    localStorage.removeItem('pos_customer_repayments');
    useCustomerStore.setState({ customers: [], repayments: [] });
  }

  if (selection.kitchenOperations) {
    useKitchenPurchasesStore.getState().setPurchases([]);
    useMeatTrackerStore.getState().setMeatEntries([]);
    useInventoryStore.getState().setGroceryPurchases([]);
  }

  if (selection.barInventory) {
    const inventory = useInventoryStore.getState();
    inventory.setAlcoholProducts(alcoholAfterStockReset(inventory.alcoholProducts));
    inventory.setBeverageProducts(beveragesAfterStockReset(inventory.beverageProducts));
    inventory.setCigaretteProducts(cigarettesAfterStockReset(inventory.cigaretteProducts));
    inventory.setInvMovements([]);
    useBarRestockStore.getState().setEntries([]);
  }

  if (selection.maintenanceExpenses) {
    useMaintenanceStore.getState().setExpenses([]);
  }
}

export async function executeSelectiveReset(selection: SelectiveResetSelection): Promise<void> {
  const pos = usePOSStore.getState();

  await applySelectiveResetToFirebase({
    selection,
    localOrders: pos.orders,
  });

  applySelectiveResetLocally(selection);
}
