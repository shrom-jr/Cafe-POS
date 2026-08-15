import { ReactNode, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStaffStore } from '@/store/useStaffStore';
import { usePOSStore } from '@/store/usePOSStore';
import { Role } from '@/types/staff';
import { StaffPermissions } from '@/types/staff';
import { LogOut, LayoutGrid, ChefHat, GlassWater, ShieldCheck, Users } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/Navigation';
import { subscribeToLogo } from '@/utils/firebaseSync';

/** Navigation items ordered by display priority.
 *  Each item maps to a specific permission key. */
const PERM_NAV: { path: string; label: string; perm: keyof StaffPermissions; icon: ReactNode }[] = [
  { path: '/',        label: 'Tables',         perm: 'pos',     icon: <LayoutGrid  size={13} /> },
  { path: '/customers', label: 'Customers',    perm: 'canViewCustomers', icon: <Users size={13} /> },
  { path: '/kitchen', label: 'Kitchen Portal', perm: 'kitchen', icon: <ChefHat     size={13} /> },
  { path: '/bar',     label: 'Bar Portal',     perm: 'bar',     icon: <GlassWater  size={13} /> },
  { path: '/admin',   label: 'Admin',          perm: 'admin',   icon: <ShieldCheck size={13} /> },
];

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin', CASHIER: 'Cashier', WAITER: 'Waiter', KITCHEN: 'Kitchen',
};

const ROLE_COLORS: Record<Role, { bg: string; border: string; text: string }> = {
  ADMIN:   { bg: 'rgba(168,85,247,0.25)', border: 'rgba(192,132,252,0.3)', text: '#e9d5ff' },
  CASHIER: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)', text: '#60a5fa' },
  WAITER:  { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)', text: '#34d399' },
  KITCHEN: { bg: 'rgba(249,115,22,0.15)',  border: 'rgba(249,115,22,0.3)',  text: '#fb923c' },
};

interface AppLayoutProps {
  title: string;
  children: ReactNode;
}

const AppLayout = ({ title, children }: AppLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = useStaffStore((s) => s.currentUser);
  const logout      = useStaffStore((s) => s.logout);
  const settings    = usePOSStore((s) => s.settings);
  const [remoteLogo, setRemoteLogo] = useState<string | null>(null);
  const [hasLoadedRemoteLogo, setHasLoadedRemoteLogo] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToLogo((logo) => {
      setRemoteLogo(logo);
      setHasLoadedRemoteLogo(true);
    });
    return unsubscribe;
  }, []);

  const logoSrc = hasLoadedRemoteLogo
    ? remoteLogo
    : settings?.cafeLogo || settings?.logoUrl || (settings as any)?.logo || null;

  // Filter nav to only the tabs this user has permission for
  const navItems = currentUser
    ? PERM_NAV.filter((n) => currentUser.permissions[n.perm])
    : [];

  const handleSwitchUser = () => {
    logout();
  };

  // ── Brand block (logo + name) ───────────────────────────────────────────────
  const brandBlock = (
    <div className="flex items-center gap-2.5 flex-shrink-0 select-none min-w-0">
      <div className="flex h-10 min-w-10 max-w-[132px] shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-1.5 py-0.5 backdrop-blur-md">
        {logoSrc ? (
          <img
            src={logoSrc}
            alt="logo"
            className="h-9 w-auto max-w-[120px] rounded-lg object-contain"
            style={{ filter: 'drop-shadow(0 0 6px rgba(59,130,246,0.35))' }}
          />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-accent" stroke="currentColor" strokeWidth={1.8}>
            <path d="M3 10h18M3 14h18M9 10V5a3 3 0 016 0v5M5 20h14a2 2 0 002-2V8H3v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      <span
        className="hidden truncate text-lg font-black tracking-wide text-white leading-tight sm:block"
      >
        {title}
      </span>
    </div>
  );

  // ── User badge ──────────────────────────────────────────────────────────────
  const userBadge = currentUser ? (
    <div className="flex flex-shrink-0 items-center gap-5">
      <div className="hidden flex-col items-center justify-center gap-0.5 text-center sm:flex">
        <span className="text-sm font-bold text-white">{currentUser.name}</span>
        <span
          className="rounded-md border border-purple-400/30 bg-purple-500/25 px-2.5 py-0.5 text-[11px] font-black text-purple-200"
          style={{
            background: ROLE_COLORS[currentUser.role].bg,
            border: `1px solid ${ROLE_COLORS[currentUser.role].border}`,
            color: ROLE_COLORS[currentUser.role].text,
          }}
        >
          {ROLE_LABEL[currentUser.role]}
        </span>
      </div>
      <span className="h-6 w-px bg-zinc-800" aria-hidden="true" />
      <button
        onClick={handleSwitchUser}
        title="Switch User"
         className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-300 transition-all hover:bg-emerald-500/20 hover:text-emerald-200 active:scale-95"
      >
        <LogOut size={13} />
        <span className="hidden sm:inline">Switch User</span>
      </button>
    </div>
  ) : null;

  // ── Nav tab renderer (desktop inline) ──────────────────────────────────────
  const desktopNav = (
    <nav
      className="flex items-center gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-1"
    >
      {navItems.map(({ path, label, icon }) => {
        const active = location.pathname === path;
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
             className={`relative flex items-center gap-2 rounded-xl text-sm whitespace-nowrap transition-colors duration-200 select-none active:scale-95 ${
               active
                 ? 'bg-emerald-600 px-4 py-2 font-bold text-white shadow-sm'
                 : 'border-0 bg-transparent px-4 py-2 font-semibold text-zinc-300 hover:bg-white/5 hover:text-white'
             }`}
          >
             <span className={active ? 'opacity-100' : 'opacity-75'}>{icon}</span>
            {label}
          </button>
        );
      })}
    </nav>
  );

  // ── Mobile tab buttons (scrollable row) ────────────────────────────────────
  const mobileTabs = navItems.map(({ path, label, icon }) => {
    const active = location.pathname === path;
    return (
      <button
        key={path}
        onClick={() => navigate(path)}
        data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
         className={`flex shrink-0 items-center gap-2 rounded-xl text-sm whitespace-nowrap transition-colors duration-200 select-none active:scale-95 ${
           active
             ? 'bg-emerald-600 px-4 py-2 font-bold text-white shadow-sm'
             : 'border-0 bg-transparent px-4 py-2 font-semibold text-zinc-300 hover:bg-white/5 hover:text-white'
         }`}
      >
         <span className={active ? 'opacity-100' : 'opacity-75'}>{icon}</span>
        {label}
      </button>
    );
  });

  return (
    <div
      className="h-[100dvh] flex flex-col overflow-hidden bg-background text-foreground dark:bg-[#0A0B0E]"
    >
      {/* ── Header ── */}
      <header className="flex-shrink-0 border-b border-white/10 bg-[#10121A] px-6 py-3">
         {/* ── TABLET / DESKTOP: single row (sm+) ── */}
        <div className="hidden h-10 items-center sm:grid" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
          {/* Left: brand */}
          <div className="flex items-center">
            {brandBlock}
          </div>
          {/* Center: nav */}
          <div className="flex items-center justify-center">
            {desktopNav}
          </div>
           {/* Right: theme + user */}
           <div className="flex items-center justify-end gap-5">
            <ThemeToggle />
            {userBadge}
          </div>
        </div>

        {/* ── MOBILE: two rows (<sm) ── */}
        <div className="sm:hidden">
           {/* Row 1: brand + theme/user */}
           <div className="flex items-center justify-between gap-3 py-2.5">
            {brandBlock}
             <div className="flex flex-shrink-0 items-center gap-5">
              <ThemeToggle />
              {userBadge}
            </div>
          </div>
          {/* Row 2: nav tabs (scrollable) */}
          {mobileTabs.length > 0 && (
             <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/90 p-1 no-scrollbar">
              {mobileTabs}
            </div>
          )}
        </div>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {children}
      </div>
    </div>
  );
};

export default AppLayout;
