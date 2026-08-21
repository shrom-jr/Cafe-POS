import { describe, expect, it, vi } from 'vitest';
import {
  authorizeAndExecuteSelectiveReset,
  validateAdminPin,
} from '@/screens/AdminPanel';
import type { StaffUser } from '@/types/staff';
import type { SelectiveResetSelection } from '@/types/selectiveReset';

const selection: SelectiveResetSelection = {
  salesHistory: true,
  activeFloor: true,
  customerCredit: true,
  kitchenOperations: true,
  barInventory: true,
  maintenanceExpenses: true,
};

const staff = (overrides: Partial<StaffUser> = {}): StaffUser => ({
  id: 'admin-1',
  name: 'Admin User',
  email: 'admin@example.com',
  role: 'ADMIN',
  pin: '2468',
  active: true,
  permissions: {
    pos: true,
    kitchen: true,
    bar: true,
    admin: true,
  },
  ...overrides,
});

describe('Factory Reset admin authorization', () => {
  it('accepts a valid PIN from any active admin and triggers the reset operation', async () => {
    const resetTransaction = vi.fn().mockResolvedValue(undefined);

    await expect(
      authorizeAndExecuteSelectiveReset(
        '2468',
        [
          staff({ id: 'inactive-admin', active: false }),
          staff({ id: 'active-admin', pin: '2468' }),
        ],
        selection,
        resetTransaction,
      ),
    ).resolves.toBe(true);

    expect(resetTransaction).toHaveBeenCalledOnce();
    expect(resetTransaction).toHaveBeenCalledWith(selection);
  });

  it('does not authorize inactive or non-admin staff PINs', async () => {
    await expect(validateAdminPin('2468', [
      staff({ active: false }),
      staff({ id: 'cashier', role: 'CASHIER' }),
    ])).resolves.toBe(false);
  });
});