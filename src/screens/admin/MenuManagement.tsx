import { useState, useMemo, useRef } from 'react';
import { usePOSStore } from '@/store/usePOSStore';
import {
  deleteCategoryFromFirebase,
  deleteMenuItemFromFirebase,
  setMenuItemAvailabilityInFirebase,
  writeCategoryToFirebase,
  writeMenuItemToFirebase,
} from '@/utils/firebaseSync';
import { toast } from 'sonner';
import type { MenuItem, MenuItemVariant, Category, PrintRoute, CategoryPillar } from '@/types/pos';
import {
  Search, Plus, Edit3, Trash2, UtensilsCrossed, ChevronRight,
  ToggleLeft, ToggleRight, X, AlertTriangle, BookOpen,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ── Constants ──────────────────────────────────────────────────────────────
const PILLARS: CategoryPillar[] = ['Food', 'Beverages', 'Alcohol', 'Others'];
const PILLAR_COLORS: Record<string, string> = {
  Food:      'bg-amber-500/20 text-amber-300 border-amber-500/40',
  Beverages: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  Alcohol:   'bg-purple-500/20 text-purple-300 border-purple-500/40',
  Others:    'bg-zinc-500/20 text-zinc-300 border-zinc-500/40',
};

const EMPTY_ITEM: Omit<MenuItem, 'id'> = {
  name: '',
  categoryId: '',
  price: 0,
  printRoute: 'KOT',
  available: true,
  variants: [],
};

const EMPTY_CAT: Omit<Category, 'id' | 'order'> = {
  name: '',
  parentCategory: 'Food',
  printRoute: 'KOT',
  sendToKitchen: true,
};

// ── Helper ─────────────────────────────────────────────────────────────────
function resolveRoute(item: MenuItem, cats: Category[]): PrintRoute {
  if (item.printRoute) return item.printRoute;
  const cat = cats.find((c) => c.id === item.categoryId);
  if (cat?.printRoute) return cat.printRoute;
  return cat?.sendToKitchen ? 'KOT' : 'BOT';
}

function routeForCategory(category?: Category): PrintRoute {
  if (category?.printRoute) return category.printRoute;
  return category?.sendToKitchen ? 'KOT' : 'BOT';
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function MenuManagement() {
  const menuItems  = usePOSStore((s) => s.menuItems);
  const categories = usePOSStore((s) => s.categories);
  const setMenuItems  = usePOSStore((s) => s.setMenuItems);
  const setCategories = usePOSStore((s) => s.setCategories);

  // ── Filter state ──
  const [pillarFilter, setPillarFilter]     = useState<'All' | CategoryPillar>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch]                 = useState('');

  // ── Modal state ──
  const [itemModal, setItemModal] = useState<{ open: boolean; mode: 'add' | 'edit'; item: Partial<MenuItem> & { id?: string } }>({
    open: false, mode: 'add', item: { ...EMPTY_ITEM },
  });
  const [itemPillar, setItemPillar] = useState<CategoryPillar | ''>('');
  const [catModal, setCatModal] = useState<{ open: boolean; mode: 'add' | 'edit'; cat: Partial<Category> & { id?: string } }>({
    open: false, mode: 'add', cat: { ...EMPTY_CAT },
  });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; type: 'item' | 'category'; id: string; name: string }>({
    open: false, type: 'item', id: '', name: '',
  });

  const [pricingMode, setPricingMode] = useState<'single' | 'variants'>('single');
  const [variantRows, setVariantRows] = useState<MenuItemVariant[]>([{ label: '', price: 0 }]);
  const [saving, setSaving] = useState(false);

  // ── Derived telemetry ──
  const telemetry = useMemo(() => {
    const total    = menuItems.length;
    const active   = menuItems.filter((m) => m.available !== false).length;
    const soldOut  = total - active;
    const kotCount = menuItems.filter((m) => resolveRoute(m, categories) === 'KOT').length;
    const botCount = menuItems.filter((m) => resolveRoute(m, categories) === 'BOT').length;
    return { active, total, kotCount, botCount, soldOut, totalCats: categories.length };
  }, [menuItems, categories]);

  // ── Filtered visible categories ──
  const visibleCategories = useMemo(() => {
    if (pillarFilter === 'All') return categories;
    return categories.filter((c) => c.parentCategory === pillarFilter);
  }, [categories, pillarFilter]);

  // ── Filtered items ──
  const filteredItems = useMemo(() => {
    const catIds = new Set(visibleCategories.map((c) => c.id));
    let items = pillarFilter === 'All' ? menuItems : menuItems.filter((m) => catIds.has(m.categoryId));
    if (categoryFilter !== 'all') items = items.filter((m) => m.categoryId === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((m) => {
        const catName = categories.find((c) => c.id === m.categoryId)?.name ?? '';
        return m.name.toLowerCase().includes(q) || catName.toLowerCase().includes(q);
      });
    }
    return items;
  }, [menuItems, categories, visibleCategories, pillarFilter, categoryFilter, search]);

  // ── Category pill count ──
  const catCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of menuItems) {
      counts[item.categoryId] = (counts[item.categoryId] ?? 0) + 1;
    }
    return counts;
  }, [menuItems]);

  // ── Availability toggle ──
  async function toggleAvailable(item: MenuItem) {
    const updated = menuItems.map((m) =>
      m.id === item.id ? { ...m, available: !(m.available !== false) } : m
    );
    setMenuItems(updated);
    await setMenuItemAvailabilityInFirebase(item.id, !(item.available !== false));
  }

  // ── Delete item ──
  async function handleDeleteItem(id: string) {
    const updated = menuItems.filter((m) => m.id !== id);
    setMenuItems(updated);
    await deleteMenuItemFromFirebase(id);
    toast.success('Item deleted');
    setDeleteDialog((d) => ({ ...d, open: false }));
  }

  // ── Delete category ──
  async function handleDeleteCategory(id: string) {
    const itemsInCat = menuItems.filter((m) => m.categoryId === id).length;
    if (itemsInCat > 0) {
      toast.error(`Cannot delete — ${itemsInCat} item(s) still in this category`);
      setDeleteDialog((d) => ({ ...d, open: false }));
      return;
    }
    const updated = categories.filter((c) => c.id !== id);
    setCategories(updated);
    await deleteCategoryFromFirebase(id);
    toast.success('Category deleted');
    setDeleteDialog((d) => ({ ...d, open: false }));
  }

  // ── Open item modal ──
  function openAddItem() {
    setPricingMode('single');
    setVariantRows([{ label: '', price: 0 }]);
    setItemPillar('');
    setItemModal({ open: true, mode: 'add', item: { ...EMPTY_ITEM } });
  }
  function openEditItem(item: MenuItem) {
    const category = categories.find((c) => c.id === item.categoryId);
    if (item.variants && item.variants.length > 0) {
      setPricingMode('variants');
      setVariantRows([...item.variants]);
    } else {
      setPricingMode('single');
      setVariantRows([{ label: '', price: 0 }]);
    }
    setItemPillar(category?.parentCategory ?? '');
    setItemModal({ open: true, mode: 'edit', item: { ...item } });
  }

  // ── Save item ──
  async function saveItem() {
    const it = itemModal.item;
    if (!it.name?.trim()) { toast.error('Item name is required'); return; }
    if (!it.categoryId) { toast.error('Category is required'); return; }
    setSaving(true);
    try {
      const existing = itemModal.mode === 'edit'
        ? menuItems.find((m) => m.id === it.id)
        : undefined;
      let final: MenuItem;
      if (pricingMode === 'variants') {
        const validVariants = variantRows.filter((v) => v.label.trim() && v.price > 0);
        if (validVariants.length === 0) { toast.error('Add at least one valid variant'); setSaving(false); return; }
        final = {
          ...existing,
          id: it.id ?? crypto.randomUUID(),
          name: it.name!.trim(),
          categoryId: it.categoryId!,
          price: validVariants[0].price,
          printRoute: it.printRoute ?? 'KOT',
          available: it.available !== false,
          variants: validVariants,
          displayOrder: existing?.displayOrder ?? menuItems.length,
        };
      } else {
        if (!it.price || it.price <= 0) { toast.error('Price must be greater than 0'); setSaving(false); return; }
        final = {
          ...existing,
          id: it.id ?? crypto.randomUUID(),
          name: it.name!.trim(),
          categoryId: it.categoryId!,
          price: it.price!,
          printRoute: it.printRoute ?? 'KOT',
          available: it.available !== false,
          variants: undefined,
          displayOrder: existing?.displayOrder ?? menuItems.length,
        };
      }
      let updated: MenuItem[];
      if (itemModal.mode === 'add') {
        updated = [...menuItems, final];
      } else {
        updated = menuItems.map((m) => (m.id === final.id ? final : m));
      }
      setMenuItems(updated);
      await writeMenuItemToFirebase(final);
      toast.success(itemModal.mode === 'add' ? 'Item added' : 'Item updated');
      setItemModal((s) => ({ ...s, open: false }));
    } finally {
      setSaving(false);
    }
  }

  // ── Open category modal ──
  function openAddCategory() {
    setCatModal({ open: true, mode: 'add', cat: { ...EMPTY_CAT } });
  }
  function openEditCategory(cat: Category) {
    setCatModal({ open: true, mode: 'edit', cat: { ...cat } });
  }

  // ── Save category ──
  async function saveCategory() {
    const c = catModal.cat;
    if (!c.name?.trim()) { toast.error('Category name is required'); return; }
    setSaving(true);
    try {
      const isKOT = c.printRoute === 'KOT';
      let updated: Category[];
      if (catModal.mode === 'add') {
        const newCat: Category = {
          id: crypto.randomUUID(),
          name: c.name!.trim(),
          order: categories.length + 1,
          parentCategory: c.parentCategory ?? 'Food',
          printRoute: c.printRoute ?? 'KOT',
          sendToKitchen: isKOT,
          displayOrder: categories.length,
        };
        updated = [...categories, newCat];
      } else {
        updated = categories.map((cat) =>
          cat.id === c.id
            ? { ...cat, name: c.name!.trim(), parentCategory: c.parentCategory, printRoute: c.printRoute, sendToKitchen: isKOT }
            : cat
        );
      }
      setCategories(updated);
      await writeCategoryToFirebase(updated.find((category) => category.id === c.id) ?? updated.at(-1)!);
      toast.success(catModal.mode === 'add' ? 'Category added' : 'Category updated');
      setCatModal((s) => ({ ...s, open: false }));
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-0">

      {/* ── Telemetry Bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Items',   value: telemetry.total,     color: 'text-white' },
          { label: 'Active',        value: telemetry.active,    color: 'text-emerald-400' },
          { label: 'Categories',    value: telemetry.totalCats, color: 'text-sky-400' },
          { label: 'KOT (Kitchen)', value: telemetry.kotCount,  color: 'text-amber-400' },
          { label: 'BOT (Bar)',     value: telemetry.botCount,  color: 'text-purple-400' },
          { label: 'Sold Out',      value: telemetry.soldOut,   color: 'text-rose-400' },
        ].map((stat) => (
          <div key={stat.label} className="bg-[#13151F] border border-white/10 rounded-2xl px-4 py-3 flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{stat.label}</span>
            <span className={`text-2xl font-black ${stat.color}`}>{stat.value}</span>
          </div>
        ))}
      </div>

      {/* ── Action row ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items or categories…"
            className="w-full pl-9 pr-4 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500/50"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 shrink-0">
          <button
            onClick={openAddCategory}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/8 border border-white/15 hover:border-white/25 text-zinc-200 hover:text-white text-sm font-bold transition-all"
          >
            <Plus size={14} />
            Add Category
          </button>
          <button
            onClick={openAddItem}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-black transition-all shadow-lg shadow-amber-500/20"
          >
            <Plus size={14} />
            Add Item
          </button>
        </div>
      </div>

      {/* ── Pillar Filter ── */}
      <div className="flex gap-2 flex-wrap">
        {(['All', ...PILLARS] as const).map((p) => (
          <button
            key={p}
            onClick={() => { setPillarFilter(p); setCategoryFilter('all'); }}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
              pillarFilter === p
                ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-lg shadow-amber-500/20'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 font-medium'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* ── Category Pills ── */}
      {visibleCategories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
              categoryFilter === 'all'
                ? 'bg-white/15 text-white border-white/30'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500 font-medium'
            }`}
          >
            All <span className="text-amber-400 font-bold">({visibleCategories.reduce((s, c) => s + (catCounts[c.id] ?? 0), 0)})</span>
          </button>
          {visibleCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                categoryFilter === cat.id
                  ? 'bg-white/15 text-white border-white/30'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500 font-medium'
              }`}
            >
              {cat.name} <span className="text-amber-400 font-bold">({catCounts[cat.id] ?? 0})</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Item Table ── */}
      <div className="bg-[#13151F] border border-white/10 rounded-2xl overflow-hidden shadow-xl shadow-black/40">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_100px_130px_120px_64px_80px] gap-2 px-5 py-3 bg-white/[0.03] border-b border-white/10 text-slate-300 font-bold text-xs uppercase tracking-wider">
          <span>Item</span>
          <span>Pillar</span>
          <span>Pricing</span>
          <span>Route</span>
          <span className="text-center">Avail.</span>
          <span className="text-right">Actions</span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-600">
            <BookOpen size={32} className="opacity-40" />
            <p className="text-sm font-bold">No items found</p>
            {search && <p className="text-xs">Try clearing the search filter</p>}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {filteredItems.map((item) => {
              const cat      = categories.find((c) => c.id === item.categoryId);
              const pillar   = cat?.parentCategory ?? 'Others';
              const route    = resolveRoute(item, categories);
              const isAvail  = item.available !== false;
              const hasVars  = item.variants && item.variants.length > 0;

              return (
                <div
                  key={item.id}
                  className={`grid grid-cols-[1fr_100px_130px_120px_64px_80px] gap-2 items-center px-5 py-3.5 transition-colors hover:bg-white/[0.02] ${!isAvail ? 'opacity-50' : ''}`}
                >
                  {/* Name */}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{item.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {cat && (
                        <span className="text-slate-300 text-xs font-medium truncate max-w-[160px]">{cat.name}</span>
                      )}
                      {hasVars && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/8 text-zinc-400 font-bold shrink-0">
                          {item.variants!.length} sizes
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Pillar */}
                  <div>
                    <span className={`text-[10px] px-2 py-1 rounded-full border font-bold ${PILLAR_COLORS[pillar] ?? PILLAR_COLORS['Others']}`}>
                      {pillar}
                    </span>
                  </div>

                  {/* Pricing */}
                  <div className="text-sm font-bold text-white">
                    {hasVars
                      ? <span className="text-[10px] px-2 py-1 bg-white/8 rounded-full text-zinc-300 font-bold">{item.variants!.length} Tiers</span>
                      : `Rs. ${item.price.toLocaleString()}`
                    }
                  </div>

                  {/* Print Route */}
                  <div>
                    {route === 'KOT' ? (
                      <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-black">
                        KOT · Kitchen
                      </span>
                    ) : (
                      <span className="text-[10px] px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 font-black">
                        BOT · Bar
                      </span>
                    )}
                  </div>

                  {/* Availability */}
                  <div className="flex justify-center">
                    <button
                      onClick={() => toggleAvailable(item)}
                      className={`transition-colors ${isAvail ? 'text-emerald-400 hover:text-emerald-300' : 'text-zinc-600 hover:text-zinc-400'}`}
                      title={isAvail ? 'Mark as Sold Out' : 'Mark as Available'}
                    >
                      {isAvail ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => openEditItem(item)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
                      title="Edit"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => setDeleteDialog({ open: true, type: 'item', id: item.id, name: item.name })}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 transition-all"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer row */}
        {filteredItems.length > 0 && (
          <div className="px-5 py-2.5 border-t border-white/[0.04] flex items-center justify-between">
            <span className="text-[11px] text-zinc-600 font-medium">
              Showing {filteredItems.length} of {menuItems.length} items
            </span>
            {/* Category management quick-link */}
            <div className="flex gap-1 flex-wrap justify-end">
              {visibleCategories.slice(0, 3).map((c) => (
                <button
                  key={c.id}
                  onClick={() => openEditCategory(c)}
                  className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors flex items-center gap-1"
                >
                  <Edit3 size={10} /> {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Category list (below table for management) ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">
            Categories ({categories.length})
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {categories
            .filter((c) => pillarFilter === 'All' || c.parentCategory === pillarFilter)
            .map((cat) => (
            <div
              key={cat.id}
              className="bg-[#13151F] border border-white/8 rounded-xl px-4 py-3 flex items-center justify-between group"
            >
              <div>
                <p className="text-sm font-bold text-white">{cat.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${PILLAR_COLORS[cat.parentCategory ?? 'Others'] ?? PILLAR_COLORS['Others']}`}>
                    {cat.parentCategory ?? '—'}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${cat.printRoute === 'KOT' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-300'}`}>
                    {cat.printRoute ?? (cat.sendToKitchen ? 'KOT' : 'BOT')}
                  </span>
                  <span className="text-[9px] text-zinc-600">{catCounts[cat.id] ?? 0} items</span>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openEditCategory(cat)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
                >
                  <Edit3 size={12} />
                </button>
                <button
                  onClick={() => setDeleteDialog({ open: true, type: 'category', id: cat.id, name: cat.name })}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 transition-all"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Delete Dialog ── */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(o) => setDeleteDialog((d) => ({ ...d, open: o }))}>
        <AlertDialogContent className="bg-[#13151F] border border-white/15 text-white max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-400" />
              Delete {deleteDialog.type === 'item' ? 'Menu Item' : 'Category'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete <span className="text-white font-bold">"{deleteDialog.name}"</span>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/8 border-white/15 text-zinc-300 hover:bg-white/12">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteDialog.type === 'item'
                  ? handleDeleteItem(deleteDialog.id)
                  : handleDeleteCategory(deleteDialog.id)
              }
              className="bg-rose-600 hover:bg-rose-500 text-white border-0"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Item Modal ── */}
      <Dialog open={itemModal.open} onOpenChange={(o) => setItemModal((s) => ({ ...s, open: o }))}>
        <DialogContent className="bg-[#13151F] border border-white/15 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-black">
              <UtensilsCrossed size={16} className="text-amber-400" />
              {itemModal.mode === 'add' ? 'Add Menu Item' : 'Edit Menu Item'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 mt-2">
            {/* Name */}
            <Field label="Item Name" required>
              <input
                value={itemModal.item.name ?? ''}
                onChange={(e) => setItemModal((s) => ({ ...s, item: { ...s.item, name: e.target.value } }))}
                placeholder="e.g. Chicken Momo"
                className={inputCls}
              />
            </Field>

            {/* Pillar → Category */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pillar">
                <Select
                  value={itemPillar || undefined}
                  onValueChange={(value) => {
                    setItemPillar(value);
                    setItemModal((s) => ({
                      ...s,
                      item: { ...s.item, categoryId: '' },
                    }));
                  }}
                >
                  <SelectTrigger className={selectCls}>
                    <SelectValue placeholder="-- Select Pillar --" />
                  </SelectTrigger>
                  <SelectContent className={selectContentCls}>
                    {PILLARS.map((pillar) => (
                      <SelectItem key={pillar} value={pillar} className={selectItemCls}>
                        {pillar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Category" required>
                <Select
                  value={itemModal.item.categoryId || undefined}
                  disabled={!itemPillar}
                  onValueChange={(value) => {
                    const selectedCategory = categories.find((c) => c.id === value);
                    setItemModal((s) => ({
                      ...s,
                      item: {
                        ...s.item,
                        categoryId: value,
                        printRoute: routeForCategory(selectedCategory),
                      },
                    }));
                  }}
                >
                  <SelectTrigger className={selectCls}>
                    <SelectValue placeholder={itemPillar ? "-- Select Category --" : "-- Select Pillar First --"} />
                  </SelectTrigger>
                  <SelectContent className={selectContentCls}>
                    {categories
                      .filter((category) => category.parentCategory === itemPillar)
                      .map((category) => (
                        <SelectItem key={category.id} value={category.id} className={selectItemCls}>
                          {category.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Pricing mode toggle */}
            <div>
              <label className={labelCls}>Pricing Mode</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPricingMode('single')}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${
                    pricingMode === 'single'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  Single Price
                </button>
                <button
                  type="button"
                  onClick={() => setPricingMode('variants')}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${
                    pricingMode === 'variants'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  Multi-Tier Variants
                </button>
              </div>
            </div>

            {pricingMode === 'single' ? (
              <Field label="Price (Rs.)" required>
                <input
                  type="number"
                  min={0}
                  value={itemModal.item.price ?? ''}
                  onChange={(e) => setItemModal((s) => ({ ...s, item: { ...s.item, price: parseFloat(e.target.value) || 0 } }))}
                  placeholder="e.g. 280"
                  className={inputCls}
                />
              </Field>
            ) : (
              <div>
                <label className={labelCls}>Variant Tiers</label>
                <div className="flex flex-col gap-2">
                  {variantRows.map((row, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        value={row.label}
                        onChange={(e) => {
                          const rows = [...variantRows];
                          rows[i] = { ...rows[i], label: e.target.value };
                          setVariantRows(rows);
                        }}
                        placeholder="Variant name (e.g. 60ml, 500g, Steam)"
                        className={`${variantInputCls} flex-1`}
                      />
                      <input
                        type="number"
                        min={0}
                        value={row.price || ''}
                        onChange={(e) => {
                          const rows = [...variantRows];
                          rows[i] = { ...rows[i], price: parseFloat(e.target.value) || 0 };
                          setVariantRows(rows);
                        }}
                        placeholder="Price (Rs.)"
                        className={`${variantInputCls} w-32`}
                      />
                      <button
                        type="button"
                        onClick={() => setVariantRows((r) => r.filter((_, idx) => idx !== i))}
                        className="p-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/15 transition-all"
                        title="Delete tier"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setVariantRows((r) => [...r, { label: '', price: 0 }])}
                    className="flex items-center gap-2 text-xs text-amber-400 hover:text-amber-300 font-bold mt-1"
                  >
                    <Plus size={12} /> Add Tier
                  </button>
                </div>
              </div>
            )}

            {/* Print Route */}
            <div>
              <label className={labelCls}>Print Station</label>
              <div className="flex gap-2">
                {(['KOT', 'BOT'] as PrintRoute[]).map((route) => (
                  <button
                    key={route}
                    type="button"
                    onClick={() => setItemModal((s) => ({ ...s, item: { ...s.item, printRoute: route } }))}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${
                      itemModal.item.printRoute === route
                        ? route === 'KOT'
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {route === 'KOT' ? '🍽 KOT — Kitchen' : '🍺 BOT — Bar / Reception'}
                  </button>
                ))}
              </div>
            </div>

            {/* Availability */}
            <div className="flex items-center justify-between bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-bold text-white">Available</p>
                <p className="text-slate-300 text-xs">Item is visible and orderable by waiters</p>
              </div>
              <button
                type="button"
                onClick={() => setItemModal((s) => ({ ...s, item: { ...s.item, available: !(s.item.available !== false) } }))}
                className={itemModal.item.available !== false ? 'text-emerald-400' : 'text-zinc-600'}
              >
                {itemModal.item.available !== false ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <button
              type="button"
              onClick={() => setItemModal((s) => ({ ...s, open: false }))}
              className="px-4 py-2.5 rounded-xl bg-white/8 border border-white/15 text-zinc-300 hover:text-white text-sm font-bold transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveItem}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-sm font-black transition-all"
            >
              {saving ? 'Saving…' : itemModal.mode === 'add' ? 'Add Item' : 'Save Changes'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Category Modal ── */}
      <Dialog open={catModal.open} onOpenChange={(o) => setCatModal((s) => ({ ...s, open: o }))}>
        <DialogContent className="bg-[#13151F] border border-white/15 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-black">
              <BookOpen size={16} className="text-amber-400" />
              {catModal.mode === 'add' ? 'Add Category' : 'Edit Category'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 mt-2">
            <Field label="Category Name" required>
              <input
                value={catModal.cat.name ?? ''}
                onChange={(e) => setCatModal((s) => ({ ...s, cat: { ...s.cat, name: e.target.value } }))}
                placeholder="e.g. Sekuwa & Grills"
                className={categoryInputCls}
              />
            </Field>

            <Field label="Parent Pillar">
              <Select
                value={catModal.cat.parentCategory ?? 'Food'}
                onValueChange={(value) => setCatModal((s) => ({
                  ...s,
                  cat: { ...s.cat, parentCategory: value as CategoryPillar },
                }))}
              >
                <SelectTrigger className={selectCls}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={selectContentCls}>
                  {PILLARS.map((pillar) => (
                    <SelectItem key={pillar} value={pillar} className={selectItemCls}>
                      {pillar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div>
              <label className={labelCls}>Default Station Route</label>
              <div className="flex gap-2">
                {(['KOT', 'BOT'] as PrintRoute[]).map((route) => (
                  <button
                    key={route}
                    type="button"
                    onClick={() => setCatModal((s) => ({ ...s, cat: { ...s.cat, printRoute: route } }))}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${
                      catModal.cat.printRoute === route
                        ? route === 'KOT'
                          ? 'bg-emerald-950/80 border border-emerald-500/80 text-emerald-400 font-semibold'
                          : 'bg-amber-950/80 border border-amber-500/80 text-amber-400 font-semibold'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {route === 'KOT' ? '🍽 KOT' : '🍺 BOT'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <button
              type="button"
              onClick={() => setCatModal((s) => ({ ...s, open: false }))}
              className="px-4 py-2.5 rounded-xl bg-white/8 border border-white/15 text-zinc-300 hover:text-white text-sm font-bold transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveCategory}
              disabled={saving}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl px-6 py-2.5 shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : catModal.mode === 'add' ? 'Add Category' : 'Save Changes'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Shared style constants ──────────────────────────────────────────────────
const inputCls = 'w-full px-3.5 py-2.5 bg-white/5 border border-white/12 rounded-xl text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500/50 transition-colors';
const categoryInputCls = 'bg-slate-900 border border-slate-700 text-white placeholder:text-slate-400 focus:border-amber-500 rounded-xl px-4 py-2.5 focus:outline-none transition-colors w-full';
const variantInputCls = 'bg-slate-900 border border-slate-700 text-white placeholder:text-slate-400 px-3 py-2 rounded-lg focus:border-amber-500 focus:outline-none transition-colors';
const selectCls = 'w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 focus:border-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';
const selectContentCls = 'bg-slate-900 border border-slate-700 text-white shadow-2xl rounded-xl z-50';
const selectItemCls = 'text-slate-200 hover:bg-slate-800 hover:text-amber-400 cursor-pointer px-3 py-2 rounded-lg';
const labelCls = 'block text-slate-200 font-bold text-xs uppercase tracking-wider mb-1.5';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
