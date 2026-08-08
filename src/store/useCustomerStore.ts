import { create } from 'zustand';
import { Customer, CustomerRepayment, StaffAttribution } from '@/types/pos';

const CUSTOMERS_KEY = 'pos_customers';
const REPAYMENTS_KEY = 'pos_customer_repayments';

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

function loadRepayments(): CustomerRepayment[] {
  try {
    const stored = localStorage.getItem(REPAYMENTS_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistRepayments(repayments: CustomerRepayment[]) {
  localStorage.setItem(REPAYMENTS_KEY, JSON.stringify(repayments));
}

interface CustomerState {
  customers: Customer[];
  repayments: CustomerRepayment[];
  /** Register a new customer; returns the created record. */
  addCustomer: (data: { name: string; phone: string }) => Customer;
  /**
   * Update a customer's profile fields. `currentDue` is deliberately excluded:
   * a balance may only move through `addToCustomerDue` or `receiveRepayment`,
   * so every change leaves an auditable trail.
   */
  updateCustomer: (id: string, updates: Partial<Omit<Customer, 'id' | 'currentDue'>>) => void;
  /**
   * Credit today's order amount to the customer's Khatta (Pay Later).
   * Increments currentDue, totalSpend, and visits.
   */
  addToCustomerDue: (id: string, amount: number) => void;
  /**
   * Record a validated partial or full repayment against a customer's Khatta.
   * This is the ONLY way a balance may decrease — it always writes a ledger
   * entry so collected dues stay auditable.
   */
  receiveRepayment: (data: {
    customerId: string;
    amount: number;
    method: 'cash' | 'fonepay';
    notes?: string;
    receivedBy?: StaffAttribution;
  }) => { ok: true; repayment: CustomerRepayment } | { ok: false; error: string };
  /** Returns the freshest snapshot of a single customer by ID. */
  getCustomer: (id: string) => Customer | undefined;
}

export const useCustomerStore = create<CustomerState>((set, get) => ({
  customers: loadCustomers(),
  repayments: loadRepayments(),

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
    // Strip balance fields at runtime too — the type alone would not stop a
    // caller that widens the object, and a silent balance edit is unauditable.
    const { currentDue: _ignoredDue, id: _ignoredId, ...safeUpdates } =
      updates as Partial<Customer>;
    const customers = get().customers.map((c) => (c.id === id ? { ...c, ...safeUpdates } : c));
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

  receiveRepayment: ({ customerId, amount, method, notes, receivedBy }) => {
    const customer = get().customers.find((entry) => entry.id === customerId);
    const normalizedAmount = Math.round(Number(amount) * 100) / 100;
    if (!customer) return { ok: false, error: 'Customer was not found.' };
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return { ok: false, error: 'Enter a valid repayment amount.' };
    }
    if (normalizedAmount > customer.currentDue) {
      return { ok: false, error: `Amount cannot exceed the current due of Rs. ${customer.currentDue}.` };
    }

    const repayment: CustomerRepayment = {
      id: crypto.randomUUID(),
      customerId,
      amount: normalizedAmount,
      method,
      notes: notes?.trim() || undefined,
      createdAt: Date.now(),
      receivedBy,
    };
    const customers = get().customers.map((entry) =>
      entry.id === customerId
        ? { ...entry, currentDue: Math.max(0, Math.round((entry.currentDue - normalizedAmount) * 100) / 100) }
        : entry
    );
    const repayments = [...get().repayments, repayment];
    persist(customers);
    persistRepayments(repayments);
    set({ customers, repayments });
    return { ok: true, repayment };
  },

  getCustomer: (id) => get().customers.find((c) => c.id === id),
}));
