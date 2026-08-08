import { ReactNode, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStaffStore } from '@/store/useStaffStore';
import { Role } from '@/types/staff';
import { StaffPermissions } from '@/types/staff';
import {
  LogOut, Menu, X, LayoutGrid, History, ChefHat, GlassWater, ShieldCheck,
} from 'lucide-react';

// ── Nav definition ────────────────────────────────────────────────────────────
const PERM_NAV: {
  path: string;
  label: string;
  perm: keyof StaffPermissions;
  Icon: React.ElementType;
}[] = [
  { path: '/',        label: 'Tables',         perm: 'pos',     Icon: LayoutGrid  },
  { path: '/history', label: 'History',        perm: 'pos',     Icon: History     },
  { path: '/kitchen', label: 'Kitchen Portal', perm: 'kitchen', Icon: ChefHat     },
  { path: '/bar',     label: 'Bar Portal',     perm: 'bar',     Icon: GlassWater  },
  { path: '/admin',   label: 'Admin',          perm: 'admin',   Icon: ShieldCheck },
];

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin', CASHIER: 'Cashier', WAITER: 'Waiter', KITCHEN: 'Kitchen',
};

const ROLE_COLORS: Record<Role, { bg: string; border: string; text: string }> = {
  ADMIN:   { bg: 'rgba(168,85,247,0.18)', border: 'rgba(168,85,247,0.35)', text: '#c084fc' },
  CASHIER: { bg: 'rgba(59,130,246,0.18)', border: 'rgba(59,130,246,0.35)', text: '#60a5fa' },
  WAITER:  { bg: 'rgba(16,185,129,0.18)', border: 'rgba(16,185,129,0.35)', text: '#34d399' },
  KITCHEN: { bg: 'rgba(249,115,22,0.18)',  border: 'rgba(249,115,22,0.35)',  text: '#fb923c' },
};

interface AppLayoutProps {
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
}

const AppLayout = ({ title, headerRight, children }: AppLayoutProps) => {
  const navigate     = useNavigate();
  const location     = useLocation();
  const currentUser  = useStaffStore((s) => s.currentUser);
  const logout       = useStaffStore((s) => s.logout);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  // Close on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [drawerOpen]);

  const navItems = currentUser
    ? PERM_NAV.filter((n) => currentUser.permissions[n.perm])
    : [];

  const colors = currentUser ? ROLE_COLORS[currentUser.role] : null;

  const handleSwitchUser = () => { setDrawerOpen(false); logout(); };

  return (
    <div
      className="h-[100dvh] flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)' }}
    >
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <header
        className="flex-shrink-0 flex items-center h-14 px-4 sm:px-5 gap-3"
        style={{
          background: 'linear-gradient(135deg, #080f1e 0%, #0c1526 100%)',
          borderBottom: '1px solid rgba(59,130,246,0.18)',
          boxShadow: '0 1px 0 0 rgba(59,130,246,0.06)',
        }}
      >
        {/* Hamburger */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90"
          style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.09)' }}
          aria-label="Open menu"
        >
          <Menu size={17} className="text-white/60" />
        </button>

        {/* Title */}
        <span className="flex-1 min-w-0 text-xs font-semibold text-white/45 tracking-[0.14em] uppercase truncate select-none">
          {title}
        </span>

        {/* Live indicator */}
        <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
          <span
            className="relative flex w-2 h-2"
          >
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" style={{ animationDuration: '2.4s' }} />
            <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-400" style={{ boxShadow: '0 0 6px 2px rgba(52,211,153,0.55)' }} />
          </span>
          <span className="text-[11px] font-semibold text-emerald-400/80 tracking-wide">Live</span>
        </div>

        {/* Divider */}
        {headerRight && <div className="hidden sm:block h-5 w-px bg-white/10 flex-shrink-0" />}

        {/* headerRight slot (clocks, counters, etc.) */}
        {headerRight && (
          <div className="flex items-center gap-2 flex-shrink-0 text-xs">
            {headerRight}
          </div>
        )}

        {/* User badge (compact) */}
        {currentUser && colors && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex-shrink-0 flex items-center gap-2 pl-2 rounded-xl transition-all active:scale-95"
            title="Open menu"
          >
            <div className="hidden sm:flex flex-col items-end leading-none gap-[3px]">
              <span className="text-xs font-bold text-white/75">{currentUser.name}</span>
              <span
                className="text-[10px] font-semibold px-1.5 py-[1px] rounded-full"
                style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
              >
                {ROLE_LABEL[currentUser.role]}
              </span>
            </div>
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black text-white/90 flex-shrink-0"
              style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
            >
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
          </button>
        )}
      </header>

      {/* ── Nav Drawer ────────────────────────────────────────────────────────── */}
      {/* Overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer panel */}
      <aside
        className="fixed inset-y-0 left-0 z-50 w-64 flex flex-col transition-transform duration-300 ease-out"
        style={{
          background: 'linear-gradient(160deg, #060d1c 0%, #090f1e 100%)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          boxShadow: drawerOpen ? '4px 0 40px -8px rgba(0,0,0,0.85)' : 'none',
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
        aria-label="Navigation drawer"
      >
        {/* Drawer header */}
        <div
          className="flex items-center justify-between px-4 h-14 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <span className="text-xs font-bold text-white/40 tracking-[0.16em] uppercase select-none">
            Navigation
          </span>
          <button
            onClick={() => setDrawerOpen(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {navItems.map(({ path, label, Icon }) => {
            const active = location.pathname === path;
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.97] select-none"
                style={active ? {
                  background: 'rgba(59,130,246,0.18)',
                  color: 'rgba(255,255,255,0.95)',
                  border: '1px solid rgba(59,130,246,0.30)',
                  boxShadow: '0 2px 12px -4px rgba(59,130,246,0.35)',
                } : {
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.50)',
                  border: '1px solid transparent',
                }}
              >
                <Icon
                  size={16}
                  style={{ color: active ? '#60a5fa' : 'rgba(255,255,255,0.35)', flexShrink: 0 }}
                />
                {label}
              </button>
            );
          })}
        </nav>

        {/* Drawer footer — user info + logout */}
        {currentUser && colors && (
          <div
            className="flex-shrink-0 p-3"
            style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
          >
            {/* User card */}
            <div
              className="flex items-center gap-3 p-3 rounded-xl mb-2"
              style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-base font-black text-white/90 flex-shrink-0"
                style={{ background: 'rgba(0,0,0,0.25)' }}
              >
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white/90 truncate">{currentUser.name}</p>
                <p className="text-[11px] font-semibold truncate" style={{ color: colors.text }}>
                  {ROLE_LABEL[currentUser.role]}
                </p>
              </div>
            </div>

            {/* Switch User */}
            <button
              onClick={handleSwitchUser}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.97]"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.18)',
                color: 'rgba(248,113,113,0.80)',
              }}
            >
              <LogOut size={14} />
              Switch User
            </button>
          </div>
        )}
      </aside>

      {/* ── Content ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {children}
      </div>
    </div>
  );
};

export default AppLayout;
