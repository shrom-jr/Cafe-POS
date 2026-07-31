export type Role = 'WAITER' | 'CASHIER' | 'ADMIN' | 'KITCHEN';

export interface StaffPermissions {
  pos:     boolean; // POS & Table Management
  kitchen: boolean; // Kitchen Portal
  bar:     boolean; // Bar Portal
  admin:   boolean; // Admin Panel
}

/** Default permissions automatically assigned when a role preset is chosen. */
export const DEFAULT_PERMISSIONS: Record<Role, StaffPermissions> = {
  WAITER:  { pos: true,  kitchen: false, bar: false, admin: false },
  CASHIER: { pos: true,  kitchen: false, bar: false, admin: false },
  KITCHEN: { pos: false, kitchen: true,  bar: false, admin: false },
  ADMIN:   { pos: true,  kitchen: true,  bar: true,  admin: true  },
};

export interface StaffUser {
  id:          string;
  name:        string;
  email:       string;
  role:        Role;
  pin:         string;
  active:      boolean;
  permissions: StaffPermissions;
}
