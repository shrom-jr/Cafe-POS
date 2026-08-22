import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStaffStore } from '@/store/useStaffStore';
import { canAccessCustomers, canAccessManagement, getFirstPermittedManagementRoute } from '@/utils/permissions';
import { usePOSStore } from '@/store/usePOSStore';
import { Role } from '@/types/staff';
import { StaffPermissions } from '@/types/staff';
import { LogOut, LayoutGrid, ChefHat, GlassWater, ShieldCheck, Users, RefreshCw, CheckCircle2, WifiOff } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/Navigation';
import { subscribeToLogo, subscribeToConnectivity, replayOfflineMutations } from '@/utils/firebaseSync';
import { getPendingQueueCount } from '@/utils/offlineQueue';
import { useToast } from '@/hooks/use-toast';
import { getSettingsLogo } from '@/utils/logo';
import { isTrainingSandboxActive } from '@/utils/trainingSandbox';

/** Navigation items ordered by display priority.
 *  Each item maps to a specific permission key. */
const PERM_NAV: { path: string; label: string; perm: keyof StaffPermissions; icon: ReactNode }[] = [
  { path: '/',        label: 'Tables',         perm: 'pos',     icon: <LayoutGrid  size={13} /> },
  { path: '/customers', label: 'Customers',    perm: 'customers', icon: <Users size={13} /> },
  { path: '/kitchen', label: 'Kitchen Portal', perm: 'kitchen', icon: <ChefHat     size={13} /> },
  { path: '/bar',     label: 'Bar Portal',     perm: 'bar',     icon: <GlassWater  size={13} /> },
  { path: '/admin',   label: 'Admin',          perm: 'dashboard',   icon: <ShieldCheck size={13} /> },
];

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin', CASHIER: 'Cashier', WAITER: 'Waiter', KITCHEN: 'Kitchen', MANAGER: 'Manager',
};

const ROLE_COLORS: Record<Role, { bg: string; border: string; text: string }> = {
  ADMIN:   { bg: 'rgba(168,85,247,0.25)', border: 'rgba(192,132,252,0.3)', text: '#e9d5ff' },
  CASHIER: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)', text: '#60a5fa' },
  WAITER:  { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)', text: '#34d399' },
  KITCHEN: { bg: 'rgba(249,115,22,0.15)',  border: 'rgba(249,115,22,0.3)',  text: '#fb923c' },
  MANAGER: { bg: 'rgba(6,182,212,0.18)', border: 'rgba(6,182,212,0.35)', text: '#67e8f9' },
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
  const isTrainingSession = isTrainingSandboxActive();
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
    : getSettingsLogo(settings);

  // Filter nav to only the tabs this user has permission for
  const navItems = currentUser
    ? PERM_NAV.filter((n) =>
        n.path === '/admin'
          ? canAccessManagement(currentUser.role, currentUser.permissions)
          : n.perm === 'customers'
            ? canAccessCustomers(currentUser.permissions)
            : currentUser.permissions[n.perm],
      ).map((item) => item.path === '/admin' && currentUser.role === 'MANAGER'
        ? { ...item, label: 'Manager' }
        : item)
    : [];

  const handleSwitchUser = () => {
    logout();
  };

  // ── Brand block (logo + name) ───────────────────────────────────────────────
  const brandBlock = (
    <div className="flex items-center flex-shrink-0 min-w-0">
      <div className="w-[52px] h-[52px] sm:w-14 sm:h-14 rounded-2xl bg-white/[0.08] border-2 border-amber-500/40 p-1 flex items-center justify-center flex-shrink-0 shadow-lg shadow-black/60 overflow-hidden group">
        <img
          src={logoSrc || '/logo.png'}
          alt="Restaurant Logo"
          className="w-full h-full object-contain rounded-xl drop-shadow-md"
        />
      </div>
      <div className="flex flex-col ml-3.5 select-none min-w-0">
        <span className="text-base sm:text-lg font-black tracking-tight text-white leading-tight whitespace-nowrap">
          {settings?.cafeName || settings?.restaurantName || 'S Bamboo Cottage & Sekuwa Corner'}
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400 mt-0.5">
          POS Terminal
        </span>
         {isTrainingSession && (
           <span className="mt-1 inline-flex w-fit rounded-full border border-amber-300/50 bg-amber-400/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-200">
             Training Sandbox
           </span>
         )}
      </div>
    </div>
  );

  // ── Connectivity / offline-queue status badge ────────────────────────────────
  const { toast } = useToast();
  const [isOnline, setIsOnline]                   = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(true);
  const [pendingCount, setPendingCount]           = useState(getPendingQueueCount);
  const [isSyncing, setIsSyncing]                 = useState(false);
  // Track previous syncing state to detect the transition true → false
  const prevSyncingRef = useRef(false);

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleQueueChange = () => setPendingCount(getPendingQueueCount());
    const handleReplayStatus = (e: Event) => {
      const active = (e as CustomEvent<{ active: boolean }>).detail.active;
      setIsSyncing(active);
    };
    const handleSyncComplete = () => {
      toast({
        title: 'All synced',
        description: 'Offline actions have been uploaded successfully.',
        duration: 3000,
      });
    };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offline-queue-changed',  handleQueueChange);
    window.addEventListener('offline-replay-status',  handleReplayStatus as EventListener);
    window.addEventListener('offline-sync-complete',  handleSyncComplete);

    const unsubConn = subscribeToConnectivity((connected) => {
      setIsFirebaseConnected(connected);
    });

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline-queue-changed',  handleQueueChange);
      window.removeEventListener('offline-replay-status',  handleReplayStatus as EventListener);
      window.removeEventListener('offline-sync-complete',  handleSyncComplete);
      unsubConn();
    };
  }, [toast]);

  // Track syncing → done transition (not needed for toast — handled by event)
  useEffect(() => { prevSyncingRef.current = isSyncing; }, [isSyncing]);

  const effectivelyOnline = isOnline && isFirebaseConnected;

  const handleManualSync = useCallback(() => {
    if (isSyncing || !effectivelyOnline) return;
    void replayOfflineMutations();
  }, [isSyncing, effectivelyOnline]);

  // Derive display state
  type SyncStatus = 'online' | 'offline' | 'syncing';
  const status: SyncStatus =
    isSyncing          ? 'syncing' :
    !effectivelyOnline ? 'offline' :
    pendingCount > 0   ? 'offline' :
    'online';

  const statusConfig: Record<SyncStatus, { pill: string; label: string; title: string; dotClass: string }> = {
    online: {
      pill:     'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25',
      dotClass: 'bg-emerald-400',
      label:    'Synced',
      title:    'All data is synced with the server',
    },
    offline: {
      pill:     'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25',
      dotClass: 'bg-amber-400 animate-pulse',
      label:    pendingCount > 0 ? `${pendingCount} pending` : 'Offline',
      title:    pendingCount > 0
                  ? `${pendingCount} action${pendingCount !== 1 ? 's' : ''} queued — click to sync when online`
                  : 'No connection to server',
    },
    syncing: {
      pill:     'bg-blue-500/15 border-blue-500/30 text-blue-400 hover:bg-blue-500/25',
      dotClass: 'bg-blue-400',
      label:    pendingCount > 0 ? `${pendingCount} left…` : 'Syncing…',
      title:    'Uploading offline actions…',
    },
  };

  const cfg = statusConfig[status];

  const syncButton = (
    <button
      onClick={handleManualSync}
      title={cfg.title}
      aria-label={cfg.title}
      className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold tracking-wide transition-all active:scale-95 select-none ${cfg.pill}`}
    >
      {/* Leading indicator — spinner when syncing, coloured dot otherwise */}
      {status === 'syncing' ? (
        <RefreshCw size={11} className="animate-spin flex-shrink-0" />
      ) : status === 'offline' && !effectivelyOnline ? (
        <WifiOff size={11} className="flex-shrink-0" />
      ) : status === 'online' ? (
        <CheckCircle2 size={11} className="flex-shrink-0" />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dotClass}`} />
      )}
      {/* Label — hidden on very small screens */}
      <span className="hidden sm:inline whitespace-nowrap">{cfg.label}</span>
      {/* Manual-replay affordance when there are pending items and we're online */}
      {status === 'offline' && effectivelyOnline && (
        <RefreshCw size={10} className="flex-shrink-0 opacity-75" />
      )}
    </button>
  );

  // ── User badge ──────────────────────────────────────────────────────────────
  const userBadge = currentUser ? (
    <div className="flex flex-shrink-0 items-center gap-2.5">
      <div className="hidden px-3.5 py-2 rounded-xl bg-[#13151F] border border-white/15 lg:flex items-center gap-2.5 shadow-md">
        <span className="text-sm font-black text-white tracking-wide">{currentUser.name}</span>
        <span
          className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/40"
        >
          {ROLE_LABEL[currentUser.role]}
        </span>
      </div>
      <button
        onClick={handleSwitchUser}
        title="Switch User"
          className="px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500 hover:text-slate-950 active:bg-amber-600 border border-amber-500/40 text-amber-300 text-xs font-black uppercase tracking-wider shadow-md transition-all active:scale-95 flex items-center gap-1.5"
      >
        <LogOut size={13} />
        <span className="hidden 2xl:inline">Switch User</span>
      </button>
    </div>
  ) : null;

  // ── Nav tab renderer (desktop inline) ──────────────────────────────────────
  const desktopNav = (
    <nav
      className="bg-[#13151F] border border-white/15 p-1.5 rounded-2xl shadow-2xl shadow-black/60 flex items-center gap-1.5"
    >
      {navItems.map(({ path, label, icon }) => {
        const active = location.pathname === path;
        return (
          <button
            key={path}
               onClick={() => navigate(path === '/admin' && currentUser?.role === 'MANAGER' ? getFirstPermittedManagementRoute(currentUser.permissions) : path)}
            data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
             className={`group relative flex items-center gap-2 rounded-xl text-sm whitespace-nowrap select-none ${
                 active
                  ? currentUser?.role === 'MANAGER' && path === '/admin'
                    ? 'px-5 py-2.5 bg-cyan-500 text-slate-950 font-black tracking-wide shadow-lg shadow-cyan-500/35 border border-cyan-400 active:scale-95 transition-all flex items-center gap-2'
                    : 'px-5 py-2.5 bg-emerald-500 text-slate-950 font-black tracking-wide shadow-lg shadow-emerald-500/35 border border-emerald-400 active:scale-95 transition-all flex items-center gap-2'
                 : 'px-4 py-2.5 text-zinc-200 hover:text-white hover:bg-white/10 font-bold tracking-wide border border-transparent hover:border-white/10 active:scale-95 transition-all flex items-center gap-2'
             }`}
          >
             <span className={`w-4 h-4 ${active ? 'text-slate-950' : 'text-zinc-300 group-hover:text-white'} transition-colors`}>{icon}</span>
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
        <header className="flex-shrink-0 h-20 w-full bg-[#0A0B0E]/95 backdrop-blur-xl border-b border-white/15 px-6 flex items-center justify-between sticky top-0 z-40">
         {/* ── TABLET / DESKTOP: single row (lg+) ── */}
         <div className="hidden h-full w-full items-center justify-between gap-6 2xl:flex">
          {/* Left: brand */}
          {brandBlock}
          {/* Center: nav */}
          {desktopNav}
           {/* Right: sync + theme + user */}
           <div className="flex min-w-0 items-center justify-end gap-3">
            {isTrainingSession && (
              <span className="rounded-xl border border-amber-300/50 bg-amber-400/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-amber-200">
                Simulated Session
              </span>
            )}
            {syncButton}
            <ThemeToggle />
            {userBadge}
          </div>
        </div>

        {/* ── MOBILE: compact bar + slide-over drawer (<lg) ── */}
        <div className="sticky top-0 z-40 flex h-20 w-full items-center justify-between border-b border-white/15 bg-[#0A0B0E]/95 px-4 backdrop-blur-xl 2xl:hidden">
          <div className="flex min-w-0 items-center gap-2">
             <div className="w-[52px] h-[52px] sm:w-14 sm:h-14 rounded-2xl bg-white/[0.08] border-2 border-amber-500/40 p-1 flex items-center justify-center overflow-hidden shrink-0">
               <img src={logoSrc || '/logo.png'} alt="Restaurant Logo" className="w-full h-full rounded-xl object-contain drop-shadow-md" />
            </div>
             <div className="flex flex-col ml-1.5 select-none min-w-0">
               <span className="truncate text-sm sm:text-base font-black tracking-tight text-white leading-tight">
                 {settings?.cafeName || settings?.restaurantName || 'S Bamboo Cottage & Sekuwa Corner'}
               </span>
               <span className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-400 mt-0.5">POS Terminal</span>
                {isTrainingSession && (
                  <span className="mt-1 text-[8px] font-black uppercase tracking-wider text-amber-200">Training Sandbox</span>
                )}
             </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {syncButton}
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
        className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 2xl:hidden ${
          isMobileMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!isMobileMenuOpen}
        onClick={() => setIsMobileMenuOpen(false)}
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-[280px] flex-col justify-between border-l border-slate-200 bg-white p-5 shadow-2xl transition-transform duration-300 ease-in-out dark:border-white/10 dark:bg-[#12141D] sm:w-[320px] 2xl:hidden ${
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
