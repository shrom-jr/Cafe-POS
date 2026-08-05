import { create } from 'zustand';
import type { MaintenanceExpense } from '@/types/pos';

interface MaintenanceStore {
  expenses: MaintenanceExpense[];
  setExpenses:    (expenses: MaintenanceExpense[]) => void;
  addExpense:     (expense: MaintenanceExpense) => void;
  updateExpense:  (id: string, patch: Partial<Omit<MaintenanceExpense, 'id'>>) => void;
  deleteExpense:  (id: string) => void;
}

export const useMaintenanceStore = create<MaintenanceStore>((set, get) => ({
  expenses: [],

  setExpenses: (expenses) => set({ expenses }),

  addExpense: (expense) => set({ expenses: [expense, ...get().expenses] }),

  updateExpense: (id, patch) =>
    set({ expenses: get().expenses.map((e) => e.id === id ? { ...e, ...patch } : e) }),

  deleteExpense: (id) =>
    set({ expenses: get().expenses.filter((e) => e.id !== id) }),
}));
