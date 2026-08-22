import { describe, expect, it } from 'vitest';
import type {
  AlcoholProduct,
  BeverageProduct,
  CafeTable,
  CigaretteProduct,
  Customer,
  Order,
  Settings,
} from '@/types/pos';
import {
  alcoholAfterStockReset,
  beveragesAfterStockReset,
  cigarettesAfterStockReset,
  customersAfterCreditReset,
  ordersAfterSelectiveReset,
  settingsAfterSalesReset,
  tablesAfterActiveFloorReset,
} from '@/utils/selectiveReset';
import { db } from '@/storage/db';

const activeOrder = { id: 'active', status: 'active' } as Order;
const billedOrder = { id: 'billed', status: 'billed' } as Order;
const paidOrder = { id: 'paid', status: 'paid' } as Order;

describe('selective reset boundaries', () => {
  it('clears completed sales without closing active or billed tables', () => {
    expect(
      ordersAfterSelectiveReset(
        [activeOrder, billedOrder, paidOrder],
        { salesHistory: true, activeFloor: false },
      ).map((order) => order.id),
    ).toEqual(['active', 'billed']);
  });

  it('clears running carts without deleting paid history', () => {
    expect(
      ordersAfterSelectiveReset(
        [activeOrder, billedOrder, paidOrder],
        { salesHistory: false, activeFloor: true },
      ).map((order) => order.id),
    ).toEqual(['paid']);
  });

  it('preserves table definitions while removing occupancy state', () => {
    const tables: CafeTable[] = [{
      id: 'table-1',
      number: 'Garden 1',
      section: 'Garden',
      status: 'occupied',
      orderId: 'active',
      orderStartTime: 123,
      pax: 4,
    }];

    expect(tablesAfterActiveFloorReset(tables)).toEqual([{
      id: 'table-1',
      number: 'Garden 1',
      section: 'Garden',
      status: 'free',
    }]);
  });

  it('resets only billing counters inside settings', () => {
    const settings = {
      cafeName: 'Bamboo',
      wallets: {},
      billCounter: 1422,
      kotCounter: 888,
      kotLastResetDate: '2026-08-19',
      vatEnabled: true,
    } as unknown as Settings;

    expect(settingsAfterSalesReset(settings)).toMatchObject({
      cafeName: 'Bamboo',
      billCounter: 1000,
      kotCounter: 100,
      vatEnabled: true,
    });
    expect(settingsAfterSalesReset(settings).kotLastResetDate).toBeUndefined();
  });

  it('clears credit data without deleting customer profiles or lifetime metrics', () => {
    const customers: Customer[] = [{
      id: 'customer-1',
      name: 'Ramesh',
      phone: '9800000000',
      currentDue: 750,
      totalSpend: 4000,
      visits: 8,
      foodItemsConsumed: 12,
      beverageItemsConsumed: 4,
    }];

    expect(customersAfterCreditReset(customers)).toEqual([{
      ...customers[0],
      currentDue: 0,
    }]);
  });

  it('zeroes stock fields without changing protected product definitions', () => {
    const alcohol: AlcoholProduct[] = [{
      id: 'a1',
      name: 'House Wine',
      category: 'wine',
      bottleSizeMl: 750,
      currentStockMl: 5250,
      minStockMl: 1500,
      costPerBottle: 900,
      status: 'active',
    }];
    const beverages: BeverageProduct[] = [{
      id: 'b1',
      name: 'Cola',
      category: 'soft-drinks',
      packagingType: 'can',
      currentStock: 24,
      minStock: 6,
      costPerUnit: 50,
      status: 'active',
    }];
    const cigarettes: CigaretteProduct[] = [{
      id: 'c1',
      name: 'Classic',
      sticksPerPacket: 20,
      currentSticks: 200,
      minSticks: 40,
      costPerPacket: 300,
      status: 'active',
    }];

    expect(alcoholAfterStockReset(alcohol)[0]).toEqual({
      ...alcohol[0],
      currentStockMl: 0,
    });
    expect(beveragesAfterStockReset(beverages)[0]).toEqual({
      ...beverages[0],
      currentStock: 0,
    });
    expect(cigarettesAfterStockReset(cigarettes)[0]).toEqual({
      ...cigarettes[0],
      currentSticks: 0,
    });
  });

  it('includes the local bar restock audit in the automatic full backup', () => {
    const entry = { id: 'restock-1', productName: 'House Wine', baseUnitChange: 750 };
    localStorage.setItem('bar_restock_entries', JSON.stringify([entry]));

    const backup = JSON.parse(db.exportFullBackup());

    expect(backup.data.barRestockEntries).toEqual([entry]);
    localStorage.removeItem('bar_restock_entries');
  });
});