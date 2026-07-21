export type Role = 'WAITER' | 'CASHIER' | 'ADMIN';

export interface StaffUser {
  id: string;
  name: string;
  role: Role;
  pin: string;
  active: boolean;
}
