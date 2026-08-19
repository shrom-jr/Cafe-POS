import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order } from '@/types/pos';
import type { SelectiveResetSelection } from '@/types/selectiveReset';

const firebaseMocks = vi.hoisted(() => {
  const data: Record<string, unknown> = {};
  const transactionRoots: Array<Record<string, unknown>> = [];
  const buildRoot = () => {
    const root: Record<string, any> = {};
    for (const [path, value] of Object.entries(data)) {
      const parts = path.split('/');
      let cursor = root;
      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          cursor[part] = structuredClone(value);
        } else {
          cursor[part] = cursor[part] ?? {};
          cursor = cursor[part];
        }
      });
    }
    return root;
  };
  return {
    data,
    transactionRoots,
    get: vi.fn((path: string) => Promise.resolve({
      val: () => data[path],
    })),
    ref: vi.fn((_database: unknown, path?: string) => path ?? '__root__'),
    update: vi.fn(() => Promise.resolve()),
    set: vi.fn(() => Promise.resolve()),
    onValue: vi.fn(() => () => undefined),
    runTransaction: vi.fn(async (_path: string, updater: (root: unknown) => unknown) => {
      const result = updater(buildRoot()) as Record<string, unknown>;
      transactionRoots.push(result);
      return { committed: true, snapshot: { val: () => result } };
    }),
  };
});

vi.mock('firebase/database', () => ({
  get: firebaseMocks.get,
  ref: firebaseMocks.ref,
  update: firebaseMocks.update,
  set: firebaseMocks.set,
  onValue: firebaseMocks.onValue,
  runTransaction: firebaseMocks.runTransaction,
}));

vi.mock('@/firebase', () => ({ db: {} }));
vi.mock('../firebase', () => ({ db: {} }));

import {
  applySelectiveResetToFirebase,
  writeCustomer,
  writeOrderTableMutation,
  writePaymentRecord,
} from '@/utils/firebaseSync';

const allSelected: SelectiveResetSelection = {
  salesHistory: true,
  activeFloor: true,
  customerCredit: true,
  kitchenOperations: true,
  barInventory: true,
  maintenanceExpenses: true,
};

describe('Firebase selective reset allowlist', () => {
  beforeEach(() => {
    Object.keys(firebaseMocks.data).forEach((key) => delete firebaseMocks.data[key]);
    firebaseMocks.get.mockClear();
    firebaseMocks.ref.mockClear();
    firebaseMocks.update.mockClear();
    firebaseMocks.set.mockClear();
    firebaseMocks.runTransaction.mockClear();
    firebaseMocks.transactionRoots.length = 0;

    firebaseMocks.data.orders = {
      activeKey: { id: 'active-order', status: 'active' },
      paidKey: { id: 'paid-order', status: 'paid' },
    };
    firebaseMocks.data.tables = {
      tableKey: {
        id: 'table-1',
        number: 'Garden 1',
        section: 'Garden',
        status: 'occupied',
        orderId: 'active-order',
        pax: 4,
      },
    };
    firebaseMocks.data.customers = {
      customerKey: {
        id: 'customer-1',
        name: 'Ramesh',
        phone: '9800000000',
        currentDue: 500,
        repayments: [{ id: 'repayment-1' }],
      },
    };
    firebaseMocks.data.alcoholProducts = {
      alcoholKey: { id: 'a1', name: 'Wine', currentStockMl: 3000 },
    };
    firebaseMocks.data.beverageProducts = {
      beverageKey: { id: 'b1', name: 'Cola', currentStock: 24 },
    };
    firebaseMocks.data.cigaretteProducts = {
      cigaretteKey: { id: 'c1', name: 'Classic', currentSticks: 200 },
    };
    firebaseMocks.data.orderTombstones = {};
    firebaseMocks.data.resetMarkers = {};
    firebaseMocks.data.menu = { items: { menu1: { id: 'menu1', name: 'Momo' } } };
    firebaseMocks.data.users = { admin: { id: 'admin', pin: '1234' } };
    firebaseMocks.data.areaOrder = ['Garden'];
    firebaseMocks.data.invMappings = { map1: { id: 'map1', productId: 'a1' } };
  });

  it('updates all selected transactional fields in one atomic root transaction', async () => {
    await applySelectiveResetToFirebase({
      selection: allSelected,
      localOrders: [
        { id: 'active-order', status: 'active' } as Order,
        { id: 'paid-order', status: 'paid' } as Order,
      ],
    });

    expect(firebaseMocks.runTransaction).toHaveBeenCalledTimes(1);
    const root = firebaseMocks.transactionRoots[0] as Record<string, any>;

    expect(root.orders).toBeUndefined();
    expect(root.payments).toBeUndefined();
    expect(root.settings).toMatchObject({ billCounter: 1000, kotCounter: 100 });
    expect(root.settings.kotLastResetDate).toBeUndefined();
    expect(root.resetMarkers.salesHistory).toMatchObject({ syncRevision: expect.any(Number) });
    expect(root.resetMarkers.activeFloor).toMatchObject({ syncRevision: expect.any(Number) });
    expect(root.tables.tableKey).toMatchObject({
      id: 'table-1',
      number: 'Garden 1',
      section: 'Garden',
      status: 'free',
    });
    expect(root.tables.tableKey.orderId).toBeUndefined();
    expect(root.customers.customerKey).toMatchObject({
      id: 'customer-1',
      name: 'Ramesh',
      currentDue: 0,
      creditResetRevision: expect.any(Number),
    });
    expect(root.customers.customerKey.repayments).toBeUndefined();
    expect(root.customerCreditResetTombstones['customer-1']).toMatchObject({ id: 'customer-1' });
    expect(root.kitchenPurchases).toBeUndefined();
    expect(root.meatEntries).toBeUndefined();
    expect(root.groceryPurchases).toBeUndefined();
    expect(root.alcoholProducts.alcoholKey.currentStockMl).toBe(0);
    expect(root.beverageProducts.beverageKey.currentStock).toBe(0);
    expect(root.cigaretteProducts.cigaretteKey.currentSticks).toBe(0);
    expect(root.invMovements).toBeUndefined();
    expect(root.maintenanceExpenses).toBeUndefined();
    expect(root.orderTombstones['active-order']).toMatchObject({ id: 'active-order' });
    expect(root.orderTombstones['paid-order']).toMatchObject({ id: 'paid-order' });
  });

  it('never writes protected master fields or unselected modules', async () => {
    await applySelectiveResetToFirebase({
      selection: {
        ...allSelected,
        salesHistory: false,
        customerCredit: false,
        kitchenOperations: false,
        maintenanceExpenses: false,
      },
      localOrders: [{ id: 'active-order', status: 'active' } as Order],
    });

    const root = firebaseMocks.transactionRoots[0] as Record<string, any>;

    expect(root.payments).toBeUndefined();
    expect(root.settings).toBeUndefined();
    expect(root.customers).toEqual(firebaseMocks.data.customers);
    expect(root.kitchenPurchases).toBeUndefined();
    expect(root.meatEntries).toBeUndefined();
    expect(root.groceryPurchases).toBeUndefined();
    expect(root.maintenanceExpenses).toBeUndefined();
    expect(root.tables.tableKey).toMatchObject({
      id: 'table-1',
      number: 'Garden 1',
      section: 'Garden',
      status: 'free',
    });
    expect(root.alcoholProducts.alcoholKey).toMatchObject({
      id: 'a1',
      name: 'Wine',
      currentStockMl: 0,
    });
    expect(root.menu).toEqual(firebaseMocks.data.menu);
    expect(root.users).toEqual(firebaseMocks.data.users);
    expect(root.areaOrder).toEqual(firebaseMocks.data.areaOrder);
    expect(root.invMappings).toEqual(firebaseMocks.data.invMappings);
  });

  it('propagates Firebase failures instead of clearing local state silently', async () => {
    firebaseMocks.runTransaction.mockRejectedValueOnce(new Error('offline'));

    await expect(
      applySelectiveResetToFirebase({
        selection: allSelected,
        localOrders: [],
      }),
    ).rejects.toThrow('offline');
  });

  it('rejects an ambiguous order/table write that began before marker hydration', async () => {
    firebaseMocks.data.resetMarkers = {
      activeFloor: {
        syncRevision: 9000,
        syncMutationId: 'reset',
      },
    };

    await writeOrderTableMutation({
      orders: [{
        id: 'fresh-tab-order',
        tableId: 'fresh-tab-table',
        tableNumber: '3',
        items: [],
        status: 'active',
        createdAt: 1000,
      }],
      tables: [{
        id: 'fresh-tab-table',
        number: '3',
        status: 'occupied',
        orderId: 'fresh-tab-order',
        orderStartTime: 1000,
      }],
    });

    expect(firebaseMocks.runTransaction).not.toHaveBeenCalled();
    expect(firebaseMocks.transactionRoots).toHaveLength(0);
  });

  it('blocks stale order/table occupancy writes after an active-floor reset', async () => {
    firebaseMocks.data.orderTombstones = {
      'old-order': {
        id: 'old-order',
        syncRevision: 2000,
        syncMutationId: 'reset',
      },
    };
    firebaseMocks.data.resetMarkers = {
      activeFloor: {
        syncRevision: 2000,
        syncMutationId: 'reset',
      },
    };

    await writeOrderTableMutation({
      orders: [{
        id: 'old-order',
        tableId: 'table-1',
        tableNumber: '1',
        items: [],
        status: 'active',
        createdAt: 1000,
        activeFloorResetGeneration: 'older-reset',
      }],
      tables: [{
        id: 'table-1',
        number: '1',
        status: 'occupied',
        orderId: 'old-order',
        orderStartTime: 1000,
        activeFloorResetGeneration: 'older-reset',
      }],
    });

    const root = firebaseMocks.transactionRoots[0] as Record<string, any>;
    expect(root.orders?.['old-order']).toBeUndefined();
    expect(root.tables.tableKey).toMatchObject({
      id: 'table-1',
      number: '1',
      status: 'free',
    });
    expect(root.tables.tableKey.orderId).toBeUndefined();
  });

  it('blocks a stale payment write after sales history was reset', async () => {
    firebaseMocks.data['resetMarkers/salesHistory'] = {
      syncRevision: 2000,
      syncMutationId: 'reset',
    };

    await writePaymentRecord({
      id: 'payment-1',
      orderId: 'old-order',
      tableNumber: '1',
      items: [],
      subtotal: 100,
      discount: 0,
      discountType: 'fixed',
      vatAmount: 0,
      vatRate: 0,
      vatMode: 'included',
      total: 100,
      method: 'cash',
      reference: '',
      createdAt: 1000,
      cafeName: 'Bamboo',
      billNumber: 1001,
      salesHistoryResetGeneration: 'older-reset',
    });

    expect(firebaseMocks.transactionRoots[0].payments).toBeUndefined();
  });

  it('accepts a post-reset payment even when its device clock is behind', async () => {
    firebaseMocks.data['resetMarkers/salesHistory'] = {
      syncRevision: 9000,
      syncMutationId: 'reset',
    };

    await writePaymentRecord({
      id: 'payment-after-reset',
      orderId: 'new-order',
      tableNumber: '2',
      items: [],
      subtotal: 100,
      discount: 0,
      discountType: 'fixed',
      vatAmount: 0,
      vatRate: 0,
      vatMode: 'included',
      total: 100,
      method: 'cash',
      reference: '',
      createdAt: 1000,
      cafeName: 'Bamboo',
      billNumber: 1002,
      salesHistoryResetGeneration: 'reset',
    });

    expect((firebaseMocks.transactionRoots[0] as Record<string, any>)
      .payments['payment-after-reset']).toMatchObject({
        id: 'payment-after-reset',
        createdAt: 1000,
        salesHistoryResetGeneration: 'reset',
      });
  });

  it('accepts a post-reset order and table even when their device clock is behind', async () => {
    firebaseMocks.data.resetMarkers = {
      activeFloor: {
        syncRevision: 9000,
        syncMutationId: 'reset',
      },
    };

    await writeOrderTableMutation({
      orders: [{
        id: 'new-order',
        tableId: 'table-2',
        tableNumber: '2',
        items: [],
        status: 'active',
        createdAt: 1000,
        activeFloorResetGeneration: 'reset',
      }],
      tables: [{
        id: 'table-2',
        number: '2',
        status: 'occupied',
        orderId: 'new-order',
        orderStartTime: 1000,
        activeFloorResetGeneration: 'reset',
      }],
    });

    const root = firebaseMocks.transactionRoots[0] as Record<string, any>;
    expect(root.orders['new-order']).toMatchObject({
      status: 'active',
      createdAt: 1000,
      activeFloorResetGeneration: 'reset',
    });
    expect(root.tables['table-2']).toMatchObject({
      status: 'occupied',
      orderId: 'new-order',
      activeFloorResetGeneration: 'reset',
    });
  });

  it('rejects a write when Firebase retries it after a concurrent reset commits', async () => {
    let optimisticWriteIncludedPayment = false;
    firebaseMocks.runTransaction.mockImplementationOnce(async (
      _path: string,
      updater: (root: unknown) => unknown,
    ) => {
      const optimistic = updater({ payments: {}, resetMarkers: {} }) as Record<string, any>;
      optimisticWriteIncludedPayment = Boolean(optimistic.payments?.['payment-race']);

      // Firebase retries a root transaction when the reset transaction commits
      // to a descendant between this writer's first read and commit.
      const retried = updater({
        resetMarkers: {
          salesHistory: { syncRevision: 2000, syncMutationId: 'reset' },
        },
      }) as Record<string, unknown>;
      firebaseMocks.transactionRoots.push(retried);
      return { committed: true, snapshot: { val: () => retried } };
    });

    await writePaymentRecord({
      id: 'payment-race',
      orderId: 'old-order',
      tableNumber: '1',
      items: [],
      subtotal: 100,
      discount: 0,
      discountType: 'fixed',
      vatAmount: 0,
      vatRate: 0,
      vatMode: 'included',
      total: 100,
      method: 'cash',
      reference: '',
      createdAt: 1000,
      cafeName: 'Bamboo',
      billNumber: 1001,
      salesHistoryResetGeneration: 'baseline',
    });

    expect(optimisticWriteIncludedPayment).toBe(true);
    expect(firebaseMocks.transactionRoots[0].payments).toBeUndefined();
  });

  it('sanitizes a stale customer-credit write against its durable reset marker', async () => {
    firebaseMocks.data['customerCreditResetTombstones/customer-1'] = {
      syncRevision: 2000,
      syncMutationId: 'reset',
    };

    await writeCustomer({
      id: 'customer-1',
      name: 'Ramesh',
      phone: '9800000000',
      currentDue: 500,
      totalSpend: 4000,
      visits: 8,
      foodItemsConsumed: 12,
      beverageItemsConsumed: 4,
      repayments: [{
        id: 'repayment-1',
        customerId: 'customer-1',
        amount: 100,
        method: 'cash',
        createdAt: 1000,
      }],
    });

    const customer = (firebaseMocks.transactionRoots[0] as Record<string, any>)
      .customers.customerKey as Record<string, unknown>;
    expect(customer).toMatchObject({
      id: 'customer-1',
      name: 'Ramesh',
      currentDue: 0,
      repayments: [],
      creditResetRevision: 2000,
      creditResetMutationId: 'reset',
    });
  });
});