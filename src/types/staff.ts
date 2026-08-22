export type Role = 'WAITER' | 'CASHIER' | 'KITCHEN' | 'MANAGER' | 'ADMIN';

export interface StaffPermissions {
  pos:     boolean; // POS & Table Management
  customers?: boolean; // Customer Directory & Ledgers
  kitchen: boolean; // Kitchen Portal
  bar:     boolean; // Bar Portal
  admin:   boolean; // Admin Panel
  dashboard?: boolean; // Live Dashboard
  reports?: boolean; // Sales Reports
  menu?: boolean; // Menu Management
  inventory?: boolean; // Stock & Restock
  expenses?: boolean; // Expense Logging
  /** Khatta: can attach a customer to an order */
  canAttachCustomer?: boolean;
  /** Khatta: can settle or view outstanding customer dues */
  canSettleDues?: boolean;
  /** Khatta: can access the customer ledger list */
  canViewCustomers?: boolean;
}

/** Default permissions automatically assigned when a role preset is chosen. */
export const DEFAULT_PERMISSIONS: Record<Role, StaffPermissions> = {
  WAITER:  { pos: true, customers: false, kitchen: false, bar: false, admin: false, dashboard: false, reports: false, menu: false, inventory: false, expenses: false, canAttachCustomer: true, canSettleDues: false, canViewCustomers: false },
  CASHIER: { pos: true, customers: true, kitchen: false, bar: false, admin: false, dashboard: false, reports: false, menu: false, inventory: false, expenses: false, canAttachCustomer: true, canSettleDues: true, canViewCustomers: true },
  KITCHEN: { pos: false, customers: false, kitchen: true, bar: false, admin: false, dashboard: false, reports: false, menu: false, inventory: false, expenses: false, canAttachCustomer: false, canSettleDues: false, canViewCustomers: false },
  MANAGER: { pos: true, customers: true, kitchen: true, bar: true, admin: false, dashboard: true, reports: true, menu: true, inventory: true, expenses: true, canAttachCustomer: true, canSettleDues: true, canViewCustomers: true },
  ADMIN:   { pos: true, customers: true, kitchen: true, bar: true, admin: true, dashboard: true, reports: true, menu: true, inventory: true, expenses: true, canAttachCustomer: true, canSettleDues: true, canViewCustomers: true },
};

export interface StaffUser {
  id:          string;
  name:        string;
  email:       string;
  role:        Role;

  /**
   * Legacy plaintext PIN field.
   * Present only on records that have **not yet been migrated** to the hashed
   * schema. The migration engine (in `subscribeToStaff` / `login`) strips this
   * field and replaces it with `pinHash` + `salt` on first encounter.
   * @deprecated Use `pinHash` + `salt` instead.
   */
  pin?:           string;

  /** SHA-256 hex hash of `salt + pin`. Present on all migrated records. */
  pinHash?:       string;
  /** Random 32-char hex salt (16 bytes) unique per user. */
  salt?:          string;
  /**
   * Expected digit count for this account's PIN.
   * - `4` — legacy account migrated from the 4-digit era; `mustChangePin` will
   *   also be `true` so the user is prompted to set a new 6-digit PIN.
   * - `6` — default for all new accounts.
   * Absence should be treated as `6`.
   */
  pinLength?:     number;
  /**
   * When `true`, the staff member is prompted to set a new 6-digit PIN
   * immediately after their next successful login.
   * Set automatically when a 4-digit legacy PIN is migrated.
   */
  mustChangePin?: boolean;

  active:      boolean;
  permissions: StaffPermissions;
}
