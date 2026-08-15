import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStaffStore } from '@/store/useStaffStore';
import { usePOSStore } from '@/store/usePOSStore';
import { Role } from '@/types/staff';
import { StaffPermissions } from '@/types/staff';
import { LogOut, LayoutGrid, ChefHat, GlassWater, ShieldCheck, Users } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/Navigation';

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
  ADMIN:   { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.3)', text: '#c084fc' },
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

  const logoSrc = settings?.cafeLogo || settings?.logoUrl || (settings as any)?.logo || null;

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
      {logoSrc ? (
        <img
          src={logoSrc}
          alt="logo"
          className="h-8 w-auto object-contain rounded-lg flex-shrink-0"
          style={{ filter: 'drop-shadow(0 0 6px rgba(59,130,246,0.35))' }}
        />
      ) : (
        /* Vector fallback icon */
        <div
          className="flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(59,130,246,0.18)', border: '1px solid rgba(59,130,246,0.3)' }}
        >
           <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-accent" stroke="currentColor" strokeWidth={1.8}>
            <path d="M3 10h18M3 14h18M9 10V5a3 3 0 016 0v5M5 20h14a2 2 0 002-2V8H3v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
      <span
        className="hidden truncate text-base font-bold tracking-wide text-white leading-tight sm:block"
      >
        {title}
      </span>
    </div>
  );

  // ── User badge ──────────────────────────────────────────────────────────────
  const userBadge = currentUser ? (
    <div className="flex items-center gap-2 flex-shrink-0">
      <div className="hidden sm:flex flex-col items-end leading-none gap-0.5">
        <span className="text-xs font-bold text-foreground">{currentUser.name}</span>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-bold"
          style={{
            background: ROLE_COLORS[currentUser.role].bg,
            border: `1px solid ${ROLE_COLORS[currentUser.role].border}`,
            color: ROLE_COLORS[currentUser.role].text,
          }}
        >
          {ROLE_LABEL[currentUser.role]}
        </span>
      </div>
      <button
        onClick={handleSwitchUser}
        title="Switch User"
         className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
      >
        <LogOut size={13} />
        <span className="hidden sm:inline">Switch User</span>
      </button>
    </div>
  ) : null;

  // ── Nav tab renderer (desktop inline) ──────────────────────────────────────
  const desktopNav = (
    <nav
      className="flex items-center gap-0.5 rounded-xl border border-border bg-secondary px-1 py-1 dark:border-white/5 dark:bg-[#13151F]"
    >
      {navItems.map(({ path, label, icon }) => {
        const active = location.pathname === path;
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
             className={`relative flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm whitespace-nowrap transition-colors duration-200 select-none active:scale-95 ${
               active
                 ? 'bg-white font-bold text-zinc-950 shadow-md'
                 : 'font-semibold text-zinc-300 hover:bg-white/5 hover:text-white'
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
         className={`flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm whitespace-nowrap transition-colors duration-200 select-none active:scale-95 ${
           active
             ? 'bg-white font-bold text-zinc-950 shadow-md'
             : 'font-semibold text-zinc-300 hover:bg-white/5 hover:text-white'
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
           <div className="flex items-center justify-end gap-3.5">
            <ThemeToggle />
            {userBadge}
          </div>
        </div>

        {/* ── MOBILE: two rows (<sm) ── */}
        <div className="sm:hidden">
           {/* Row 1: brand + theme/user */}
           <div className="flex items-center justify-between gap-3 py-2.5">
            {brandBlock}
             <div className="flex flex-shrink-0 items-center gap-3.5">
              <ThemeToggle />
              {userBadge}
            </div>
          </div>
          {/* Row 2: nav tabs (scrollable) */}
          {mobileTabs.length > 0 && (
            <div className="flex items-center gap-1.5 border-t border-border px-3 pb-2.5 overflow-x-auto no-scrollbar dark:border-white/5">
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
