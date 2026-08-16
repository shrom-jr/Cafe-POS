import { useState } from 'react';
import { useStaffStore } from '@/store/useStaffStore';
import { StaffUser, Role, StaffPermissions, DEFAULT_PERMISSIONS } from '@/types/staff';
import { Plus, Trash2, Edit3, X, Save, Eye, EyeOff, KeyRound, Users } from 'lucide-react';
import { toast } from 'sonner';

const ROLES: Role[] = ['WAITER', 'CASHIER', 'ADMIN', 'KITCHEN'];

const ROLE_COLORS: Record<Role, { bg: string; border: string; text: string }> = {
  ADMIN:   { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.3)', text: '#c084fc' },
  CASHIER: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)', text: '#60a5fa' },
  WAITER:  { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)', text: '#34d399' },
  KITCHEN: { bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.3)',  text: '#fb923c' },
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin', CASHIER: 'Cashier', WAITER: 'Waiter', KITCHEN: 'Kitchen',
};

// Permission display config
type PermKey = keyof StaffPermissions;
const PERM_CONFIG: { key: PermKey; label: string; badge: string; color: string; border: string }[] = [
  { key: 'pos',     label: 'POS & Tables',    badge: 'POS',     color: 'rgba(59,130,246,0.18)',  border: 'rgba(59,130,246,0.35)'  },
  { key: 'kitchen', label: 'Kitchen Portal',  badge: 'Kitchen', color: 'rgba(249,115,22,0.18)',  border: 'rgba(249,115,22,0.35)'  },
  { key: 'bar',     label: 'Bar Portal',      badge: 'Bar',     color: 'rgba(16,185,129,0.18)',  border: 'rgba(16,185,129,0.35)'  },
  { key: 'admin',   label: 'Admin Panel',     badge: 'Admin',   color: 'rgba(168,85,247,0.18)', border: 'rgba(168,85,247,0.35)' },
];
const PERM_TEXT: Record<PermKey, string> = {
  pos: '#60a5fa', kitchen: '#fb923c', bar: '#34d399', admin: '#c084fc',
};

const inputCls = 'w-full bg-[#181B26] border-2 border-white/20 focus:border-amber-400 text-white font-bold rounded-xl px-4 py-3.5 text-sm placeholder:text-zinc-500 outline-none transition-all shadow-inner';
const MODAL_BG = { background: '#0E1017', border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 24px 64px -8px rgba(0,0,0,0.85)' };

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
  const [email, setEmail]     = useState(existing?.email ?? '');
  const [role, setRole]       = useState<Role>(existing?.role ?? 'WAITER');
  const [pin, setPin]         = useState(existing?.pin ?? '');
  const [showPin, setShowPin] = useState(false);
  const [active, setActive]   = useState(existing?.active ?? true);
  const [perms, setPerms]     = useState<StaffPermissions>(
    existing?.permissions ?? DEFAULT_PERMISSIONS['WAITER']
  );

  const isEdit = !!existing;

  /** Selecting a role preset snaps permissions to defaults for that role. */
  const handleRoleSelect = (r: Role) => {
    setRole(r);
    setPerms(DEFAULT_PERMISSIONS[r]);
  };

  const togglePerm = (key: PermKey) =>
    setPerms((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSave = () => {
    if (!name.trim()) return toast.error('Name is required');
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return toast.error('Email is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return toast.error('Enter a valid email address');
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) return toast.error('PIN must be exactly 4 digits');

    if (isEdit) {
      updateUser(existing.id, { name: name.trim(), email: trimmedEmail, role, pin, active, permissions: perms });
      toast.success('Staff member updated');
    } else {
      addUser({ name: name.trim(), email: trimmedEmail, role, pin, active: true, permissions: perms });
      toast.success('Staff member added');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="max-w-md w-full p-7 rounded-[28px] bg-[#0E1017] border border-white/20 shadow-2xl shadow-black text-white relative flex flex-col gap-4">
        <div className="flex items-center justify-between">
           <h3 className="text-lg font-black text-white tracking-tight">{isEdit ? 'Edit Staff' : 'Add Staff'}</h3>
           <button onClick={onClose} className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3.5">
          {/* Name */}
          <div>
             <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1.5 block">Full Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sita Thapa" className={inputCls} />
          </div>

          {/* Email */}
          <div>
             <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1.5 block">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="e.g. sita@example.com"
              className={inputCls}
              autoComplete="off"
            />
          </div>

          {/* Role — quick presets */}
          <div>
             <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1.5 block">
              Role <span className="text-white/25 font-normal">(sets default permissions)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => {
                const c = ROLE_COLORS[r];
                const isActive = role === r;
                return (
                  <button
                    key={r}
                    onClick={() => handleRoleSelect(r)}
                    className="py-2 rounded-xl text-xs font-bold transition-all active:scale-95"
                    style={isActive
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

          {/* Feature Permissions */}
          <div>
             <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1.5 block">
              Feature Permissions <span className="text-white/25 font-normal">(override individually)</span>
            </label>
            <div className="space-y-2">
              {PERM_CONFIG.map(({ key, label, color, border }) => {
                const checked = perms[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => togglePerm(key)}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all active:scale-[0.98]"
                    style={checked
                      ? { background: color, border: `1px solid ${border}` }
                      : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }
                    }
                  >
                    {/* Checkbox indicator */}
                    <span
                      className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
                      style={checked
                        ? { background: border, border: `1px solid ${border}` }
                        : { background: 'transparent', border: '1px solid rgba(255,255,255,0.18)' }
                      }
                    >
                      {checked && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: checked ? PERM_TEXT[key] : 'rgba(255,255,255,0.4)' }}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PIN */}
          <div>
             <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1.5 block">4-Digit PIN</label>
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
             <div className="flex items-center justify-between p-4 rounded-2xl bg-[#181B26] border border-white/15">
               <p className="text-sm font-black text-white">Active</p>
              <button
                onClick={() => setActive((v) => !v)}
                 className={`w-10 h-6 rounded-full transition-all relative border-2 ${active ? 'bg-amber-500 border-amber-400 shadow-md shadow-amber-500/30' : 'bg-white/10 border-white/20'}`}
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
             className="flex-1 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-black text-xs uppercase tracking-wider transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
             className="flex-1 w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2"
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
      <div className="max-w-md w-full p-7 rounded-[28px] bg-[#0E1017] border border-white/20 shadow-2xl shadow-black text-white relative flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
             <h3 className="text-lg font-black text-white tracking-tight">Reset PIN</h3>
             <p className="text-xs font-bold text-zinc-300 mt-0.5">{user.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white/70">
            <X size={16} />
          </button>
        </div>

        <div>
           <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1.5 block">New 4-Digit PIN</label>
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
           <button onClick={onClose} className="flex-1 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-black text-xs uppercase tracking-wider transition-all">
            Cancel
          </button>
           <button onClick={handleReset} className="flex-1 w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2">
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
      <div className="max-w-md w-full p-7 rounded-[28px] bg-[#0E1017] border border-white/20 shadow-2xl shadow-black text-white relative flex flex-col gap-4">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <Trash2 size={20} className="text-red-400" />
          </div>
           <h3 className="text-lg font-black text-white tracking-tight">Remove Staff Member?</h3>
           <p className="text-sm font-bold text-zinc-300 mt-1.5">
            <span className="text-white/70 font-semibold">{user.name}</span> will be permanently removed.
          </p>
        </div>
        <div className="flex gap-2.5">
           <button onClick={onClose} className="flex-1 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-black text-xs uppercase tracking-wider transition-all">
            Cancel
          </button>
           <button onClick={handleDelete} className="flex-1 py-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5">
            <Trash2 size={13} /> Remove
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Permission Badges ─────────────────────────────────────────────────────────
const PermissionBadges = ({ user }: { user: StaffUser }) => {
  const perms = user.permissions ?? DEFAULT_PERMISSIONS[user.role];
  const active = PERM_CONFIG.filter((p) => perms[p.key]);
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {active.map(({ key, badge, color, border }) => (
        <span
          key={key}
           className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/10 border border-white/15 text-[10px] font-black uppercase text-zinc-200 leading-tight"
          style={{ background: color, border: `1px solid ${border}`, color: PERM_TEXT[key] }}
        >
          {badge}
        </span>
      ))}
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
         className="bg-[#13151F] border border-white/15 p-5 rounded-2xl flex items-center justify-between mb-3 shadow-md transition-all hover:bg-white/[0.04]"
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
             <p className="text-base font-black text-white tracking-wide truncate">{user.name}</p>
            {!user.active && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/[0.07] text-white/30 border border-white/[0.07] flex-shrink-0">
                Inactive
              </span>
            )}
          </div>
          {user.email && (
             <p className="text-xs font-bold text-zinc-300 font-mono ml-2 truncate mt-0.5">{user.email}</p>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <span
               className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border"
              style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
            >
              {ROLE_LABEL[user.role]}
            </span>
            <span className="text-xs text-white/25 font-mono tracking-[0.3em]">{'•'.repeat(4)}</span>
          </div>
          <PermissionBadges user={user} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setModal('reset')}
            title="Reset PIN"
             className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 transition-all"
          >
            <KeyRound size={14} />
          </button>
          <button
            onClick={() => setModal('edit')}
            title="Edit"
             className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 transition-all"
          >
            <Edit3 size={14} />
          </button>
          <button
            onClick={() => setModal('delete')}
            title="Remove"
             className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 transition-all"
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

  const byRole: Record<Role, StaffUser[]> = { ADMIN: [], CASHIER: [], WAITER: [], KITCHEN: [] };
  users.forEach((u) => { if (byRole[u.role]) byRole[u.role].push(u); });

  return (
    <div className="space-y-5">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ROLES.map((r) => {
          const c = ROLE_COLORS[r];
          const count = byRole[r].filter((u) => u.active).length;
          return (
            <div
              key={r}
               className={`p-5 rounded-2xl bg-[#13151F] border-2 text-center ${
                 r === 'WAITER' ? 'border-emerald-500/40' :
                 r === 'CASHIER' ? 'border-sky-500/40' :
                 r === 'ADMIN' ? 'border-purple-500/40' : 'border-amber-500/40'
               }`}
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
           <span className="text-sm font-black text-white uppercase tracking-wider">{users.length} Staff Account{users.length !== 1 ? 's' : ''}</span>
        </div>
        <button
          onClick={() => setShowAdd(true)}
           className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all flex items-center gap-2 hover:-translate-y-0.5"
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
