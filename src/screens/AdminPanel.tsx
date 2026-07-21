import { useState, useRef } from 'react';
import { usePOSStore } from '@/store/usePOSStore';
import AppLayout from '@/components/ui/AppLayout';
import ReceiptPreview from '@/components/ReceiptPreview';
import { InventorySection } from '@/screens/InventorySection';
import { toast } from 'sonner';
import {
  BarChart3, Coffee, CreditCard, Table2, TrendingUp, FileDown,
  Plus, Trash2, Edit3, Save, X, Lock, DollarSign, ShoppingCart,
  Download, Upload, Smartphone, ToggleLeft, ToggleRight,
  Receipt, ImagePlus, Image, Menu as MenuIcon, Users, Package,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmt } from '@/utils/format';
import { format, startOfDay, subDays, startOfWeek, startOfMonth } from 'date-fns';

type AdminTab = 'dashboard' | 'menu' | 'tables' | 'payments' | 'bill' | 'reports' | 'backup' | 'inventory';

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
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const settings = usePOSStore((s) => s.settings);

  const handlePinSubmit = () => {
    if (pin === settings.adminPin) {
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
    { id: 'dashboard', label: 'Dashboard',       icon: <BarChart3 size={15} />,  subtitle: 'Overview of your café performance' },
    { id: 'menu',      label: 'Menu',            icon: <Coffee size={15} />,     subtitle: 'Manage items and categories' },
    { id: 'tables',    label: 'Tables',          icon: <Table2 size={15} />,     subtitle: 'Add or remove tables' },
    { id: 'payments',  label: 'Payments',        icon: <CreditCard size={15} />, subtitle: 'Configure payment methods' },
    { id: 'bill',      label: 'Company Profile', icon: <Receipt size={15} />,    subtitle: 'Business info and receipt settings' },
    { id: 'reports',   label: 'Reports',         icon: <TrendingUp size={15} />, subtitle: 'Sales reports and exports' },
    { id: 'inventory', label: 'Inventory',       icon: <Package size={15} />,    subtitle: 'Stock management for alcohol, beverages, cigarettes & groceries' },
    { id: 'backup',    label: 'Backup',          icon: <FileDown size={15} />,   subtitle: 'Export, restore or reset data' },
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
            {activeTab === 'payments'  && <PaymentsSection />}
            {activeTab === 'bill'      && <BillDesignSection />}
            {activeTab === 'reports'   && <ReportsSection />}
            {activeTab === 'inventory' && <InventorySection />}
            {activeTab === 'backup'    && <BackupSection />}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

// ── DASHBOARD ──────────────────────────────────────────────────────────────
const DashboardSection = () => {
  const payments = usePOSStore((s) => s.payments);
  const today = startOfDay(new Date()).getTime();

  const todayPayments = payments.filter((p) => p.createdAt >= today);
  const todaySales = todayPayments.reduce((s, p) => s + p.total, 0);
  const todayOrders = todayPayments.length;
  const cashToday = todayPayments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.total, 0);
  const digitalToday = todaySales - cashToday;

  const itemCounts: Record<string, { name: string; count: number; revenue: number }> = {};
  todayPayments.forEach((p) => {
    p.items.forEach((i) => {
      if (!itemCounts[i.menuItemId]) itemCounts[i.menuItemId] = { name: i.name, count: 0, revenue: 0 };
      itemCounts[i.menuItemId].count += i.quantity;
      itemCounts[i.menuItemId].revenue += i.price * i.quantity;
    });
  });
  const topItems = Object.values(itemCounts).sort((a, b) => b.count - a.count).slice(0, 5);

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const day = startOfDay(subDays(new Date(), 6 - i));
    const dayEnd = startOfDay(subDays(new Date(), 5 - i));
    const daySales = payments
      .filter((p) => p.createdAt >= day.getTime() && p.createdAt < (i === 6 ? Date.now() : dayEnd.getTime()))
      .reduce((s, p) => s + p.total, 0);
    return { day: format(day, 'EEE'), sales: daySales };
  });

  const stats = [
    { label: "Today's Sales",  value: `Rs. ${fmt(todaySales)}`,   icon: <DollarSign size={18} />,  color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20' },
    { label: 'Orders Today',   value: todayOrders,                icon: <ShoppingCart size={18} />, color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20' },
    { label: 'Cash Sales',     value: `Rs. ${fmt(cashToday)}`,    icon: <DollarSign size={18} />,   color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20' },
    { label: 'Digital Sales',  value: `Rs. ${fmt(digitalToday)}`, icon: <Smartphone size={18} />,  color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s, i) => (
          <div
            key={i}
            className={`bg-card rounded-2xl border ${s.border} p-4 hover:scale-[1.01] hover:shadow-lg transition-all cursor-default`}
          >
            <div className={`w-9 h-9 rounded-xl ${s.bg} border ${s.border} flex items-center justify-center mb-3`}>
              <span className={s.color}>{s.icon}</span>
            </div>
            <p className="text-2xl font-bold text-foreground leading-tight">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-foreground">Weekly Sales</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Revenue over the last 7 days</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={last7} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="day" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                background: '#0d1525',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                color: '#fff',
                fontSize: 13,
              }}
            />
            <Bar dataKey="sales" fill="rgba(59,130,246,0.7)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="font-semibold text-foreground mb-4">Top Selling Items Today</h3>
        {topItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ShoppingCart size={32} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm">No sales recorded today yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {topItems.map((item, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40 hover:bg-secondary/60 transition-colors">
                <span className="w-7 h-7 rounded-lg bg-accent/15 text-accent flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm text-foreground font-medium">{item.name}</span>
                <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-lg">{item.count} sold</span>
                <span className="text-sm font-semibold text-accent">Rs. {fmt(item.revenue)}</span>
              </div>
            ))}
          </div>
        )}
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

// ── MENU MANAGEMENT ──────────────────────────────────────────────────────

const MenuSection = () => {
  const pillars = usePOSStore((s) => s.pillars);
  const addPillar = usePOSStore((s) => s.addPillar);
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

  const filteredCats = pillarFilter === 'All'
    ? categories
    : categories.filter((c) => c.parentCategory === pillarFilter);

  const handleSetPillarFilter = (f: string) => {
    setPillarFilter(f);
    if (f !== 'All') setNewCatParent(f);
    // Keep selection valid — if selected cat is no longer in view, pick first visible
    const inView = f === 'All' ? categories : categories.filter((c) => c.parentCategory === f);
    if (!inView.find((c) => c.id === selectedCat)) {
      setSelectedCat(inView[0]?.id || '');
    }
  };

  const CORE_PILLARS = ['Foods', 'Beverages', 'Cigarettes', 'Hukkah'];
  const isCustomPillar = pillarFilter !== 'All' && !CORE_PILLARS.includes(pillarFilter);

  const handleDeletePillar = () => {
    if (!isCustomPillar) return;
    if (window.confirm(`Are you sure you want to delete the "${pillarFilter}" pillar?`)) {
      deletePillar(pillarFilter);
      setPillarFilter('All');
      toast.success(`Pillar "${pillarFilter}" deleted`);
    }
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
    <div className="grid md:grid-cols-[280px_1fr] gap-5">
      {/* ── Left: Categories ── */}
      <div className="space-y-3 md:sticky md:top-0 md:self-start">
        <div className="bg-card rounded-2xl border border-border p-4">
          {/* ── Header row ── */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground text-sm">Categories</h3>
            <div className="flex items-center gap-1.5">
              {isCustomPillar && filteredCats.length > 0 && (
                <button
                  onClick={handleDeletePillar}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95"
                  style={{ background: 'rgba(239,68,68,0.08)', color: 'rgba(239,68,68,0.7)', border: '1px solid rgba(239,68,68,0.2)' }}
                  title={`Delete "${pillarFilter}" pillar`}
                >
                  <Trash2 size={11} strokeWidth={2} />
                  Delete "{pillarFilter}"
                </button>
              )}
              <button
                onClick={() => { setShowAddCat((v) => !v); setNewCat(''); }}
                data-testid="button-toggle-add-category"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95"
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
                Category
              </button>
            </div>
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
                    {mode === 'sub' ? 'Sub-Category' : 'Main Pillar'}
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
                          onClick={(e) => { e.stopPropagation(); deleteCategory(c.id); }}
                          className="p-1 rounded hover:bg-danger/20 text-white/40 hover:text-danger"
                        ><Trash2 size={11} /></button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {filteredCats.length === 0 && (
              <div className="text-center py-4 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {pillarFilter === 'All' ? 'No categories yet.' : `No ${pillarFilter} categories yet.`}
                </p>
                {isCustomPillar && (
                  <button
                    onClick={handleDeletePillar}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95"
                    style={{ background: 'rgba(239,68,68,0.08)', color: 'rgba(239,68,68,0.65)', border: '1px solid rgba(239,68,68,0.18)' }}
                  >
                    <Trash2 size={11} strokeWidth={2} />
                    Delete "{pillarFilter}" Pillar
                  </button>
                )}
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
                      <button onClick={() => deleteMenuItem(item.id)} className="p-2 rounded-lg text-danger/50 hover:text-danger hover:bg-danger/10 transition-colors"><Trash2 size={14} /></button>
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
  );
};

// ── TABLE MANAGEMENT ──────────────────────────────────────────────────────
const TablesSection = () => {
  const tables = usePOSStore((s) => s.tables);
  const addTable = usePOSStore((s) => s.addTable);
  const deleteTable = usePOSStore((s) => s.deleteTable);
  const [newNum, setNewNum] = useState('');

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    free:    { label: 'Free',      color: 'text-green-400',  bg: 'bg-green-500/12 border-green-500/25' },
    active:  { label: 'Occupied',  color: 'text-blue-400',   bg: 'bg-blue-500/12 border-blue-500/25' },
    billing: { label: 'Billing',   color: 'text-amber-400',  bg: 'bg-amber-500/12 border-amber-500/25' },
  };

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="font-semibold text-foreground text-sm mb-3">Add Table</h3>
        <div className="flex gap-2 max-w-xs">
          <input
            value={newNum}
            onChange={(e) => setNewNum(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && Number(newNum) > 0) { addTable(Number(newNum)); setNewNum(''); toast.success(`Table ${newNum} added`); } }}
            type="number"
            placeholder="Table number"
            data-testid="input-table-number"
            className="flex-1 px-3 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent h-11"
          />
          <button
            onClick={() => { if (Number(newNum) > 0) { addTable(Number(newNum)); toast.success(`Table ${newNum} added`); setNewNum(''); } }}
            data-testid="button-add-table"
            className="px-4 py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-semibold flex items-center gap-1.5 hover:brightness-110 transition-all active:scale-95 h-11"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {tables.sort((a, b) => a.number - b.number).map((t) => {
          const cfg = statusConfig[t.status] || statusConfig.free;
          return (
            <div
              key={t.id}
              className="bg-card rounded-2xl border border-border p-4 flex flex-col gap-3 hover:border-white/20 hover:shadow-lg transition-all"
              data-testid={`table-row-${t.id}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-foreground text-base">Table {t.number}</p>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border mt-1.5 ${cfg.bg} ${cfg.color}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                    {cfg.label}
                  </span>
                </div>
                <button
                  onClick={() => { deleteTable(t.id); toast.success(`Table ${t.number} removed`); }}
                  disabled={t.status !== 'free'}
                  className="p-2 rounded-xl text-danger/50 hover:text-danger hover:bg-danger/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {t.pax && t.pax > 0 && t.status !== 'free' && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users size={12} />
                  {t.pax} guest{t.pax !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          );
        })}
        {tables.length === 0 && (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            <Table2 size={36} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm font-medium">No tables configured</p>
            <p className="text-xs mt-1 opacity-60">Add a table number above to get started</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ── PAYMENT SETTINGS ──────────────────────────────────────────────────────
const PaymentsSection = () => {
  const settings = usePOSStore((s) => s.settings);
  const updateSettings = usePOSStore((s) => s.updateSettings);

  const [cafeName, setCafeName] = useState(settings.cafeName);
  const [adminPin, setAdminPin] = useState(settings.adminPin);
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
          <h3 className="font-semibold text-foreground">General Settings</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Basic café and security settings</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Café Name</label>
            <input
              value={cafeName}
              onChange={(e) => setCafeName(e.target.value)}
              onBlur={() => { updateSettings({ cafeName }); toast.success('Settings saved'); }}
              data-testid="input-cafe-name"
              className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-accent h-11"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Admin PIN</label>
            <input
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              onBlur={() => { updateSettings({ adminPin }); toast.success('PIN updated'); }}
              data-testid="input-admin-pin-change"
              className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-accent h-11"
              type="password"
            />
          </div>
        </div>
      </div>

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
const BillDesignSection = () => {
  const settings = usePOSStore((s) => s.settings);
  const updateSettings = usePOSStore((s) => s.updateSettings);

  const [cafeName, setCafeName] = useState(settings.cafeName);
  const [cafeAddress, setCafeAddress] = useState(settings.cafeAddress || '');
  const [cafePhone, setCafePhone] = useState(settings.cafePhone || '');
  const [cafePan, setCafePan] = useState(settings.cafePan || '');
  const [vatEnabled, setVatEnabled] = useState(settings.vatEnabled ?? true);
  const [billFooter, setBillFooter] = useState(settings.billFooter || 'Thank you for visiting!');
  const [billCounter, setBillCounter] = useState(String(settings.billCounter));

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateSettings({ cafeLogo: reader.result as string });
    reader.readAsDataURL(file);
  };

  const saveAll = () => {
    updateSettings({
      cafeName,
      cafeAddress: cafeAddress || undefined,
      cafePhone: cafePhone || undefined,
      cafePan: cafePan || undefined,
      vatEnabled,
      billFooter: billFooter || undefined,
      billCounter: Number(billCounter) || settings.billCounter,
    });
    toast.success('Changes saved successfully');
  };

  const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 h-11 transition-colors';

  const sampleSubtotal = 680;
  const sampleVatAmount = vatEnabled ? Math.round(sampleSubtotal * settings.vatRate) : 0;
  const sampleTotal = vatEnabled ? sampleSubtotal + sampleVatAmount : sampleSubtotal;
  const sampleItems = [
    { menuItemId: '1', name: 'Cappuccino', price: 250, quantity: 2 },
    { menuItemId: '2', name: 'Croissant', price: 180, quantity: 1 },
  ];

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
            <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium cursor-pointer hover:bg-accent/15 hover:text-accent transition-colors">
              <Upload size={14} /> {settings.cafeLogo ? 'Replace' : 'Upload'} Logo
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </label>
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
      </div>

      <button
        onClick={saveAll}
        data-testid="button-save-bill-design"
        className="w-full py-3.5 rounded-2xl bg-accent text-accent-foreground font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] hover:brightness-110 shadow-[0_4px_16px_-4px_rgba(59,130,246,0.4)]"
      >
        <Save size={16} /> Save Changes
      </button>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <h3 className="font-semibold text-foreground">Bill Preview</h3>
        <p className="text-xs text-muted-foreground">Preview of how your receipt will look</p>
        <ReceiptPreview
          cafeName={cafeName}
          cafeLogo={settings.cafeLogo}
          cafeAddress={cafeAddress}
          cafePhone={cafePhone}
          cafePan={cafePan}
          billFooter={billFooter}
          tableNumber={1}
          items={sampleItems}
          subtotal={sampleSubtotal}
          discount={0}
          discountType="fixed"
          vatEnabled={vatEnabled}
          vatRate={settings.vatRate}
          vatAmount={sampleVatAmount}
          total={sampleTotal}
          method="Cash"
          billNumber={Number(billCounter) + 1}
          date={Date.now()}
        />
      </div>
    </div>
  );
};

// ── REPORTS ───────────────────────────────────────────────────────────────
const ReportsSection = () => {
  const payments = usePOSStore((s) => s.payments);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');

  const now = new Date();
  const periodStart =
    period === 'day' ? startOfDay(now) : period === 'week' ? startOfWeek(now) : startOfMonth(now);
  const periodPayments = payments.filter((p) => p.createdAt >= periodStart.getTime());
  const totalRevenue = periodPayments.reduce((s, p) => s + p.total, 0);
  const cashTotal = periodPayments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.total, 0);
  const digitalTotal = totalRevenue - cashTotal;

  const exportCSV = () => {
    const headers = 'Bill#,Table,Items,Subtotal,Discount,Total,Method,Date\n';
    const rows = periodPayments
      .map((p) =>
        `${p.billNumber},${p.tableNumber},"${p.items.map((i) => `${i.name}x${i.quantity}`).join('; ')}",${p.subtotal},${p.discount},${p.total},${p.method},${format(p.createdAt, 'yyyy-MM-dd HH:mm')}`
      )
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${period}-${format(now, 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const periodLabel = period === 'day' ? 'Today' : period === 'week' ? 'This Week' : 'This Month';

  const stats = [
    { label: 'Total Revenue', value: `Rs. ${fmt(totalRevenue)}`, color: 'text-blue-400',  border: 'border-blue-500/20',  bg: 'bg-blue-500/8' },
    { label: 'Orders',        value: periodPayments.length,       color: 'text-green-400', border: 'border-green-500/20', bg: 'bg-green-500/8' },
    { label: 'Cash',          value: `Rs. ${fmt(cashTotal)}`,     color: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/8' },
    { label: 'Digital',       value: `Rs. ${fmt(digitalTotal)}`,  color: 'text-purple-400',border: 'border-purple-500/20',bg: 'bg-purple-500/8' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {(['day', 'week', 'month'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            data-testid={`button-report-period-${p}`}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold capitalize transition-all ${
              period === p
                ? 'text-white shadow-[0_0_12px_-2px_rgba(59,130,246,0.4)]'
                : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
            }`}
            style={period === p ? ACTIVE_STYLE : {}}
          >
            {p === 'day' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((s, i) => (
          <div key={i} className={`bg-card rounded-2xl border ${s.border} p-4 ${s.bg}`}>
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {periodPayments.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-10 text-center text-muted-foreground">
          <TrendingUp size={36} className="mx-auto mb-2 opacity-20" />
          <p className="text-sm font-medium">No data for {periodLabel.toLowerCase()}</p>
          <p className="text-xs mt-1 opacity-60">Sales will appear here once orders are completed</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="font-semibold text-foreground mb-4">Transactions — {periodLabel}</h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {periodPayments.slice().reverse().map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors">
                <span className="text-xs font-mono text-muted-foreground w-10">#{p.billNumber}</span>
                <span className="text-sm text-foreground flex-1">Table {p.tableNumber}</span>
                <span className="text-xs text-muted-foreground">{format(p.createdAt, 'hh:mm a')}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium capitalize">{p.method}</span>
                <span className="text-sm font-semibold text-foreground">Rs. {fmt(p.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={exportCSV}
        data-testid="button-export-csv"
        className="w-full py-3.5 rounded-2xl bg-secondary text-secondary-foreground font-semibold flex items-center justify-center gap-2 hover:bg-accent/15 hover:text-accent transition-all active:scale-[0.98]"
      >
        <Download size={16} /> Export CSV
      </button>
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
