import { useState, useRef } from 'react';
import { usePOSStore } from '@/store/usePOSStore';
import { useStaffStore } from '@/store/useStaffStore';
import AppLayout from '@/components/ui/AppLayout';
import ReceiptPreview from '@/components/ReceiptPreview';
import { InventorySection } from '@/screens/InventorySection';
import StaffManagement from '@/screens/admin/StaffManagement';
import { toast } from 'sonner';
import {
  BarChart3, Coffee, CreditCard, Table2, TrendingUp, FileDown,
  Plus, Trash2, Edit3, Save, X, Lock, DollarSign, ShoppingCart,
  Download, Upload, Smartphone, ToggleLeft, ToggleRight,
  Receipt, ImagePlus, Image, Menu as MenuIcon, Users, Package,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Settings,
  Search, Printer, ArrowUp, ArrowDown,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { fmt, resolvePaymentLabel } from '@/utils/format';
import { format, startOfDay, subDays, startOfWeek, startOfMonth } from 'date-fns';
import { compareTableNames, tableDisplayName, tableNameKey } from '@/utils/tableName';

type AdminTab = 'dashboard' | 'menu' | 'tables' | 'settings' | 'reports' | 'backup' | 'inventory';
type SettingsSubTab = 'bill' | 'billing' | 'payments' | 'staff';

const SIDEBAR_BG = 'linear-gradient(180deg, #080f1e 0%, #040a14 100%)';
const ACTIVE_STYLE = {
  background: 'rgba(59,130,246,0.16)',
  border: '1px solid rgba(59,130,246,0.28)',
  boxShadow: '0 0 18px -4px rgba(59,130,246,0.3)',
};


const PageHeader = ({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) => (
  <div className="flex items-start justify-between mb-6 pb-5 border-b border-white/[0.06]">
    <div>
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
    {action && <div className="flex-shrink-0 ml-4">{action}</div>}
  </div>
);

const AdminPanel = () => {
  const currentUser = useStaffStore((s) => s.currentUser);
  const staffUsers  = useStaffStore((s) => s.users);

  // All hooks must be declared before any conditional return (Rules of Hooks)
  const [authenticated, setAuthenticated] = useState(currentUser?.role === 'ADMIN');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('bill');
  const settings = usePOSStore((s) => s.settings);

  // Hard RBAC guard — belt-and-suspenders on top of the route-level RequireAdmin.
  // Placed after all hooks so Rules of Hooks is satisfied.
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return null;
  }

  const handlePinSubmit = () => {
    if (staffUsers.some((u) => u.role === 'ADMIN' && u.pin === pin)) {
      setAuthenticated(true);
      setPinError(false);
    } else {
      setPinError(true);
      setPin('');
    }
  };

  if (!authenticated) {
    return (
      <AppLayout title="Admin Panel">
        <div className="flex-1 overflow-y-auto flex items-center justify-center p-8">
          <div
            className="w-full max-w-sm rounded-2xl border border-white/[0.08] p-8 space-y-5"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4">
                <Lock size={24} className="text-accent" />
              </div>
              <h2 className="text-lg font-bold text-foreground">Admin Access</h2>
              <p className="text-sm text-muted-foreground mt-1">Enter your PIN to continue</p>
            </div>
            <input
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => { setPin(e.target.value); setPinError(false); }}
              onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()}
              placeholder="••••••"
              data-testid="input-admin-pin"
              className="w-full text-center text-2xl tracking-[0.5em] px-4 py-3.5 rounded-xl bg-secondary border border-border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent h-14"
              autoFocus
            />
            {pinError && (
              <p className="text-danger text-sm text-center font-medium">Incorrect PIN. Try again.</p>
            )}
            <button
              onClick={handlePinSubmit}
              data-testid="button-unlock-admin"
              className="w-full py-3.5 rounded-xl bg-accent text-accent-foreground font-bold transition-all active:scale-[0.98] hover:brightness-110"
            >
              Unlock
            </button>
            <p className="text-xs text-muted-foreground text-center">Default PIN: 1234</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode; subtitle: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={15} />,  subtitle: 'Overview of your café performance' },
    { id: 'menu',      label: 'Menu',      icon: <Coffee size={15} />,     subtitle: 'Manage items and categories' },
    { id: 'tables',    label: 'Tables',    icon: <Table2 size={15} />,     subtitle: 'Add or remove tables' },
    { id: 'reports',   label: 'Reports',   icon: <TrendingUp size={15} />, subtitle: 'Sales reports and exports' },
    { id: 'inventory', label: 'Inventory', icon: <Package size={15} />,    subtitle: 'Stock management for alcohol, beverages, cigarettes & groceries' },
    { id: 'backup',    label: 'Backup',    icon: <FileDown size={15} />,   subtitle: 'Export, restore or reset data' },
    { id: 'settings',  label: 'Settings',  icon: <Settings size={15} />,   subtitle: 'Company profile, payments, and staff management' },
  ];

  const active = tabs.find((t) => t.id === activeTab)!;

  return (
    <AppLayout title="Admin Panel">
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── Mobile backdrop ── */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm sm:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar ── */}
        <aside
          className={`
            flex-shrink-0 flex flex-col border-r border-white/[0.06] z-50
            fixed sm:static inset-y-0 left-0
            w-52
            transition-transform duration-300 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'}
          `}
          style={{ background: SIDEBAR_BG }}
        >
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto pt-5">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setSidebarOpen(false); }}
                  data-testid={`tab-admin-${tab.id}`}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                    isActive
                      ? 'text-white'
                      : 'text-white/40 hover:text-white/72 hover:bg-white/[0.05]'
                  }`}
                  style={isActive ? ACTIVE_STYLE : {}}
                >
                  <span className={isActive ? 'text-blue-400' : ''}>{tab.icon}</span>
                  {tab.label}
                </button>
              );
            })}
          </nav>
          <div className="p-4 border-t border-white/[0.05]">
            <p className="text-[10px] text-white/20 uppercase tracking-widest font-semibold">Café POS</p>
          </div>
        </aside>

        {/* ── Main content ── */}
        <div className="flex-1 overflow-y-auto min-w-0">
          {/* Mobile tab-bar header */}
          <div
            className="sm:hidden flex items-center gap-3 px-4 py-3 sticky top-0 z-30 border-b border-white/[0.06]"
            style={{ background: 'rgba(6,14,26,0.95)', backdropFilter: 'blur(12px)' }}
          >
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/8 transition-colors"
            >
              <MenuIcon size={18} />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-blue-400">{active.icon}</span>
              <p className="text-sm font-semibold text-foreground">{active.label}</p>
            </div>
          </div>

          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
            <div className="hidden sm:block">
              <PageHeader title={active.label} subtitle={active.subtitle} />
            </div>
            {activeTab === 'dashboard' && <DashboardSection />}
            {activeTab === 'menu'      && <MenuSection />}
            {activeTab === 'tables'    && <TablesSection />}
            {activeTab === 'reports'   && <ReportsSection />}
            {activeTab === 'inventory' && <InventorySection />}
            {activeTab === 'backup'    && <BackupSection />}
            {activeTab === 'settings'  && (
              <div className="space-y-6">
                {/* Sub-tab pills */}
                <div className="flex gap-2 flex-wrap">
                  {([
                    { id: 'bill',     label: 'Company Profile' },
                    { id: 'billing',  label: 'Billing & Receipts' },
                    { id: 'payments', label: 'Payments' },
                    { id: 'staff',    label: 'Staff & Users' },
                  ] as { id: SettingsSubTab; label: string }[]).map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => setSettingsSubTab(sub.id)}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                        settingsSubTab === sub.id
                          ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                          : 'border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.05]'
                      }`}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
                {/* Sub-tab content */}
                {settingsSubTab === 'bill'     && <CompanyProfileSection />}
                {settingsSubTab === 'billing'  && <BillingReceiptsSection />}
                {settingsSubTab === 'payments' && <PaymentsSection />}
                {settingsSubTab === 'staff'    && <StaffManagement />}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

// ── DASHBOARD ──────────────────────────────────────────────────────────────
const DONUT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899'];

const DashboardSection = () => {
  const payments = usePOSStore((s) => s.payments);
  const tables   = usePOSStore((s) => s.tables);
  const orders   = usePOSStore((s) => s.orders);
  const now = new Date();
  const todayStart     = startOfDay(now).getTime();
  const yesterdayStart = startOfDay(subDays(now, 1)).getTime();

  const todayPayments     = payments.filter((p) => p.createdAt >= todayStart);
  const yesterdayPayments = payments.filter((p) => p.createdAt >= yesterdayStart && p.createdAt < todayStart);

  const todaySales      = todayPayments.reduce((s, p) => s + p.total, 0);
  const yesterdaySales  = yesterdayPayments.reduce((s, p) => s + p.total, 0);
  const todayOrders     = todayPayments.length;
  const yesterdayOrders = yesterdayPayments.length;
  const todayAOV        = todayOrders > 0 ? todaySales / todayOrders : 0;
  const yesterdayAOV    = yesterdayOrders > 0 ? yesterdaySales / yesterdayOrders : 0;
  const cashToday       = todayPayments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.total, 0);
  // FIX: when no revenue, both shares are 0 — not 100%
  const cashRatio       = todaySales > 0 ? (cashToday / todaySales) * 100 : 0;
  const digitalShare    = todaySales > 0 ? Math.round(100 - cashRatio) : 0;

  // Live operational counts
  const activeTables = tables.filter((t) => t.status !== 'free').length;
  const openOrders   = orders.filter((o) => o.status === 'active' || o.status === 'billed').length;

  const pctChange = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };

  // FIX: 0% → neutral slate; >0 → green; <0 → red
  const TrendBadge = ({ curr, prev }: { curr: number; prev: number }) => {
    const pct = pctChange(curr, prev);
    const cls =
      pct > 0  ? 'bg-emerald-500/15 text-emerald-400' :
      pct < 0  ? 'bg-red-500/15 text-red-400'         :
                 'bg-slate-800 text-slate-400';
    return (
      <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
        {pct > 0 && <ArrowUp size={10} />}
        {pct < 0 && <ArrowDown size={10} />}
        {Math.abs(pct)}%
      </span>
    );
  };

  // Hourly revenue data 10 AM – 10 PM
  const hourlyData = Array.from({ length: 13 }, (_, i) => {
    const hour   = 10 + i;
    const hStart = new Date(now); hStart.setHours(hour, 0, 0, 0);
    const hEnd   = new Date(now); hEnd.setHours(hour + 1, 0, 0, 0);
    const sales  = todayPayments
      .filter((p) => p.createdAt >= hStart.getTime() && p.createdAt < hEnd.getTime())
      .reduce((s, p) => s + p.total, 0);
    const label  = hour === 12 ? '12P' : hour < 12 ? `${hour}A` : `${hour - 12}P`;
    return { hour: label, sales };
  });

  // Top selling items with progress bar
  const itemCounts: Record<string, { name: string; count: number }> = {};
  todayPayments.forEach((p) =>
    p.items.forEach((i) => {
      if (!itemCounts[i.menuItemId]) itemCounts[i.menuItemId] = { name: i.name, count: 0 };
      itemCounts[i.menuItemId].count += i.quantity;
    })
  );
  const topItems = Object.values(itemCounts).sort((a, b) => b.count - a.count).slice(0, 5);
  const maxCount = topItems[0]?.count || 1;

  // Compact Rs. formatter for Y-axis ticks
  const yAxisFmt = (v: number) => {
    if (v === 0) return '';
    if (v >= 1000) return `Rs.${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
    return `Rs.${v}`;
  };

  return (
    <div className="space-y-5">
      {/* ── Live status bar ── */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-800/80 bg-slate-900/50 text-xs text-muted-foreground"
      >
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="font-semibold text-emerald-400">Live Café Status</span>
        <span className="text-slate-600">·</span>
        <span><span className="font-semibold text-foreground">{activeTables}</span> Active Table{activeTables !== 1 ? 's' : ''}</span>
        <span className="text-slate-600">·</span>
        <span><span className="font-semibold text-foreground">{openOrders}</span> Open Order{openOrders !== 1 ? 's' : ''}</span>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Revenue */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-md p-4 hover:border-slate-700 hover:border-blue-500/30 hover:shadow-[0_0_20px_-4px_rgba(59,130,246,0.25)] transition-all cursor-default">
          <div className="flex items-start justify-between mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <DollarSign size={14} className="text-blue-400" />
            </div>
            <TrendBadge curr={todaySales} prev={yesterdaySales} />
          </div>
          <p className="text-2xl font-bold text-foreground leading-tight">Rs. {fmt(todaySales)}</p>
          <p className="text-xs text-muted-foreground mt-1">Today's Revenue</p>
        </div>

        {/* Orders */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-md p-4 hover:border-slate-700 hover:border-emerald-500/30 hover:shadow-[0_0_20px_-4px_rgba(16,185,129,0.25)] transition-all cursor-default">
          <div className="flex items-start justify-between mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <ShoppingCart size={14} className="text-emerald-400" />
            </div>
            <TrendBadge curr={todayOrders} prev={yesterdayOrders} />
          </div>
          <p className="text-2xl font-bold text-foreground leading-tight">{todayOrders}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Orders Today</p>
        </div>

        {/* AOV */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-md p-4 hover:border-slate-700 hover:border-amber-500/30 hover:shadow-[0_0_20px_-4px_rgba(245,158,11,0.25)] transition-all cursor-default">
          <div className="flex items-start justify-between mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <TrendingUp size={14} className="text-amber-400" />
            </div>
            <TrendBadge curr={todayAOV} prev={yesterdayAOV} />
          </div>
          <p className="text-2xl font-bold text-foreground leading-tight">Rs. {fmt(Math.round(todayAOV))}</p>
          <p className="text-xs text-muted-foreground mt-1">Avg. Order Value</p>
        </div>

        {/* Cash vs Digital — FIX: show 0% digital when revenue is zero */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-md p-4 hover:border-slate-700 hover:border-purple-500/30 hover:shadow-[0_0_20px_-4px_rgba(168,85,247,0.25)] transition-all cursor-default">
          <div className="flex items-start justify-between mb-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <CreditCard size={14} className="text-purple-400" />
            </div>
            <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
              {todaySales > 0 ? `${Math.round(cashRatio)}%` : '0%'} Cash
            </span>
          </div>
          <p className="text-2xl font-bold text-foreground leading-tight">{digitalShare}%</p>
          <p className="text-xs text-muted-foreground mt-1">Digital Share</p>
          <div className="mt-2.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${cashRatio}%`, background: 'linear-gradient(90deg,#f59e0b,#8b5cf6)' }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            <span>Cash</span><span>Digital</span>
          </div>
        </div>
      </div>

      {/* ── Main grid: peak hours + top items ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[65%_1fr] gap-4">
        {/* Peak hours bar chart — Y-axis shows Rs. revenue */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-md p-5">
          <h3 className="font-semibold text-foreground">Today's Peak Hours</h3>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">Hourly revenue (Rs.) — 10 AM to 10 PM</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourlyData} barSize={16} margin={{ top: 4, right: 4, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="peakGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(59,130,246,0.9)" />
                  <stop offset="100%" stopColor="rgba(99,102,241,0.45)" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="hour" stroke="rgba(255,255,255,0.22)" fontSize={11} tickLine={false} axisLine={false} />
              {/* FIX: Y-axis values formatted as Rs. */}
              <YAxis stroke="rgba(255,255,255,0.22)" fontSize={10} tickLine={false} axisLine={false} width={56} tickFormatter={yAxisFmt} />
              <Tooltip
                contentStyle={{ background: '#0d1525', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 12 }}
                formatter={(v: number) => [`Rs. ${fmt(v)}`, 'Revenue']}
              />
              <Bar dataKey="sales" fill="url(#peakGrad)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top selling items */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-md p-5">
          <h3 className="font-semibold text-foreground mb-4">Top Selling Items</h3>
          {topItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-3">
                <ShoppingCart size={20} className="opacity-25" />
              </div>
              <p className="text-sm font-medium">No sales today yet</p>
              <p className="text-xs opacity-50 mt-0.5">Items appear after orders close</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {topItems.map((item, i) => {
                const pct = Math.round((item.count / maxCount) * 100);
                return (
                  <div key={i}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-5 h-5 rounded-md bg-blue-500/15 text-blue-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{i + 1}</span>
                      <span className="flex-1 text-sm text-foreground font-medium truncate">{item.name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{item.count} sold</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden ml-7">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: `linear-gradient(90deg,${DONUT_COLORS[i % DONUT_COLORS.length]},${DONUT_COLORS[(i + 1) % DONUT_COLORS.length]})` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── HELPERS ──────────────────────────────────────────────────────────────
const compressImage = (file: File, maxPx = 400): Promise<string> =>
  new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = maxPx;
      canvas.height = maxPx;
      const ctx = canvas.getContext('2d')!;
      const srcSize = Math.min(img.width, img.height);
      const sx = (img.width - srcSize) / 2;
      const sy = (img.height - srcSize) / 2;
      ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, maxPx, maxPx);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = url;
  });

const ItemImageField = ({
  image,
  onChange,
  onRemove,
}: {
  image?: string;
  onChange: (dataUrl: string) => void;
  onRemove: () => void;
}) => {
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const compressed = await compressImage(file);
    onChange(compressed);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="flex items-center gap-3">
      <label
        className={`relative w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer overflow-hidden transition-colors flex-shrink-0
          ${dragging ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50 bg-secondary/50'}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {image ? (
          <img src={image} alt="Item" className="w-full h-full object-cover" />
        ) : (
          <Image size={20} className="text-muted-foreground" />
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium cursor-pointer hover:bg-accent/15 hover:text-accent transition-colors">
          <Upload size={12} /> {image ? 'Replace' : 'Upload'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </label>
        {image && (
          <button
            onClick={onRemove}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-danger/70 hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <X size={12} /> Remove
          </button>
        )}
      </div>
    </div>
  );
};

// ── CONFIRM MODAL ────────────────────────────────────────────────────────

type ConfirmModalState = {
  open: boolean;
  title: string;
  description: string;
  warning?: string;
  onConfirm: () => void;
};

const MODAL_CLOSED: ConfirmModalState = { open: false, title: '', description: '', onConfirm: () => {} };

const ConfirmModal = ({ state, onCancel }: { state: ConfirmModalState; onCancel: () => void }) => {
  if (!state.open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-xl p-6 space-y-4 shadow-2xl"
        style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            <Trash2 size={15} style={{ color: 'rgba(239,68,68,0.85)' }} />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">{state.title}</h3>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {state.description}
            </p>
          </div>
        </div>
        {state.warning && (
          <div
            className="px-3 py-2.5 rounded-lg text-xs leading-relaxed"
            style={{
              background: 'rgba(251,146,60,0.08)',
              border: '1px solid rgba(251,146,60,0.22)',
              color: 'rgba(251,191,36,0.85)',
            }}
          >
            ⚠ {state.warning}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all hover:brightness-110"
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={state.onConfirm}
            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all hover:brightness-110 active:scale-95"
            style={{
              background: 'rgba(239,68,68,0.15)',
              color: 'rgba(239,68,68,0.95)',
              border: '1px solid rgba(239,68,68,0.3)',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

// ── MENU MANAGEMENT ──────────────────────────────────────────────────────

const MenuSection = () => {
  const pillars = usePOSStore((s) => s.pillars);
  const addPillar = usePOSStore((s) => s.addPillar);
  const renamePillar = usePOSStore((s) => s.renamePillar);
  const deletePillar = usePOSStore((s) => s.deletePillar);
  const categories = usePOSStore((s) => s.categories);
  const menuItems = usePOSStore((s) => s.menuItems);
  const addCategory = usePOSStore((s) => s.addCategory);
  const updateCategory = usePOSStore((s) => s.updateCategory);
  const deleteCategory = usePOSStore((s) => s.deleteCategory);
  const addMenuItem = usePOSStore((s) => s.addMenuItem);
  const updateMenuItem = usePOSStore((s) => s.updateMenuItem);
  const deleteMenuItem = usePOSStore((s) => s.deleteMenuItem);

  const [pillarFilter, setPillarFilter] = useState<string>('All');
  const [showAddCat, setShowAddCat] = useState(false);
  const [addMode, setAddMode] = useState<'sub' | 'pillar'>('sub');
  const [newCat, setNewCat] = useState('');
  const [newCatParent, setNewCatParent] = useState<string>(pillars[0] || 'Foods');
  const [editCat, setEditCat] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatParent, setEditCatParent] = useState<string>('');
  const [selectedCat, setSelectedCat] = useState(categories[0]?.id || '');

  // Pillar rename state
  const [editPillar, setEditPillar] = useState(false);
  const [editPillarName, setEditPillarName] = useState('');

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(MODAL_CLOSED);
  const closeModal = () => setConfirmModal(MODAL_CLOSED);

  const filteredCats = pillarFilter === 'All'
    ? categories
    : categories.filter((c) => c.parentCategory === pillarFilter);

  const isDeletablePillar = pillarFilter !== 'All';

  const handleSetPillarFilter = (f: string) => {
    setPillarFilter(f);
    setEditPillar(false);
    if (f !== 'All') setNewCatParent(f);
    // Keep selection valid — if selected cat is no longer in view, pick first visible
    const inView = f === 'All' ? categories : categories.filter((c) => c.parentCategory === f);
    if (!inView.find((c) => c.id === selectedCat)) {
      setSelectedCat(inView[0]?.id || '');
    }
  };

  const handleDeletePillar = () => {
    if (!isDeletablePillar) return;
    const hasCats = filteredCats.length > 0;
    const hasItems = hasCats && menuItems.some((i) => filteredCats.some((c) => c.id === i.categoryId));
    setConfirmModal({
      open: true,
      title: `Delete "${pillarFilter}" Category?`,
      description: `Are you sure you want to remove "${pillarFilter}" from your menu?`,
      warning: hasCats
        ? `This section contains active sub-categories${hasItems ? ' or items' : ''}. Deleting it will unassign them.`
        : undefined,
      onConfirm: () => {
        deletePillar(pillarFilter);
        setPillarFilter('All');
        closeModal();
        toast.success(`"${pillarFilter}" removed`);
      },
    });
  };

  const handleRenamePillar = () => {
    const name = editPillarName.trim();
    if (!name || name === pillarFilter) { setEditPillar(false); return; }
    renamePillar(pillarFilter, name);
    setPillarFilter(name);
    setEditPillar(false);
    toast.success(`Pillar renamed to "${name}"`);
  };

  const handleAddPillar = () => {
    if (!newCat.trim()) return;
    const name = newCat.trim();
    addPillar(name);
    setPillarFilter(name);
    setNewCatParent(name);
    setNewCat('');
    setShowAddCat(false);
    toast.success(`Pillar "${name}" added`);
  };

  const handleAddSubCategory = () => {
    if (!newCat.trim()) return;
    addCategory(newCat.trim(), newCatParent);
    setNewCat('');
    setShowAddCat(false);
    toast.success('Category added');
  };
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemImage, setItemImage] = useState<string | undefined>(undefined);
  const [editItem, setEditItem] = useState<string | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');
  const [editItemImage, setEditItemImage] = useState<string | undefined>(undefined);

  const catItems = menuItems.filter((i) => i.categoryId === selectedCat);
  const selectedCatName = categories.find((c) => c.id === selectedCat)?.name || '';

  const handleAddItem = () => {
    if (itemName.trim() && Number(itemPrice) > 0 && selectedCat) {
      addMenuItem({ categoryId: selectedCat, name: itemName.trim(), price: Number(itemPrice), image: itemImage });
      setItemName(''); setItemPrice(''); setItemImage(undefined); setShowAddItem(false);
      toast.success('Item added');
    }
  };

  const handleSaveEdit = () => {
    if (!editItem) return;
    updateMenuItem(editItem, { name: editItemName, price: Number(editItemPrice), image: editItemImage });
    setEditItem(null);
    toast.success('Item updated');
  };

  const startEdit = (item: typeof catItems[0]) => {
    setEditItem(item.id);
    setEditItemName(item.name);
    setEditItemPrice(String(item.price));
    setEditItemImage(item.image);
  };

  return (
    <>
    <div className="grid md:grid-cols-[280px_1fr] gap-5">
      {/* ── Left: Categories ── */}
      <div className="space-y-3 md:sticky md:top-0 md:self-start">
        <div className="bg-card rounded-2xl border border-border p-4">
          {/* ── Header row ── */}
          <div className="mb-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground text-sm">Categories</h3>
              {/* + Add Category always visible */}
              <button
                onClick={() => { setShowAddCat((v) => !v); setNewCat(''); }}
                data-testid="button-toggle-add-category"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                style={showAddCat ? {
                  background: 'rgba(59,130,246,0.22)',
                  color: 'rgba(147,197,253,0.95)',
                  border: '1px solid rgba(59,130,246,0.35)',
                } : {
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.5)',
                  border: '1px solid rgba(255,255,255,0.09)',
                }}
              >
                <Plus size={11} strokeWidth={2.5} />
                Add Category
              </button>
            </div>

            {/* Pillar action row — only when a specific pillar tab is active */}
            {isDeletablePillar && !editPillar && (
              <div className="flex items-center gap-2 mt-2.5">
                <button
                  onClick={() => { setEditPillar(true); setEditPillarName(pillarFilter); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 hover:brightness-110"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <Edit3 size={11} strokeWidth={2} />
                  Rename
                </button>
                <button
                  onClick={handleDeletePillar}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 hover:brightness-110"
                  style={{ background: 'rgba(239,68,68,0.07)', color: 'rgba(239,68,68,0.7)', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  <Trash2 size={11} strokeWidth={2} />
                  Delete
                </button>
              </div>
            )}

            {/* Inline pillar rename form */}
            {isDeletablePillar && editPillar && (
              <div className="flex items-center gap-2 mt-2.5 p-2.5 rounded-lg" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.18)' }}>
                <input
                  value={editPillarName}
                  onChange={(e) => setEditPillarName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenamePillar();
                    if (e.key === 'Escape') setEditPillar(false);
                  }}
                  autoFocus
                  placeholder="New name"
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-secondary border border-accent/40 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  onClick={handleRenamePillar}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 hover:brightness-110"
                  style={{ background: 'rgba(34,197,94,0.15)', color: 'rgba(74,222,128,0.9)', border: '1px solid rgba(34,197,94,0.25)' }}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditPillar(false)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:brightness-110"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* ── Inline add form (toggleable) ── */}
          {showAddCat && (
            <div className="mb-3 p-3 rounded-xl border border-accent/25 space-y-2" style={{ background: 'rgba(59,130,246,0.06)' }}>
              {/* Mode toggle */}
              <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'rgba(0,0,0,0.25)' }}>
                {(['sub', 'pillar'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => { setAddMode(mode); setNewCat(''); }}
                    className="flex-1 py-1 rounded-md text-[11px] font-semibold transition-all"
                    style={addMode === mode ? {
                      background: 'rgba(59,130,246,0.35)',
                      color: 'rgba(255,255,255,0.95)',
                    } : {
                      color: 'rgba(255,255,255,0.38)',
                    }}
                  >
                    {mode === 'sub' ? 'Sub-Category' : 'Main Category'}
                  </button>
                ))}
              </div>

              <input
                key={addMode}
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newCat.trim()) {
                    if (addMode === 'pillar') handleAddPillar();
                    else handleAddSubCategory();
                  }
                  if (e.key === 'Escape') { setShowAddCat(false); setNewCat(''); }
                }}
                placeholder={addMode === 'pillar' ? 'New pillar name (e.g. Desserts)' : 'Sub-category name'}
                autoFocus
                data-testid="input-new-category"
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              />

              <div className="flex gap-1.5">
                {addMode === 'sub' && (
                  <select
                    value={newCatParent}
                    onChange={(e) => setNewCatParent(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {pillars.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                )}
                <button
                  onClick={addMode === 'pillar' ? handleAddPillar : handleAddSubCategory}
                  data-testid="button-add-category"
                  className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-semibold hover:brightness-110 transition-all active:scale-95"
                >Add</button>
                <button
                  onClick={() => { setShowAddCat(false); setNewCat(''); }}
                  className="px-2.5 py-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                ><X size={13} /></button>
              </div>
            </div>
          )}

          {/* ── Pillar filter tabs — single row, no wrap ── */}
          <div className="flex flex-nowrap gap-1 mb-3 overflow-x-auto no-scrollbar">
            {(['All', ...pillars]).map((f) => (
              <button
                key={f}
                onClick={() => handleSetPillarFilter(f)}
                className="flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all"
                style={pillarFilter === f ? {
                  background: 'rgba(59,130,246,0.22)',
                  color: 'rgba(255,255,255,0.9)',
                  border: '1px solid rgba(59,130,246,0.35)',
                } : {
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.38)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* ── Category list ── */}
          <div className="space-y-1 mb-4">
            {filteredCats.map((c) => (
              <div key={c.id}>
                {editCat === c.id ? (
                  <div className="space-y-1.5 px-2 py-2 rounded-lg bg-secondary border border-accent/30">
                    <input
                      value={editCatName}
                      onChange={(e) => setEditCatName(e.target.value)}
                      className="bg-transparent text-sm w-full focus:outline-none text-foreground"
                      autoFocus
                    />
                    <div className="flex items-center gap-1.5">
                      <select
                        value={editCatParent}
                        onChange={(e) => setEditCatParent(e.target.value)}
                        className="flex-1 px-2 py-1 rounded bg-background border border-border text-foreground text-xs focus:outline-none"
                      >
                        <option value="">— no pillar —</option>
                        {pillars.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <button onClick={() => { updateCategory(c.id, { name: editCatName, parentCategory: editCatParent || undefined }); setEditCat(null); toast.success('Category updated'); }} className="text-success hover:opacity-80"><Save size={12} /></button>
                      <button onClick={() => setEditCat(null)} className="text-muted-foreground hover:text-foreground"><X size={12} /></button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`flex items-start justify-between px-3 py-2 rounded-xl cursor-pointer transition-all group ${
                      selectedCat === c.id
                        ? 'text-white'
                        : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                    }`}
                    style={selectedCat === c.id ? ACTIVE_STYLE : {}}
                    onClick={() => setSelectedCat(c.id)}
                  >
                    <div className="flex-1 min-w-0 mr-1">
                      <span className="text-sm font-medium break-words leading-snug">{c.name}</span>
                      {c.parentCategory && (
                        <span className="block text-[10px] mt-0.5 font-semibold" style={{ color: 'rgba(147,197,253,0.55)' }}>
                          {c.subGroup ? `${c.parentCategory} • ${c.subGroup}` : c.parentCategory}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                      {/* KOT toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateCategory(c.id, { sendToKitchen: !c.sendToKitchen });
                        }}
                        title={c.sendToKitchen ? 'KOT: ON — sends to kitchen' : 'KOT: OFF — counter/bar item'}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold transition-all"
                        style={
                          c.sendToKitchen
                            ? { background: 'rgba(251,146,60,0.18)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.35)' }
                            : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.22)', border: '1px solid rgba(255,255,255,0.08)' }
                        }
                      >
                        {c.sendToKitchen ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                        <span>KOT</span>
                      </button>
                      {/* Edit / Delete — reveal on hover */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditCat(c.id); setEditCatName(c.name); setEditCatParent(c.parentCategory || ''); }}
                          className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white"
                        ><Edit3 size={11} /></button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmModal({
                              open: true,
                              title: `Delete "${c.name}"`,
                              description: `This will permanently remove the "${c.name}" sub-category.`,
                              onConfirm: () => { deleteCategory(c.id); closeModal(); toast.success('Category deleted'); },
                            });
                          }}
                          className="p-1 rounded hover:bg-danger/20 text-white/40 hover:text-danger"
                        ><Trash2 size={11} /></button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {filteredCats.length === 0 && (
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground">
                  {pillarFilter === 'All' ? 'No categories yet.' : `No categories in ${pillarFilter} yet.`}
                </p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Right: Menu Items ── */}
      <div className="space-y-4">
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-foreground">
                {selectedCatName ? `${selectedCatName} Items` : 'Menu Items'}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">{catItems.length} item{catItems.length !== 1 ? 's' : ''}</p>
            </div>
            <button
              onClick={() => { setShowAddItem(!showAddItem); setItemName(''); setItemPrice(''); setItemImage(undefined); }}
              data-testid="button-toggle-add-item"
              className="px-3.5 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-semibold flex items-center gap-1.5 hover:brightness-110 transition-all active:scale-95"
            >
              <Plus size={14} /> Add Item
            </button>
          </div>

          {showAddItem && (
            <div className="mb-4 p-4 bg-secondary/40 rounded-xl border border-white/[0.07] space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Item</p>
              <ItemImageField image={itemImage} onChange={setItemImage} onRemove={() => setItemImage(undefined)} />
              <div className="flex gap-2">
                <input
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
                  placeholder="Item name"
                  data-testid="input-item-name"
                  className="flex-1 px-3 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <input
                  value={itemPrice}
                  onChange={(e) => setItemPrice(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
                  placeholder="Price"
                  type="number"
                  data-testid="input-item-price"
                  className="w-24 px-3 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  onClick={handleAddItem}
                  data-testid="button-add-item-confirm"
                  className="px-4 py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:brightness-110 transition-all active:scale-95"
                >Add</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {catItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-white/[0.06] overflow-hidden"
                data-testid={`menu-item-row-${item.id}`}
              >
                {editItem === item.id ? (
                  <div className="p-3 space-y-3 bg-secondary/30">
                    <ItemImageField image={editItemImage} onChange={setEditItemImage} onRemove={() => setEditItemImage(undefined)} />
                    <div className="flex gap-2 items-center">
                      <input value={editItemName} onChange={(e) => setEditItemName(e.target.value)} className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
                      <input value={editItemPrice} onChange={(e) => setEditItemPrice(e.target.value)} type="number" className="w-24 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
                      <button onClick={handleSaveEdit} className="p-2 rounded-lg bg-success/15 text-success hover:bg-success/25 transition-colors"><Save size={15} /></button>
                      <button onClick={() => setEditItem(null)} className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"><X size={15} /></button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3.5 px-4 py-3 bg-secondary/20 hover:bg-secondary/40 transition-colors group">
                    {item.image && (
                      <img src={item.image} alt={item.name} className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Rs. {fmt(item.price)}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(item)} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors"><Edit3 size={14} /></button>
                      <button
                        onClick={() => setConfirmModal({
                          open: true,
                          title: `Delete "${item.name}"`,
                          description: `This will permanently remove "${item.name}" from the menu.`,
                          onConfirm: () => { deleteMenuItem(item.id); closeModal(); toast.success('Item deleted'); },
                        })}
                        className="p-2 rounded-lg text-danger/50 hover:text-danger hover:bg-danger/10 transition-colors"
                      ><Trash2 size={14} /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {catItems.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <Coffee size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium">No items in this category</p>
                <p className="text-xs mt-1 opacity-60">Click "Add Item" to get started</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    <ConfirmModal state={confirmModal} onCancel={closeModal} />
    </>
  );
};

// ── TABLE MANAGEMENT ──────────────────────────────────────────────────────

/** Build an ordered, deduplicated area list: areaOrder first, then any table sections not yet in it. */
function buildAreaList(areaOrder: string[], tables: { section?: string }[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of [...areaOrder, ...tables.map((t) => t.section?.trim() || 'Ground Floor')]) {
    const key = name.trim();
    if (key && !seen.has(key)) { seen.add(key); result.push(key); }
  }
  return result;
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  free:    { label: 'Free',     color: 'text-green-400', bg: 'bg-green-500/12 border-green-500/25' },
  active:  { label: 'Occupied', color: 'text-blue-400',  bg: 'bg-blue-500/12  border-blue-500/25' },
  billing: { label: 'Billing',  color: 'text-amber-400', bg: 'bg-amber-500/12 border-amber-500/25' },
};

const TablesSection = () => {
  const tables      = usePOSStore((s) => s.tables);
  const addTable    = usePOSStore((s) => s.addTable);
  const updateTable = usePOSStore((s) => s.updateTable);
  const deleteTable = usePOSStore((s) => s.deleteTable);
  const areaOrder   = usePOSStore((s) => s.areaOrder);
  const setAreaOrder = usePOSStore((s) => s.setAreaOrder);

  // Per-area inline "add table" input values
  const [inlineNames, setInlineNames] = useState<Record<string, string>>({});

  // ── Area modals ──────────────────────────────
  const [addAreaOpen, setAddAreaOpen]     = useState(false);
  const [addAreaName, setAddAreaName]     = useState('');
  const [renamingArea, setRenamingArea]   = useState<string | null>(null);
  const [renameAreaVal, setRenameAreaVal] = useState('');
  const [deletingArea,  setDeletingArea]  = useState<string | null>(null);

  // ── Table modals ─────────────────────────────
  const [editingTableId,  setEditingTableId]  = useState<string | null>(null);
  const [editTableName,   setEditTableName]   = useState('');
  const [editTableSection,setEditTableSection]= useState('');
  const [deletingTableId, setDeletingTableId] = useState<string | null>(null);

  const editingTable  = tables.find((t) => t.id === editingTableId);
  const deletingTable = tables.find((t) => t.id === deletingTableId);

  // Canonical area list: persisted areaOrder + any table sections not yet in it
  const areas = buildAreaList(areaOrder, tables);

  const hasDuplicateName = (name: string, excludedId?: string) =>
    tables.some((t) => t.id !== excludedId && tableNameKey(t.number) === tableNameKey(name));

  // ── Area reordering ──────────────────────────
  const moveArea = (area: string, direction: 'up' | 'down') => {
    const list = [...areas];
    const idx  = list.indexOf(area);
    if (idx === -1) return;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    setAreaOrder(list);
  };

  // ── Area helpers ────────────────────────────
  const submitAddArea = () => {
    const name = addAreaName.trim();
    if (!name) return;
    if (areas.some((a) => a.toLowerCase() === name.toLowerCase())) {
      toast.error(`An area named "${name}" already exists.`);
      return;
    }
    setAreaOrder([...areas, name]);
    setAddAreaName('');
    setAddAreaOpen(false);
    toast.success(`Area "${name}" added`);
  };

  const submitRenameArea = () => {
    if (!renamingArea) return;
    const next = renameAreaVal.trim();
    if (!next) return;
    if (areas.some((a) => a !== renamingArea && a.toLowerCase() === next.toLowerCase())) {
      toast.error(`An area named "${next}" already exists.`);
      return;
    }
    // Update all tables that belong to the renamed area
    tables
      .filter((t) => (t.section?.trim() || 'Ground Floor') === renamingArea)
      .forEach((t) => updateTable(t.id, { section: next }));
    // Update persisted areaOrder
    setAreaOrder(areas.map((a) => (a === renamingArea ? next : a)));
    // Transfer inline input state
    setInlineNames((prev) => {
      const copy = { ...prev };
      if (renamingArea in copy) { copy[next] = copy[renamingArea]; delete copy[renamingArea]; }
      return copy;
    });
    toast.success(`Area renamed to "${next}"`);
    setRenamingArea(null);
  };

  const tablesInArea = (area: string) =>
    tables.filter((t) => (t.section?.trim() || 'Ground Floor') === area);

  const requestDeleteArea = (area: string) => {
    if (tablesInArea(area).length > 0) {
      toast.error('Remove all tables in this area before deleting it.');
      return;
    }
    setDeletingArea(area);
  };

  const confirmDeleteArea = () => {
    if (!deletingArea) return;
    setAreaOrder(areas.filter((a) => a !== deletingArea));
    setInlineNames((prev) => { const c = { ...prev }; delete c[deletingArea]; return c; });
    toast.success(`Area "${deletingArea}" deleted`);
    setDeletingArea(null);
  };

  // ── Table helpers ────────────────────────────
  const submitInlineTable = (area: string) => {
    const name = (inlineNames[area] ?? '').trim();
    if (!name) return;
    if (hasDuplicateName(name)) {
      toast.error(`A table named '${tableDisplayName(name)}' already exists.`);
      return;
    }
    addTable(name, area);
    setInlineNames((prev) => ({ ...prev, [area]: '' }));
    toast.success(`${tableDisplayName(name)} added to ${area}`);
  };

  const openEdit = (t: typeof tables[number]) => {
    if (t.status !== 'free') { toast.error('Cannot edit a table with an active order.'); return; }
    setEditingTableId(t.id);
    setEditTableName(t.number);
    setEditTableSection(t.section?.trim() || 'Ground Floor');
  };

  const saveEdit = () => {
    if (!editingTable) return;
    const name = editTableName.trim();
    if (!name) { toast.error('Table name cannot be empty.'); return; }
    if (hasDuplicateName(name, editingTable.id)) {
      toast.error(`A table named '${tableDisplayName(name)}' already exists.`);
      return;
    }
    updateTable(editingTable.id, { number: name, section: editTableSection || 'Ground Floor' });
    setEditingTableId(null);
    toast.success(`Table updated`);
  };

  const requestDeleteTable = (t: typeof tables[number]) => {
    if (t.status !== 'free') { toast.error('Cannot delete a table with an active order.'); return; }
    setDeletingTableId(t.id);
  };

  const confirmDeleteTable = () => {
    if (!deletingTable) return;
    deleteTable(deletingTable.id);
    toast.success(`${tableDisplayName(deletingTable.number)} removed`);
    setDeletingTableId(null);
  };

  return (
    <div className="space-y-4">
      {/* ── Top bar ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {tables.length} table{tables.length !== 1 ? 's' : ''} across {areas.length} area{areas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { setAddAreaName(''); setAddAreaOpen(true); }}
          data-testid="button-add-area"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:brightness-110 transition-all active:scale-95"
        >
          <Plus size={14} /> Add Area
        </button>
      </div>

      {/* ── Area containers ─────────────────────────────────────────── */}
      {areas.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <Table2 size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">No areas yet</p>
          <p className="text-xs mt-1 opacity-60">Click "+ Add Area" to get started</p>
        </div>
      )}

      {areas.map((area, areaIdx) => {
        const areaTablesSorted = tablesInArea(area)
          .slice()
          .sort((a, b) => compareTableNames(a.number, b.number));
        const isEmpty = areaTablesSorted.length === 0;
        const isFirst = areaIdx === 0;
        const isLast  = areaIdx === areas.length - 1;

        return (
          <div
            key={area}
            data-testid={`area-container-${area}`}
            className="rounded-2xl border border-border bg-card overflow-hidden"
          >
            {/* Area header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60 bg-white/[0.02]">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="font-semibold text-foreground text-sm truncate">{area}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full border border-border">
                  {areaTablesSorted.length} table{areaTablesSorted.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {/* Move up / down */}
                <button
                  onClick={() => moveArea(area, 'up')}
                  disabled={isFirst}
                  aria-label={`Move ${area} up`}
                  title="Move area up"
                  className="p-2 rounded-lg text-muted-foreground hover:text-accent hover:bg-accent/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={() => moveArea(area, 'down')}
                  disabled={isLast}
                  aria-label={`Move ${area} down`}
                  title="Move area down"
                  className="p-2 rounded-lg text-muted-foreground hover:text-accent hover:bg-accent/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronDown size={14} />
                </button>
                <span className="w-px h-4 bg-border/60 mx-1" />
                <button
                  onClick={() => { setRenamingArea(area); setRenameAreaVal(area); }}
                  aria-label={`Rename area ${area}`}
                  title="Rename area"
                  className="p-2 rounded-lg text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  onClick={() => requestDeleteArea(area)}
                  aria-label={`Delete area ${area}`}
                  title={isEmpty ? 'Delete area' : 'Remove all tables first'}
                  className={`p-2 rounded-lg transition-colors ${isEmpty ? 'text-danger/50 hover:text-danger hover:bg-danger/10' : 'text-muted-foreground/25 cursor-not-allowed'}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Table cards */}
            <div className="p-4">
              {areaTablesSorted.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-4">
                  {areaTablesSorted.map((t) => {
                    const cfg = STATUS_CFG[t.status] || STATUS_CFG.free;
                    return (
                      <div
                        key={t.id}
                        data-testid={`table-row-${t.id}`}
                        className="bg-background/50 rounded-xl border border-border/60 p-3.5 flex flex-col gap-2.5 hover:border-white/20 hover:shadow-md transition-all group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate font-semibold text-foreground text-sm leading-snug"
                              title={tableDisplayName(t.number)}
                            >
                              {tableDisplayName(t.number)}
                            </p>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border mt-1.5 ${cfg.bg} ${cfg.color}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                              {cfg.label}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEdit(t)}
                              disabled={t.status !== 'free'}
                              title={t.status !== 'free' ? 'Table has an active order' : 'Edit table'}
                              aria-label={`Edit ${tableDisplayName(t.number)}`}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-accent hover:bg-accent/10 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              onClick={() => requestDeleteTable(t)}
                              disabled={t.status !== 'free'}
                              title={t.status !== 'free' ? 'Table has an active order' : 'Delete table'}
                              aria-label={`Delete ${tableDisplayName(t.number)}`}
                              className="p-1.5 rounded-lg text-danger/40 hover:text-danger hover:bg-danger/10 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        {t.pax && t.pax > 0 && t.status !== 'free' && (
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Users size={11} />
                            {t.pax} guest{t.pax !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/50 italic mb-3">No tables in this area yet.</p>
              )}

              {/* Inline add table */}
              <div className="flex gap-2">
                <input
                  value={inlineNames[area] ?? ''}
                  onChange={(e) => setInlineNames((prev) => ({ ...prev, [area]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && submitInlineTable(area)}
                  type="text"
                  placeholder="Table name (e.g. 5, Cabin 2, VIP 2)"
                  data-testid={`input-table-name-${area}`}
                  className="flex-1 px-3 py-2 rounded-xl bg-secondary/60 border border-border text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent h-10"
                />
                <button
                  onClick={() => submitInlineTable(area)}
                  data-testid={`button-add-table-${area}`}
                  className="px-3.5 py-2 rounded-xl bg-accent/15 border border-accent/25 text-accent text-sm font-semibold flex items-center gap-1 hover:bg-accent/25 transition-all active:scale-95 h-10"
                >
                  <Plus size={13} /> Add
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* ── Add Area modal ───────────────────────────────────────────── */}
      <Dialog open={addAreaOpen} onOpenChange={(open) => !open && setAddAreaOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Seating Area</DialogTitle>
            <DialogDescription>Enter a name for the new area (e.g. "Rooftop", "Garden Patio").</DialogDescription>
          </DialogHeader>
          <input
            autoFocus
            value={addAreaName}
            onChange={(e) => setAddAreaName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitAddArea()}
            placeholder="Area name"
            data-testid="input-new-area-name"
            className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <DialogFooter>
            <button onClick={() => setAddAreaOpen(false)} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
            <button onClick={submitAddArea} data-testid="button-confirm-add-area" className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-semibold">Create</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Rename Area modal ────────────────────────────────────────── */}
      <Dialog open={Boolean(renamingArea)} onOpenChange={(open) => !open && setRenamingArea(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Area</DialogTitle>
            <DialogDescription>All tables in "{renamingArea}" will be updated to the new name.</DialogDescription>
          </DialogHeader>
          <input
            autoFocus
            value={renameAreaVal}
            onChange={(e) => setRenameAreaVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitRenameArea()}
            placeholder="New area name"
            className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <DialogFooter>
            <button onClick={() => setRenamingArea(null)} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
            <button onClick={submitRenameArea} className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-semibold">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Area confirm ──────────────────────────────────────── */}
      <AlertDialog open={Boolean(deletingArea)} onOpenChange={(open) => !open && setDeletingArea(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Area?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the area "{deletingArea}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteArea} className="bg-danger text-danger-foreground hover:bg-danger/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit Table modal ─────────────────────────────────────────── */}
      <Dialog open={Boolean(editingTable)} onOpenChange={(open) => !open && setEditingTableId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Table</DialogTitle>
            <DialogDescription>Rename the table or move it to a different area.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Table name</label>
              <input
                autoFocus
                value={editTableName}
                onChange={(e) => setEditTableName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                placeholder="Table name / number"
                data-testid="input-edit-table-name"
                className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Area</label>
              <Select value={editTableSection} onValueChange={setEditTableSection}>
                <SelectTrigger
                  data-testid="select-edit-table-section"
                  className="h-10 w-full rounded-xl border-border bg-secondary text-sm text-foreground"
                >
                  <SelectValue placeholder="Select area" />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setEditingTableId(null)} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
            <button onClick={saveEdit} className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-semibold">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Table confirm ─────────────────────────────────────── */}
      <AlertDialog open={Boolean(deletingTable)} onOpenChange={(open) => !open && setDeletingTableId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Table?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete '{deletingTable ? tableDisplayName(deletingTable.number) : ''}'? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteTable} className="bg-danger text-danger-foreground hover:bg-danger/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ── PAYMENT SETTINGS ──────────────────────────────────────────────────────
const PaymentsSection = () => {
  const settings = usePOSStore((s) => s.settings);
  const updateSettings = usePOSStore((s) => s.updateSettings);

  const [showAddWallet, setShowAddWallet] = useState(false);
  const [newWalletName, setNewWalletName] = useState('');

  const toggleWallet = (key: 'esewa' | 'khalti' | 'fonepay') => {
    updateSettings({
      wallets: {
        ...settings.wallets,
        [key]: { ...settings.wallets[key], enabled: !settings.wallets[key].enabled },
      },
    });
  };

  const updateWalletImage = (key: 'esewa' | 'khalti' | 'fonepay', field: 'qrImage' | 'logoImage', file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      updateSettings({ wallets: { ...settings.wallets, [key]: { ...settings.wallets[key], [field]: reader.result as string } } });
    };
    reader.readAsDataURL(file);
  };

  const clearWalletImage = (key: 'esewa' | 'khalti' | 'fonepay', field: 'qrImage' | 'logoImage') => {
    updateSettings({ wallets: { ...settings.wallets, [key]: { ...settings.wallets[key], [field]: undefined } } });
  };

  const addCustomWallet = () => {
    if (!newWalletName.trim()) return;
    const id = `custom-${Date.now()}`;
    const customWallets = [...(settings.customWallets || []), { id, name: newWalletName.trim(), enabled: true }];
    updateSettings({ customWallets });
    setNewWalletName('');
    setShowAddWallet(false);
    toast.success('Wallet added');
  };

  const removeCustomWallet = (id: string) => {
    const customWallets = (settings.customWallets || []).filter((w) => w.id !== id);
    updateSettings({ customWallets });
    toast.success('Wallet removed');
  };

  const toggleCustomWallet = (id: string) => {
    const customWallets = (settings.customWallets || []).map((w) =>
      w.id === id ? { ...w, enabled: !w.enabled } : w
    );
    updateSettings({ customWallets });
  };

  const updateCustomWalletImage = (id: string, field: 'qrImage' | 'logoImage', file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const customWallets = (settings.customWallets || []).map((w) =>
        w.id === id ? { ...w, [field]: reader.result as string } : w
      );
      updateSettings({ customWallets });
    };
    reader.readAsDataURL(file);
  };

  const clearCustomWalletImage = (id: string, field: 'qrImage' | 'logoImage') => {
    const customWallets = (settings.customWallets || []).map((w) =>
      w.id === id ? { ...w, [field]: undefined } : w
    );
    updateSettings({ customWallets });
  };

  const walletLabels: Record<string, string> = { esewa: 'eSewa', khalti: 'Khalti', fonepay: 'Fonepay' };

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">Digital Wallets</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Enable and configure payment wallets</p>
        </div>

        <div className="space-y-3">
          {(['esewa', 'khalti', 'fonepay'] as const).map((key) => (
            <div key={key} className="p-4 bg-secondary/40 rounded-xl border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{walletLabels[key]}</span>
                <button onClick={() => toggleWallet(key)} className="text-accent" data-testid={`toggle-wallet-${key}`}>
                  {settings.wallets[key].enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-muted-foreground" />}
                </button>
              </div>
              {settings.wallets[key].enabled && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Logo</p>
                    <div className="flex items-center gap-3">
                      {settings.wallets[key].logoImage ? (
                        <div className="relative w-12 h-12 flex-shrink-0">
                          <img src={settings.wallets[key].logoImage} alt={`${key} logo`} className="w-full h-full object-contain rounded-lg border border-border bg-white/5 p-1" />
                          <button onClick={() => clearWalletImage(key, 'logoImage')} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center"><X size={10} /></button>
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg border-2 border-dashed border-border flex items-center justify-center flex-shrink-0">
                          <ImagePlus size={16} className="text-muted-foreground" />
                        </div>
                      )}
                      <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium cursor-pointer hover:bg-accent/20 transition-colors">
                        <Upload size={12} /> {settings.wallets[key].logoImage ? 'Replace' : 'Upload'} Logo
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) updateWalletImage(key, 'logoImage', f); }} />
                      </label>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">QR Image</p>
                    {settings.wallets[key].qrImage && (
                      <div className="relative w-32 h-32 mx-auto">
                        <img src={settings.wallets[key].qrImage} alt={`${key} QR`} className="w-full h-full object-contain rounded-lg border border-border bg-foreground p-1" />
                        <button onClick={() => clearWalletImage(key, 'qrImage')} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-danger text-white flex items-center justify-center"><X size={12} /></button>
                      </div>
                    )}
                    <label className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-secondary text-foreground text-sm font-medium cursor-pointer hover:bg-accent/20 transition-colors">
                      <Upload size={14} /> {settings.wallets[key].qrImage ? 'Replace' : 'Upload'} QR Image
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) updateWalletImage(key, 'qrImage', f); }} />
                    </label>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Custom Wallets</p>
          {(settings.customWallets || []).map((wallet) => (
            <div key={wallet.id} className="p-4 bg-secondary/40 rounded-xl border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{wallet.name}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleCustomWallet(wallet.id)} className="text-accent">
                    {wallet.enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-muted-foreground" />}
                  </button>
                  <button onClick={() => removeCustomWallet(wallet.id)} className="w-7 h-7 rounded-full bg-danger/15 text-danger flex items-center justify-center hover:bg-danger/30 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {wallet.enabled && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Logo</p>
                    <div className="flex items-center gap-3">
                      {wallet.logoImage ? (
                        <div className="relative w-12 h-12 flex-shrink-0">
                          <img src={wallet.logoImage} alt={`${wallet.name} logo`} className="w-full h-full object-contain rounded-lg border border-border bg-white/5 p-1" />
                          <button onClick={() => clearCustomWalletImage(wallet.id, 'logoImage')} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center"><X size={10} /></button>
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg border-2 border-dashed border-border flex items-center justify-center flex-shrink-0">
                          <ImagePlus size={16} className="text-muted-foreground" />
                        </div>
                      )}
                      <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium cursor-pointer hover:bg-accent/20 transition-colors">
                        <Upload size={12} /> {wallet.logoImage ? 'Replace' : 'Upload'} Logo
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) updateCustomWalletImage(wallet.id, 'logoImage', f); }} />
                      </label>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">QR Image</p>
                    {wallet.qrImage && (
                      <div className="relative w-32 h-32 mx-auto">
                        <img src={wallet.qrImage} alt={`${wallet.name} QR`} className="w-full h-full object-contain rounded-lg border border-border bg-foreground p-1" />
                        <button onClick={() => clearCustomWalletImage(wallet.id, 'qrImage')} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-danger text-white flex items-center justify-center"><X size={12} /></button>
                      </div>
                    )}
                    <label className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-secondary text-foreground text-sm font-medium cursor-pointer hover:bg-accent/20 transition-colors">
                      <Upload size={14} /> {wallet.qrImage ? 'Replace' : 'Upload'} QR Image
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) updateCustomWalletImage(wallet.id, 'qrImage', f); }} />
                    </label>
                  </div>
                </div>
              )}
            </div>
          ))}
          {showAddWallet ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newWalletName}
                onChange={(e) => setNewWalletName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addCustomWallet(); if (e.key === 'Escape') { setShowAddWallet(false); setNewWalletName(''); } }}
                placeholder="Wallet name (e.g. Connect IPS)"
                className="flex-1 px-3 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button onClick={addCustomWallet} className="px-3 py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:brightness-110 transition-all">Add</button>
              <button onClick={() => { setShowAddWallet(false); setNewWalletName(''); }} className="px-3 py-2.5 rounded-xl bg-secondary text-muted-foreground text-sm hover:text-foreground transition-colors">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddWallet(true)}
              className="flex items-center gap-2 w-full py-2.5 rounded-xl border-2 border-dashed border-border text-muted-foreground text-sm hover:border-accent/50 hover:text-accent transition-colors justify-center"
            >
              <Plus size={15} /> Add Custom Wallet
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── COMPANY PROFILE / BILL DESIGN ─────────────────────────────────────────
// ── COMPANY PROFILE ────────────────────────────────────────────────────────
const CompanyProfileSection = () => {
  const settings = usePOSStore((s) => s.settings);
  const updateSettings = usePOSStore((s) => s.updateSettings);

  const [cafeName, setCafeName] = useState(settings.cafeName);
  const [cafeAddress, setCafeAddress] = useState(settings.cafeAddress || '');
  const [cafePhone, setCafePhone] = useState(settings.cafePhone || '');
  const [cafePan, setCafePan] = useState(settings.cafePan || '');
  const [vatEnabled, setVatEnabled] = useState(settings.vatEnabled ?? true);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Please choose an image under 2MB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      updateSettings({ cafeLogo: base64, logo: base64, logoUrl: base64 });
    };
    reader.readAsDataURL(file);
  };

  const saveAll = () => {
    updateSettings({
      cafeName,
      cafeAddress: cafeAddress || undefined,
      cafePhone: cafePhone || undefined,
      cafePan: cafePan || undefined,
      vatEnabled,
    });
    toast.success('Changes saved successfully');
  };

  const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 h-11 transition-colors';

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">Business Information</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Appears on printed receipts</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Café Name</label>
            <input value={cafeName} onChange={(e) => setCafeName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Phone Number</label>
            <input value={cafePhone} onChange={(e) => setCafePhone(e.target.value)} placeholder="e.g. 01-XXXXXXX" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Address</label>
            <input value={cafeAddress} onChange={(e) => setCafeAddress(e.target.value)} placeholder="e.g. Kathmandu, Nepal" className={inputCls} />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Logo</label>
          <div className="flex items-center gap-4">
            {settings.cafeLogo ? (
              <div className="relative w-20 h-20">
                <img src={settings.cafeLogo} alt="Logo" className="w-full h-full object-contain rounded-xl border border-border bg-white p-1" />
                <button onClick={() => updateSettings({ cafeLogo: undefined })} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center text-muted-foreground">
                <ImagePlus size={22} />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium cursor-pointer hover:bg-accent/15 hover:text-accent transition-colors">
                <Upload size={14} /> {settings.cafeLogo ? 'Replace' : 'Upload'} Logo
                <input type="file" accept="image/png, image/jpeg, image/webp" className="hidden" onChange={handleLogoUpload} />
              </label>
              <p className="text-[11px] text-muted-foreground/60 leading-tight">PNG or JPG · Max 2MB · High contrast works best</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">Tax Settings</h3>
          <p className="text-xs text-muted-foreground mt-0.5">VAT and PAN configuration</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">PAN / VAT Number</label>
          <input value={cafePan} onChange={(e) => setCafePan(e.target.value)} placeholder="e.g. 123456789" className={inputCls} />
        </div>
        <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-white/[0.06]">
          <div>
            <p className="text-sm font-medium text-foreground">Enable VAT (13%)</p>
            <p className="text-xs text-muted-foreground mt-0.5">Applies 13% VAT to all orders</p>
          </div>
          <button onClick={() => setVatEnabled((v) => !v)} className="flex-shrink-0 transition-all active:scale-95">
            {vatEnabled
              ? <ToggleRight size={36} className="text-accent" />
              : <ToggleLeft size={36} className="text-muted-foreground" />}
          </button>
        </div>
      </div>

      <button
        onClick={saveAll}
        data-testid="button-save-bill-design"
        className="w-full py-3.5 rounded-2xl bg-accent text-accent-foreground font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] hover:brightness-110 shadow-[0_4px_16px_-4px_rgba(59,130,246,0.4)]"
      >
        <Save size={16} /> Save Changes
      </button>
    </div>
  );
};

// ── BILLING & RECEIPTS ─────────────────────────────────────────────────────
const BillingReceiptsSection = () => {
  const settings = usePOSStore((s) => s.settings);
  const updateSettings = usePOSStore((s) => s.updateSettings);

  const [billFooter, setBillFooter] = useState(settings.billFooter || 'Thank you for visiting!');
  const [billCounter, setBillCounter] = useState(String(settings.billCounter));
  const [kotCounter, setKotCounter] = useState(String(settings.kotCounter ?? 100));
  const [resetKotDaily, setResetKotDaily] = useState(settings.resetKotDaily ?? false);
  const [showLogoOnBill, setShowLogoOnBill] = useState(settings.showLogoOnBill ?? true);

  const saveAll = () => {
    updateSettings({
      billFooter: billFooter || undefined,
      billCounter: Number(billCounter) || settings.billCounter,
      kotCounter: Number(kotCounter) || settings.kotCounter,
      resetKotDaily,
      showLogoOnBill,
    });
    toast.success('Changes saved successfully');
  };

  const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 h-11 transition-colors';

  const sampleSubtotal = 680;
  const sampleVatAmount = settings.vatEnabled ? Math.round(sampleSubtotal * settings.vatRate) : 0;
  const sampleTotal = settings.vatEnabled ? sampleSubtotal + sampleVatAmount : sampleSubtotal;
  const sampleItems = [
    { menuItemId: '1', name: 'Cappuccino', price: 250, quantity: 2 },
    { menuItemId: '2', name: 'Croissant', price: 180, quantity: 1 },
  ];

  return (
    <div className="space-y-5">

      {/* Logo Display */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">Logo Display</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Control logo visibility on printed bills</p>
        </div>
        <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-white/[0.06]">
          <div>
            <p className="text-sm font-medium text-foreground">Show Logo on Printed Bills &amp; Receipts</p>
            <p className="text-xs text-muted-foreground mt-0.5">Requires a logo to be uploaded in Company Profile</p>
          </div>
          <button onClick={() => setShowLogoOnBill((v) => !v)} className="flex-shrink-0 transition-all active:scale-95">
            {showLogoOnBill
              ? <ToggleRight size={36} className="text-accent" />
              : <ToggleLeft size={36} className="text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* Receipt Settings */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">Receipt Settings</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Customize receipt appearance</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Footer Message</label>
          <input value={billFooter} onChange={(e) => setBillFooter(e.target.value)} placeholder="Thank you for visiting!" className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Current Bill Number</label>
          <input value={billCounter} onChange={(e) => setBillCounter(e.target.value)} type="number" className={inputCls} />
          <p className="text-xs text-muted-foreground mt-1.5">Next bill will be <span className="text-foreground font-medium">#{Number(billCounter) + 1}</span></p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Current KOT Number</label>
          <input value={kotCounter} onChange={(e) => setKotCounter(e.target.value)} type="number" className={inputCls} />
          <p className="text-xs text-muted-foreground mt-1.5">Next KOT will be <span className="text-foreground font-medium">#{Number(kotCounter) + 1}</span></p>
        </div>
        <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-white/[0.06]">
          <div>
            <p className="text-sm font-medium text-foreground">Reset KOT Numbers Daily</p>
            <p className="text-xs text-muted-foreground mt-0.5">Automatically resets the KOT sequence back to 1 at the start of each day</p>
          </div>
          <button onClick={() => setResetKotDaily((v) => !v)} className="flex-shrink-0 transition-all active:scale-95">
            {resetKotDaily
              ? <ToggleRight size={36} className="text-accent" />
              : <ToggleLeft size={36} className="text-muted-foreground" />}
          </button>
        </div>
      </div>

      <button
        onClick={saveAll}
        className="w-full py-3.5 rounded-2xl bg-accent text-accent-foreground font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] hover:brightness-110 shadow-[0_4px_16px_-4px_rgba(59,130,246,0.4)]"
      >
        <Save size={16} /> Save Changes
      </button>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <h3 className="font-semibold text-foreground">Bill Preview</h3>
        <p className="text-xs text-muted-foreground">Preview of how your receipt will look</p>
        <ReceiptPreview
          cafeName={settings.cafeName}
          cafeLogo={settings.cafeLogo}
          cafeAddress={settings.cafeAddress || ''}
          cafePhone={settings.cafePhone || ''}
          cafePan={settings.cafePan || ''}
          billFooter={billFooter}
          tableNumber="1"
          items={sampleItems}
          subtotal={sampleSubtotal}
          discount={0}
          discountType="fixed"
          vatEnabled={settings.vatEnabled}
          vatRate={settings.vatRate}
          vatAmount={sampleVatAmount}
          total={sampleTotal}
          method="Cash"
          billNumber={Number(billCounter) + 1}
          date={Date.now()}
          showLogoOnBill={showLogoOnBill}
        />
      </div>
    </div>
  );
};

// ── REPORTS ───────────────────────────────────────────────────────────────
type ReportPeriod = 'today' | 'yesterday' | 'last7' | 'month' | 'custom';
const PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: 'Today', yesterday: 'Yesterday', last7: 'Last 7 Days', month: 'This Month', custom: 'Custom',
};

const ReportsSection = () => {
  const payments  = usePOSStore((s) => s.payments);
  const menuItems = usePOSStore((s) => s.menuItems);
  const categories = usePOSStore((s) => s.categories);
  const settings  = usePOSStore((s) => s.settings);

  const [period, setPeriod]         = useState<ReportPeriod>('today');
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  // Custom date range (ISO date strings yyyy-MM-dd)
  const [customStart, setCustomStart] = useState(() => format(subDays(new Date(), 6), 'yyyy-MM-dd'));
  const [customEnd,   setCustomEnd]   = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const PAGE_SIZE = 8;

  const now = new Date();

  const periodStart = (() => {
    switch (period) {
      case 'today':     return startOfDay(now);
      case 'yesterday': return startOfDay(subDays(now, 1));
      case 'last7':     return startOfDay(subDays(now, 6));
      case 'month':     return startOfMonth(now);
      case 'custom':    return startOfDay(new Date(customStart + 'T00:00:00'));
    }
  })();
  const periodEnd = (() => {
    if (period === 'yesterday') return startOfDay(now).getTime();
    if (period === 'custom') {
      const end = new Date(customEnd + 'T00:00:00');
      end.setDate(end.getDate() + 1); // include the full end day
      return end.getTime();
    }
    return now.getTime() + 1;
  })();

  const periodPayments = payments.filter(
    (p) => p.createdAt >= periodStart.getTime() && p.createdAt < periodEnd,
  );

  // Summary metrics
  const netSales       = periodPayments.reduce((s, p) => s + p.total, 0);
  const grossSales     = periodPayments.reduce((s, p) => s + p.subtotal, 0);
  const totalDiscounts = periodPayments.reduce((s, p) => s + (p.discount || 0), 0);
  const discountedCount = periodPayments.filter((p) => p.discount > 0).length;

  // Payment breakdown
  const paymentBreakdown: Record<string, number> = {};
  periodPayments.forEach((p) => {
    paymentBreakdown[p.method] = (paymentBreakdown[p.method] || 0) + p.total;
  });
  const paymentEntries = Object.entries(paymentBreakdown).sort((a, b) => b[1] - a[1]);

  // Category donut data
  const catMap: Record<string, { name: string; total: number }> = {};
  periodPayments.forEach((p) =>
    p.items.forEach((item) => {
      const mi  = menuItems.find((m) => m.id === item.menuItemId);
      const cat = mi ? categories.find((c) => c.id === mi.categoryId) : null;
      const key = cat?.parentCategory || cat?.name || 'Other';
      if (!catMap[key]) catMap[key] = { name: key, total: 0 };
      catMap[key].total += item.price * item.quantity;
    })
  );
  const catData = Object.values(catMap).sort((a, b) => b.total - a.total);

  // Filtered + paginated transactions
  const filtered = periodPayments
    .slice()
    .reverse()
    .filter((p) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        String(p.billNumber).includes(s) ||
        p.tableNumber.toLowerCase().includes(s) ||
        p.method.toLowerCase().includes(s) ||
        (p.processedBy?.name || p.takenBy?.name || '').toLowerCase().includes(s)
      );
    });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const changePeriod = (p: ReportPeriod) => { setPeriod(p); setPage(1); setSearch(''); };

  const exportCSV = () => {
    const headers = 'Time,Bill#,Table,Items,Subtotal,Discount,Total,Method,Staff\n';
    const rows = periodPayments
      .slice()
      .reverse()
      .map((p) =>
        `${format(p.createdAt, 'yyyy-MM-dd HH:mm')},${p.billNumber},${p.tableNumber},"${p.items.map((i) => `${i.name}x${i.quantity}`).join('; ')}",${p.subtotal},${p.discount},${p.total},${p.method},"${p.processedBy?.name || p.takenBy?.name || ''}"`
      )
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `report-${period}-${format(now, 'yyyy-MM-dd')}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  // shared date-input style
  const dateInputCls = 'px-2.5 py-1.5 text-sm rounded-lg bg-white/[0.05] border border-white/[0.1] text-foreground focus:outline-none focus:border-blue-500/40 [color-scheme:dark]';

  return (
    <div className="space-y-5">
      {/* ── Header toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(Object.entries(PERIOD_LABELS) as [ReportPeriod, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => changePeriod(key)}
              data-testid={`button-report-period-${key}`}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                period === key
                  ? 'text-white'
                  : 'bg-white/[0.05] border border-white/[0.08] text-white/50 hover:text-white/80'
              }`}
              style={period === key ? ACTIVE_STYLE : {}}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            data-testid="button-export-csv"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-white/[0.05] border border-white/[0.08] text-white/55 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all"
          >
            <Download size={14} /> CSV
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-white/[0.05] border border-white/[0.08] text-white/55 hover:text-blue-400 hover:border-blue-500/30 hover:bg-blue-500/10 transition-all"
          >
            <Printer size={14} /> PDF
          </button>
        </div>
      </div>

      {/* ── Custom date range inputs (shown only when Custom is active) ── */}
      {period === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.06]">
          <span className="text-xs font-semibold text-blue-400 flex-shrink-0">Date Range</span>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={customStart}
              max={customEnd}
              onChange={(e) => { setCustomStart(e.target.value); setPage(1); }}
              className={dateInputCls}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => { setCustomEnd(e.target.value); setPage(1); }}
              className={dateInputCls}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {periodPayments.length} transaction{periodPayments.length !== 1 ? 's' : ''} in range
          </span>
        </div>
      )}

      {/* ── Data cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Net Sales',         value: `Rs. ${fmt(netSales)}`,       sub: 'After discounts & tax',               color: 'blue',    icon: <DollarSign size={14} /> },
          { label: 'Gross Sales',       value: `Rs. ${fmt(grossSales)}`,     sub: 'Before discounts',                    color: 'emerald', icon: <TrendingUp size={14} /> },
          { label: 'Discounts Given',   value: `Rs. ${fmt(totalDiscounts)}`, sub: `${discountedCount} orders discounted`, color: 'amber',   icon: <Receipt size={14} /> },
          { label: 'Cancelled / Voids', value: '0',                          sub: 'No void tracking yet',                color: 'red',     icon: <X size={14} /> },
        ].map((card, i) => {
          const c = {
            blue:    { b: 'border-blue-500/25',    bg: 'bg-blue-500/[0.08]',    ic: 'text-blue-400',    val: 'text-blue-300' },
            emerald: { b: 'border-emerald-500/25', bg: 'bg-emerald-500/[0.08]', ic: 'text-emerald-400', val: 'text-emerald-300' },
            amber:   { b: 'border-amber-500/25',   bg: 'bg-amber-500/[0.08]',   ic: 'text-amber-400',   val: 'text-amber-300' },
            red:     { b: 'border-red-500/25',     bg: 'bg-red-500/[0.08]',     ic: 'text-red-400',     val: 'text-red-300' },
          }[card.color]!;
          return (
            <div key={i} className={`rounded-2xl border ${c.b} bg-slate-900/60 backdrop-blur-md p-4`}>
              <div className={`w-8 h-8 rounded-lg ${c.bg} border ${c.b} flex items-center justify-center mb-3`}>
                <span className={c.ic}>{card.icon}</span>
              </div>
              <p className={`text-xl font-bold ${c.val} leading-tight`}>{card.value}</p>
              <p className="text-xs font-semibold text-foreground/80 mt-0.5">{card.label}</p>
              <p className="text-[10px] text-muted-foreground/55 mt-0.5">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* ── Analytics grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sales by category — donut */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-md p-5">
          <h3 className="font-semibold text-foreground mb-4">Sales by Category</h3>
          {catData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-3">
                <BarChart3 size={20} className="opacity-25" />
              </div>
              <p className="text-sm font-medium">No category data</p>
              <p className="text-xs opacity-50 mt-0.5">Appears after orders close</p>
            </div>
          ) : (
            <div className="flex items-center gap-5">
              <div className="flex-shrink-0">
                <PieChart width={150} height={150}>
                  <Pie data={catData} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={46} outerRadius={68} paddingAngle={3} strokeWidth={0}>
                    {catData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#0d1525', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [`Rs. ${fmt(v)}`, 'Revenue']}
                  />
                </PieChart>
              </div>
              <div className="flex-1 space-y-2 min-w-0">
                {catData.map((cat, i) => {
                  const pct = netSales > 0 ? Math.round((cat.total / netSales) * 100) : 0;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="text-xs text-foreground font-medium flex-1 truncate">{cat.name}</span>
                      <span className="text-xs font-semibold text-muted-foreground">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Payment breakdown */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-md p-5">
          <h3 className="font-semibold text-foreground mb-4">Payment Breakdown</h3>
          {paymentEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-3">
                <CreditCard size={20} className="opacity-25" />
              </div>
              <p className="text-sm font-medium">No payments this period</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {paymentEntries.map(([method, total], i) => {
                const pct   = netSales > 0 ? Math.round((total / netSales) * 100) : 0;
                const label = resolvePaymentLabel(method, settings);
                const count = periodPayments.filter((p) => p.method === method).length;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                        <span className="text-sm font-semibold text-foreground">{label}</span>
                        <span className="text-[11px] text-muted-foreground">{count} txns</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">Rs. {fmt(total)}</span>
                        <span className="text-[11px] text-muted-foreground bg-white/[0.06] px-1.5 py-0.5 rounded">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Transactions table ── */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-md p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h3 className="font-semibold text-foreground">Detailed Transactions</h3>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search bill, table, staff…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-8 pr-3 py-1.5 text-sm rounded-lg bg-white/[0.05] border border-white/[0.1] text-foreground placeholder:text-muted-foreground/45 focus:outline-none focus:border-blue-500/40 w-52"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-3">
              <Receipt size={20} className="opacity-25" />
            </div>
            <p className="text-sm font-medium">{search ? 'No matching transactions' : 'No transactions this period'}</p>
            <p className="text-xs opacity-50 mt-0.5">{search ? 'Try a different search term' : 'Completed orders will appear here'}</p>
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="hidden sm:grid grid-cols-[90px_56px_80px_52px_110px_80px_96px_1fr] gap-2 px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-white/[0.06] mb-1">
              <span>Time</span><span>Bill #</span><span>Table</span>
              <span className="text-center">Items</span><span>Method</span>
              <span className="text-right">Discount</span><span className="text-right">Total</span><span>Staff</span>
            </div>
            <div className="space-y-0.5">
              {paginated.map((p) => (
                <div
                  key={p.id}
                  className="hidden sm:grid grid-cols-[90px_56px_80px_52px_110px_80px_96px_1fr] gap-2 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors"
                >
                  <span className="text-xs text-muted-foreground tabular-nums">{format(p.createdAt, 'hh:mm a')}</span>
                  <span className="text-xs font-mono text-muted-foreground">#{p.billNumber}</span>
                  <span className="text-xs font-medium text-foreground truncate">{tableDisplayName(p.tableNumber)}</span>
                  <span className="text-xs text-center text-muted-foreground">{p.items.reduce((s, i) => s + i.quantity, 0)}</span>
                  <span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-semibold capitalize">
                      {resolvePaymentLabel(p.method, settings)}
                    </span>
                  </span>
                  <span className="text-xs text-right font-medium text-amber-400">{p.discount > 0 ? `Rs. ${fmt(p.discount)}` : '—'}</span>
                  <span className="text-sm text-right font-bold text-foreground">Rs. {fmt(p.total)}</span>
                  <span className="text-xs text-muted-foreground truncate">{p.processedBy?.name || p.takenBy?.name || '—'}</span>
                </div>
              ))}
              {/* Mobile fallback rows */}
              {paginated.map((p) => (
                <div key={`m-${p.id}`} className="sm:hidden flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">#{p.billNumber}</span>
                      <span className="text-xs font-medium text-foreground">{tableDisplayName(p.tableNumber)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{format(p.createdAt, 'hh:mm a')}</span>
                      <span className="text-[10px] text-muted-foreground">{p.processedBy?.name || p.takenBy?.name || ''}</span>
                    </div>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-semibold capitalize flex-shrink-0">
                    {resolvePaymentLabel(p.method, settings)}
                  </span>
                  <span className="text-sm font-bold text-foreground flex-shrink-0">Rs. {fmt(p.total)}</span>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.06]">
                <p className="text-xs text-muted-foreground">{filtered.length} transactions · Page {page} of {totalPages}</p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((v) => Math.max(1, v - 1))} disabled={page === 1}
                    className="p-1.5 rounded-lg hover:bg-white/[0.07] text-muted-foreground disabled:opacity-30 transition-colors">
                    <ChevronLeft size={15} />
                  </button>
                  <button onClick={() => setPage((v) => Math.min(totalPages, v + 1))} disabled={page === totalPages}
                    className="p-1.5 rounded-lg hover:bg-white/[0.07] text-muted-foreground disabled:opacity-30 transition-colors">
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ── BACKUP ────────────────────────────────────────────────────────────────
const BackupSection = () => {
  const exportData = usePOSStore((s) => s.exportData);
  const importData = usePOSStore((s) => s.importData);
  const factoryReset = usePOSStore((s) => s.factoryReset);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cafe-pos-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Backup exported successfully');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importData(reader.result as string);
        toast.success('Data restored successfully');
      } catch {
        toast.error('Invalid backup file');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5 max-w-lg">
      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">Export Backup</h3>
          <p className="text-sm text-muted-foreground mt-1">Download all your data as a JSON file for safekeeping. Include menu, tables, orders, and settings.</p>
        </div>
        <button
          onClick={handleExport}
          data-testid="button-export-backup"
          className="w-full py-3 rounded-xl bg-accent text-accent-foreground font-semibold flex items-center justify-center gap-2 hover:brightness-110 transition-all active:scale-[0.98]"
        >
          <Download size={16} /> Export Backup
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">Restore Backup</h3>
          <p className="text-sm text-muted-foreground mt-1">Import a previously exported backup file. This will overwrite your current data.</p>
        </div>
        <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        <button
          onClick={() => fileRef.current?.click()}
          data-testid="button-import-backup"
          className="w-full py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold flex items-center justify-center gap-2 hover:bg-accent/15 hover:text-accent transition-all active:scale-[0.98]"
        >
          <Upload size={16} /> Import Backup
        </button>
      </div>

      <div className="bg-card rounded-2xl border-2 border-destructive/25 p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-destructive">Factory Reset</h3>
          <p className="text-sm text-muted-foreground mt-1">Delete all data and restore default settings. <span className="text-destructive font-medium">This cannot be undone.</span></p>
        </div>
        {!showResetConfirm ? (
          <button
            onClick={() => setShowResetConfirm(true)}
            data-testid="button-factory-reset"
            className="w-full py-3 rounded-xl bg-destructive/8 text-destructive font-semibold flex items-center justify-center gap-2 hover:bg-destructive/18 transition-all active:scale-[0.98]"
          >
            <Trash2 size={16} /> Factory Reset
          </button>
        ) : (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-destructive/8 border border-destructive/20">
              <p className="text-sm font-semibold text-destructive text-center">Are you sure? All data will be permanently erased.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { factoryReset(); window.location.reload(); }}
                data-testid="button-confirm-factory-reset"
                className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-bold hover:brightness-110 transition-all active:scale-[0.97]"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
