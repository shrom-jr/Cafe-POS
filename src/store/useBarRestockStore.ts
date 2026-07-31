/**
 * Bar Restock Store
 *
 * Records bar restock / spill-loss entries for the Bar Portal.
 * Each entry also carries the signed base-unit change that was applied to
 * inventory so that deleting an entry can precisely reverse the stock effect.
 */

import { create } from 'zustand';
import { InvProductType } from '@/types/pos';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BarEntryType = 'Restock' | 'Spill/Loss';

export interface BarRestockEntry {
  id: string;
  date: string;            // yyyy-MM-dd
  timestamp: number;
  productType: InvProductType;
  productId: string;
  productName: string;
  entryType: BarEntryType;
  qty: number;             // user-entered quantity in qtyUnit
  qtyUnit: string;         // 'bottles' | 'pcs' | 'packets'
  baseUnitChange: number;  // signed change actually applied (ml / pcs / sticks)
  totalCost: number;       // NPR cost (0 for Spill/Loss)
  supplier: string;        // blank if not provided
  loggedBy: string;        // staff member name
}

// ── Persistence ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'bar_restock_entries';

const load = (): BarRestockEntry[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
};

const persist = (data: BarRestockEntry[]) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

// ── Store ─────────────────────────────────────────────────────────────────────

interface BarRestockStoreState {
  entries: BarRestockEntry[];
  addEntry:    (entry: BarRestockEntry) => void;
  updateEntry: (id: string, patch: Partial<Omit<BarRestockEntry, 'id'>>) => void;
  deleteEntry: (id: string) => void;
}

export const useBarRestockStore = create<BarRestockStoreState>((set, get) => ({
  entries: load(),

  addEntry: (entry) => {
    const updated = [entry, ...get().entries];
    persist(updated);
    set({ entries: updated });
  },

  updateEntry: (id, patch) => {
    const updated = get().entries.map((e) => e.id === id ? { ...e, ...patch } : e);
    persist(updated);
    set({ entries: updated });
  },

  deleteEntry: (id) => {
    const updated = get().entries.filter((e) => e.id !== id);
    persist(updated);
    set({ entries: updated });
  },
}));
