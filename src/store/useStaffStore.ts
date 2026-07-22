import { create } from 'zustand';
import { StaffUser } from '@/types/staff';

const STAFF_KEY        = 'pos_staff_users';
const SESSION_KEY      = 'pos_current_user_id';
const SESSION_USER_KEY = 'pos_current_user';   // full object — survives HMR & refresh

const DEFAULT_USERS: StaffUser[] = [
  { id: 'staff-admin',   name: 'Admin Owner',   role: 'ADMIN',   pin: '1234', active: true },
  { id: 'staff-cashier', name: 'Cashier Desk',  role: 'CASHIER', pin: '2222', active: true },
  { id: 'staff-waiter',  name: 'Waiter Staff',  role: 'WAITER',  pin: '3333', active: true },
];

function loadUsers(): StaffUser[] {
  try {
    const d = localStorage.getItem(STAFF_KEY);
    const parsed: StaffUser[] = d ? JSON.parse(d) : DEFAULT_USERS;
    if (!parsed.length) return DEFAULT_USERS;
    return parsed;
  } catch { return DEFAULT_USERS; }
}

function saveUsers(users: StaffUser[]) {
  localStorage.setItem(STAFF_KEY, JSON.stringify(users));
}

/** Rehydrate the logged-in user. Validates against the live users list so a
 *  deleted/deactivated account is never returned. */
function loadCurrentUser(users: StaffUser[]): StaffUser | null {
  try {
    // Prefer the full serialised object (written on every login)
    const raw = localStorage.getItem(SESSION_USER_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as StaffUser;
      const live = users.find((u) => u.id === cached.id && u.active);
      if (live) return live;       // return live data (may have been updated)
    }
    // Fallback: ID-only key written by older builds
    const id = localStorage.getItem(SESSION_KEY);
    if (id) return users.find((u) => u.id === id && u.active) ?? null;
  } catch { /* ignore */ }
  return null;
}

function saveCurrentUser(user: StaffUser | null) {
  if (user) {
    localStorage.setItem(SESSION_KEY, user.id);
    localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_USER_KEY);
  }
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
  const currentUser = loadCurrentUser(users);

  return {
    users,
    currentUser,

    login: (userId, pin) => {
      const user = get().users.find((u) => u.id === userId && u.active);
      if (!user || user.pin !== pin) return false;
      saveCurrentUser(user);
      set({ currentUser: user });
      return true;
    },

    logout: () => {
      saveCurrentUser(null);
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
      const nextCu = cu?.id === id ? { ...cu, ...updates } as StaffUser : cu;
      // Keep session storage in sync if the logged-in user was edited
      if (nextCu && nextCu.id === id) saveCurrentUser(nextCu);
      set({ users, currentUser: nextCu });
    },

    deleteUser: (id) => {
      const users = get().users.filter((u) => u.id !== id);
      saveUsers(users);
      const wasLoggedIn = get().currentUser?.id === id;
      if (wasLoggedIn) saveCurrentUser(null);
      set({ users, currentUser: wasLoggedIn ? null : get().currentUser });
    },
  };
});
