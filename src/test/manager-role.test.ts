import { describe, expect, it } from 'vitest';
import { DEFAULT_PERMISSIONS } from '@/types/staff';
import { migrateUser } from '@/store/useStaffStore';
import {
  canAccessManagement,
  canAccessCustomers,
  getFirstPermittedManagementRoute,
  getFirstPermittedRoute,
} from '@/utils/permissions';

describe('Manager role permissions and navigation', () => {
  it('ships a complete Manager preset that can be customized independently', () => {
    expect(DEFAULT_PERMISSIONS.MANAGER).toMatchObject({
      pos: true,
      customers: true,
      kitchen: true,
      bar: true,
      dashboard: true,
      reports: true,
      menu: true,
      inventory: true,
      expenses: true,
      admin: false,
    });

    const customized = { ...DEFAULT_PERMISSIONS.MANAGER, menu: false, inventory: false };
    expect(customized.menu).toBe(false);
    expect(DEFAULT_PERMISSIONS.MANAGER.menu).toBe(true);
  });

  it('lets Admins and permitted Managers enter management, but not other roles', () => {
    expect(canAccessManagement('ADMIN', DEFAULT_PERMISSIONS.ADMIN)).toBe(true);
    expect(canAccessManagement('MANAGER', { ...DEFAULT_PERMISSIONS.MANAGER, dashboard: false })).toBe(true);
    expect(canAccessManagement('CASHIER', DEFAULT_PERMISSIONS.CASHIER)).toBe(false);
    expect(canAccessManagement('MANAGER', { ...DEFAULT_PERMISSIONS.MANAGER, dashboard: false, reports: false, menu: false, inventory: false, expenses: false })).toBe(false);
  });

  it('uses customers as the canonical permission and only falls back for legacy records', () => {
    expect(canAccessCustomers({ ...DEFAULT_PERMISSIONS.CASHIER, customers: true, canViewCustomers: false })).toBe(true);
    expect(canAccessCustomers({ ...DEFAULT_PERMISSIONS.CASHIER, customers: false, canViewCustomers: true })).toBe(false);
    expect(canAccessCustomers({ ...DEFAULT_PERMISSIONS.CASHIER, customers: undefined, canViewCustomers: true })).toBe(true);
  });

  it('preserves an explicit legacy customer denial during store migration', () => {
    const migrated = migrateUser({
      id: 'legacy-cashier',
      name: 'Legacy Cashier',
      email: 'legacy@example.com',
      role: 'CASHIER',
      active: true,
      pin: '123456',
      permissions: { pos: true, kitchen: false, bar: false, admin: false, canViewCustomers: false },
    });
    expect(migrated.permissions.customers).toBe(false);
    expect(canAccessCustomers(migrated.permissions)).toBe(false);
  });

  it('does not advertise management access to non-Manager roles', () => {
    const customCashier = { ...DEFAULT_PERMISSIONS.CASHIER, reports: true };
    expect(canAccessManagement('CASHIER', customCashier)).toBe(false);
  });

  it('routes a Manager to the management shell while preserving portal priority', () => {
    const manager = { ...DEFAULT_PERMISSIONS.MANAGER, pos: false };
    expect(getFirstPermittedManagementRoute(manager)).toBe('/admin');
    expect(getFirstPermittedRoute(manager)).toBe('/admin?tab=dashboard');
    expect(getFirstPermittedRoute(DEFAULT_PERMISSIONS.MANAGER)).toBe('/');
  });
});