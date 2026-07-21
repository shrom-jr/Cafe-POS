import { useState } from 'react';
import { useStaffStore } from '@/store/useStaffStore';
import { StaffUser, Role } from '@/types/staff';
import { Plus, Trash2, Edit3, X, Save, Eye, EyeOff, KeyRound, Users } from 'lucide-react';
import { toast } from 'sonner';

const ROLES: Role[] = ['WAITER', 'CASHIER', 'ADMIN'];

const ROLE_COLORS: Record<Role, { bg: string; border: string; text: string }> = {
  ADMIN:   { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.3)', text: '#c084fc' },
  CASHIER: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)', text: '#60a5fa' },
  WAITER:  { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)', text: '#34d399' },
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin', CASHIER: 'Cashier', WAITER: 'Waiter',
};

const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 h-11 transition-colors';
const MODAL_BG = { background: 'linear-gradient(160deg, #0f1929 0%, #0b1220 100%)', border: '1px solid rgba(59,130,246,0.22)', boxShadow: '0 24px 64px -8px rgba(0,0,0,0.85)' };

// ── Add / Edit Modal ─────────────────────────────────────────────────────────
const StaffModal = ({
  existing,
  onClose,
}: {
  existing: StaffUser | null; // null = create new
  onClose: () => void;
}) => {
  const { addUser, updateUser } = useStaffStore();
  const [name, setName]       = useState(existing?.name ?? '');
  const [role, setRole]       = useState<Role>(existing?.role ?? 'WAITER');
  const [pin, setPin]         = useState(existing?.pin ?? '');
  const [showPin, setShowPin] = useState(false);
  const [active, setActive]   = useState(existing?.active ?? true);

  const isEdit = !!existing;

  const handleSave = () => {
    if (!name.trim())       return toast.error('Name is required');
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) return toast.error('PIN must be exactly 4 digits');

    if (isEdit) {
      updateUser(existing.id, { name: name.trim(), role, pin, active });
      toast.success('Staff member updated');
    } else {
      addUser({ name: name.trim(), role, pin, active: true });
      toast.success('Staff member added');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl p-6 space-y-5" style={MODAL_BG}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white/90">{isEdit ? 'Edit Staff' : 'Add Staff'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white/70 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3.5">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Full Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sita Thapa" className={inputCls} />
          </div>

          {/* Role */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Role</label>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map((r) => {
                const c = ROLE_COLORS[r];
                const active = role === r;
                return (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className="py-2 rounded-xl text-xs font-bold transition-all active:scale-95"
                    style={active
                      ? { background: c.bg, border: `1px solid ${c.border}`, color: c.text }
                      : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }
                    }
                  >
                    {ROLE_LABEL[r]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* PIN */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">4-Digit PIN</label>
            <div className="relative">
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                placeholder="••••"
                maxLength={4}
                className={`${inputCls} pr-10 tracking-[0.4em] text-center`}
              />
              <button
                onClick={() => setShowPin((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
              >
                {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Active toggle (edit only) */}
          {isEdit && (
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-secondary/50 border border-white/[0.06]">
              <p className="text-sm font-medium text-foreground">Active</p>
              <button
                onClick={() => setActive((v) => !v)}
                className={`w-10 h-6 rounded-full transition-all relative ${active ? 'bg-accent' : 'bg-white/15'}`}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                  style={{ left: active ? '18px' : '2px' }}
                />
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-2.5 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/50 transition-all active:scale-[0.97]"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
            style={{ background: 'linear-gradient(135deg, #1e50d0 0%, #4186f5 100%)', boxShadow: '0 4px 16px -4px rgba(59,130,246,0.55)' }}
          >
            <Save size={14} /> {isEdit ? 'Save Changes' : 'Add Staff'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Reset PIN Modal ──────────────────────────────────────────────────────────
const ResetPinModal = ({
  user,
  onClose,
}: {
  user: StaffUser;
  onClose: () => void;
}) => {
  const { updateUser } = useStaffStore();
  const [pin, setPin]         = useState('');
  const [showPin, setShowPin] = useState(false);

  const handleReset = () => {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) return toast.error('PIN must be exactly 4 digits');
    updateUser(user.id, { pin });
    toast.success(`PIN reset for ${user.name}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xs rounded-2xl p-6 space-y-5" style={MODAL_BG}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-white/90">Reset PIN</h3>
            <p className="text-xs text-white/40 mt-0.5">{user.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white/70">
            <X size={16} />
          </button>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">New 4-Digit PIN</label>
          <div className="relative">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              placeholder="••••"
              maxLength={4}
              className={`${inputCls} pr-10 tracking-[0.4em] text-center`}
              autoFocus
            />
            <button
              onClick={() => setShowPin((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
            >
              {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div className="flex gap-2.5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/50" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            Cancel
          </button>
          <button onClick={handleReset} className="flex-1 py-2.5 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #1e50d0 0%, #4186f5 100%)', boxShadow: '0 4px 16px -4px rgba(59,130,246,0.55)' }}>
            <KeyRound size={14} /> Reset PIN
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Delete Confirm ───────────────────────────────────────────────────────────
const DeleteConfirm = ({
  user,
  onClose,
}: {
  user: StaffUser;
  onClose: () => void;
}) => {
  const { deleteUser } = useStaffStore();

  const handleDelete = () => {
    deleteUser(user.id);
    toast.success(`${user.name} removed`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xs rounded-2xl p-6 space-y-5" style={MODAL_BG}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <Trash2 size={20} className="text-red-400" />
          </div>
          <h3 className="font-bold text-white/90">Remove Staff Member?</h3>
          <p className="text-sm text-white/50 mt-1.5">
            <span className="text-white/70 font-semibold">{user.name}</span> will be permanently removed.
          </p>
        </div>
        <div className="flex gap-2.5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/50" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            Cancel
          </button>
          <button onClick={handleDelete} className="flex-1 py-2.5 rounded-xl text-sm font-black text-red-300 flex items-center justify-center gap-1.5" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.28)' }}>
            <Trash2 size={13} /> Remove
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Staff Row ────────────────────────────────────────────────────────────────
const StaffRow = ({ user }: { user: StaffUser }) => {
  const [modal, setModal] = useState<'edit' | 'reset' | 'delete' | null>(null);
  const colors = ROLE_COLORS[user.role];

  return (
    <>
      <div
        className="flex items-center gap-4 p-4 rounded-2xl transition-all"
        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {/* Avatar */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-base font-black text-white/85 flex-shrink-0"
          style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm text-white/90 truncate">{user.name}</p>
            {!user.active && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/[0.07] text-white/30 border border-white/[0.07] flex-shrink-0">
                Inactive
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
            >
              {ROLE_LABEL[user.role]}
            </span>
            <span className="text-xs text-white/25 font-mono tracking-[0.3em]">{'•'.repeat(4)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setModal('reset')}
            title="Reset PIN"
            className="p-2 rounded-lg text-white/35 hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
          >
            <KeyRound size={14} />
          </button>
          <button
            onClick={() => setModal('edit')}
            title="Edit"
            className="p-2 rounded-lg text-white/35 hover:text-white/70 hover:bg-white/08 transition-colors"
          >
            <Edit3 size={14} />
          </button>
          <button
            onClick={() => setModal('delete')}
            title="Remove"
            className="p-2 rounded-lg text-white/35 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {modal === 'edit'   && <StaffModal    existing={user} onClose={() => setModal(null)} />}
      {modal === 'reset'  && <ResetPinModal user={user}     onClose={() => setModal(null)} />}
      {modal === 'delete' && <DeleteConfirm user={user}     onClose={() => setModal(null)} />}
    </>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────
const StaffManagement = () => {
  const { users } = useStaffStore();
  const [showAdd, setShowAdd] = useState(false);

  const byRole: Record<Role, StaffUser[]> = { ADMIN: [], CASHIER: [], WAITER: [] };
  users.forEach((u) => byRole[u.role].push(u));

  return (
    <div className="space-y-5">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        {ROLES.map((r) => {
          const c = ROLE_COLORS[r];
          const count = byRole[r].filter((u) => u.active).length;
          return (
            <div
              key={r}
              className="rounded-2xl p-4 text-center"
              style={{ background: c.bg, border: `1px solid ${c.border}` }}
            >
              <p className="text-2xl font-black" style={{ color: c.text }}>{count}</p>
              <p className="text-xs font-semibold mt-0.5" style={{ color: c.text, opacity: 0.7 }}>{ROLE_LABEL[r]}</p>
            </div>
          );
        })}
      </div>

      {/* List header + add button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white/50">
          <Users size={15} />
          <span className="text-sm font-semibold">{users.length} Staff Account{users.length !== 1 ? 's' : ''}</span>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all active:scale-95 hover:brightness-110"
          style={{ background: 'linear-gradient(135deg, #1e50d0 0%, #4186f5 100%)', boxShadow: '0 4px 16px -4px rgba(59,130,246,0.5)' }}
        >
          <Plus size={14} /> Add Staff
        </button>
      </div>

      {/* Staff rows */}
      <div className="space-y-2.5">
        {users.length === 0 ? (
          <div className="text-center py-16 text-white/25">
            <p className="text-sm font-semibold">No staff accounts yet.</p>
          </div>
        ) : (
          users.map((u) => <StaffRow key={u.id} user={u} />)
        )}
      </div>

      {/* Add modal */}
      {showAdd && <StaffModal existing={null} onClose={() => setShowAdd(false)} />}
    </div>
  );
};

export default StaffManagement;
