import { beforeEach, describe, expect, it } from 'vitest';
import {
  canRemoveOrDeactivateStaffUser,
  useStaffStore,
} from '@/store/useStaffStore';
import { DEFAULT_PERMISSIONS } from '@/types/staff';
import type { StaffUser } from '@/types/staff';

const makeUser = (id: string, role: StaffUser['role'], active = true): StaffUser => ({
  id,
  name: id,
  email: `${id}@example.com`,
  role,
  active,
  pin: '2468',
  permissions: { ...DEFAULT_PERMISSIONS[role] },
});

describe('Staff admin account protection', () => {
  beforeEach(() => {
    localStorage.clear();
    useStaffStore.setState({
      users: [makeUser('admin-1', 'ADMIN')],
      currentUser: null,
    });
  });

  it('rejects deleting the sole active Admin', () => {
    expect(useStaffStore.getState().deleteUser('admin-1')).toBe(false);
    expect(useStaffStore.getState().users.map((user) => user.id)).toEqual(['admin-1']);
  });

  it('allows deleting the other Admin after a second Admin is added', async () => {
    useStaffStore.setState({
      users: [makeUser('admin-1', 'ADMIN'), makeUser('admin-2', 'ADMIN')],
    });

    expect(useStaffStore.getState().deleteUser('admin-2')).toBe(true);
    expect(useStaffStore.getState().users.map((user) => user.id)).toEqual(['admin-1']);
  });

  it('rejects a logged-in Admin from deleting or deactivating themselves', async () => {
    useStaffStore.setState({
      users: [makeUser('admin-1', 'ADMIN'), makeUser('admin-2', 'ADMIN')],
      currentUser: makeUser('admin-1', 'ADMIN'),
    });

    expect(canRemoveOrDeactivateStaffUser(
      useStaffStore.getState().users,
      'admin-1',
      'admin-1',
    ).allowed).toBe(false);
    expect(useStaffStore.getState().deleteUser('admin-1')).toBe(false);
    await expect(useStaffStore.getState().updateUser('admin-1', { active: false })).resolves.toBe(false);
    expect(useStaffStore.getState().users.find((user) => user.id === 'admin-1')?.active).toBe(true);
  });
});