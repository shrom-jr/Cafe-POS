/**
 * Shared store for Kitchen Portal purchases / Daily Expenses.
 *
 * Both the Kitchen Portal (KitchenPortal.tsx) and the Admin Inventory's
 * Kitchen Groceries tab (KitchenGroceriesTab.tsx) read from and write to
 * this store, which persists to localStorage under 'kitchen_purchases'.
 *
 * Any write in either screen is immediately visible in the other because
 * both components subscribe to the same Zustand state.
 */

import { create } from 'zustand';
import { isTrainingSandboxActive } from '@/utils/trainingSandbox';

// ── Shared types ──────────────────────────────────────────────────────────────

export type PurchaseCategory = 'Meats' | 'Groceries & Supplies' | 'Custom';

export interface PurchaseEntry {
  id: string;
  date: string;              // yyyy-MM-dd
  time: string;              // HH:mm
  itemName: string;
  category: PurchaseCategory;
  quantity: string;          // formatted: "5 kg", "2 L"
  rate: number;
  totalCost: number;
}

// ── LocalStorage persistence ──────────────────────────────────────────────────

export const KITCHEN_PURCHASES_KEY = 'kitchen_purchases';

const load = (): PurchaseEntry[] => {
  try { return JSON.parse(localStorage.getItem(KITCHEN_PURCHASES_KEY) || '[]'); }
  catch { return []; }
};

const persist = (data: PurchaseEntry[]) => {
  if (isTrainingSandboxActive()) return;
  localStorage.setItem(KITCHEN_PURCHASES_KEY, JSON.stringify(data));
};

// ── Store ─────────────────────────────────────────────────────────────────────

interface KitchenPurchasesStore {
  purchases: PurchaseEntry[];
  setPurchases:   (entries: PurchaseEntry[]) => void;
  addPurchase:    (entry: PurchaseEntry) => void;
  deletePurchase: (id: string) => void;
  updatePurchase: (id: string, patch: Partial<Omit<PurchaseEntry, 'id'>>) => void;
}

export const useKitchenPurchasesStore = create<KitchenPurchasesStore>((set, get) => ({
  purchases: load(),

  setPurchases: (entries) => {
    persist(entries);
    set({ purchases: entries });
  },

  addPurchase: (entry) => {
    const updated = [entry, ...get().purchases];
    persist(updated);
    set({ purchases: updated });
  },

  deletePurchase: (id) => {
    const updated = get().purchases.filter((p) => p.id !== id);
    persist(updated);
    set({ purchases: updated });
  },

  updatePurchase: (id, patch) => {
    const updated = get().purchases.map((p) => p.id === id ? { ...p, ...patch } : p);
    persist(updated);
    set({ purchases: updated });
  },
}));
