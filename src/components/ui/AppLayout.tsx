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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
      <div className="flex h-10 min-w-10 max-w-[132px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-1.5 py-0.5 backdrop-blur-md dark:border-white/20 dark:bg-white/10">
        {logoSrc ? (
          <img
            src={logoSrc}
            alt="logo"
            className="h-9 w-auto max-w-[120px] rounded-lg object-contain"
            style={{ filter: 'drop-shadow(0 0 6px rgba(59,130,246,0.35))' }}
          />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-emerald-700 dark:text-accent" stroke="currentColor" strokeWidth={1.8}>
            <path d="M3 10h18M3 14h18M9 10V5a3 3 0 016 0v5M5 20h14a2 2 0 002-2V8H3v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      <span
        className="hidden truncate text-lg font-black tracking-wide text-slate-900 leading-tight dark:text-white lg:block"
      >
        {title}
      </span>
    </div>
  );

  // ── User badge ──────────────────────────────────────────────────────────────
  const userBadge = currentUser ? (
    <div className="flex flex-shrink-0 items-center gap-2.5">
      <div className="hidden flex-col items-center justify-center gap-0.5 text-center lg:flex">
        <span className="text-xs font-bold text-slate-900 dark:text-white">{currentUser.name}</span>
        <span
          className={`rounded border px-2 py-0.5 text-[11px] font-bold ${
            currentUser.role === 'ADMIN'
               ? 'border-purple-300 bg-purple-100 text-purple-800 dark:border-purple-400/30 dark:bg-purple-500/25 dark:text-purple-200'
              : 'border-purple-400/30 bg-purple-500/25 text-purple-200'
          }`}
          style={currentUser.role === 'ADMIN' ? undefined : {
            background: ROLE_COLORS[currentUser.role].bg,
            border: `1px solid ${ROLE_COLORS[currentUser.role].border}`,
            color: ROLE_COLORS[currentUser.role].text,
          }}
        >
          {ROLE_LABEL[currentUser.role]}
        </span>
      </div>
      <span className="h-6 w-px bg-slate-200 dark:bg-zinc-800" aria-hidden="true" />
      <button
        onClick={handleSwitchUser}
        title="Switch User"
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-bold text-slate-700 transition-all hover:bg-slate-200 active:scale-95 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
      >
        <LogOut size={13} />
        <span className="hidden lg:inline">Switch User</span>
      </button>
    </div>
  ) : null;

  // ── Nav tab renderer (desktop inline) ──────────────────────────────────────
  const desktopNav = (
    <nav
      className="flex items-center gap-1 rounded-2xl border border-slate-300 bg-slate-300/60 p-1 dark:border-zinc-800 dark:bg-zinc-900/90"
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
                 : 'border-0 bg-transparent px-4 py-2 font-bold text-slate-700 transition-all hover:bg-white/60 hover:text-slate-950 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white'
             }`}
          >
             <span className={active ? 'opacity-100' : 'opacity-75'}>{icon}</span>
            {label}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div
       className="min-h-screen h-[100dvh] flex flex-col overflow-hidden bg-white text-slate-900 transition-colors dark:bg-[#0A0B0E] dark:text-slate-100"
    >
      {/* ── Header ── */}
        <header className="flex-shrink-0 border-b border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#10121A] lg:flex lg:h-16 lg:items-center lg:px-6 lg:py-2.5">
         {/* ── TABLET / DESKTOP: single row (lg+) ── */}
        <div className="hidden h-full w-full items-center justify-between gap-4 lg:flex">
          {/* Left: brand */}
          {brandBlock}
          {/* Center: nav */}
          {desktopNav}
           {/* Right: theme + user */}
          <div className="flex min-w-0 items-center justify-end gap-3">
            <ThemeToggle />
            {userBadge}
          </div>
        </div>

        {/* ── MOBILE: compact bar + slide-over drawer (<lg) ── */}
        <div className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-white/10 dark:bg-[#0A0B0E] lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-white/20 dark:bg-white/10">
              {logoSrc ? (
                <img src={logoSrc} alt="logo" className="h-8 w-8 rounded-lg object-contain" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-emerald-700 dark:text-accent" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M3 10h18M3 14h18M9 10V5a3 3 0 016 0v5M5 20h14a2 2 0 002-2V8H3v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span className="truncate text-sm font-black tracking-tight text-slate-900 dark:text-white sm:text-base">
              {title}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isMobileMenuOpen}
              onClick={() => setIsMobileMenuOpen((open) => !open)}
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <span className="relative h-5 w-5">
                <span className={`absolute left-0 top-1 block h-0.5 w-5 rounded-full bg-current transition-all duration-300 ${isMobileMenuOpen ? 'translate-y-1.5 rotate-45' : ''}`} />
                <span className={`absolute left-0 top-2.5 block h-0.5 w-5 rounded-full bg-current transition-all duration-300 ${isMobileMenuOpen ? 'opacity-0' : 'opacity-100'}`} />
                <span className={`absolute left-0 top-4 block h-0.5 w-5 rounded-full bg-current transition-all duration-300 ${isMobileMenuOpen ? '-translate-y-1.5 -rotate-45' : ''}`} />
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* ── MOBILE: animated navigation drawer ── */}
      <div
        className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          isMobileMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!isMobileMenuOpen}
        onClick={() => setIsMobileMenuOpen(false)}
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-[280px] flex-col justify-between border-l border-slate-200 bg-white p-5 shadow-2xl transition-transform duration-300 ease-in-out dark:border-white/10 dark:bg-[#12141D] sm:w-[320px] lg:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="Mobile navigation"
      >
        <div>
          <div className="mb-6 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {currentUser && (
                <>
                  <p className="truncate text-base font-black text-slate-900 dark:text-white">{currentUser.name}</p>
                  <span
                    className={`mt-1 inline-flex rounded border px-2 py-0.5 text-[11px] font-bold ${
                      currentUser.role === 'ADMIN'
                        ? 'border-purple-300 bg-purple-100 text-purple-800 dark:border-purple-400/30 dark:bg-purple-500/25 dark:text-purple-200'
                        : 'border-purple-400/30 bg-purple-500/25 text-purple-200'
                    }`}
                    style={currentUser.role === 'ADMIN' ? undefined : {
                      background: ROLE_COLORS[currentUser.role].bg,
                      border: `1px solid ${ROLE_COLORS[currentUser.role].border}`,
                      color: ROLE_COLORS[currentUser.role].text,
                    }}
                  >
                    {ROLE_LABEL[currentUser.role]}
                  </span>
                </>
              )}
            </div>
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-lg font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10"
            >
              ×
            </button>
          </div>

          {currentUser && (
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                handleSwitchUser();
              }}
              className="mb-6 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <LogOut size={14} />
              Switch User
            </button>
          )}

          <nav className="flex flex-col gap-2">
            {navItems.map(({ path, label, icon }) => {
              const active = location.pathname === path;
              return (
                <button
                  key={path}
                  type="button"
                  onClick={() => {
                    navigate(path);
                    setIsMobileMenuOpen(false);
                  }}
                  data-testid={`mobile-nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors ${
                    active
                      ? 'border border-emerald-500/30 bg-emerald-500/15 font-bold text-emerald-600 dark:text-emerald-400'
                      : 'font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'
                  }`}
                >
                  <span className={active ? 'opacity-100' : 'opacity-75'}>{icon}</span>
                  {label}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {children}
      </div>
    </div>
  );
};

export default AppLayout;
