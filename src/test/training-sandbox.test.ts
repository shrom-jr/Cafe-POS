import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/storage/db';
import { enqueueMutation, getPendingQueueCount } from '@/utils/offlineQueue';
import {
  beginTrainingSandbox,
  configureTrainingSandbox,
  endTrainingSandbox,
  isTrainingAccessConfirmation,
  isTrainingSandboxActive,
  isTrainingSandboxReconciling,
  TRAINING_RECEIPT_NOTICE,
} from '@/utils/trainingSandbox';
import { useStaffStore } from '@/store/useStaffStore';
import { DEFAULT_PERMISSIONS } from '@/types/staff';
import { fireSilentPrintJob } from '@/utils/silentPrint';
import { executeSelectiveReset } from '@/utils/selectiveReset';
import { browserPrintKOT } from '@/utils/browserPrint';

describe('Staff Practice sandbox boundary', () => {
  beforeEach(() => {
    if (isTrainingSandboxActive()) endTrainingSandbox();
    localStorage.clear();
    configureTrainingSandbox({ capture: () => {}, restore: () => {} });
  });

  it('accepts only the case-insensitive training confirmation', () => {
    expect(isTrainingAccessConfirmation('test')).toBe(true);
    expect(isTrainingAccessConfirmation(' TEST ')).toBe(true);
    expect(isTrainingAccessConfirmation('testing')).toBe(false);
  });

  it('blocks browser persistence and offline queue writes while active', () => {
    db.saveTables([{ id: 'live-table', number: '1', section: 'Main', status: 'free' }]);
    const liveTables = localStorage.getItem('pos_tables');

    beginTrainingSandbox();
    db.saveTables([{ id: 'practice-table', number: '99', section: 'Practice', status: 'free' }]);
    enqueueMutation('orders', 'create_order', {}, 'baseline');

    expect(localStorage.getItem('pos_tables')).toBe(liveTables);
    expect(getPendingQueueCount()).toBe(0);
  });

  it('restores the captured state when practice ends and never persists its synthetic user', () => {
    const liveUser = {
      id: 'live-cashier',
      name: 'Live Cashier',
      email: 'cashier@example.com',
      role: 'CASHIER' as const,
      active: true,
      permissions: { ...DEFAULT_PERMISSIONS.CASHIER },
    };
    useStaffStore.setState({ users: [liveUser], currentUser: null });
    let restored = false;
    configureTrainingSandbox({
      capture: () => {},
      restore: () => {
        restored = true;
        useStaffStore.setState({ users: [liveUser], currentUser: null });
      },
    });

    useStaffStore.getState().enterTraining();
    expect(useStaffStore.getState().currentUser?.name).toBe('Staff Practice');
    expect(useStaffStore.getState().currentUser?.permissions).toEqual(DEFAULT_PERMISSIONS.ADMIN);
    expect(localStorage.getItem('pos_current_user')).toBeNull();

    useStaffStore.getState().logout();
    expect(restored).toBe(true);
    expect(isTrainingSandboxActive()).toBe(false);
    expect(useStaffStore.getState().currentUser).toBeNull();
  });

  it('reconciles live snapshots before lifting the no-write boundary on exit', () => {
    let state = 'live';
    let reconciliationWasGuarded = false;
    configureTrainingSandbox({
      capture: () => { state = 'snapshot'; },
      restore: () => { state = 'restored-snapshot'; },
      reconcile: () => {
        reconciliationWasGuarded = isTrainingSandboxActive() && isTrainingSandboxReconciling();
        state = 'latest-live-snapshot';
      },
    });

    beginTrainingSandbox();
    state = 'practice-change';
    endTrainingSandbox();

    expect(reconciliationWasGuarded).toBe(true);
    expect(state).toBe('latest-live-snapshot');
    expect(isTrainingSandboxActive()).toBe(false);
  });

  it('suppresses physical print dispatches while a practice session is active', async () => {
    beginTrainingSandbox();
    await expect(fireSilentPrintJob({
      type: 'PRE_BILL',
      data: {
        cafeName: 'Practice Cafe',
        tableNumber: '1',
        timestamp: Date.now(),
        items: [],
        subtotal: 0,
        discountAmount: 0,
        vatEnabled: false,
        vatAmount: 0,
        vatRate: 0,
        total: 0,
      },
    })).resolves.toBe(false);
    await expect(browserPrintKOT({
      cafeName: 'Practice Cafe',
      ticket: {
        id: 'practice-kot',
        orderId: 'practice-order',
        tableId: 'practice-table',
        tableName: '1',
        ticketType: 'KOT',
        ticketNumber: 1,
        items: [],
        serverName: 'Staff Practice',
        createdAt: new Date().toISOString(),
        status: 'pending',
      },
    })).resolves.toBe(false);
    expect(TRAINING_RECEIPT_NOTICE).toContain('NOT A TAX INVOICE');
  });

  it('cannot reset live data through the Admin data-management action', async () => {
    localStorage.setItem('pos_customers', JSON.stringify([{ id: 'live-customer' }]));
    beginTrainingSandbox();

    await executeSelectiveReset({
      salesHistory: true,
      activeFloor: true,
      customerCredit: true,
      kitchenOperations: true,
      barInventory: true,
      maintenanceExpenses: true,
    });

    expect(localStorage.getItem('pos_customers')).toContain('live-customer');
  });
});