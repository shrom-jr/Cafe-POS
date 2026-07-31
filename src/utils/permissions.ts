import { StaffPermissions } from '@/types/staff';

/** Returns the first route the user has access to, in priority order. */
export function getFirstPermittedRoute(permissions: StaffPermissions): string {
  if (permissions.pos)     return '/';
  if (permissions.kitchen) return '/kitchen';
  if (permissions.bar)     return '/bar';
  if (permissions.admin)   return '/admin';
  return '/';
}
