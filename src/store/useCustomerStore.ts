import { create } from 'zustand';
import { Customer } from '@/types/pos';

const CUSTOMERS_KEY = 'pos_customers';

const SEED_CUSTOMERS: Customer[] = [
  { id: 'cust-1', name: 'Ramesh Sharma',  phone: '9841012345', currentDue: 1200, totalSpend: 8500,  visits: 12 },
  { id: 'cust-2', name: 'Sunita Thapa',   phone: '9812345678', currentDue: 0,    totalSpend: 4200,  visits: 7  },
  { id: 'cust-3', name: 'Binod Karki',    phone: '9856789012', currentDue: 350,  totalSpend: 2700,  visits: 5  },
];

function loadCustomers(): Customer[] {
  try {
    const d = localStorage.getItem(CUSTOMERS_KEY);
    if (d) {
      const parsed = JSON.parse(d) as Customer[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  // First run — seed with demo data and persist
  localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(SEED_CUSTOMERS));
  return SEED_CUSTOMERS;
}

function persist(customers: Customer[]) {
  localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
}

interface CustomerState {
  customers: Customer[];
  /** Register a new customer; returns the created record. */
  addCustomer: (data: { name: string; phone: string }) => Customer;
  /** Generic partial update. */
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  /**
   * Credit today's order amount to the customer's Khatta (Pay Later).
   * Increments currentDue, totalSpend, and visits.
   */
  addToCustomerDue: (id: string, amount: number) => void;
  /**
   * Marks the customer's outstanding due as fully settled (currentDue → 0).
   * Called when a cashier includes the previous due in a normal payment.
   */
  settleCustomerDue: (id: string) => void;
  /** Returns the freshest snapshot of a single customer by ID. */
  getCustomer: (id: string) => Customer | undefined;
}

export const useCustomerStore = create<CustomerState>((set, get) => ({
  customers: loadCustomers(),

  addCustomer: (data) => {
    const customer: Customer = {
      id: crypto.randomUUID(),
      name: data.name.trim(),
      phone: data.phone.trim(),
      currentDue: 0,
      totalSpend: 0,
      visits: 0,
    };
    const customers = [...get().customers, customer];
    persist(customers);
    set({ customers });
    return customer;
  },

  updateCustomer: (id, updates) => {
    const customers = get().customers.map((c) => (c.id === id ? { ...c, ...updates } : c));
    persist(customers);
    set({ customers });
  },

  addToCustomerDue: (id, amount) => {
    const customers = get().customers.map((c) =>
      c.id === id
        ? {
            ...c,
            currentDue: c.currentDue + amount,
            totalSpend: c.totalSpend + amount,
            visits: c.visits + 1,
          }
        : c
    );
    persist(customers);
    set({ customers });
  },

  settleCustomerDue: (id) => {
    const customers = get().customers.map((c) =>
      c.id === id ? { ...c, currentDue: 0 } : c
    );
    persist(customers);
    set({ customers });
  },

  getCustomer: (id) => get().customers.find((c) => c.id === id),
}));
