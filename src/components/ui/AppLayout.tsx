import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStaffStore } from '@/store/useStaffStore';
import { Role } from '@/types/staff';
import { LogOut } from 'lucide-react';

const ALL_NAV = [
  { path: '/',        label: 'Tables'  },
  { path: '/history', label: 'History' },
  { path: '/admin',   label: 'Admin'   },
];

// Which tabs each role can see
const ROLE_TABS: Record<Role, string[]> = {
  WAITER:  ['/'],
  CASHIER: ['/', '/history'],
  ADMIN:   ['/', '/history', '/admin'],
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin', CASHIER: 'Cashier', WAITER: 'Waiter',
};

const ROLE_COLORS: Record<Role, { bg: string; border: string; text: string }> = {
  ADMIN:   { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.3)', text: '#c084fc' },
  CASHIER: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)', text: '#60a5fa' },
  WAITER:  { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)', text: '#34d399' },
};

interface AppLayoutProps {
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
}

const NAV_BTN_BASE = 'px-4 py-1.5 rounded-md text-sm font-semibold whitespace-nowrap transition-all duration-200 select-none active:scale-95';

const AppLayout = ({ title, headerRight, children }: AppLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = useStaffStore((s) => s.currentUser);
  const logout      = useStaffStore((s) => s.logout);

  const allowedPaths = currentUser ? ROLE_TABS[currentUser.role] : [];
  const navItems = ALL_NAV.filter((n) => allowedPaths.includes(n.path));

  const handleSwitchUser = () => {
    logout();
    // currentUser becomes null → App renders PinLoginScreen
  };

  // ── User badge ──────────────────────────────────────────────────────────────
  const userBadge = currentUser ? (
    <div className="flex items-center gap-2 flex-shrink-0">
      <div className="hidden sm:flex flex-col items-end leading-none gap-0.5">
        <span className="text-xs font-bold text-white/80">{currentUser.name}</span>
        <span
          className="text-[10px] font-semibold px-1.5 py-[1px] rounded-full"
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
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 hover:brightness-110 flex-shrink-0"
        style={{
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.55)',
        }}
      >
        <LogOut size={13} />
        <span className="hidden sm:inline">Switch User</span>
      </button>
    </div>
  ) : null;

  const tabs = navItems.map(({ path, label }) => {
    const active = location.pathname === path;
    return (
      <button
        key={path}
        onClick={() => navigate(path)}
        data-testid={`nav-${label.toLowerCase()}`}
        className={NAV_BTN_BASE}
        style={active ? {
          background: 'rgba(59,130,246,0.22)',
          color: 'rgba(255,255,255,0.95)',
          border: '1px solid rgba(59,130,246,0.35)',
          boxShadow: '0 2px 10px -2px rgba(59,130,246,0.3)',
        } : {
          color: 'rgba(255,255,255,0.55)',
          border: '1px solid transparent',
        }}
      >
        {label}
      </button>
    );
  });

  return (
    <div
      className="h-[100dvh] flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)' }}
    >
      {/* ── Header ── */}
      <header
        className="flex-shrink-0"
        style={{
          background: 'linear-gradient(135deg, #0a1228 0%, #0d1a2e 100%)',
          borderBottom: '1px solid rgba(59,130,246,0.25)',
        }}
      >
        {/* ── TABLET / DESKTOP: single row (sm+) ── */}
        <div className="hidden sm:flex items-stretch h-14 px-6">
          <div className="flex items-center flex-1 min-w-0">
            <span className="text-xs font-semibold text-white/50 tracking-[0.14em] uppercase truncate select-none">
              {title}
            </span>
          </div>
          <nav className="flex items-stretch gap-1 px-1">
            {navItems.map(({ path, label }) => {
              const active = location.pathname === path;
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  data-testid={`nav-${label.toLowerCase()}`}
                  className="relative px-4 my-2 flex items-center text-sm font-semibold rounded-md transition-all duration-200 select-none active:scale-95"
                  style={active ? {
                    background: 'rgba(59,130,246,0.22)',
                    color: 'rgba(255,255,255,0.95)',
                    border: '1px solid rgba(59,130,246,0.35)',
                    boxShadow: '0 2px 10px -2px rgba(59,130,246,0.3)',
                  } : {
                    color: 'rgba(255,255,255,0.55)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </nav>
          <div className="flex items-center justify-end gap-3 flex-1 min-w-0">
            {headerRight}
            {userBadge}
          </div>
        </div>

        {/* ── MOBILE: two rows (<sm) ── */}
        <div className="sm:hidden">
          {/* Row 1: title + status/clock + user */}
          <div className="flex items-center justify-between px-4 py-3 gap-3">
            <span className="text-xs font-semibold text-white/50 tracking-[0.14em] uppercase truncate select-none">
              {title}
            </span>
            <div className="flex items-center gap-2 flex-shrink-0 text-xs">
              {headerRight}
              {userBadge}
            </div>
          </div>
          {/* Row 2: nav tabs (horizontally scrollable) */}
          <div
            className="flex items-center gap-2 px-3 pb-2.5 overflow-x-auto no-scrollbar"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            {tabs}
          </div>
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
