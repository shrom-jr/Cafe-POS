import { create } from 'zustand';
import { Customer, CustomerRepayment, StaffAttribution } from '@/types/pos';
import { writeCustomer, deleteCustomerFirebase } from '@/utils/firebaseSync';

const CUSTOMERS_KEY = 'pos_customers';
const REPAYMENTS_KEY = 'pos_customer_repayments';

function loadCustomers(): Customer[] {
  try {
    const d = localStorage.getItem(CUSTOMERS_KEY);
    if (d) {
      const parsed = JSON.parse(d) as Customer[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* ignore */ }
  return [];
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
  /** Permanently remove a customer from the local store and Firebase. */
  deleteCustomer: (id: string) => void;
  /**
   * Record consumption metrics when an order settles with an attached
   * customer: visit count, last visit, spend, food/beverage tallies, and the
   * running top-orders ranking. `countVisitAndSpend` is false for Pay Later
   * settlements because `addToCustomerDue` already counted them.
   */
  recordOrderConsumption: (
    customerId: string,
    data: {
      orderTotal: number;
      countVisitAndSpend: boolean;
      foodItems: number;
      beverageItems: number;
      items: Array<{ itemId: string; name: string; quantity: number; category: string }>;
    },
  ) => void;
  /** Replace local customer state with a Firebase snapshot. */
  hydrateFromFirebase: (records: Array<Customer & { repayments?: CustomerRepayment[] }>) => void;
  /** Returns the freshest snapshot of a single customer by ID. */
  getCustomer: (id: string) => Customer | undefined;
}

function withLedger(
  customer: Customer,
  repayments: CustomerRepayment[],
): Customer & { repayments: CustomerRepayment[] } {
  return {
    ...customer,
    repayments: repayments.filter((repayment) => repayment.customerId === customer.id),
  };
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
      foodItemsConsumed: 0,
      beverageItemsConsumed: 0,
    };
    const customers = [...get().customers, customer];
    persist(customers);
    set({ customers });
    void writeCustomer(withLedger(customer, get().repayments));
    return customer;
  },

  updateCustomer: (id, updates) => {
    const { currentDue: _ignoredDue, id: _ignoredId, ...safeUpdates } =
      updates as Partial<Customer>;
    const customers = get().customers.map((c) => (c.id === id ? { ...c, ...safeUpdates } : c));
    persist(customers);
    set({ customers });
    const updatedCustomer = customers.find((customer) => customer.id === id);
    if (updatedCustomer) void writeCustomer(withLedger(updatedCustomer, get().repayments));
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
    const updatedCustomer = customers.find((customer) => customer.id === id);
    if (updatedCustomer) void writeCustomer(withLedger(updatedCustomer, get().repayments));
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
    const updatedCustomer = customers.find((entry) => entry.id === customerId);
    if (updatedCustomer) void writeCustomer(withLedger(updatedCustomer, repayments));
    return { ok: true, repayment };
  },

  deleteCustomer: (id) => {
    const customers = get().customers.filter((c) => c.id !== id);
    const repayments = get().repayments.filter((r) => r.customerId !== id);
    persist(customers);
    persistRepayments(repayments);
    set({ customers, repayments });
    void deleteCustomerFirebase(id);
  },

  recordOrderConsumption: (customerId, data) => {
    const nowIso = new Date().toISOString();
    const customers = get().customers.map((c) => {
      if (c.id !== customerId) return c;
      const topOrders = [...(c.topOrders ?? [])];
      for (const item of data.items) {
        const idx = topOrders.findIndex((t) => t.itemId === item.itemId);
        if (idx >= 0) {
          topOrders[idx] = { ...topOrders[idx], quantity: topOrders[idx].quantity + item.quantity };
        } else {
          topOrders.push({ ...item });
        }
      }
      topOrders.sort((a, b) => b.quantity - a.quantity);
      return {
        ...c,
        visits: data.countVisitAndSpend ? c.visits + 1 : c.visits,
        totalSpend: data.countVisitAndSpend
          ? Math.round((c.totalSpend + data.orderTotal) * 100) / 100
          : c.totalSpend,
        lastVisit: nowIso,
        foodItemsConsumed: (c.foodItemsConsumed ?? 0) + data.foodItems,
        beverageItemsConsumed: (c.beverageItemsConsumed ?? 0) + data.beverageItems,
        topOrders,
      };
    });
    persist(customers);
    set({ customers });
    const updatedCustomer = customers.find((c) => c.id === customerId);
    if (updatedCustomer) void writeCustomer(withLedger(updatedCustomer, get().repayments));
  },

  hydrateFromFirebase: (records) => {
    const customers = records.map(({ repayments: _repayments, ...customer }) => ({
      ...customer,
      foodItemsConsumed: customer.foodItemsConsumed ?? 0,
      beverageItemsConsumed: customer.beverageItemsConsumed ?? 0,
    }));
    const repayments = records.flatMap((record) =>
      Array.isArray(record.repayments)
        ? record.repayments.filter((repayment) => repayment.customerId === record.id)
        : [],
    );
    persist(customers);
    persistRepayments(repayments);
    set({ customers, repayments });
  },

  getCustomer: (id) => get().customers.find((c) => c.id === id),
}));