import { useState, useRef } from 'react';
import { usePOSStore } from '@/store/usePOSStore';
import { useStaffStore } from '@/store/useStaffStore';
import AppLayout from '@/components/ui/AppLayout';
import ReceiptPreview from '@/components/ReceiptPreview';
import PrinterSettingsSection from '@/components/settings/PrinterSettingsModal';
import { InventorySection } from '@/screens/InventorySection';
import { KitchenReportTab } from '@/screens/reports/KitchenReportTab';
import StaffManagement from '@/screens/admin/StaffManagement';
import { ExpensesSection } from '@/screens/admin/ExpensesSection';
import MenuManagement from '@/screens/admin/MenuManagement';
import { useCustomerStore } from '@/store/useCustomerStore';
import { useMaintenanceStore } from '@/store/useMaintenanceStore';
import { useKitchenPurchasesStore } from '@/store/useKitchenPurchasesStore';
import { useInventoryStore } from '@/store/useInventoryStore';
import { useMeatTrackerStore } from '@/store/useMeatTrackerStore';
import { db } from '@/storage/db';
import type { ClosedShift } from '@/storage/db';
import { toast } from 'sonner';
import {
  BarChart3, CreditCard, Table2, TrendingUp,
  Plus, Trash2, Edit3, Save, X, Lock, DollarSign, ShoppingCart,
  Download, Upload, Smartphone, ToggleLeft, ToggleRight,
  Receipt, ImagePlus, Image, Menu as MenuIcon, Users, Package,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Settings,
  Search, Printer, ArrowUp, ArrowDown, Wrench, UtensilsCrossed,
  AlertTriangle, RotateCcw, ShieldAlert, FileJson,
  ClipboardCheck, History, CheckCircle2,
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
import { format, startOfDay, endOfDay, subDays, startOfWeek, startOfMonth } from 'date-fns';
import { compareTableNames, tableDisplayName, tableNameKey } from '@/utils/tableName';
import { pushLogoToFirebase } from '@/utils/firebaseSync';
import {
  EMPTY_SELECTIVE_RESET_SELECTION,
  SELECTIVE_RESET_MODULES,
  hasSelectedResetModule,
  type SelectiveResetModuleId,
  type SelectiveResetSelection,
} from '@/types/selectiveReset';
import { executeSelectiveReset } from '@/utils/selectiveReset';

type AdminTab = 'dashboard' | 'tables' | 'settings' | 'reports' | 'customers' | 'inventory' | 'expenses' | 'menu';
type SettingsSubTab = 'bill' | 'billing' | 'payments' | 'printers' | 'staff' | 'data-management';

const SIDEBAR_BG = 'linear-gradient(180deg, #080f1e 0%, #040a14 100%)';
const ACTIVE_STYLE = {
  background: 'rgba(59,130,246,0.16)',
  border: '1px solid rgba(59,130,246,0.28)',
  boxShadow: '0 0 18px -4px rgba(59,130,246,0.3)',
};

const compressLogoToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read the logo file.'));
    reader.onload = () => {
      const image = document.createElement('img');
      image.onerror = () => reject(new Error('Unable to decode the logo image.'));
      image.onload = () => {
        const maxDimension = 512;
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Unable to process the logo image.'));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/webp', 0.82));
      };
      image.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });


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
      <p className="text-sm text-slate-300 mt-0.5">{subtitle}</p>
    </div>
    {action && <div className="flex-shrink-0 ml-4">{action}</div>}
  </div>
);

// ── ADMIN CUSTOMER ANALYTICS ─────────────────────────────────────────────────

const RatioBar = ({
  leftLabel, rightLabel, leftValue, rightValue, leftColor, rightColor,
}: {
  leftLabel: string; rightLabel: string; leftValue: number; rightValue: number;
  leftColor: string; rightColor: string;
}) => {
  const total = leftValue + rightValue;
  const leftPct = total > 0 ? Math.round((leftValue / total) * 100) : 50;
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-zinc-200 mt-2">
        <span className="font-semibold" style={{ color: leftColor }}>{leftLabel}</span>
        <span className="font-semibold" style={{ color: rightColor }}>{rightLabel}</span>
      </div>
      <div className="h-3 rounded-full bg-white/10 overflow-hidden flex mt-2">
        <div className="h-full" style={{ width: `${leftPct}%`, background: leftColor }} />
        <div className="h-full flex-1" style={{ background: rightColor }} />
      </div>
    </div>
  );
};

const AdminCustomerAnalytics = () => {
  const customers = useCustomerStore((s) => s.customers);
  const repayments = useCustomerStore((s) => s.repayments);
  const orders = usePOSStore((s) => s.orders);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<'financials' | 'visits' | 'consumption' | 'audit'>('financials');

  const totalRevenue = customers.reduce((s, c) => s + c.totalSpend, 0);
  const totalDue = customers.reduce((s, c) => s + c.currentDue, 0);
  const totalPaid = repayments.reduce((s, r) => s + r.amount, 0);
  const totalFood = customers.reduce((s, c) => s + (c.foodItemsConsumed ?? 0), 0);
  const totalBev = customers.reduce((s, c) => s + (c.beverageItemsConsumed ?? 0), 0);

  const selected = selectedId ? customers.find((c) => c.id === selectedId) : undefined;
  const selectedRepayments = selected
    ? repayments.filter((r) => r.customerId === selected.id).sort((a, b) => b.createdAt - a.createdAt)
    : [];
  const selectedOrders = selected
    ? orders
        .filter((o) => o.attachedCustomer?.id === selected.id && o.status === 'paid')
        .sort((a, b) => b.createdAt - a.createdAt)
    : [];
  const selectedPaidOff = selectedRepayments.reduce((s, r) => s + r.amount, 0);

  const visitFrequency = (() => {
    if (!selected || selected.visits < 2 || selectedOrders.length < 2) return null;
    const times = selectedOrders.map((o) => o.createdAt);
    const spanDays = (Math.max(...times) - Math.min(...times)) / 86400000;
    if (spanDays <= 0) return null;
    const perWeek = (selected.visits / spanDays) * 7;
    return perWeek >= 1 ? `${perWeek.toFixed(1)} visits / week` : `${(perWeek * 4.35).toFixed(1)} visits / month`;
  })();

  const cardStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' };

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-6">
        <div className="p-6 rounded-2xl bg-[#13151F] border-2 border-amber-500/40 shadow-xl shadow-amber-500/5 flex flex-col justify-between min-h-[140px]">
          <p className="text-xs font-black uppercase tracking-wider text-amber-400">Total Customer Revenue</p>
          <p className="text-3xl font-black text-white tracking-tight mt-2" data-testid="stat-customer-revenue">Rs. {fmt(totalRevenue)}</p>
        </div>
        <div className="p-6 rounded-2xl bg-[#13151F] border-2 border-emerald-500/40 shadow-xl shadow-emerald-500/5 flex flex-col justify-between min-h-[140px]">
          <p className="text-xs font-black uppercase tracking-wider text-emerald-400">Outstanding Credit Ratio</p>
          <RatioBar
            leftLabel={`Paid Rs. ${fmt(totalPaid)}`} rightLabel={`Unpaid Rs. ${fmt(totalDue)}`}
            leftValue={totalPaid} rightValue={totalDue} leftColor="#34d399" rightColor="#f87171"
          />
        </div>
        <div className="p-6 rounded-2xl bg-[#13151F] border-2 border-sky-500/40 shadow-xl shadow-sky-500/5 flex flex-col justify-between min-h-[140px]">
          <p className="text-xs font-black uppercase tracking-wider text-sky-400">Food vs Beverage Consumption</p>
          <RatioBar
            leftLabel={`Food ${totalFood}`} rightLabel={`Beverage ${totalBev}`}
            leftValue={totalFood} rightValue={totalBev} leftColor="#fbbf24" rightColor="#60a5fa"
          />
        </div>
      </div>

      {/* Customer table */}
      <div className="bg-[#13151F] border border-white/15 rounded-3xl overflow-hidden shadow-2xl shadow-black/50 mt-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/[0.04] border-b border-white/10 text-left text-xs font-black uppercase tracking-widest text-zinc-200">
              <th className="py-4 px-6">Name</th>
              <th className="py-4 px-6">Phone</th>
              <th className="py-4 px-6">Lifetime Revenue</th>
              <th className="py-4 px-6">Outstanding</th>
              <th className="py-4 px-6">Visits</th>
              <th className="py-4 px-6">Last Visit</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-sm font-bold text-zinc-300">No customers registered yet.</td></tr>
            )}
            {customers.map((c) => (
              <tr
                key={c.id}
                onClick={() => { setSelectedId(c.id); setDrawerTab('financials'); }}
                className="cursor-pointer border-b border-white/10 transition-colors last:border-0 hover:bg-white/[0.03]"
                data-testid={`row-analytics-customer-${c.id}`}
              >
                <td className="py-4 px-6 text-base font-black text-white tracking-wide">{c.name}</td>
                <td className={`py-4 px-6 text-sm font-bold font-mono ${c.phone ? 'text-zinc-100' : 'text-zinc-500'}`}>{c.phone || '—'}</td>
                <td className="py-4 px-6 text-sm font-black text-amber-400 font-mono">Rs. {fmt(c.totalSpend)}</td>
                <td className="py-4 px-6">
                  {c.currentDue > 0
                    ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/50 text-rose-300 text-xs font-black shadow-sm">Rs. {fmt(c.currentDue)}</span>
                    : <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-black shadow-sm">Clear</span>}
                </td>
                <td className="py-4 px-6 text-xs font-bold text-zinc-200 font-mono">{c.visits}</td>
                <td className="py-4 px-6 text-xs font-bold text-zinc-200 font-mono">
                  {c.lastVisit ? format(new Date(c.lastVisit), 'dd MMM yyyy, hh:mm a') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Analytics drawer */}
      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>{selected?.phone}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                {([
                  { id: 'financials',  label: '💰 Financials' },
                  { id: 'visits',      label: '📅 Visits' },
                  { id: 'consumption', label: '🍽️ Consumption & Top Items' },
                  { id: 'audit',       label: '📜 Audit Trail' },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setDrawerTab(tab.id)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${
                      drawerTab === tab.id
                        ? 'border-blue-500/40 bg-blue-500/15 text-blue-300'
                        : 'border-white/10 bg-white/[0.04] text-slate-400'
                    }`}
                    data-testid={`tab-analytics-${tab.id}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="max-h-[55vh] overflow-y-auto">
                {drawerTab === 'financials' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl p-4" style={cardStyle}>
                      <p className="text-xs text-slate-400">Lifetime Revenue</p>
                      <p className="mt-1 text-xl font-bold text-white">Rs. {fmt(selected.totalSpend)}</p>
                    </div>
                    <div className="rounded-xl p-4" style={cardStyle}>
                      <p className="text-xs text-slate-400">Total Paid Off</p>
                      <p className="mt-1 text-xl font-bold text-emerald-400">Rs. {fmt(selectedPaidOff)}</p>
                    </div>
                    <div className="rounded-xl p-4" style={cardStyle}>
                      <p className="text-xs text-slate-400">Current Outstanding Balance</p>
                      <p className={`mt-1 text-xl font-bold ${selected.currentDue > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {selected.currentDue > 0 ? `Rs. ${fmt(selected.currentDue)}` : 'Clear'}
                      </p>
                    </div>
                  </div>
                )}

                {drawerTab === 'visits' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl p-4" style={cardStyle}>
                      <p className="text-xs text-slate-400">Total Visit Count</p>
                      <p className="mt-1 text-xl font-bold text-white">{selected.visits}</p>
                    </div>
                    <div className="rounded-xl p-4" style={cardStyle}>
                      <p className="text-xs text-slate-400">Last Visit</p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {selected.lastVisit ? format(new Date(selected.lastVisit), 'dd MMM yyyy, hh:mm a') : 'No visits recorded'}
                      </p>
                    </div>
                    <div className="rounded-xl p-4" style={cardStyle}>
                      <p className="text-xs text-slate-400">Visit Frequency</p>
                      <p className="mt-1 text-sm font-semibold text-white">{visitFrequency ?? 'Not enough data yet'}</p>
                    </div>
                  </div>
                )}

                {drawerTab === 'consumption' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl p-4" style={cardStyle}>
                        <p className="text-xs text-slate-400">Total Food Items Eaten</p>
                        <p className="mt-1 text-xl font-bold text-amber-300">{selected.foodItemsConsumed ?? 0}</p>
                      </div>
                      <div className="rounded-xl p-4" style={cardStyle}>
                        <p className="text-xs text-slate-400">Total Drinks Consumed</p>
                        <p className="mt-1 text-xl font-bold text-blue-300">{selected.beverageItemsConsumed ?? 0}</p>
                      </div>
                    </div>
                    <div className="rounded-xl p-4" style={cardStyle}>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Ranked Top Favorites</p>
                      {(selected.topOrders ?? []).length === 0 && (
                        <p className="text-sm text-slate-500">No settled orders recorded yet.</p>
                      )}
                      {(selected.topOrders ?? []).slice(0, 10).map((item, i) => (
                        <div key={item.itemId} className="flex items-center justify-between border-b border-white/[0.04] py-1.5 last:border-0">
                          <span className="text-sm text-slate-200">
                            <span className="mr-2 font-bold text-slate-500">#{i + 1}</span>
                            {item.name}
                            <span className="ml-2 text-xs text-slate-500">{item.category}</span>
                          </span>
                          <span className="text-sm font-semibold text-white">×{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {drawerTab === 'audit' && (
                  <div className="space-y-2">
                    {selectedOrders.length === 0 && selectedRepayments.length === 0 && (
                      <p className="py-6 text-center text-sm text-slate-500">No history recorded yet.</p>
                    )}
                    {[
                      ...selectedOrders.map((o) => ({
                        key: `o-${o.id}`, at: o.createdAt, kind: 'order' as const,
                        title: `Order — Table ${o.tableNumber}`,
                        amount: o.items.reduce((s, i) => s + i.price * i.quantity, 0),
                        lines: o.items.map((i) => `${i.name} ×${i.quantity} — Rs. ${fmt(i.price * i.quantity)}`),
                      })),
                      ...selectedRepayments.map((r) => ({
                        key: `r-${r.id}`, at: r.createdAt, kind: 'repayment' as const,
                        title: `Repayment (${r.method === 'cash' ? 'Cash' : 'QR / Fonepay'})${r.receivedBy ? ` — by ${r.receivedBy.name}` : ''}`,
                        amount: r.amount,
                        lines: r.notes ? [r.notes] : [],
                      })),
                    ]
                      .sort((a, b) => b.at - a.at)
                      .map((entry) => (
                        <div key={entry.key} className="rounded-xl p-3" style={cardStyle}>
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-semibold ${entry.kind === 'repayment' ? 'text-emerald-300' : 'text-white'}`}>
                              {entry.title}
                            </span>
                            <span className={`text-sm font-bold ${entry.kind === 'repayment' ? 'text-emerald-400' : 'text-slate-200'}`}>
                              {entry.kind === 'repayment' ? '−' : '+'} Rs. {fmt(entry.amount)}
                            </span>
                          </div>
                          {entry.lines.map((line, i) => (
                            <p key={i} className="mt-0.5 text-xs text-slate-400">{line}</p>
                          ))}
                          <p className="mt-0.5 text-[11px] text-slate-500">{format(new Date(entry.at), 'dd MMM yyyy, hh:mm a')}</p>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

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
  const [reportView,    setReportView]    = useState<'sales' | 'kitchen' | 'shifts'>('sales');
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
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={15} />,         subtitle: 'Overview of your café performance' },
    { id: 'menu',      label: 'Menu',      icon: <UtensilsCrossed size={15} />,   subtitle: 'Manage categories, items, pricing & printer routing' },
    { id: 'tables',    label: 'Tables',    icon: <Table2 size={15} />,            subtitle: 'Add or remove tables' },
    { id: 'reports',   label: 'Reports',   icon: <TrendingUp size={15} />,        subtitle: 'Sales reports and exports' },
    { id: 'customers', label: 'Customers', icon: <Users size={15} />,             subtitle: 'Customer Khatta balances and repayments' },
    { id: 'inventory', label: 'Inventory', icon: <Package size={15} />,           subtitle: 'Stock management for alcohol, beverages, cigarettes & groceries' },
    { id: 'expenses',  label: 'Expenses',  icon: <Wrench size={15} />,            subtitle: 'Log and track maintenance expenses' },
    { id: 'settings',  label: 'Settings',  icon: <Settings size={15} />,          subtitle: 'Company profile, payments, and staff management' },
  ];

  // Fall back to Dashboard if hot reload or a stale session retains a removed tab.
  const resolvedActiveTab: AdminTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : 'dashboard';
  const active = tabs.find((t) => t.id === resolvedActiveTab)!;

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
            w-64 bg-[#13151F] border-r border-white/15 min-h-[calc(100vh-64px)] p-4 flex flex-col justify-between flex-shrink-0 z-50
            fixed sm:static inset-y-0 left-0
            transition-transform duration-300 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'}
          `}
        >
          <nav className="flex-1 space-y-1 overflow-y-auto">
            {tabs.map((tab) => {
              const isActive = resolvedActiveTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setSidebarOpen(false); }}
                  data-testid={`tab-admin-${tab.id}`}
                  className={isActive
                    ? 'w-full px-4 py-3 rounded-xl bg-amber-500 text-slate-950 font-black text-sm tracking-wide shadow-lg shadow-amber-500/25 flex items-center gap-3 transition-all text-left'
                    : 'w-full px-4 py-3 rounded-xl bg-transparent text-zinc-200 hover:text-white hover:bg-white/10 font-bold text-sm tracking-wide flex items-center gap-3 transition-all text-left'}
                >
                  <span className={isActive ? 'text-slate-950' : 'text-zinc-300'}>{tab.icon}</span>
                  {tab.label}
                </button>
              );
            })}
          </nav>
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
              {resolvedActiveTab === 'dashboard' ? (
                <div className="mb-6">
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Executive Dashboard</h1>
                  <p className="text-xs font-black uppercase tracking-widest text-amber-400 mt-1">
                    Overview of your business &amp; revenue performance
                  </p>
                </div>
              ) : resolvedActiveTab === 'tables' ? (
                <div className="mb-6">
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Tables &amp; Venue Zones</h1>
                  <p className="text-xs font-black uppercase tracking-widest text-amber-400 mt-1">
                    Manage floor areas, dining tables &amp; capacity
                  </p>
                </div>
              ) : resolvedActiveTab === 'reports' ? (
                <div className="mb-6">
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Financial Reports &amp; Analytics</h1>
                  <p className="text-xs font-black uppercase tracking-widest text-amber-400 mt-1">
                    Audited revenue, net margins &amp; expense ledgers
                  </p>
                </div>
              ) : resolvedActiveTab === 'customers' ? (
                <div className="mb-6">
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Customers</h1>
                  <p className="text-xs font-black uppercase tracking-widest text-amber-400 mt-1">
                    Customer khata balances, repayments &amp; lifetime revenue analytics
                  </p>
                </div>
              ) : resolvedActiveTab === 'menu' ? (
                <div className="mb-6">
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Menu Management</h1>
                  <p className="text-xs font-black uppercase tracking-widest text-amber-400 mt-1">
                    Categories, items, pricing, variants &amp; printer station routing
                  </p>
                </div>
              ) : resolvedActiveTab === 'inventory' ? (
                <div className="mb-6">
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Inventory Control</h1>
                  <p className="text-xs font-black uppercase tracking-widest text-amber-400 mt-1">
                    Stock management for alcohol, beverages, cigarettes &amp; groceries
                  </p>
                </div>
              ) : resolvedActiveTab === 'expenses' ? (
                <div className="mb-6">
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Expenses &amp; Maintenance</h1>
                  <p className="text-xs font-black uppercase tracking-widest text-amber-400 mt-1">
                    Log and track operational &amp; facility maintenance costs
                  </p>
                </div>
              ) : resolvedActiveTab === 'settings' ? (
                <div className="mb-6">
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Settings</h1>
                  <p className="text-xs font-black uppercase tracking-widest text-amber-400 mt-1">
                    Company profile, billing, payments, printers &amp; staff management
                  </p>
                </div>
              ) : (
                <PageHeader title={active.label} subtitle={active.subtitle} />
              )}
            </div>
            {resolvedActiveTab === 'dashboard' && <DashboardSection />}
            {resolvedActiveTab === 'tables'    && <TablesSection />}
            {resolvedActiveTab === 'reports'   && (
              <div className="space-y-5">
                {/* Report type toggle */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {([
                    { id: 'sales',   label: '📊 Sales Reports' },
                    { id: 'kitchen', label: '🍳 Kitchen & Meat Analytics' },
                    { id: 'shifts',  label: '📋 Closed Day History' },
                  ] as { id: 'sales' | 'kitchen' | 'shifts'; label: string }[]).map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => setReportView(id)}
                      className={reportView === id
                        ? 'px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all flex items-center gap-2 active:scale-95'
                        : 'px-5 py-2.5 rounded-xl bg-[#13151F] text-zinc-300 hover:text-white border border-white/15 hover:border-white/30 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95'}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {reportView === 'sales'   && <ReportsSection />}
                {reportView === 'kitchen' && <KitchenReportTab />}
                {reportView === 'shifts'  && <ShiftHistorySection />}
              </div>
            )}
            {resolvedActiveTab === 'menu'      && <MenuManagement />}
            {resolvedActiveTab === 'customers' && <AdminCustomerAnalytics />}
            {resolvedActiveTab === 'inventory' && <InventorySection />}
            {resolvedActiveTab === 'expenses'  && <ExpensesSection />}
            {resolvedActiveTab === 'settings'  && (
              <div className="space-y-6">
                {/* Sub-tab pills */}
                <div className="flex gap-2 flex-wrap">
                  {([
                    { id: 'bill',            label: 'Company Profile' },
                    { id: 'billing',         label: 'Billing & Receipts' },
                    { id: 'payments',        label: 'Payments' },
                    { id: 'printers',        label: 'Printers' },
                    { id: 'staff',           label: 'Staff & Users' },
                    { id: 'data-management', label: 'Data Management' },
                  ] as { id: SettingsSubTab; label: string }[]).map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => setSettingsSubTab(sub.id)}
                      className={`px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
                        settingsSubTab === sub.id
                          ? 'bg-amber-500 text-slate-950 font-black shadow-lg shadow-amber-500/25'
                          : 'bg-[#13151F] text-zinc-300 hover:text-white border border-white/15 hover:border-white/30 font-black'
                      }`}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
                {/* Sub-tab content */}
                {settingsSubTab === 'bill'            && <CompanyProfileSection />}
                {settingsSubTab === 'billing'         && <BillingReceiptsSection />}
                {settingsSubTab === 'payments'        && <PaymentsSection />}
                {settingsSubTab === 'printers'        && <PrinterSettingsSection />}
                {settingsSubTab === 'staff'           && <StaffManagement />}
                {settingsSubTab === 'data-management' && <DataManagementSection />}
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

  // Hourly revenue data — full 24-hour day (12 AM to 11 PM)
  const hourlyData = Array.from({ length: 24 }, (_, hour) => {
    const hStart = new Date(now); hStart.setHours(hour, 0, 0, 0);
    const hEnd   = new Date(now); hEnd.setHours(hour + 1, 0, 0, 0);
    const sales  = todayPayments
      .filter((p) => p.createdAt >= hStart.getTime() && p.createdAt < hEnd.getTime())
      .reduce((s, p) => s + p.total, 0);
    const label  = hour === 0 ? '12A' : hour === 12 ? '12P' : hour < 12 ? `${hour}A` : `${hour - 12}P`;
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
        <div className="mt-5 p-4 rounded-2xl bg-[#13151F] border border-emerald-500/40 shadow-lg shadow-emerald-500/5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            LIVE VENUE TELEMETRY
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-black uppercase tracking-wider">
              Active Tables: {activeTables}
            </span>
            <span className="px-3.5 py-1 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-300 text-xs font-black uppercase tracking-wider">
              Open Orders: {openOrders}
            </span>
          </div>
        </div>

      {/* ── KPI cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="p-5 rounded-2xl bg-[#13151F] border-2 border-amber-500/40 shadow-xl shadow-amber-500/5 flex flex-col justify-between min-h-[140px]">
            <p className="text-xs font-black uppercase tracking-wider text-amber-400">Today's Revenue</p>
            <p className="text-3xl font-black text-white tracking-tight mt-2">Rs. {fmt(todaySales)}</p>
          </div>
          <div className="p-5 rounded-2xl bg-[#13151F] border-2 border-sky-500/40 shadow-xl shadow-sky-500/5 flex flex-col justify-between min-h-[140px]">
            <p className="text-xs font-black uppercase tracking-wider text-sky-400">Total Orders Today</p>
            <p className="text-3xl font-black text-white tracking-tight mt-2">{todayOrders}</p>
          </div>
          <div className="p-5 rounded-2xl bg-[#13151F] border-2 border-emerald-500/40 shadow-xl shadow-emerald-500/5 flex flex-col justify-between min-h-[140px]">
            <p className="text-xs font-black uppercase tracking-wider text-emerald-400">Avg. Order Value</p>
            <p className="text-3xl font-black text-white tracking-tight mt-2">Rs. {fmt(Math.round(todayAOV))}</p>
          </div>
          <div className="p-5 rounded-2xl bg-[#13151F] border-2 border-purple-500/40 shadow-xl shadow-purple-500/5 flex flex-col justify-between min-h-[140px]">
            <p className="text-xs font-black uppercase tracking-wider text-purple-400">Digital vs Cash Share</p>
            <p className="text-3xl font-black text-white tracking-tight mt-2">{digitalShare}% Digital</p>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden flex mt-2">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${cashRatio}%`, background: 'linear-gradient(90deg,#f59e0b,#8b5cf6)' }}
              />
            </div>
          </div>
        </div>

      {/* ── Main grid: peak hours + top items ── */}
      <div className="grid grid-cols-12 gap-5 mt-6">
        {/* Peak hours bar chart — Y-axis shows Rs. revenue */}
        <div className="col-span-12 lg:col-span-8 bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl flex flex-col min-h-[380px]">
          <h3 className="text-base font-black text-white tracking-wide">Today's Peak Hours</h3>
          <p className="text-xs font-bold text-amber-400 tracking-wider uppercase mt-0.5">Hourly revenue (Rs.)</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={hourlyData} barSize={8} margin={{ top: 4, right: 4, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="peakGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(59,130,246,0.9)" />
                  <stop offset="100%" stopColor="rgba(99,102,241,0.45)" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.15)" vertical={false} />
              <XAxis dataKey="hour" stroke="#e4e4e7" tick={{ fill: '#e4e4e7', fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }} tickLine={false} axisLine={false} interval={0} />
              {/* FIX: Y-axis values formatted as Rs. */}
              <YAxis stroke="#e4e4e7" tick={{ fill: '#e4e4e7', fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }} tickLine={false} axisLine={false} width={56} tickFormatter={yAxisFmt} domain={[0, (dataMax: number) => Math.max(1000, dataMax)]} />
              <Tooltip
                contentStyle={{ background: '#12141D', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, color: '#fff', fontSize: 12 }}
                formatter={(v: number) => [`Rs. ${fmt(v)}`, 'Revenue']}
              />
              <Bar dataKey="sales" fill="url(#peakGrad)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top selling items */}
        <div className="col-span-12 lg:col-span-4 bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl flex flex-col min-h-[380px]">
          <h3 className="text-base font-black text-white tracking-wide">Top Selling Items</h3>
          {topItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-white/10 rounded-2xl bg-white/[0.02] mt-4">
              <ShoppingCart size={36} className="text-4xl text-amber-400 mb-2" />
              <p className="text-sm font-black text-white">No sales recorded today yet.</p>
              <p className="text-xs font-bold text-zinc-300 mt-1">Items will appear here in real-time as orders are paid.</p>
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
  free:    { label: 'Free',     color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/40' },
  active:  { label: 'Occupied', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-500/40' },
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
  const [collapsedAreas, setCollapsedAreas] = useState<Record<string, boolean>>({});

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
        <div className="inline-flex items-center gap-2 mt-2 px-3.5 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-bold text-zinc-200">
          <Table2 size={13} className="text-amber-400" />
          {tables.length} table{tables.length !== 1 ? 's' : ''} across {areas.length} area{areas.length !== 1 ? 's' : ''}
        </div>
        <button
          onClick={() => { setAddAreaName(''); setAddAreaOpen(true); }}
          data-testid="button-add-area"
          className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all flex items-center gap-2 hover:-translate-y-0.5"
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
            className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl mb-6 flex flex-col gap-4"
          >
            {/* Area header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-lg font-black text-white tracking-wide truncate">{area}</span>
                <span className="px-3 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-black uppercase tracking-wider ml-3">
                  {areaTablesSorted.length} table{areaTablesSorted.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Move up / down */}
                <button
                  onClick={() => moveArea(area, 'up')}
                  disabled={isFirst}
                  aria-label={`Move ${area} up`}
                  title="Move area up"
                  className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 transition-all cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={() => moveArea(area, 'down')}
                  disabled={isLast}
                  aria-label={`Move ${area} down`}
                  title="Move area down"
                  className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 transition-all cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  onClick={() => { setRenamingArea(area); setRenameAreaVal(area); }}
                  aria-label={`Rename area ${area}`}
                  title="Rename area"
                  className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 transition-all cursor-pointer"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  onClick={() => requestDeleteArea(area)}
                  aria-label={`Delete area ${area}`}
                  title={isEmpty ? 'Delete area' : 'Remove all tables first'}
                  className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 transition-all cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
                <button
                  onClick={() => setCollapsedAreas((prev) => ({ ...prev, [area]: !prev[area] }))}
                  aria-label={`${collapsedAreas[area] ? 'Expand' : 'Collapse'} area ${area}`}
                  title={collapsedAreas[area] ? 'Expand area' : 'Collapse area'}
                  className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 transition-all cursor-pointer"
                >
                  <ChevronDown size={14} className={`transition-transform ${collapsedAreas[area] ? '-rotate-90' : ''}`} />
                </button>
              </div>
            </div>

            {/* Table cards */}
            {!collapsedAreas[area] && <div>
              {areaTablesSorted.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                  {areaTablesSorted.map((t) => {
                    const cfg = STATUS_CFG[t.status] || STATUS_CFG.free;
                    return (
                      <div
                        key={t.id}
                        data-testid={`table-row-${t.id}`}
                        className="relative p-4 rounded-2xl bg-[#181B28] hover:bg-[#1E2235] border border-white/15 hover:border-amber-400/60 shadow-md transition-all flex flex-col justify-between min-h-[90px] group cursor-pointer"
                      >
                        <div className="flex flex-col justify-between h-full gap-2">
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-base font-black text-white group-hover:text-amber-200 transition-colors tracking-wide"
                              title={tableDisplayName(t.number)}
                            >
                              {tableDisplayName(t.number)}
                            </p>
                            <span className={`mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider self-start ${cfg.bg} ${cfg.color}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />
                              {cfg.label}
                            </span>
                          </div>
                          <div className="absolute top-2 right-2 flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEdit(t)}
                              disabled={t.status !== 'free'}
                              title={t.status !== 'free' ? 'Table has an active order' : 'Edit table'}
                              aria-label={`Edit ${tableDisplayName(t.number)}`}
                              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              onClick={() => requestDeleteTable(t)}
                              disabled={t.status !== 'free'}
                              title={t.status !== 'free' ? 'Table has an active order' : 'Delete table'}
                              aria-label={`Delete ${tableDisplayName(t.number)}`}
                              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        {t.pax && t.pax > 0 && t.status !== 'free' && (
                          <div className="flex items-center gap-1 text-[11px] text-zinc-300">
                            <Users size={11} />
                            {t.pax} guest{t.pax !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs font-bold text-zinc-300 mb-3">No tables in this area yet.</p>
              )}

              {/* Inline add table */}
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-white/10">
                <input
                  value={inlineNames[area] ?? ''}
                  onChange={(e) => setInlineNames((prev) => ({ ...prev, [area]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && submitInlineTable(area)}
                  type="text"
                  placeholder="Table name (e.g. 5, Cabin 2, VIP 2)"
                  data-testid={`input-table-name-${area}`}
                  className="flex-1 bg-[#181B26] border-2 border-white/20 focus:border-amber-400 text-white font-bold rounded-xl px-4 py-3 text-sm placeholder:text-zinc-400 outline-none transition-all shadow-inner"
                />
                <button
                  onClick={() => submitInlineTable(area)}
                  data-testid={`button-add-table-${area}`}
                  className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-1.5"
                >
                  <Plus size={13} /> Add
                </button>
              </div>
            </div>}
          </div>
        );
      })}

      {/* ── Add Area modal ───────────────────────────────────────────── */}
      <Dialog open={addAreaOpen} onOpenChange={(open) => !open && setAddAreaOpen(false)}>
        <DialogContent className="max-w-md w-full p-7 rounded-[28px] bg-[#0E1017] border border-white/20 shadow-2xl shadow-black text-white relative flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-white tracking-tight">New Seating Area</DialogTitle>
            <DialogDescription className="text-xs font-bold text-zinc-300">Enter a name for the new area (e.g. "Rooftop", "Garden Patio").</DialogDescription>
          </DialogHeader>
          <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1 block">Area Name</label>
          <input
            autoFocus
            value={addAreaName}
            onChange={(e) => setAddAreaName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitAddArea()}
            placeholder="Area name"
            data-testid="input-new-area-name"
            className="w-full bg-[#181B26] border-2 border-white/20 focus:border-amber-400 text-white font-bold rounded-xl px-4 py-3.5 text-sm placeholder:text-zinc-400 outline-none"
          />
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <button onClick={() => setAddAreaOpen(false)} className="flex-1 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-black text-xs uppercase tracking-wider transition-all">Cancel</button>
            <button onClick={submitAddArea} data-testid="button-confirm-add-area" className="flex-1 w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all">Create Area</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Rename Area modal ────────────────────────────────────────── */}
      <Dialog open={Boolean(renamingArea)} onOpenChange={(open) => !open && setRenamingArea(null)}>
        <DialogContent className="max-w-md w-full p-7 rounded-[28px] bg-[#0E1017] border border-white/20 shadow-2xl shadow-black text-white relative flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-white tracking-tight">Rename Area</DialogTitle>
            <DialogDescription className="text-xs font-bold text-zinc-300">All tables in "{renamingArea}" will be updated to the new name.</DialogDescription>
          </DialogHeader>
          <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1 block">Area Name</label>
          <input
            autoFocus
            value={renameAreaVal}
            onChange={(e) => setRenameAreaVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitRenameArea()}
            placeholder="New area name"
            className="w-full bg-[#181B26] border-2 border-white/20 focus:border-amber-400 text-white font-bold rounded-xl px-4 py-3.5 text-sm placeholder:text-zinc-400 outline-none"
          />
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <button onClick={() => setRenamingArea(null)} className="flex-1 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-black text-xs uppercase tracking-wider transition-all">Cancel</button>
            <button onClick={submitRenameArea} className="flex-1 w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all">Save Changes</button>
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
        <DialogContent className="max-w-md w-full p-7 rounded-[28px] bg-[#0E1017] border border-white/20 shadow-2xl shadow-black text-white relative flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-white tracking-tight">Edit Table</DialogTitle>
            <DialogDescription className="text-xs font-bold text-zinc-300">Rename the table or move it to a different area.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1 block">Table Name</label>
              <input
                autoFocus
                value={editTableName}
                onChange={(e) => setEditTableName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                placeholder="Table name / number"
                data-testid="input-edit-table-name"
                className="w-full bg-[#181B26] border-2 border-white/20 focus:border-amber-400 text-white font-bold rounded-xl px-4 py-3.5 text-sm placeholder:text-zinc-400 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1 block">Area</label>
              <Select value={editTableSection} onValueChange={setEditTableSection}>
                <SelectTrigger
                  data-testid="select-edit-table-section"
                  className="h-auto w-full rounded-xl border-2 border-white/20 bg-[#181B26] px-4 py-3.5 text-sm font-bold text-white focus:border-amber-400"
                >
                  <SelectValue placeholder="Select area" />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <button onClick={() => setEditingTableId(null)} className="flex-1 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-black text-xs uppercase tracking-wider transition-all">Cancel</button>
            <button onClick={saveEdit} className="flex-1 w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all">Save Changes</button>
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
      <div className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl mb-6 flex flex-col gap-4">
        <div>
          <h3 className="text-base font-black text-white tracking-wide">Digital Wallets</h3>
          <p className="text-xs font-bold text-zinc-300 mt-1">Enable and configure payment wallets</p>
        </div>

        <div className="space-y-3">
          {(['esewa', 'khalti', 'fonepay'] as const).map((key) => (
            <div key={key} className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-lg font-black text-white">{walletLabels[key]}</span>
                <button onClick={() => toggleWallet(key)} className="text-amber-400" data-testid={`toggle-wallet-${key}`}>
                  {settings.wallets[key].enabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} className="text-zinc-500" />}
                </button>
              </div>
              {settings.wallets[key].enabled && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                     <p className="text-xs font-black uppercase tracking-wider text-amber-400">Logo</p>
                    <div className="flex items-center gap-3">
                      {settings.wallets[key].logoImage ? (
                        <div className="relative w-12 h-12 flex-shrink-0">
                          <img src={settings.wallets[key].logoImage} alt={`${key} logo`} className="w-full h-full object-contain rounded-lg border border-border bg-white/5 p-1" />
                          <button onClick={() => clearWalletImage(key, 'logoImage')} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center"><X size={10} /></button>
                        </div>
                      ) : (
                         <div className="w-12 h-12 rounded-xl border-2 border-dashed border-white/20 bg-[#181B26] flex items-center justify-center flex-shrink-0">
                           <ImagePlus size={16} className="text-amber-400" />
                        </div>
                      )}
                       <label className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer">
                        <Upload size={12} /> {settings.wallets[key].logoImage ? 'Replace' : 'Upload'} Logo
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) updateWalletImage(key, 'logoImage', f); }} />
                      </label>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                     <p className="text-xs font-black uppercase tracking-wider text-amber-400">QR Image</p>
                    {settings.wallets[key].qrImage && (
                      <div className="relative w-32 h-32 mx-auto">
                        <img src={settings.wallets[key].qrImage} alt={`${key} QR`} className="w-full h-full object-contain rounded-lg border border-border bg-foreground p-1" />
                        <button onClick={() => clearWalletImage(key, 'qrImage')} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-danger text-white flex items-center justify-center"><X size={12} /></button>
                      </div>
                    )}
                     <label className="p-6 rounded-2xl border-2 border-dashed border-white/20 hover:border-amber-400/60 bg-[#181B26] flex flex-col items-center justify-center cursor-pointer transition-all gap-2 text-center group">
                       <Upload size={22} className="text-amber-400 group-hover:scale-110 transition-transform" />
                       <span className="text-xs font-black uppercase tracking-wider text-zinc-100 group-hover:text-white">{settings.wallets[key].qrImage ? 'Replace QR Code Image' : 'Upload QR Code Image'}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) updateWalletImage(key, 'qrImage', f); }} />
                    </label>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

         <div className="border-t border-white/15 pt-5 space-y-3">
           <p className="text-xs font-black text-amber-400 uppercase tracking-widest">Custom Wallets</p>
          {(settings.customWallets || []).map((wallet) => (
             <div key={wallet.id} className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                 <span className="text-lg font-black text-white">{wallet.name}</span>
                <div className="flex items-center gap-2">
                   <button onClick={() => toggleCustomWallet(wallet.id)} className="text-amber-400">
                     {wallet.enabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} className="text-zinc-500" />}
                  </button>
                  <button onClick={() => removeCustomWallet(wallet.id)} className="w-7 h-7 rounded-full bg-danger/15 text-danger flex items-center justify-center hover:bg-danger/30 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {wallet.enabled && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                     <p className="text-xs font-black uppercase tracking-wider text-amber-400">Logo</p>
                    <div className="flex items-center gap-3">
                      {wallet.logoImage ? (
                        <div className="relative w-12 h-12 flex-shrink-0">
                          <img src={wallet.logoImage} alt={`${wallet.name} logo`} className="w-full h-full object-contain rounded-lg border border-border bg-white/5 p-1" />
                          <button onClick={() => clearCustomWalletImage(wallet.id, 'logoImage')} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center"><X size={10} /></button>
                        </div>
                      ) : (
                         <div className="w-12 h-12 rounded-xl border-2 border-dashed border-white/20 bg-[#181B26] flex items-center justify-center flex-shrink-0">
                           <ImagePlus size={16} className="text-amber-400" />
                        </div>
                      )}
                       <label className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer">
                        <Upload size={12} /> {wallet.logoImage ? 'Replace' : 'Upload'} Logo
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) updateCustomWalletImage(wallet.id, 'logoImage', f); }} />
                      </label>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                     <p className="text-xs font-black uppercase tracking-wider text-amber-400">QR Image</p>
                    {wallet.qrImage && (
                      <div className="relative w-32 h-32 mx-auto">
                        <img src={wallet.qrImage} alt={`${wallet.name} QR`} className="w-full h-full object-contain rounded-lg border border-border bg-foreground p-1" />
                        <button onClick={() => clearCustomWalletImage(wallet.id, 'qrImage')} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-danger text-white flex items-center justify-center"><X size={12} /></button>
                      </div>
                    )}
                     <label className="p-6 rounded-2xl border-2 border-dashed border-white/20 hover:border-amber-400/60 bg-[#181B26] flex flex-col items-center justify-center cursor-pointer transition-all gap-2 text-center group">
                       <Upload size={22} className="text-amber-400 group-hover:scale-110 transition-transform" />
                       <span className="text-xs font-black uppercase tracking-wider text-zinc-100 group-hover:text-white">{wallet.qrImage ? 'Replace QR Code Image' : 'Upload QR Code Image'}</span>
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
                 className="flex-1 bg-[#181B26] border-2 border-white/20 focus:border-amber-400 text-white font-bold rounded-xl px-4 py-3 text-sm outline-none"
              />
               <button onClick={addCustomWallet} className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider transition-all">Add</button>
               <button onClick={() => { setShowAddWallet(false); setNewWalletName(''); }} className="px-4 py-3 rounded-xl bg-white/10 text-white font-black text-xs uppercase tracking-wider hover:bg-white/15 transition-all">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddWallet(true)}
               className="flex items-center gap-2 w-full py-3.5 rounded-2xl border-2 border-dashed border-white/20 text-zinc-300 text-xs font-black uppercase tracking-wider hover:border-amber-400/60 hover:text-amber-400 transition-all justify-center"
            >
              <Plus size={15} /> Add Custom Wallet
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── COMPANY PROFILE ────────────────────────────────────────────────────────
const CompanyProfileSection = () => {
  const settings = usePOSStore((s) => s.settings);
  const updateSettings = usePOSStore((s) => s.updateSettings);

  const [cafeName, setCafeName] = useState(settings.cafeName);
  const [cafeAddress, setCafeAddress] = useState(settings.cafeAddress || '');
  const [cafePhone, setCafePhone] = useState(settings.cafePhone || '');
  const [cafePan, setCafePan] = useState(settings.cafePan || '');
  const [vatEnabled, setVatEnabled] = useState(settings.vatEnabled ?? true);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Please choose an image under 2MB.');
      e.target.value = '';
      return;
    }
    try {
      const base64 = await compressLogoToBase64(file);
      updateSettings({ cafeLogo: base64, logo: base64, logoUrl: base64 });
      await pushLogoToFirebase(base64);
    } catch (error) {
      console.error('[Logo Upload] Failed:', error);
      toast.error('Unable to process the logo image.');
    } finally {
      e.target.value = '';
    }
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

  const inputCls = 'w-full bg-[#181B26] border-2 border-white/20 focus:border-amber-400 text-white font-bold rounded-xl px-4 py-3.5 text-sm placeholder:text-zinc-500 outline-none transition-all shadow-inner';

  return (
    <div className="space-y-5">
      <div className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl mb-6 flex flex-col gap-5">
        <div>
          <h3 className="text-base font-black text-white tracking-wide">Business Information</h3>
          <p className="text-xs font-bold text-zinc-300 mt-1">Appears on printed receipts</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1.5 block">Café Name</label>
            <input value={cafeName} onChange={(e) => setCafeName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1.5 block">Phone Number</label>
            <input value={cafePhone} onChange={(e) => setCafePhone(e.target.value)} placeholder="e.g. 01-XXXXXXX" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1.5 block">Street Address</label>
            <input value={cafeAddress} onChange={(e) => setCafeAddress(e.target.value)} placeholder="e.g. Kathmandu, Nepal" className={inputCls} />
          </div>
        </div>

        <div>
          <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1.5 block">Logo</label>
          <div className="flex items-center gap-4">
            {settings.cafeLogo ? (
                <div className="relative w-24 h-24 rounded-2xl bg-[#181B26] border-2 border-white/20 p-2 flex items-center justify-center overflow-hidden">
                <img src={settings.cafeLogo} alt="Logo" className="w-full h-full object-contain rounded-xl bg-white p-1" />
                <button
                  onClick={() => {
                    updateSettings({ cafeLogo: undefined, logo: undefined, logoUrl: undefined });
                    void pushLogoToFirebase(null);
                  }}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-[#181B26] border-2 border-white/20 flex items-center justify-center text-zinc-400">
                <ImagePlus size={22} />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md shadow-amber-500/20 transition-all flex items-center gap-2 cursor-pointer">
                <Upload size={14} /> {settings.cafeLogo ? 'Replace' : 'Upload'} Logo
                <input type="file" accept="image/png, image/jpeg, image/webp" className="hidden" onChange={handleLogoUpload} />
              </label>
              <p className="text-xs font-bold text-zinc-300 ml-4 leading-tight">PNG or JPG · Max 2MB · High contrast works best</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl mb-6 flex flex-col gap-5">
        <div>
          <h3 className="text-base font-black text-white tracking-wide">Tax Settings</h3>
          <p className="text-xs font-bold text-zinc-300 mt-1">VAT and PAN configuration</p>
        </div>
        <div>
          <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1.5 block">PAN / VAT Number</label>
          <input value={cafePan} onChange={(e) => setCafePan(e.target.value)} placeholder="e.g. 123456789" className={inputCls} />
        </div>
        <div className="flex items-center justify-between p-4 rounded-2xl bg-[#181B26] border border-white/15">
          <div>
            <p className="text-sm font-black text-white">Enable VAT (13%)</p>
            <p className="text-xs font-bold text-zinc-300 mt-0.5">Applies 13% VAT to all orders</p>
          </div>
          <button onClick={() => setVatEnabled((v) => !v)} className="flex-shrink-0 transition-all active:scale-95">
            {vatEnabled
              ? <ToggleRight size={36} className="text-amber-400" />
              : <ToggleLeft size={36} className="text-zinc-500" />}
          </button>
        </div>
      </div>

      <button
        onClick={saveAll}
        data-testid="button-save-bill-design"
        className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2"
      >
        <Save size={16} /> Save Changes
      </button>
    </div>
  );
};

// ── DATA MANAGEMENT ────────────────────────────────────────────────────────
const DataManagementSection = () => {
  const settings = usePOSStore((s) => s.settings);

  // Live Zustand state injected into the backup payload
  const maintenanceExpenses = useMaintenanceStore((s) => s.expenses);
  const alcoholProducts     = useInventoryStore((s) => s.alcoholProducts);
  const beverageProducts    = useInventoryStore((s) => s.beverageProducts);
  const cigaretteProducts   = useInventoryStore((s) => s.cigaretteProducts);
  const invMovements        = useInventoryStore((s) => s.invMovements);

  // ── Backup download ───────────────────────────────────────────────────────
  const handleDownloadFullBackup = (): boolean => {
    try {
      const json = db.exportFullBackup({
        maintenanceExpenses,
        alcoholProducts,
        beverageProducts,
        cigaretteProducts,
        invMovements,
      });
      const now   = new Date();
      const pad   = (n: number) => String(n).padStart(2, '0');
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
      const blob  = new Blob([json], { type: 'application/json' });
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      a.href      = url;
      a.download  = `Bamboo_POS_Backup_${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Full backup downloaded');
      return true;
    } catch (err) {
      console.error('[Backup] Export failed:', err);
      toast.error('Backup failed — please try again.');
      return false;
    }
  };

  // ── Safeguard modal state ─────────────────────────────────────────────────
  const restoreFileRef  = useRef<HTMLInputElement>(null);
  const [dmAction,      setDmAction]      = useState<null | 'restore' | 'reset'>(null);
  const [dmStep,        setDmStep]        = useState<'select' | 'backup' | 'warn' | 'pin' | 'confirm'>('warn');
  const [dmPin,         setDmPin]         = useState('');
  const [dmPinError,    setDmPinError]    = useState(false);
  const [dmConfirmText, setDmConfirmText] = useState('');
  const [dmFile,        setDmFile]        = useState<File | null>(null);
  const [dmSelection,   setDmSelection]   = useState<SelectiveResetSelection>(EMPTY_SELECTIVE_RESET_SELECTION);
  const [dmBackupSucceeded, setDmBackupSucceeded] = useState(false);
  const [dmWorking,     setDmWorking]     = useState(false);

  const openDM = (action: 'restore' | 'reset') => {
    setDmAction(action);
    setDmStep(action === 'reset' ? 'select' : 'warn');
    setDmPin('');
    setDmPinError(false);
    setDmConfirmText('');
    setDmFile(null);
    setDmSelection({ ...EMPTY_SELECTIVE_RESET_SELECTION });
    setDmBackupSucceeded(false);
  };

  const closeDM = () => { if (!dmWorking) setDmAction(null); };

  const handleDMPinNext = () => {
    if (dmPin === settings.adminPin) { setDmPinError(false); setDmStep('confirm'); }
    else setDmPinError(true);
  };

  const dmConfirmWord = dmAction === 'reset' ? 'RESET' : 'CONFIRM';
  const allResetModulesSelected = SELECTIVE_RESET_MODULES.every((module) => dmSelection[module.id]);
  const dmReady = dmAction === 'reset'
    ? dmBackupSucceeded && hasSelectedResetModule(dmSelection) && dmPin.length > 0 && dmConfirmText === 'RESET'
    : dmConfirmText === 'CONFIRM' && dmFile !== null;

  const handleResetSelectionContinue = () => {
    if (!hasSelectedResetModule(dmSelection)) return;
    const succeeded = handleDownloadFullBackup();
    if (succeeded) {
      setDmBackupSucceeded(true);
      setDmStep('backup');
    }
  };

  const handleDMExecute = async () => {
    if (dmAction === 'reset' && dmPin !== settings.adminPin) {
      setDmPinError(true);
      return;
    }
    setDmWorking(true);
    try {
      if (dmAction === 'restore') {
        const backupSucceeded = handleDownloadFullBackup();
        if (!backupSucceeded) { setDmWorking(false); return; }
        if (!dmFile) { toast.error('No backup file selected.'); setDmWorking(false); return; }
        const text   = await dmFile.text();
        const result = db.importFullBackup(text);
        if (!result.success) { toast.error(`Restore failed: ${result.error ?? 'Unknown error'}`); setDmWorking(false); return; }
        toast.success(`Backup restored (Schema v${result.version}). Reloading…`);
      } else {
        await executeSelectiveReset(dmSelection);
        toast.success('Selected transaction data cleared. Reloading…');
      }
      setTimeout(() => window.location.reload(), 1400);
    } catch (err) {
      console.error('[DataManagement] Execute failed:', err);
      toast.error('Action failed — please try again.');
      setDmWorking(false);
    }
  };

  return (
    <div className="space-y-5">

      {/* ── Info & coverage panel ─────────────────────────────────────────── */}
      <div className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl flex flex-col gap-4">
        <div>
          <h3 className="text-base font-black text-white tracking-wide">Backup Coverage</h3>
          <p className="text-xs font-bold text-zinc-300 mt-1">Schema v2 exports capture all 23 operational data domains in a single JSON file.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-2 text-xs font-bold text-zinc-300">
          {[
            'Orders & payments', 'Tables & floor layout', 'Menu, categories & pillars',
            'Ingredients, recipes & stock', 'Customers & Khatta ledgers', 'Staff accounts',
            'Kitchen purchases', 'Meat tracker entries', 'Maintenance expenses',
             'Grocery purchases', 'Inventory mappings', 'Bar restock audit', 'Alcohol / beverage / cigarettes',
          ].map((d) => (
            <div key={d} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              {d}
            </div>
          ))}
        </div>
      </div>

      {/* ── Security safeguards notice ────────────────────────────────────── */}
      <div className="bg-[#13151F] border border-amber-500/20 p-5 rounded-3xl shadow-xl flex gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <ShieldAlert size={17} className="text-amber-400" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-black text-white">Security Safeguards</p>
          <p className="text-xs font-bold text-zinc-300 leading-relaxed">
            Restore and Factory Reset require <span className="text-amber-400">Admin PIN verification</span> followed by typed text confirmation
            (<span className="text-orange-400 font-black">CONFIRM</span> or <span className="text-red-400 font-black">RESET</span>).
            A safety backup is automatically downloaded <span className="text-white">before</span> any destructive action runs.
          </p>
        </div>
      </div>

      {/* ── Hardware protection notice ────────────────────────────────────── */}
      <div className="bg-[#13151F] border border-blue-500/20 p-5 rounded-3xl shadow-xl flex gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Printer size={17} className="text-blue-400" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-black text-white">Hardware Config Always Preserved</p>
          <p className="text-xs font-bold text-zinc-300 leading-relaxed">
            Local Windows printer configuration (<span className="text-blue-300 font-black">printer_kitchen_device_name</span>,{' '}
            <span className="text-blue-300 font-black">printer_reception_device_name</span>,{' '}
            <span className="text-blue-300 font-black">pos_is_print_hub</span>) is strictly
            protected and never cleared during any reset or restore operation.
          </p>
        </div>
      </div>

      {/* ── Action cards ─────────────────────────────────────────────────── */}
      <div className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl flex flex-col gap-3">
        <h3 className="text-base font-black text-white tracking-wide">Actions</h3>

        {/* Download */}
        <button
          onClick={handleDownloadFullBackup}
          className="flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-[#181B26] border border-white/20 hover:border-amber-400/60 hover:bg-[#1e2130] active:scale-[0.98] transition-all text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <Download size={17} className="text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-black text-white">Download Full Backup</p>
            <p className="text-xs font-bold text-zinc-400 mt-0.5">JSON · Schema v2 · All 23 data domains · Instant download</p>
          </div>
        </button>

        {/* Restore */}
        <button
          onClick={() => openDM('restore')}
          className="flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-[#181B26] border border-orange-500/30 hover:border-orange-400/60 hover:bg-[#1e1814] active:scale-[0.98] transition-all text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center flex-shrink-0">
            <FileJson size={17} className="text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-black text-white">Restore Backup (.json)</p>
            <p className="text-xs font-bold text-zinc-400 mt-0.5">Overwrites current data · Admin PIN + CONFIRM required</p>
          </div>
        </button>

        {/* Factory reset */}
        <button
          onClick={() => openDM('reset')}
          className="flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-[#181B26] border border-red-500/30 hover:border-red-400/60 hover:bg-[#1e1415] active:scale-[0.98] transition-all text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
            <RotateCcw size={17} className="text-red-400" />
          </div>
          <div>
            <p className="text-sm font-black text-white">Factory Reset POS</p>
           <p className="text-xs font-bold text-zinc-400 mt-0.5">Clears selected transaction data · Masters stay protected · Admin PIN + RESET required</p>
          </div>
        </button>
      </div>

      {/* Hidden file input for restore */}
      <input
        ref={restoreFileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => { setDmFile(e.target.files?.[0] ?? null); e.target.value = ''; }}
      />

      {/* ── Deliberate reset / restore safeguard modal ───────────────────── */}
      <Dialog open={dmAction !== null} onOpenChange={(open) => { if (!open) closeDM(); }}>
        <DialogContent className="bg-[#0e1120] border border-white/10 rounded-3xl shadow-2xl max-w-lg w-[calc(100%-1.5rem)] max-h-[calc(100dvh-1.5rem)] p-0 overflow-hidden flex flex-col">
          <div className={`px-6 pt-6 pb-4 border-b border-white/10 flex items-center gap-3 ${dmAction === 'reset' ? 'bg-red-950/30' : 'bg-orange-950/20'}`}>
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${dmAction === 'reset' ? 'bg-red-500/20' : 'bg-orange-500/20'}`}>
              {dmAction === 'reset' ? <ShieldAlert size={20} className="text-red-400" /> : <AlertTriangle size={20} className="text-orange-400" />}
            </div>
            <div>
              <DialogTitle className="text-base font-black text-white">
                {dmAction === 'reset' ? 'Factory Reset POS' : 'Restore Backup'}
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400 mt-0.5">
                 {dmAction === 'reset'
                   ? `Step ${dmStep === 'select' ? '1' : dmStep === 'backup' ? '2' : '3'} of 3`
                   : `Step ${dmStep === 'warn' ? '1' : dmStep === 'pin' ? '2' : '3'} of 3`}
              </DialogDescription>
            </div>
          </div>

           <div className="px-6 py-5 space-y-5 overflow-y-auto">
             {/* Reset step 1: module selection */}
             {dmAction === 'reset' && dmStep === 'select' && (
               <div className="space-y-4">
                 <div className="rounded-2xl border border-red-500/30 bg-red-950/35 p-4">
                   <div className="flex items-start gap-3">
                     <ShieldAlert size={18} className="mt-0.5 flex-shrink-0 text-red-300" />
                     <div>
                       <p className="text-sm font-black text-white">Choose exactly what to clear</p>
                       <p className="mt-1 text-xs font-bold leading-relaxed text-red-100/75">
                         This is a selective reset of transaction data. Your operating masters stay intact.
                       </p>
                     </div>
                   </div>
                 </div>
                 <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#181B26] px-4 py-3">
                   <div>
                     <p className="text-sm font-black text-white">Select all transaction modules</p>
                     <p className="text-[11px] font-bold text-zinc-500">Six selectable areas</p>
                   </div>
                   <button
                     type="button"
                     onClick={() => {
                       setDmSelection(allResetModulesSelected ? { ...EMPTY_SELECTIVE_RESET_SELECTION } : Object.fromEntries(
                         SELECTIVE_RESET_MODULES.map((module) => [module.id, true]),
                       ) as SelectiveResetSelection);
                     }}
                     className={`rounded-lg border px-3 py-2 text-xs font-black transition-colors ${allResetModulesSelected ? 'border-red-400/50 text-red-200 hover:bg-red-500/10' : 'border-amber-400/60 text-amber-300 hover:bg-amber-500/10'}`}
                   >
                      {allResetModulesSelected ? 'Deselect all' : 'Select all'}
                   </button>
                 </div>
                 <div className="space-y-2">
                   {SELECTIVE_RESET_MODULES.map((module) => {
                     const checked = dmSelection[module.id];
                     return (
                       <label key={module.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${checked ? 'border-red-400/45 bg-red-500/[0.07]' : 'border-white/10 bg-[#181B26] hover:border-white/25'}`}>
                         <input
                           type="checkbox"
                           checked={checked}
                           onChange={() => setDmSelection((current) => ({ ...current, [module.id as SelectiveResetModuleId]: !current[module.id] }))}
                           className="mt-0.5 h-4 w-4 accent-red-500"
                         />
                         <span className="min-w-0">
                           <span className="block text-sm font-black text-white">{module.title}</span>
                           <span className="mt-0.5 block text-xs font-bold leading-relaxed text-zinc-400">{module.description}</span>
                         </span>
                       </label>
                     );
                   })}
                 </div>
                 <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3">
                   <p className="text-[11px] font-black uppercase tracking-wider text-emerald-300">Always protected</p>
                   <p className="mt-1 text-xs font-bold leading-relaxed text-emerald-100/75">
                     Table/floor layout, menu catalog, bar product definitions and mappings, staff accounts/PINs, Windows printer/print-hub settings, payment configuration, and immutable closed-shift archives.
                   </p>
                 </div>
                 <button onClick={handleResetSelectionContinue} disabled={!hasSelectedResetModule(dmSelection)} className="w-full rounded-2xl bg-red-600 py-3.5 text-sm font-black uppercase tracking-wider text-white transition-all hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40">
                   Back up and review reset
                 </button>
                 <button onClick={closeDM} className="w-full py-2.5 text-xs font-black text-zinc-400 transition-colors hover:text-white">Cancel</button>
               </div>
             )}

             {/* Reset step 2: automatic backup confirmation */}
             {dmAction === 'reset' && dmStep === 'backup' && (
               <div className="space-y-4">
                 <div className="rounded-2xl border border-emerald-500/35 bg-emerald-950/25 p-5">
                   <div className="flex items-center gap-3">
                     <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15"><CheckCircle2 size={21} className="text-emerald-300" /></div>
                     <div>
                       <p className="text-sm font-black text-emerald-200">Safety backup downloaded</p>
                       <p className="mt-0.5 text-xs font-bold text-emerald-100/65">The full JSON export completed before this reset.</p>
                     </div>
                   </div>
                 </div>
                 <div>
                   <p className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-400">Selected modules</p>
                   <div className="flex flex-wrap gap-2">
                     {SELECTIVE_RESET_MODULES.filter((module) => dmSelection[module.id]).map((module) => (
                       <span key={module.id} className="rounded-lg border border-red-400/25 bg-red-500/10 px-2.5 py-1.5 text-xs font-black text-red-200">{module.title}</span>
                     ))}
                   </div>
                 </div>
                 <p className="rounded-xl border border-white/10 bg-[#181B26] p-3 text-xs font-bold leading-relaxed text-zinc-300">
                   Nothing has been cleared yet. Continue only when this selection matches the intended service reset.
                 </p>
                 <button onClick={() => setDmStep('confirm')} className="w-full rounded-2xl bg-red-600 py-3.5 text-sm font-black uppercase tracking-wider text-white transition-all hover:bg-red-500">Continue to final confirmation</button>
                 <button onClick={() => setDmStep('select')} className="w-full py-2.5 text-xs font-black text-zinc-400 transition-colors hover:text-white">Back to module selection</button>
               </div>
             )}

             {/* Restore step A / existing warning */}
            {dmStep === 'warn' && (
              <div className="space-y-4">
                <div className={`rounded-2xl p-4 border text-sm font-bold leading-relaxed ${dmAction === 'reset' ? 'bg-red-950/40 border-red-500/30 text-red-200' : 'bg-orange-950/30 border-orange-500/30 text-orange-200'}`}>
                   {dmAction === 'restore' ? (
                    <>
                       <p className="font-black text-white mb-2">Restoring a backup will overwrite your current data:</p>
                      <ul className="space-y-1 text-xs list-disc list-inside text-orange-200/80">
                        <li>All current orders and payment history will be replaced</li>
                        <li>Menu, tables, customers, and staff will be replaced</li>
                        <li>Firebase-only data will re-sync after reload</li>
                      </ul>
                      <p className="mt-3 text-xs font-black text-white/70">A safety backup of current data downloads automatically before restore runs.</p>
                    </>
                   ) : null}
                </div>
                <button onClick={() => setDmStep('pin')} className={`w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider transition-all ${dmAction === 'reset' ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-orange-600 hover:bg-orange-500 text-white'}`}>
                  I Understand — Continue
                </button>
                <button onClick={closeDM} className="w-full py-2.5 rounded-xl text-xs font-black text-zinc-400 hover:text-white transition-colors">Cancel</button>
              </div>
            )}

             {/* Restore step B: PIN */}
             {dmAction === 'restore' && dmStep === 'pin' && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-2 block">Enter Master Admin PIN</label>
                  <input
                    type="password" inputMode="numeric" maxLength={8} autoFocus
                    value={dmPin}
                    onChange={(e) => { setDmPin(e.target.value); setDmPinError(false); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleDMPinNext()}
                    placeholder="••••"
                    className={`w-full bg-[#181B26] border-2 rounded-xl px-4 py-3.5 text-white font-black text-center text-lg tracking-[0.4em] outline-none transition-all shadow-inner ${dmPinError ? 'border-red-500 placeholder:text-red-400' : 'border-white/20 focus:border-amber-400 placeholder:text-zinc-500'}`}
                  />
                  {dmPinError && <p className="text-xs font-black text-red-400 mt-2 text-center">Incorrect PIN — try again</p>}
                </div>
                <button onClick={handleDMPinNext} disabled={dmPin.length < 4} className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-black text-sm uppercase tracking-wider transition-all">
                  Verify PIN
                </button>
                <button onClick={closeDM} className="w-full py-2.5 rounded-xl text-xs font-black text-zinc-400 hover:text-white transition-colors">Cancel</button>
              </div>
            )}

             {/* Final confirmation */}
             {dmStep === 'confirm' && (
              <div className="space-y-4">
                 {dmAction === 'reset' && (
                   <div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-4">
                     <p className="text-sm font-black text-white">Final authorization</p>
                     <p className="mt-1 text-xs font-bold leading-relaxed text-red-100/75">This clears only the selected modules. Protected masters and closed-shift archives remain untouched.</p>
                   </div>
                 )}
                {dmAction === 'restore' && (
                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-2 block">Select Backup File</label>
                    <button
                      type="button"
                      onClick={() => restoreFileRef.current?.click()}
                      className={`w-full py-3 px-4 rounded-xl border-2 border-dashed text-sm font-black transition-all flex items-center justify-center gap-2 ${dmFile ? 'border-green-500/60 bg-green-950/20 text-green-300' : 'border-white/20 hover:border-amber-400/50 text-zinc-400 hover:text-white bg-[#181B26]'}`}
                    >
                      <FileJson size={15} />
                      {dmFile ? dmFile.name : 'Choose .json backup file…'}
                    </button>
                  </div>
                )}
                 {dmAction === 'reset' && (
                   <div>
                     <label className="mb-2 block text-xs font-black uppercase tracking-wider text-amber-400">Master Admin PIN</label>
                     <input
                       type="password" inputMode="numeric" maxLength={8} value={dmPin}
                       onChange={(e) => { setDmPin(e.target.value); setDmPinError(false); }}
                       placeholder="Enter PIN"
                       className={`w-full rounded-xl border-2 bg-[#181B26] px-4 py-3.5 text-center text-lg font-black tracking-[0.4em] text-white outline-none transition-all shadow-inner ${dmPinError ? 'border-red-500' : 'border-white/20 focus:border-amber-400'}`}
                     />
                     {dmPinError && <p className="mt-2 text-center text-xs font-black text-red-400">Incorrect PIN — try again</p>}
                   </div>
                 )}
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-2 block">
                    Type <span className={`font-black ${dmAction === 'reset' ? 'text-red-400' : 'text-orange-400'}`}>{dmConfirmWord}</span> to confirm
                  </label>
                  <input
                    type="text"
                    autoFocus={dmAction === 'reset'}
                    value={dmConfirmText}
                    onChange={(e) => setDmConfirmText(e.target.value)}
                    placeholder={dmConfirmWord}
                    className="w-full bg-[#181B26] border-2 border-white/20 focus:border-amber-400 text-white font-black rounded-xl px-4 py-3.5 text-sm text-center tracking-widest outline-none transition-all shadow-inner placeholder:text-zinc-600"
                  />
                </div>
                <button
                  onClick={handleDMExecute}
                  disabled={!dmReady || dmWorking}
                  className={`w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${dmAction === 'reset' ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-orange-600 hover:bg-orange-500 text-white'}`}
                >
                  {dmWorking
                    ? <><RotateCcw size={14} className="animate-spin" /> Processing…</>
                    : dmAction === 'reset'
                      ? <><RotateCcw size={14} /> Execute Factory Reset</>
                      : <><FileJson size={14} /> Execute Restore</>}
                </button>
                <button onClick={closeDM} disabled={dmWorking} className="w-full py-2.5 rounded-xl text-xs font-black text-zinc-400 hover:text-white transition-colors disabled:opacity-40">Cancel</button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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

  const inputCls = 'w-full bg-[#181B26] border-2 border-white/20 focus:border-amber-400 text-white font-bold rounded-xl px-4 py-3.5 text-sm placeholder:text-zinc-500 outline-none transition-all shadow-inner';
  const nextBill = parseInt(billCounter || '1000', 10) + 1;
  const nextKot = parseInt(kotCounter || '100', 10) + 1;

  const sampleSubtotal = 680;
  const sampleVatAmount = settings.vatEnabled ? Math.round(sampleSubtotal * settings.vatRate) : 0;
  const sampleTotal = settings.vatEnabled ? sampleSubtotal + sampleVatAmount : sampleSubtotal;
  const sampleItems = [
    { id: 'preview-1', menuItemId: '1', name: 'Cappuccino', price: 250, quantity: 2 },
    { id: 'preview-2', menuItemId: '2', name: 'Croissant', price: 180, quantity: 1 },
  ];

  return (
    <div className="space-y-5">

      {/* Logo Display */}
      <div className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl mb-6 flex flex-col gap-5">
        <div>
          <h3 className="text-base font-black text-white tracking-wide">Logo Display</h3>
          <p className="text-xs font-bold text-zinc-300 mt-1">Control logo visibility on printed bills</p>
        </div>
        <div className="flex items-center justify-between p-4 rounded-2xl bg-[#181B26] border border-white/15">
          <div>
            <p className="text-sm font-black text-white">Show Logo on Printed Bills &amp; Receipts</p>
            <p className="text-xs font-bold text-zinc-300 mt-0.5">Requires a logo to be uploaded in Company Profile</p>
          </div>
          <button onClick={() => setShowLogoOnBill((v) => !v)} className="flex-shrink-0 transition-all active:scale-95">
            {showLogoOnBill
              ? <ToggleRight size={36} className="text-amber-400" />
              : <ToggleLeft size={36} className="text-zinc-500" />}
          </button>
        </div>
      </div>

      {/* Receipt Settings */}
      <div className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl mb-6 flex flex-col gap-5">
        <div>
          <h3 className="text-base font-black text-white tracking-wide">Receipt Settings</h3>
          <p className="text-xs font-bold text-zinc-300 mt-1">Customize receipt appearance</p>
        </div>
        <div>
          <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1.5 block">Footer Message</label>
          <input value={billFooter} onChange={(e) => setBillFooter(e.target.value)} placeholder="Thank you for visiting!" className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1.5 block">Current Bill Number</label>
          <input value={billCounter} onChange={(e) => setBillCounter(e.target.value)} type="number" className={inputCls} />
          <p className="text-xs font-bold text-amber-400 mt-1">Next bill will be #{isNaN(nextBill) ? 1001 : nextBill}</p>
        </div>
        <div>
          <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1.5 block">Current KOT Number</label>
          <input value={kotCounter} onChange={(e) => setKotCounter(e.target.value)} type="number" className={inputCls} />
          <p className="text-xs font-bold text-amber-400 mt-1">Next KOT will be #{isNaN(nextKot) ? 101 : nextKot}</p>
        </div>
        <div className="flex items-center justify-between p-4 rounded-2xl bg-[#181B26] border border-white/15">
          <div>
            <p className="text-sm font-black text-white">Reset KOT Numbers Daily</p>
            <p className="text-xs font-bold text-zinc-300 mt-0.5">Automatically resets the KOT sequence back to 1 at the start of each day</p>
          </div>
          <button onClick={() => setResetKotDaily((v) => !v)} className="flex-shrink-0 transition-all active:scale-95">
            {resetKotDaily
              ? <ToggleRight size={36} className="text-amber-400" />
              : <ToggleLeft size={36} className="text-zinc-500" />}
          </button>
        </div>
      </div>

      <button
        onClick={saveAll}
        className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2"
      >
        <Save size={16} /> Save Changes
      </button>

      <div className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl mb-6 flex flex-col gap-3">
        <h3 className="text-base font-black text-white tracking-wide">Bill Preview</h3>
        <p className="text-xs font-bold text-zinc-300">Preview of how your receipt will look</p>
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
          billNumber={isNaN(nextBill) ? 1001 : nextBill}
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
  const allMaintenanceExpenses = useMaintenanceStore((s) => s.expenses);
  const kitchenPurchases = useKitchenPurchasesStore((s) => s.purchases);
  const invMovements = useInventoryStore((s) => s.invMovements);

  const [period, setPeriod]         = useState<ReportPeriod>('today');
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  // Custom date range (ISO date strings yyyy-MM-dd)
  const [customStart, setCustomStart] = useState(() => format(subDays(new Date(), 6), 'yyyy-MM-dd'));
  const [customEnd,   setCustomEnd]   = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const PAGE_SIZE = 8;

  // End-of-day closing modal state
  const [zModal,      setZModal]      = useState(false);
  const [zPin,        setZPin]        = useState('');
  const [zStep,       setZStep]       = useState<'pin' | 'success'>('pin');
  const [zPinError,   setZPinError]   = useState('');
  const [zSavedShift, setZSavedShift] = useState<ClosedShift | null>(null);

  const now = new Date();
  const currentUser   = useStaffStore((s) => s.currentUser);
  const todayDateStr  = format(now, 'yyyy-MM-dd');

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
    // Use end-of-day so all transactions made today are always included
    return endOfDay(now).getTime();
  })();

  const periodPayments = payments.filter(
    (p) => p.createdAt >= periodStart.getTime() && p.createdAt < periodEnd,
  );

  // Maintenance expenses filtered to the same period (matched by ISO date string)
  const periodMaintenanceExpenses = allMaintenanceExpenses.filter((e) => {
    const ts = new Date(e.date + 'T00:00:00').getTime();
    return ts >= periodStart.getTime() && ts < periodEnd;
  });
  const totalMaintenanceExpenses = periodMaintenanceExpenses.reduce((s, e) => s + e.amount, 0);
  const totalKitchenPurchases = kitchenPurchases
    .filter((purchase) => {
      const ts = new Date(`${purchase.date}T00:00:00`).getTime();
      return ts >= periodStart.getTime() && ts < periodEnd;
    })
    .reduce((s, purchase) => s + purchase.totalCost, 0);
  const totalBarRestocks = invMovements
    .filter((movement) =>
      movement.source === 'bar' &&
      movement.quantity > 0 &&
      movement.timestamp >= periodStart.getTime() &&
      movement.timestamp < periodEnd
    )
    .reduce((s, movement) => s + (movement.totalCost ?? 0), 0);
  const totalOperatingExpenses = totalKitchenPurchases + totalBarRestocks + totalMaintenanceExpenses;

  // Summary metrics
  // grossSales  = item subtotals before any discount or tax
  // netSales    = grossSales minus discounts (pre-tax revenue)
  // totalRevenue = final amount actually collected (post-discount, post-tax)
  const grossSales     = periodPayments.reduce((s, p) => s + p.subtotal, 0);
  const totalDiscounts = periodPayments.reduce((s, p) => s + (p.discount || 0), 0);
  const netSales       = grossSales - totalDiscounts;
  const totalRevenue   = periodPayments.reduce((s, p) => s + p.total, 0);
  const totalVat       = periodPayments.reduce((s, p) => s + (p.vatAmount || 0), 0);
  const discountedCount = periodPayments.filter((p) => p.discount > 0).length;
  // Check if today has already been closed
  const todaysClosed = period === 'today'
    ? (db.getClosedShifts().find((s) => s.date === todayDateStr) ?? null)
    : null;

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

  const openZModal = () => {
    setZPin(''); setZPinError(''); setZStep('pin'); setZSavedShift(null); setZModal(true);
  };

  const handleZReportClose = () => {
    if (zPin !== settings.adminPin) {
      setZPinError('Incorrect PIN. Try again.');
      return;
    }
    const shift: ClosedShift = {
      shiftId:              crypto.randomUUID(),
      date:                 todayDateStr,
      closedAt:             new Date().toISOString(),
      closedBy:             currentUser?.name || 'Admin',
      grossSales,
      totalDiscounts,
      netSales,
      totalVat,
      totalRevenue,
      paymentBreakdown:     { ...paymentBreakdown },
      maintenanceExpenses:  totalMaintenanceExpenses,
      kitchenPurchases:     totalKitchenPurchases,
      barRestocks:          totalBarRestocks,
      totalOperatingExpenses,
      netProfit:            totalRevenue - totalOperatingExpenses,
      transactionCount:     periodPayments.length,
    };
    db.appendClosedShift(shift);
    setZSavedShift(shift);
    setZStep('success');
    toast.success('Business day closed — daily totals archived.');
  };

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
  const dateInputCls = 'px-4 py-2 rounded-xl bg-[#13151F] border border-white/15 text-white font-bold text-xs focus:outline-none focus:border-amber-400 [color-scheme:dark]';

  return (
    <div className="space-y-5">
      {/* ── Header toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mt-6">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(Object.entries(PERIOD_LABELS) as [ReportPeriod, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => changePeriod(key)}
              data-testid={`button-report-period-${key}`}
              className={`px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-all ${
                period === key
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20'
                  : 'bg-[#13151F] border border-white/15 text-zinc-200 hover:text-white hover:bg-white/10 font-bold'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            data-testid="button-export-csv"
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 border border-white/20 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm"
          >
            <Download size={14} /> CSV
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 border border-white/20 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm"
          >
            <Printer size={14} /> PDF
          </button>
          {period === 'today' && (
            todaysClosed ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-black uppercase tracking-wider">
                <Lock size={13} /> Closed &amp; Locked at {format(new Date(todaysClosed.closedAt), 'hh:mm a')}
              </div>
            ) : (
              <button
                onClick={openZModal}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm shadow-emerald-900/40"
              >
                <ClipboardCheck size={14} /> CLOSE BUSINESS DAY
              </button>
            )
          )}
        </div>
      </div>

      {/* ── Custom date range inputs (shown only when Custom is active) ── */}
      {period === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06]">
          <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex-shrink-0">Date Range</span>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={customStart}
              max={customEnd}
              onChange={(e) => { setCustomStart(e.target.value); setPage(1); }}
              className={dateInputCls}
            />
            <span className="text-xs font-bold text-zinc-300">to</span>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => { setCustomEnd(e.target.value); setPage(1); }}
              className={dateInputCls}
            />
          </div>
          <span className="text-xs font-bold text-zinc-300">
            {periodPayments.length} transaction{periodPayments.length !== 1 ? 's' : ''} in range
          </span>
        </div>
      )}

      {/* ── Business day status banner ── */}
      {period === 'today' && (
        todaysClosed ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/25">
            <Lock size={15} className="text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-xs font-black text-emerald-400 uppercase tracking-wider">BUSINESS DAY CLOSED &amp; LOCKED</p>
              <p className="text-xs text-zinc-300">Totals locked at {format(new Date(todaysClosed.closedAt), 'hh:mm a')} by {todaysClosed.closedBy}. This is an audited snapshot — live order changes do not affect it.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/[0.07] border border-amber-500/20">
            <History size={15} className="text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-xs font-black text-amber-400 uppercase tracking-wider">TODAY'S RUNNING SALES (LIVE)</p>
              <p className="text-xs text-zinc-300">Numbers update in real-time as bills are settled. Use 'Close Business Day' to lock final revenue.</p>
            </div>
          </div>
        )
      )}

      {/* ── Data cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
        {[
          { label: 'Gross Sales',          value: `Rs. ${fmt(grossSales)}`,                         color: 'sky',     icon: <TrendingUp size={16} /> },
          { label: 'Net Sales',            value: `Rs. ${fmt(netSales)}`,                           color: 'emerald', icon: <DollarSign size={16} /> },
          { label: 'Total Revenue',        value: `Rs. ${fmt(totalRevenue)}`,                       color: 'amber',  icon: <Receipt size={16} /> },
          { label: 'Discounts Given',      value: `Rs. ${fmt(totalDiscounts)}`,                     color: 'purple', icon: <X size={16} /> },
          { label: 'Maintenance & Expenses', value: `Rs. ${fmt(totalMaintenanceExpenses)}`,        color: 'rose',   icon: <Wrench size={16} /> },
          { label: 'Net Profit Margin',    value: `Rs. ${fmt(totalRevenue - totalOperatingExpenses)}`, color: totalRevenue - totalOperatingExpenses >= 0 ? 'profit' : 'loss', icon: <TrendingUp size={16} /> },
        ].map((card, i) => {
          const c = {
            sky:     { b: 'border-sky-500/40',     bg: 'bg-[#13151F]', ic: 'text-sky-400',     label: 'text-sky-400',     val: 'text-white',     shadow: 'shadow-sky-500/5' },
            emerald: { b: 'border-emerald-500/40', bg: 'bg-[#13151F]', ic: 'text-emerald-400', label: 'text-emerald-400', val: 'text-white',     shadow: 'shadow-emerald-500/5' },
            amber:   { b: 'border-amber-500/40',   bg: 'bg-[#13151F]', ic: 'text-amber-400',   label: 'text-amber-400',   val: 'text-white',     shadow: 'shadow-amber-500/5' },
            purple:  { b: 'border-purple-500/40',  bg: 'bg-[#13151F]', ic: 'text-purple-400',  label: 'text-purple-400',  val: 'text-white',     shadow: 'shadow-purple-500/5' },
            rose:    { b: 'border-rose-500/40',    bg: 'bg-[#181116]', ic: 'text-rose-400',    label: 'text-rose-400',    val: 'text-rose-400 drop-shadow-[0_0_12px_rgba(244,63,94,0.3)]', shadow: 'shadow-rose-500/5' },
            profit:  { b: 'border-emerald-500/50', bg: 'bg-[#0F1916]', ic: 'text-emerald-400', label: 'text-emerald-400', val: 'text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.3)]', shadow: 'shadow-emerald-500/10' },
            loss:    { b: 'border-rose-500/50',    bg: 'bg-[#181116]', ic: 'text-rose-400',    label: 'text-rose-400',    val: 'text-rose-400', shadow: 'shadow-rose-500/5' },
          }[card.color]!;
          return (
            <div key={i} className={`p-6 rounded-2xl ${c.bg} border-2 ${c.b} shadow-xl ${c.shadow} flex flex-col justify-between min-h-[140px]`}>
              <div className={`w-9 h-9 rounded-xl bg-white/5 border ${c.b} flex items-center justify-center mb-4`}>
                <span className={c.ic}>{card.icon}</span>
              </div>
              <div>
                <p className={`text-xs font-black uppercase tracking-wider ${c.label}`}>{card.label}</p>
                <p className={`text-3xl font-black tracking-tight mt-1 ${c.val}`}>{card.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Analytics grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6">
        {/* Sales by category — donut */}
        <div className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl flex flex-col min-h-[340px]">
          <h3 className="text-base font-black text-white tracking-wide">Category Breakdown</h3>
          {catData.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-white/10 rounded-2xl bg-white/[0.02] mt-4">
              <BarChart3 size={36} className="text-amber-400 mb-2" />
              <p className="text-sm font-black text-white">No sales data recorded for this period.</p>
              <p className="text-xs font-bold text-zinc-300 mt-1">Analytics will populate automatically as customer bills are finalized.</p>
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-5 mt-4">
              <div className="flex-shrink-0">
                <PieChart width={150} height={150}>
                  <Pie data={catData} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={46} outerRadius={68} paddingAngle={3} strokeWidth={0}>
                    {catData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      fontSize: 12,
                      color: '#ffffff',
                      fontWeight: 'bold',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                    }}
                    itemStyle={{ color: '#ffffff' }}
                    labelStyle={{ color: '#94a3b8', fontWeight: 'normal', marginBottom: 2 }}
                    formatter={(v: number) => [`Rs. ${fmt(v)}`, 'Revenue']}
                  />
                </PieChart>
              </div>
              <div className="flex-1 space-y-2 min-w-0">
                {(() => {
                  const catTotal = catData.reduce((s, c) => s + c.total, 0);
                  return catData.map((cat, i) => {
                    const pct = catTotal > 0 ? Math.round((cat.total / catTotal) * 100) : 0;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                        <span className="text-xs text-foreground font-medium flex-1 truncate">{cat.name}</span>
                        <span className="text-xs font-semibold text-muted-foreground">{pct}%</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Payment breakdown */}
        <div className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl flex flex-col min-h-[340px]">
          <h3 className="text-base font-black text-white tracking-wide">Payment Breakdown</h3>
          {paymentEntries.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-white/10 rounded-2xl bg-white/[0.02] mt-4">
              <CreditCard size={36} className="text-amber-400 mb-2" />
              <p className="text-sm font-black text-white">No sales data recorded for this period.</p>
              <p className="text-xs font-bold text-zinc-300 mt-1">Analytics will populate automatically as customer bills are finalized.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center space-y-3.5 mt-4">
              {paymentEntries.map(([method, total], i) => {
                const pct   = totalRevenue > 0 ? Math.round((total / totalRevenue) * 100) : 0;
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
      <div className="bg-[#13151F] border border-white/15 p-6 rounded-3xl shadow-xl">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h3 className="text-base font-black text-white tracking-wide">Detailed Transactions</h3>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search bill, table, staff…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-8 pr-3 py-2 rounded-xl bg-[#181B26] border-2 border-white/20 text-white font-bold text-xs placeholder:text-zinc-400 focus:outline-none focus:border-amber-400 w-52"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
            <Receipt size={36} className="text-amber-400 mb-2" />
            <p className="text-sm font-black text-white">{search ? 'No matching transactions' : 'No transactions this period'}</p>
            <p className="text-xs font-bold text-zinc-300 mt-1">{search ? 'Try a different search term' : 'Completed orders will appear here'}</p>
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="hidden sm:grid grid-cols-[90px_56px_80px_52px_110px_80px_96px_1fr] gap-2 px-3 py-1.5 text-[10px] font-black text-zinc-300 uppercase tracking-wider border-b border-white/10 mb-1">
              <span>Time</span><span>Bill #</span><span>Table</span>
              <span className="text-center">Items</span><span>Method</span>
              <span className="text-right">Discount</span><span className="text-right">Total</span><span>Staff</span>
            </div>
            <div className="space-y-0.5">
              {paginated.map((p) => (
                <div
                  key={p.id}
                  className="hidden sm:grid grid-cols-[90px_56px_80px_52px_110px_80px_96px_1fr] gap-2 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors"
                >
                  <span className="text-xs text-zinc-300 tabular-nums">{format(p.createdAt, 'hh:mm a')}</span>
                  <span className="text-xs font-mono text-zinc-300">#{p.billNumber}</span>
                  <span className="text-xs font-bold text-white truncate">{tableDisplayName(p.tableNumber)}</span>
                  <span className="text-xs text-center text-zinc-300">{p.items.reduce((s, i) => s + i.quantity, 0)}</span>
                  <span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-black capitalize">
                      {resolvePaymentLabel(p.method, settings)}
                    </span>
                  </span>
                  <span className="text-xs text-right font-medium text-amber-400">{p.discount > 0 ? `Rs. ${fmt(p.discount)}` : '—'}</span>
                  <span className="text-sm text-right font-black text-white">Rs. {fmt(p.total)}</span>
                  <span className="text-xs text-zinc-300 truncate">{p.processedBy?.name || p.takenBy?.name || '—'}</span>
                </div>
              ))}
              {/* Mobile fallback rows */}
              {paginated.map((p) => (
                <div key={`m-${p.id}`} className="sm:hidden flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-300">#{p.billNumber}</span>
                      <span className="text-xs font-bold text-white">{tableDisplayName(p.tableNumber)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-zinc-300">{format(p.createdAt, 'hh:mm a')}</span>
                      <span className="text-[10px] text-zinc-300">{p.processedBy?.name || p.takenBy?.name || ''}</span>
                    </div>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-black capitalize flex-shrink-0">
                    {resolvePaymentLabel(p.method, settings)}
                  </span>
                  <span className="text-sm font-black text-white flex-shrink-0">Rs. {fmt(p.total)}</span>
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

      {/* ── End of day closing modal ── */}
      <Dialog open={zModal} onOpenChange={(o) => { if (!o) { setZModal(false); setZPin(''); setZStep('pin'); setZPinError(''); } }}>
        <DialogContent className="max-w-lg bg-[#0d0f1a] border border-white/15 text-white">
          <DialogHeader>
            <DialogTitle className="text-white font-black flex items-center gap-2">
              {zStep === 'success'
                ? <><CheckCircle2 size={18} className="text-emerald-400" /> Business Day Closed</>
                : <><ClipboardCheck size={18} className="text-amber-400" /> End of Day Closing Summary</>
              }
            </DialogTitle>
            <DialogDescription className="text-zinc-300 text-xs">
              {zStep === 'success'
                ? "Today's financial totals are permanently locked. View the full record in Closed Day History."
                : "Review today's final totals before entering your Admin PIN to lock the day's records."}
            </DialogDescription>
          </DialogHeader>

          {zStep === 'pin' && (
            <div className="space-y-4 py-2">
              {/* Today's compiled summary */}
              <div className="grid grid-cols-2 gap-2">
                {([
                  { label: 'Total Revenue',  value: `Rs. ${fmt(totalRevenue)}` },
                  { label: 'Transactions',   value: String(periodPayments.length) },
                  { label: 'Discounts',      value: `Rs. ${fmt(totalDiscounts)}` },
                  { label: 'VAT Collected',  value: `Rs. ${fmt(totalVat)}` },
                  { label: 'Expenses',       value: `Rs. ${fmt(totalOperatingExpenses)}` },
                  { label: 'Net Profit',     value: `Rs. ${fmt(totalRevenue - totalOperatingExpenses)}` },
                ] as { label: string; value: string }[]).map(({ label, value }) => (
                  <div key={label} className="bg-[#13151F] border border-white/10 rounded-xl px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
                    <p className="text-sm font-black text-white mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-zinc-300">Admin PIN</label>
                <input
                  type="password"
                  value={zPin}
                  onChange={(e) => { setZPin(e.target.value); setZPinError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleZReportClose()}
                  placeholder="Enter admin PIN to lock"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#13151F] border-2 border-white/20 text-white font-bold text-sm placeholder:text-zinc-400 focus:outline-none focus:border-amber-400"
                  autoFocus
                />
                {zPinError && <p className="text-xs font-bold text-rose-400">{zPinError}</p>}
              </div>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
                <p className="text-xs font-bold text-amber-300">Once locked, archived totals cannot be modified or recalculated.</p>
              </div>
            </div>
          )}

          {zStep === 'success' && zSavedShift && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                <CheckCircle2 size={22} className="text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-black text-white">Daily closing saved for {zSavedShift.date}</p>
                  <p className="text-xs text-emerald-300 mt-0.5">
                    Closed {format(new Date(zSavedShift.closedAt), 'hh:mm a')} · {zSavedShift.transactionCount} transaction{zSavedShift.transactionCount !== 1 ? 's' : ''} · Rs. {fmt(zSavedShift.totalRevenue)}
                  </p>
                </div>
              </div>
              <p className="text-[10px] font-mono text-zinc-600 px-1">Shift ID: {zSavedShift.shiftId}</p>
            </div>
          )}

          <DialogFooter className="gap-2">
            {zStep === 'pin' ? (
              <>
                <button
                  onClick={() => { setZModal(false); setZPin(''); setZPinError(''); }}
                  className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white font-black text-xs uppercase tracking-wider hover:bg-white/20 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleZReportClose}
                  className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95"
                >
                  <Lock size={13} /> Lock & Archive
                </button>
              </>
            ) : (
              <button
                onClick={() => { setZModal(false); setZPin(''); setZStep('pin'); setZSavedShift(null); }}
                className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider transition-all active:scale-95"
              >
                Done
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── CLOSED DAY HISTORY ───────────────────────────────────────────────────────
const ShiftHistorySection = () => {
  const settings = usePOSStore((s) => s.settings);
  const [shifts]   = useState<ClosedShift[]>(() => db.getClosedShifts().slice().reverse());
  const [expanded, setExpanded] = useState<string | null>(null);

  if (shifts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-white/10 rounded-2xl bg-white/[0.02] mt-4">
        <History size={40} className="text-amber-400 mb-3" />
        <p className="text-sm font-black text-white">No closed business days yet</p>
        <p className="text-xs font-bold text-zinc-300 mt-2">
          Use "Close Business Day" in Sales Reports to lock and archive daily totals.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-2">
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/[0.07] border border-emerald-500/20">
        <ShieldAlert size={15} className="text-emerald-400 flex-shrink-0" />
        <p className="text-xs font-bold text-emerald-300">
          <strong>Historical Audited Closings</strong> — These records are permanent and tamper-proof.
        </p>
      </div>

      {shifts.map((shift) => {
        const isOpen = expanded === shift.shiftId;
        return (
          <div key={shift.shiftId} className="bg-[#13151F] border border-white/15 rounded-2xl overflow-hidden">
            {/* Row header */}
            <button
              onClick={() => setExpanded(isOpen ? null : shift.shiftId)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                  <ClipboardCheck size={15} className="text-emerald-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-black text-white">{shift.date}</p>
                  <p className="text-xs text-zinc-300">
                    Closed {format(new Date(shift.closedAt), 'hh:mm a')} · by {shift.closedBy}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-black text-amber-400">Rs. {fmt(shift.totalRevenue)}</p>
                  <p className="text-[10px] text-zinc-400">{shift.transactionCount} txn{shift.transactionCount !== 1 ? 's' : ''}</p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                  Locked
                </span>
                {isOpen ? <ChevronUp size={15} className="text-zinc-400" /> : <ChevronDown size={15} className="text-zinc-400" />}
              </div>
            </button>

            {/* Expanded detail */}
            {isOpen && (
              <div className="px-5 pb-5 border-t border-white/10 pt-4 space-y-4">
                {/* Financial grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {([
                    { label: 'Gross Sales',   value: shift.grossSales,              color: 'sky' },
                    { label: 'Discounts',     value: shift.totalDiscounts,          color: 'purple' },
                    { label: 'Net Sales',     value: shift.netSales,                color: 'emerald' },
                    { label: 'VAT Collected', value: shift.totalVat,                color: 'zinc' },
                    { label: 'Total Revenue', value: shift.totalRevenue,            color: 'amber' },
                    { label: 'Expenses',      value: shift.totalOperatingExpenses,  color: 'rose' },
                    { label: 'Net Profit',    value: shift.netProfit,               color: shift.netProfit >= 0 ? 'profit' : 'loss' },
                  ] as { label: string; value: number; color: string }[]).map(({ label, value, color }) => {
                    const tc =
                      color === 'sky'     ? 'text-sky-400'     :
                      color === 'purple'  ? 'text-purple-400'  :
                      color === 'emerald' ? 'text-emerald-400' :
                      color === 'amber'   ? 'text-amber-400'   :
                      color === 'rose'    ? 'text-rose-400'    :
                      color === 'profit'  ? 'text-emerald-400' :
                      color === 'loss'    ? 'text-rose-400'    : 'text-white';
                    return (
                      <div key={label} className="bg-[#0d0f1a] border border-white/10 rounded-xl px-3 py-2.5">
                        <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
                        <p className={`text-sm font-black mt-0.5 ${tc}`}>Rs. {fmt(value)}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Payment breakdown */}
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-zinc-400 mb-2">Payment Breakdown</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(shift.paymentBreakdown).map(([method, total]) => (
                      <div key={method} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/10">
                        <span className="text-xs font-black text-white capitalize">
                          {resolvePaymentLabel(method, settings)}
                        </span>
                        <span className="text-xs font-bold text-amber-400">Rs. {fmt(total)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-[10px] font-mono text-zinc-600">Shift ID: {shift.shiftId}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AdminPanel;
