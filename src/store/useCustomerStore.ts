import { create } from 'zustand';
import { Customer, CustomerRepayment, StaffAttribution } from '@/types/pos';
import * as firebaseLib from '@/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  updateDoc 
} from 'firebase/firestore';

const CUSTOMERS_KEY = 'pos_customers';
const REPAYMENTS_KEY = 'pos_customer_repayments';

// Safely extract Firestore instance regardless of export name (db or firestore)
const getDb = () => {
  try {
    return (firebaseLib as any).db || (firebaseLib as any).firestore || (firebaseLib as any).default;
  } catch {
    return null;
  }
};

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
  try {
    localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
  } catch { /* ignore */ }
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
  try {
    localStorage.setItem(REPAYMENTS_KEY, JSON.stringify(repayments));
  } catch { /* ignore */ }
}

interface CustomerState {
  customers: Customer[];
  repayments: CustomerRepayment[];
  initialized: boolean;

  initSync: () => () => void;
  addCustomer: (data: { name: string; phone: string }) => Customer;
  updateCustomer: (id: string, updates: Partial<Omit<Customer, 'id' | 'currentDue'>>) => void;
  addToCustomerDue: (id: string, amount: number) => void;
  receiveRepayment: (data: {
    customerId: string;
    amount: number;
    method: 'cash' | 'fonepay';
    notes?: string;
    receivedBy?: StaffAttribution;
  }) => { ok: true; repayment: CustomerRepayment } | { ok: false; error: string };
  getCustomer: (id: string) => Customer | undefined;
}

export const useCustomerStore = create<CustomerState>((set, get) => ({
  customers: loadCustomers(),
  repayments: loadRepayments(),
  initialized: false,

  initSync: () => {
    const db = getDb();
    if (!db) {
      console.warn('Firebase DB instance not found. Running in local mode.');
      return () => {};
    }

    try {
      const unsubCustomers = onSnapshot(
        collection(db, 'customers'),
        (snapshot) => {
          const customers = snapshot.docs.map((doc) => doc.data() as Customer);
          if (customers.length > 0) {
            persist(customers);
            set({ customers });
          }
        },
        (error) => console.warn('Customer sync warning:', error)
      );

      const unsubRepayments = onSnapshot(
        collection(db, 'customer_repayments'),
        (snapshot) => {
          const repayments = snapshot.docs.map((doc) => doc.data() as CustomerRepayment);
          if (repayments.length > 0) {
            persistRepayments(repayments);
            set({ repayments });
          }
        },
        (error) => console.warn('Repayment sync warning:', error)
      );

      set({ initialized: true });

      return () => {
        unsubCustomers();
        unsubRepayments();
      };
    } catch (err) {
      console.warn('Firebase listener error:', err);
      return () => {};
    }
  },

  addCustomer: (data) => {
    const customer: Customer = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cust_${Date.now()}`,
      name: data.name.trim(),
      phone: data.phone.trim(),
      currentDue: 0,
      totalSpend: 0,
      visits: 0,
    };

    const customers = [...get().customers, customer];
    persist(customers);
    set({ customers });

    const db = getDb();
    if (db) {
      setDoc(doc(db, 'customers', customer.id), customer).catch(() => {});
    }

    return customer;
  },

  updateCustomer: (id, updates) => {
    const { currentDue: _ignoredDue, id: _ignoredId, ...safeUpdates } = updates as Partial<Customer>;
    const customers = get().customers.map((c) => (c.id === id ? { ...c, ...safeUpdates } : c));
    persist(customers);
    set({ customers });

    const db = getDb();
    if (db) {
      updateDoc(doc(db, 'customers', id), safeUpdates).catch(() => {});
    }
  },

  addToCustomerDue: (id, amount) => {
    const target = get().customers.find((c) => c.id === id);
    const newDue = target ? Math.round((target.currentDue + amount) * 100) / 100 : amount;
    const newSpend = target ? Math.round((target.totalSpend + amount) * 100) / 100 : amount;
    const newVisits = target ? target.visits + 1 : 1;

    const customers = get().customers.map((c) =>
      c.id === id ? { ...c, currentDue: newDue, totalSpend: newSpend, visits: newVisits } : c
    );
    persist(customers);
    set({ customers });

    const db = getDb();
    if (db) {
      updateDoc(doc(db, 'customers', id), {
        currentDue: newDue,
        totalSpend: newSpend,
        visits: newVisits,
      }).catch(() => {});
    }
  },

  receiveRepayment: ({ customerId, amount, method, notes, receivedBy }) => {
    const customer = get().customers.find((entry) => entry.id === customerId);
    const normalizedAmount = Math.round(Number(amount) * 100) / 100;

    if (!customer) return { ok: false, error: 'Customer was not found.' };
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return { ok: false, error: 'Enter a valid repayment amount.' };
    }
    if (normalizedAmount > customer.currentDue) {
      return { ok: false, error: `Amount cannot exceed current due of Rs. ${customer.currentDue}.` };
    }

    const repayment: CustomerRepayment = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `pay_${Date.now()}`,
      customerId,
      amount: normalizedAmount,
      method,
      notes: notes?.trim() || undefined,
      createdAt: Date.now(),
      receivedBy,
    };

    const newDue = Math.max(0, Math.round((customer.currentDue - normalizedAmount) * 100) / 100);
    const customers = get().customers.map((entry) =>
      entry.id === customerId ? { ...entry, currentDue: newDue } : entry
    );
    const repayments = [...get().repayments, repayment];

    persist(customers);
    persistRepayments(repayments);
    set({ customers, repayments });

    const db = getDb();
    if (db) {
      setDoc(doc(db, 'customer_repayments', repayment.id), repayment).catch(() => {});
      updateDoc(doc(db, 'customers', customerId), { currentDue: newDue }).catch(() => {});
    }

    return { ok: true, repayment };
  },

  getCustomer: (id) => get().customers.find((c) => c.id === id),
}));