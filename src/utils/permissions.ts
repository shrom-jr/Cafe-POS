import { StaffPermissions } from '@/types/staff';

export const MANAGER_MANAGEMENT_PERMISSIONS: (keyof StaffPermissions)[] = [
  'dashboard', 'reports', 'menu', 'inventory', 'expenses',
];

/** Canonical customer-directory permission with a one-way legacy fallback. */
export function canAccessCustomers(permissions: StaffPermissions | undefined): boolean {
  if (!permissions) return false;
  return permissions.customers !== undefined
    ? permissions.customers === true
    : permissions.canViewCustomers === true;
}

export function canAccessManagement(
  role: string | undefined,
  permissions: StaffPermissions | undefined,
): boolean {
  if (!permissions) return false;
  return role === 'ADMIN' || (
    role === 'MANAGER' &&
    MANAGER_MANAGEMENT_PERMISSIONS.some((permission) => permissions[permission] === true)
  );
}

export function getFirstPermittedManagementRoute(permissions: StaffPermissions): string {
  if (permissions.dashboard) return '/admin';
  if (permissions.reports) return '/admin';
  if (permissions.menu) return '/admin';
  if (permissions.inventory) return '/admin';
  if (permissions.expenses) return '/admin';
  return '/';
}

/** Returns the first route the user has access to, in priority order. */
export function getFirstPermittedRoute(permissions: StaffPermissions): string {
  if (permissions.pos)     return '/';
  if (permissions.dashboard) return '/admin?tab=dashboard';
  if (permissions.reports) return '/admin?tab=reports';
  if (permissions.menu) return '/admin?tab=menu';
  if (permissions.inventory) return '/admin?tab=inventory';
  if (permissions.expenses) return '/admin?tab=expenses';
  if (permissions.customers || permissions.canViewCustomers) return '/customers';
  if (permissions.kitchen) return '/kitchen';
  if (permissions.bar)     return '/bar';
  if (permissions.admin)   return '/admin';
  return '/';
}
