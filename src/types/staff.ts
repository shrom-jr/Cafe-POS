export type Role = 'WAITER' | 'CASHIER' | 'ADMIN';

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  pin: string;
  active: boolean;
}
