/**
 * Shared store for the Kitchen Portal's Meat Tracker.
 *
 * Both KitchenPortal.tsx (operational logging) and
 * MeatPrepLogsTab.tsx (admin audit view) subscribe to this store.
 * All writes persist to localStorage under 'kitchen_meat_tracker'.
 */

import { create } from 'zustand';
import { isTrainingSandboxActive } from '@/utils/trainingSandbox';

// ── Types ─────────────────────────────────────────────────────────────────────

export type MeatAction = 'Marinated' | 'Minced (Keema)' | 'Sent to Grill';

export interface MeatEntry {
  id: string;
  date: string;        // yyyy-MM-dd
  time: string;        // HH:mm
  meatItem: string;
  action: MeatAction;
  quantity: string;    // formatted: "5 kg"
  loggedBy?: string;   // optional; shows "Kitchen" when absent
}

// ── Persistence ───────────────────────────────────────────────────────────────

export const MEAT_TRACKER_KEY = 'kitchen_meat_tracker';

const load = (): MeatEntry[] => {
  try { return JSON.parse(localStorage.getItem(MEAT_TRACKER_KEY) || '[]'); }
  catch { return []; }
};

const persist = (data: MeatEntry[]) => {
  if (isTrainingSandboxActive()) return;
  localStorage.setItem(MEAT_TRACKER_KEY, JSON.stringify(data));
};

// ── Store ─────────────────────────────────────────────────────────────────────

interface MeatTrackerStore {
  meatEntries: MeatEntry[];
  setMeatEntries:  (entries: MeatEntry[]) => void;
  addMeatEntry:    (entry: MeatEntry) => void;
  deleteMeatEntry: (id: string) => void;
}

export const useMeatTrackerStore = create<MeatTrackerStore>((set, get) => ({
  meatEntries: load(),

  setMeatEntries: (entries) => {
    persist(entries);
    set({ meatEntries: entries });
  },

  addMeatEntry: (entry) => {
    const updated = [entry, ...get().meatEntries];
    persist(updated);
    set({ meatEntries: updated });
  },

  deleteMeatEntry: (id) => {
    const updated = get().meatEntries.filter((e) => e.id !== id);
    persist(updated);
    set({ meatEntries: updated });
  },
}));
