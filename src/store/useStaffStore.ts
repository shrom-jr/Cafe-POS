import { create } from 'zustand';
import { StaffUser, DEFAULT_PERMISSIONS } from '@/types/staff';
import { hashPin, verifyPin } from '@/utils/cryptoPin';

const STAFF_KEY        = 'pos_staff_users';
const SESSION_KEY      = 'pos_current_user_id';
const SESSION_USER_KEY = 'pos_current_user';   // full object — survives HMR & refresh

/** Backfill `permissions` for accounts created before this field existed. */
function migrateUser(u: StaffUser): StaffUser {
  return {
    ...u,
    // Preserve explicit permissions while filling capabilities added in later releases.
    permissions: {
      ...(DEFAULT_PERMISSIONS[u.role] ?? DEFAULT_PERMISSIONS.WAITER),
      ...(u.permissions ?? {}),
    },
  };
}

function loadUsers(): StaffUser[] {
  try {
    const d = localStorage.getItem(STAFF_KEY);
    if (!d) return [];
    const parsed: StaffUser[] = JSON.parse(d);
    return Array.isArray(parsed) ? parsed.map(migrateUser) : [];
  } catch { return []; }
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
  setUsers: (users: StaffUser[]) => void;
  currentUser: StaffUser | null;

  /**
   * Attempts login. Returns true on success, false on wrong PIN.
   *
   * For migrated accounts the stored `pinHash`+`salt` are used.
   * For legacy accounts that still carry a plaintext `pin`, the comparison
   * falls back to direct equality **and** performs an inline migration so that
   * subsequent logins (including offline ones) use the hashed credential.
   */
  login: (userId: string, pin: string) => Promise<boolean>;
  logout: () => void;

  /**
   * Create a new staff account. The plaintext `pin` in `userData` is hashed
   * before being persisted; no plaintext ever reaches localStorage or Firebase.
   */
  addUser: (user: Omit<StaffUser, 'id'>) => Promise<void>;

  /**
   * Update an existing staff account.
   * If `updates` contains a plaintext `pin`, it is hashed before storage and
   * `mustChangePin` is cleared automatically.
   */
  updateUser: (id: string, updates: Partial<Omit<StaffUser, 'id'>>) => Promise<boolean>;

  deleteUser: (id: string) => boolean;
}

export const ONLY_ADMIN_PROTECTION_MESSAGE =
  'Cannot delete or deactivate the only Administrator account. Add another Admin first.';

export function isActiveAdmin(user: StaffUser): boolean {
  return user.active === true && user.role === 'ADMIN';
}

export function canRemoveOrDeactivateStaffUser(
  users: StaffUser[],
  targetId: string,
  currentUserId?: string,
): { allowed: boolean; reason?: string } {
  const target = users.find((user) => user.id === targetId);
  if (!target) return { allowed: false, reason: 'Staff account not found.' };
  if (targetId === currentUserId) {
    return { allowed: false, reason: 'You cannot delete or deactivate your own account.' };
  }

  if (isActiveAdmin(target)) {
    const activeAdminCount = users.filter(isActiveAdmin).length;
    if (activeAdminCount <= 1) {
      return { allowed: false, reason: ONLY_ADMIN_PROTECTION_MESSAGE };
    }
  }

  return { allowed: true };
}

export const useStaffStore = create<StaffState>((set, get) => {
  const users = loadUsers();
  const currentUser = loadCurrentUser(users);

  return {
    users,
    setUsers: (incoming) => {
      // Migrate any accounts that predate the permissions field
      const users = incoming.map(migrateUser);
      // Persist non-empty lists to localStorage so the login screen renders
      // immediately on the next page load (before the Firebase listener fires).
      // Never persist an empty array — that would wipe a valid cache if Firebase
      // is momentarily unreachable.
      if (users.length > 0) saveUsers(users);
      set({ users });
    },
    currentUser,

    login: async (userId, pin) => {
      const user = get().users.find((u) => u.id === userId && u.active);
      if (!user) return false;

      let valid = false;
      let userToSave = user;

      if (user.pinHash && user.salt) {
        // ── Hashed credential path (all migrated accounts) ────────────────
        valid = await verifyPin(pin, user.pinHash, user.salt);
      } else if (user.pin !== undefined) {
        // ── Legacy plaintext path (pre-migration accounts) ─────────────────
        valid = user.pin === pin;
        if (valid) {
          // Migrate locally so subsequent offline logins use the hash.
          // Firebase-side migration is handled separately by subscribeToStaff.
          const { hash, salt } = await hashPin(pin);
          const { pin: _removed, ...rest } = user;
          void _removed;
          userToSave = {
            ...rest,
            pinHash: hash,
            salt,
            pinLength: pin.length,
            mustChangePin: pin.length === 4,
          };
          const updatedUsers = get().users.map((u) =>
            u.id === userId ? userToSave : u,
          );
          saveUsers(updatedUsers);
          set({ users: updatedUsers });
        }
      }

      if (!valid) return false;
      saveCurrentUser(userToSave);
      set({ currentUser: userToSave });
      return true;
    },

    logout: () => {
      saveCurrentUser(null);
      set({ currentUser: null });
    },

    addUser: async (userData) => {
      // Hash the plaintext pin before any storage
      let base = { ...userData };
      if (base.pin) {
        const { hash, salt } = await hashPin(base.pin);
        const { pin: _removed, ...rest } = base;
        void _removed;
        base = { ...rest, pinHash: hash, salt, pinLength: 6 };
      }
      const user: StaffUser = { ...base, id: crypto.randomUUID() };
      const users = [...get().users, user];
      saveUsers(users);
      set({ users });
    },

    updateUser: async (id, updates) => {
      const existing = get().users.find((user) => user.id === id);
      if (!existing) return false;

      const nextUser = { ...existing, ...updates };
      const isDeactivating = existing.active && updates.active === false;
      const isRemovingAdminRole =
        isActiveAdmin(existing) && (nextUser.active !== true || nextUser.role !== 'ADMIN');
      if (isDeactivating || isRemovingAdminRole) {
        const guard = canRemoveOrDeactivateStaffUser(
          get().users,
          id,
          get().currentUser?.id,
        );
        if (!guard.allowed) return false;
      }

      let processed = { ...updates };
      if (processed.pin !== undefined) {
        // Hash the new PIN and clear the mustChangePin flag
        const { hash, salt } = await hashPin(processed.pin);
        const { pin: _removed, ...rest } = processed;
        void _removed;
        processed = {
          ...rest,
          pinHash: hash,
          salt,
          pinLength: 6,
          mustChangePin: false,
        };
      }
      const users = get().users.map((u) => (u.id === id ? { ...u, ...processed } : u));
      saveUsers(users);
      const cu = get().currentUser;
      const nextCu = cu?.id === id ? ({ ...cu, ...processed } as StaffUser) : cu;
      // Keep session storage in sync if the logged-in user was edited
      if (nextCu && nextCu.id === id) saveCurrentUser(nextCu);
      set({ users, currentUser: nextCu });
      return true;
    },

    deleteUser: (id) => {
      const guard = canRemoveOrDeactivateStaffUser(get().users, id, get().currentUser?.id);
      if (!guard.allowed) return false;

      const users = get().users.filter((u) => u.id !== id);
      saveUsers(users);
      const wasLoggedIn = get().currentUser?.id === id;
      if (wasLoggedIn) saveCurrentUser(null);
      set({ users, currentUser: wasLoggedIn ? null : get().currentUser });
      return true;
    },
  };
});
