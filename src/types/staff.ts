export type Role = 'WAITER' | 'CASHIER' | 'ADMIN' | 'KITCHEN';

export interface StaffPermissions {
  pos:     boolean; // POS & Table Management
  kitchen: boolean; // Kitchen Portal
  bar:     boolean; // Bar Portal
  admin:   boolean; // Admin Panel
  /** Khatta: can attach a customer to an order */
  canAttachCustomer?: boolean;
  /** Khatta: can settle or view outstanding customer dues */
  canSettleDues?: boolean;
  /** Khatta: can access the customer ledger list */
  canViewCustomers?: boolean;
}

/** Default permissions automatically assigned when a role preset is chosen. */
export const DEFAULT_PERMISSIONS: Record<Role, StaffPermissions> = {
  WAITER:  { pos: true,  kitchen: false, bar: false, admin: false, canAttachCustomer: true,  canSettleDues: false, canViewCustomers: false },
  CASHIER: { pos: true,  kitchen: false, bar: false, admin: false, canAttachCustomer: true,  canSettleDues: true,  canViewCustomers: true  },
  KITCHEN: { pos: false, kitchen: true,  bar: false, admin: false, canAttachCustomer: false, canSettleDues: false, canViewCustomers: false },
  ADMIN:   { pos: true,  kitchen: true,  bar: true,  admin: true,  canAttachCustomer: true,  canSettleDues: true,  canViewCustomers: true  },
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
