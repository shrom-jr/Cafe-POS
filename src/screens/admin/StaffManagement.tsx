import { useState } from 'react';
import {
  useStaffStore,
  canRemoveOrDeactivateStaffUser,
  ONLY_ADMIN_PROTECTION_MESSAGE,
} from '@/store/useStaffStore';
import { StaffUser, Role, StaffPermissions, DEFAULT_PERMISSIONS } from '@/types/staff';
import { Plus, Trash2, Edit3, X, Save, Eye, EyeOff, KeyRound, Users } from 'lucide-react';
import { toast } from 'sonner';

const ROLES: Role[] = ['WAITER', 'CASHIER', 'KITCHEN', 'MANAGER', 'ADMIN'];

const ROLE_COLORS: Record<Role, { bg: string; border: string; text: string }> = {
  ADMIN:   { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.3)', text: '#c084fc' },
  CASHIER: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)', text: '#60a5fa' },
  WAITER:  { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)', text: '#34d399' },
  KITCHEN: { bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.3)',  text: '#fb923c' },
  MANAGER: { bg: 'rgba(6,182,212,0.15)', border: 'rgba(6,182,212,0.3)', text: '#67e8f9' },
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin', CASHIER: 'Cashier', WAITER: 'Waiter', KITCHEN: 'Kitchen', MANAGER: 'Manager',
};

// Permission display config. Keep this list stable so the modal never changes
// height when a role preset changes.
type PermKey = keyof StaffPermissions;
type PermissionConfig = { key: PermKey; label: string; badge: string };
const OPERATIONAL_PERMISSIONS: PermissionConfig[] = [
  { key: 'pos', label: 'POS & Tables', badge: 'POS' },
  { key: 'customers', label: 'Customer Directory', badge: 'Customers' },
  { key: 'kitchen', label: 'Kitchen Portal', badge: 'Kitchen' },
  { key: 'bar', label: 'Bar Portal', badge: 'Bar' },
];
const MANAGEMENT_PERMISSIONS: PermissionConfig[] = [
  { key: 'dashboard', label: 'Dashboard Overview', badge: 'Dashboard' },
  { key: 'reports', label: 'Sales Reports', badge: 'Reports' },
  { key: 'menu', label: 'Menu Management', badge: 'Menu' },
  { key: 'inventory', label: 'Inventory Tracking', badge: 'Inventory' },
  { key: 'expenses', label: 'Expense Logging', badge: 'Expenses' },
  { key: 'printers', label: 'Printer Settings & Hardware', badge: 'Printers' },
];
const ALL_PERMISSIONS = [...OPERATIONAL_PERMISSIONS, ...MANAGEMENT_PERMISSIONS];

const inputCls = 'w-full bg-[#161d2d] border border-slate-700/90 text-white placeholder-slate-500 text-sm rounded-xl px-4 py-2.5 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all';
const labelCls = 'text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 block';

const ACTIVE_ROLE_CLS: Record<Role, string> = {
  WAITER:  'bg-emerald-600/30 border-2 border-emerald-500 text-emerald-300 font-bold',
  CASHIER: 'bg-blue-600/30 border-2 border-blue-500 text-blue-300 font-bold',
  KITCHEN: 'bg-orange-600/30 border-2 border-orange-500 text-orange-300 font-bold',
  MANAGER: 'bg-cyan-600/30 border-2 border-cyan-500 text-cyan-300 font-bold',
  ADMIN:   'bg-purple-600/30 border-2 border-purple-500 text-purple-300 font-bold',
};
const INACTIVE_ROLE_CLS = 'py-2.5 px-3 rounded-xl bg-[#161d2d] border border-slate-700/80 text-slate-300 font-semibold text-xs text-center hover:border-slate-500 hover:text-white transition-all';

// ── Add / Edit Modal ─────────────────────────────────────────────────────────
const StaffModal = ({
  existing,
  onClose,
  canDeactivate = true,
}: {
  existing: StaffUser | null; // null = create new
  onClose: () => void;
  canDeactivate?: boolean;
}) => {
  const { addUser, updateUser } = useStaffStore();
  const [name, setName]       = useState(existing?.name ?? '');
  const [email, setEmail]     = useState(existing?.email ?? '');
  const [role, setRole]       = useState<Role>(existing?.role ?? 'WAITER');
  const [pin, setPin]         = useState('');
  const [showPin, setShowPin] = useState(false);
  const [active, setActive]   = useState(existing?.active ?? true);
  const [perms, setPerms]     = useState<StaffPermissions>(
    existing?.permissions ?? DEFAULT_PERMISSIONS[existing?.role ?? 'WAITER']
  );

  const isEdit = !!existing;

  /** Selecting a role preset snaps permissions to defaults for that role. */
  const handleRoleSelect = (r: Role) => {
    setRole(r);
    setPerms(DEFAULT_PERMISSIONS[r]);
  };

  const togglePerm = (key: PermKey) =>
    setPerms((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSave = async () => {
    if (!name.trim()) return toast.error('Name is required');
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return toast.error('Email is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return toast.error('Enter a valid email address');
    if (pin && (pin.length !== 6 || !/^\d{6}$/.test(pin))) return toast.error('PIN must be exactly 6 digits');
    if (!isEdit && !pin) return toast.error('PIN is required for new staff');

    if (isEdit) {
      const updates: Partial<Omit<typeof existing & object, 'id'>> = { name: name.trim(), email: trimmedEmail, role, active, permissions: perms } as any;
      if (pin) (updates as any).pin = pin;
      const updated = await updateUser(existing!.id, updates as any);
      if (!updated) {
        toast.error(ONLY_ADMIN_PROTECTION_MESSAGE);
        return;
      }
      toast.success('Staff member updated');
    } else {
      await addUser({ name: name.trim(), email: trimmedEmail, role, pin: pin!, active: true, permissions: perms } as any);
      toast.success('Staff member added');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl bg-[#0e131f] border border-slate-800 rounded-2xl shadow-2xl p-6 text-white">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-extrabold text-white tracking-wide uppercase">{isEdit ? 'Edit Staff' : 'Add Staff'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Left column ── */}
          <div className="space-y-4">

            {/* Name */}
            <div>
              <label className={labelCls}>Full Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sita Thapa"
                className={inputCls}
              />
            </div>

            {/* Email */}
            <div>
              <label className={labelCls}>
                Email <span className="text-red-400 normal-case font-normal">*</span>
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

            {/* Role */}
            <div>
              <label className={labelCls}>
                Role{' '}
                <span className="normal-case font-normal text-slate-400">(sets default permissions)</span>
              </label>
              {/* Row 1: Waiter · Cashier · Kitchen */}
              <div className="grid grid-cols-3 gap-2 mb-2">
                {(['WAITER', 'CASHIER', 'KITCHEN'] as Role[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => handleRoleSelect(r)}
                    className={role === r
                      ? `w-full py-2.5 px-3 rounded-xl text-xs transition-all ${ACTIVE_ROLE_CLS[r]}`
                      : INACTIVE_ROLE_CLS}
                  >
                    {ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
              {/* Row 2: Manager · Admin */}
              <div className="grid grid-cols-2 gap-2">
                {(['MANAGER', 'ADMIN'] as Role[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => handleRoleSelect(r)}
                    className={role === r
                      ? `w-full py-2.5 px-3 rounded-xl text-xs transition-all ${ACTIVE_ROLE_CLS[r]}`
                      : INACTIVE_ROLE_CLS}
                  >
                    {ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>

            {/* PIN */}
            <div>
              <label className={labelCls}>
                6-Digit PIN
                {isEdit && <span className="normal-case font-normal text-slate-400 ml-1">(leave blank to keep)</span>}
              </label>
              <div className="relative">
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  placeholder="••••••"
                  maxLength={6}
                  className={`${inputCls} pr-10 tracking-[0.4em] text-center`}
                />
                <button
                  onClick={() => setShowPin((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Active toggle (edit only) */}
            {isEdit && (
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#1E293B] border border-slate-600">
                <p className="text-sm font-semibold text-slate-200">Active</p>
                <button
                  onClick={() => { if (canDeactivate) setActive((v) => !v); }}
                  title={canDeactivate ? 'Toggle active status' : ONLY_ADMIN_PROTECTION_MESSAGE}
                  aria-label={canDeactivate ? 'Toggle active status' : ONLY_ADMIN_PROTECTION_MESSAGE}
                  disabled={!canDeactivate}
                  className={`w-10 h-6 rounded-full transition-all relative border-2 ${active ? 'bg-amber-500 border-amber-400 shadow-md shadow-amber-500/30' : 'bg-slate-700 border-slate-600'} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                    style={{ left: active ? '18px' : '2px' }}
                  />
                </button>
              </div>
            )}
          </div>

          {/* ── Right column: permissions / preset / admin ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Feature Permissions</span>
              <span className="text-[11px] text-slate-400">Choose access</span>
            </div>

            {role === 'MANAGER' ? (
              <div className="space-y-4">
                {[
                  { title: 'Operational Portals', items: OPERATIONAL_PERMISSIONS },
                  { title: 'Management & Hardware', items: MANAGEMENT_PERMISSIONS },
                ].map(({ title, items }) => (
                  <div key={title}>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 block">{title}</span>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {items.map(({ key, label }) => {
                        const checked = perms[key] === true;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => togglePerm(key)}
                            className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all active:scale-[0.98] ${
                              checked
                                ? 'bg-amber-500/15 border-amber-500/60 text-amber-200 text-xs font-semibold'
                                : 'bg-[#161d2d]/60 border-slate-800 text-slate-300 text-xs font-medium hover:border-slate-600 hover:text-white'
                            }`}
                          >
                            <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${
                              checked ? 'bg-amber-500/20 border-amber-400' : 'bg-transparent border-slate-600'
                            }`}>
                              {checked && (
                                <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                                  <path d="M1 3.5L3.5 6L8 1" stroke="#FBBF24" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </span>
                            <span className="text-left leading-tight">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

            ) : role === 'ADMIN' ? (
              <div className="bg-purple-950/20 border border-purple-800/40 rounded-xl p-4 text-purple-200 text-xs leading-relaxed">
                <p className="text-sm font-bold text-purple-200 uppercase tracking-wider mb-1">Master Administrator</p>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  Full unrestricted master access: complete control over all floor portals, management views,
                  hardware/printers, company tax &amp; VAT settings, staff management, and system data resets.
                </p>
                <span className="px-2.5 py-1 rounded-lg bg-purple-900 border border-purple-400 text-purple-200 font-bold text-xs">
                  Locked Full Access
                </span>
              </div>

            ) : (
              <div className="bg-[#161d2d] border border-slate-800 rounded-xl p-4 text-slate-300 text-xs leading-relaxed">
                <p className="text-sm font-bold text-white uppercase tracking-wider mb-1">Role Access Preset</p>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  {role === 'WAITER'  && 'POS & Floor Tables access for taking orders and managing assigned tables.'}
                  {role === 'CASHIER' && 'POS & Table Billing plus Customer Directory access for payments and khata.'}
                  {role === 'KITCHEN' && 'Kitchen Portal access for preparing and completing kitchen orders.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {OPERATIONAL_PERMISSIONS.filter(({ key }) => perms[key] === true).map(({ badge }) => (
                    <span key={badge} className="px-2.5 py-1 rounded-lg bg-slate-700 border border-slate-500 text-slate-100 font-bold text-xs">
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-5 mt-1 border-t border-slate-700/60">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#161d2d] hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wide transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="w-full sm:w-auto px-8 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
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

  const handleReset = async () => {
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) return toast.error('PIN must be exactly 6 digits');
    await updateUser(user.id, { pin } as any);
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
           <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1.5 block">New 6-Digit PIN</label>
          <div className="relative">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              placeholder="••••••"
              maxLength={6}
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
  currentUserId,
  onClose,
}: {
  user: StaffUser;
  currentUserId?: string;
  onClose: () => void;
}) => {
  const { deleteUser } = useStaffStore();

  const handleDelete = () => {
    const deleted = deleteUser(user.id);
    if (!deleted) {
      const reason = canRemoveOrDeactivateStaffUser(
        useStaffStore.getState().users,
        user.id,
        currentUserId,
      ).reason ?? ONLY_ADMIN_PROTECTION_MESSAGE;
      toast.error(reason);
      return;
    }
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
  const active = ALL_PERMISSIONS.filter((p) => perms[p.key]);
  if (active.length === 0) return null;
  const hasFullAccess = (user.role === 'ADMIN' || user.role === 'MANAGER')
    && ALL_PERMISSIONS.every((p) => perms[p.key] === true);
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {hasFullAccess ? (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/50 text-[10px] font-black uppercase text-amber-300 leading-tight">
          FULL ACCESS
        </span>
      ) : active.map(({ badge }) => (
        <span
          key={badge}
           className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-600/70 text-[10px] font-black uppercase text-slate-200 leading-tight"
        >
          {badge}
        </span>
      ))}
    </div>
  );
};

// ── Staff Row ────────────────────────────────────────────────────────────────
const StaffRow = ({
  user,
  activeAdminCount,
  currentUserId,
}: {
  user: StaffUser;
  activeAdminCount: number;
  currentUserId?: string;
}) => {
  const [modal, setModal] = useState<'edit' | 'reset' | 'delete' | null>(null);
  const colors = ROLE_COLORS[user.role];
  const isSoleActiveAdmin = user.active && user.role === 'ADMIN' && activeAdminCount <= 1;
  const isCurrentUser = user.id === currentUserId;
  const protectedReason = isCurrentUser
    ? 'You cannot delete or deactivate your own account.'
    : isSoleActiveAdmin
      ? ONLY_ADMIN_PROTECTION_MESSAGE
      : undefined;

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
            <span className="text-xs text-white/25 font-mono tracking-[0.3em]">{'•'.repeat(user.pinLength ?? 6)}</span>
          </div>
          <PermissionBadges user={user} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setModal('reset')}
            title="Reset PIN"
              className="p-2 rounded-lg bg-slate-800/80 border border-slate-700 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <KeyRound size={14} />
          </button>
          <button
            onClick={() => setModal('edit')}
            title="Edit"
              className="p-2 rounded-lg bg-slate-800/80 border border-slate-700 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <Edit3 size={14} />
          </button>
          <button
            onClick={() => { if (!protectedReason) setModal('delete'); }}
            title={protectedReason ?? 'Remove'}
            aria-label={protectedReason ?? `Remove ${user.name}`}
            disabled={!!protectedReason}
              className="p-2 rounded-lg bg-slate-800/80 border border-slate-700 hover:bg-slate-700 text-slate-300 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {modal === 'edit'   && <StaffModal    existing={user} onClose={() => setModal(null)} canDeactivate={!protectedReason} />}
      {modal === 'reset'  && <ResetPinModal user={user}     onClose={() => setModal(null)} />}
      {modal === 'delete' && <DeleteConfirm user={user} currentUserId={currentUserId} onClose={() => setModal(null)} />}
    </>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────
const StaffManagement = () => {
  const { users, currentUser } = useStaffStore();
  const [showAdd, setShowAdd] = useState(false);
  const activeAdminCount = users.filter((user) => user.active && user.role === 'ADMIN').length;

  const byRole: Record<Role, StaffUser[]> = { ADMIN: [], CASHIER: [], WAITER: [], KITCHEN: [], MANAGER: [] };
  users.forEach((u) => { if (byRole[u.role]) byRole[u.role].push(u); });

  return (
    <div className="space-y-5">
      {/* Summary row */}
       <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
          users.map((u) => (
            <StaffRow
              key={u.id}
              user={u}
              activeAdminCount={activeAdminCount}
              currentUserId={currentUser?.id}
            />
          ))
        )}
      </div>

      {/* Add modal */}
      {showAdd && <StaffModal existing={null} onClose={() => setShowAdd(false)} />}
    </div>
  );
};

export default StaffManagement;
