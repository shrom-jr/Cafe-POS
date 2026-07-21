import { create } from 'zustand';
import { StaffUser } from '@/types/staff';

const STAFF_KEY   = 'pos_staff_users';
const SESSION_KEY = 'pos_current_user_id';

const DEFAULT_USERS: StaffUser[] = [
  { id: 'staff-admin',   name: 'Admin Owner',   role: 'ADMIN',   pin: '1234', active: true },
  { id: 'staff-cashier', name: 'Cashier Desk',  role: 'CASHIER', pin: '2222', active: true },
  { id: 'staff-waiter',  name: 'Waiter Staff',  role: 'WAITER',  pin: '3333', active: true },
];

function loadUsers(): StaffUser[] {
  try {
    const d = localStorage.getItem(STAFF_KEY);
    const parsed: StaffUser[] = d ? JSON.parse(d) : DEFAULT_USERS;
    // Ensure default users are always present (never wiped)
    if (!parsed.length) return DEFAULT_USERS;
    return parsed;
  } catch { return DEFAULT_USERS; }
}

function saveUsers(users: StaffUser[]) {
  localStorage.setItem(STAFF_KEY, JSON.stringify(users));
}

function loadCurrentUserId(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

function saveCurrentUserId(id: string | null) {
  if (id) localStorage.setItem(SESSION_KEY, id);
  else localStorage.removeItem(SESSION_KEY);
}

interface StaffState {
  users: StaffUser[];
  currentUser: StaffUser | null;

  /** Attempts login; returns true on success, false on wrong PIN. */
  login: (userId: string, pin: string) => boolean;
  logout: () => void;

  addUser: (user: Omit<StaffUser, 'id'>) => void;
  updateUser: (id: string, updates: Partial<Omit<StaffUser, 'id'>>) => void;
  deleteUser: (id: string) => void;
}

export const useStaffStore = create<StaffState>((set, get) => {
  const users = loadUsers();
  const currentUserId = loadCurrentUserId();
  const currentUser = currentUserId
    ? (users.find((u) => u.id === currentUserId && u.active) ?? null)
    : null;

  return {
    users,
    currentUser,

    login: (userId, pin) => {
      const user = get().users.find((u) => u.id === userId && u.active);
      if (!user || user.pin !== pin) return false;
      saveCurrentUserId(userId);
      set({ currentUser: user });
      return true;
    },

    logout: () => {
      saveCurrentUserId(null);
      set({ currentUser: null });
    },

    addUser: (userData) => {
      const user: StaffUser = { ...userData, id: crypto.randomUUID() };
      const users = [...get().users, user];
      saveUsers(users);
      set({ users });
    },

    updateUser: (id, updates) => {
      const users = get().users.map((u) => (u.id === id ? { ...u, ...updates } : u));
      saveUsers(users);
      const cu = get().currentUser;
      set({ users, currentUser: cu?.id === id ? { ...cu, ...updates } as StaffUser : cu });
    },

    deleteUser: (id) => {
      const users = get().users.filter((u) => u.id !== id);
      saveUsers(users);
      set({ users });
    },
  };
});
