import { create } from 'zustand';
import { db } from '@/storage/db';
import { CafeTable, Category, Ingredient, MenuItem, Order, Payment, Recipe, RecipeIngredient, Settings, StaffAttribution, StockMovement, TablePayment } from '@/types/pos';
import { normalizeToBase } from '@/utils/units';
import { useInventoryStore } from '@/store/useInventoryStore';
import { useStaffStore } from '@/store/useStaffStore';
import { getStaffName } from '@/utils/staffName';

db.seed();

interface POSState {
  tables: CafeTable[];
  pillars: string[];
  categories: Category[];
  menuItems: MenuItem[];
  orders: Order[];
  payments: Payment[];
  settings: Settings;

  addTable: (number: string) => void;
  updateTable: (id: string, updates: Partial<CafeTable>) => void;
  deleteTable: (id: string) => void;
  resetTable: (id: string) => void;

  addPillar: (name: string) => void;
  renamePillar: (oldName: string, newName: string) => void;
  deletePillar: (name: string) => void;

  addCategory: (name: string, parentCategory?: import('@/types/pos').CategoryPillar) => void;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  deleteCategory: (id: string) => void;

  addMenuItem: (item: Omit<MenuItem, 'id'>) => void;
  updateMenuItem: (id: string, updates: Partial<MenuItem>) => void;
  deleteMenuItem: (id: string) => void;

  getActiveOrder: (tableId: string) => Order | undefined;
  createOrder: (tableId: string, tableNumber: string, takenBy?: StaffAttribution) => Order;
  addItemToOrder: (orderId: string, item: MenuItem) => void;
  updateItemQuantity: (orderId: string, menuItemId: string, delta: number) => void;
  removeItemFromOrder: (orderId: string, menuItemId: string) => void;
  updateOrderStatus: (orderId: string, status: Order['status']) => void;
  sendToKitchen: (orderId: string) => void;

  moveOrder: (orderId: string, newTableId: string) => void;
  clearOrder: (orderId: string) => void;

  splitOrderItem: (orderId: string, menuItemId: string, qty: number) => string;
  markItemsPaid: (orderId: string, menuItemIds: string[], tablePayment: TablePayment) => void;

  addPayment: (payment: Omit<Payment, 'id'>) => void;

  updateSettings: (updates: Partial<Settings>) => void;
  getNextBillNumber: () => number;
  getNextKotNumber: () => number;

  ingredients: Ingredient[];
  recipes: Recipe[];

  addIngredient: (ingredient: Omit<Ingredient, 'id'>) => void;
  updateIngredient: (id: string, updates: Partial<Ingredient>) => void;
  deleteIngredient: (id: string) => void;

  stockMovements: StockMovement[];

  saveRecipe: (menuItemId: string, ingredients: RecipeIngredient[]) => void;
  deleteRecipe: (menuItemId: string) => void;
  deductStockForOrder: (orderId: string) => void;
  adjustStock: (ingredientId: string, change: number, reason: string) => void;

  exportData: () => string;
  importData: (json: string) => void;
  factoryReset: () => void;
}

export const usePOSStore = create<POSState>((set, get) => ({
  tables: db.getTables(),
  pillars: db.getPillars(),
  categories: db.getCategories(),
  menuItems: db.getMenuItems(),
  orders: (() => {
    const raw = db.getOrders();
    let dirty = false;
    const migrated = raw.map((o) => ({
      ...o,
      items: o.items.map((i) => {
        if (!(i as unknown as { id?: string }).id) {
          dirty = true;
          return { ...i, id: crypto.randomUUID() };
        }
        return i;
      }),
    }));
    if (dirty) db.saveOrders(migrated);
    return migrated;
  })(),
  payments: db.getPayments(),
  settings: db.getSettings(),
  ingredients: db.getIngredients(),
  recipes: db.getRecipes(),
  stockMovements: db.getStockMovements(),

  addTable: (number) => {
    const name = number.trim();
    if (!name) return;
    set((state) => {
      const tables = [...state.tables, { id: crypto.randomUUID(), number: name, status: 'free' as const }];
      db.saveTables(tables);
      return { tables };
    });
  },

  updateTable: (id, updates) => {
    set((state) => {
      const tables = state.tables.map((t) => (t.id === id ? { ...t, ...updates } : t));
      db.saveTables(tables);
      return { tables };
    });
  },

  deleteTable: (id) => {
    set((state) => {
      const tables = state.tables.filter((t) => t.id !== id);
      db.saveTables(tables);
      return { tables };
    });
  },

  resetTable: (id) => {
    set((state) => {
      const tables = state.tables.map((t) =>
        t.id === id ? { ...t, status: 'free' as const, orderId: undefined, orderStartTime: undefined, pax: undefined } : t
      );
      const orders = state.orders.map((o) =>
        o.tableId === id && (o.status === 'active' || o.status === 'billed')
          ? { ...o, status: 'paid' as const }
          : o
      );
      db.saveTables(tables);
      db.saveOrders(orders);
      return { tables, orders };
    });
  },

  addPillar: (name) => {
    set((state) => {
      if (state.pillars.includes(name)) return {};
      const pillars = [...state.pillars, name];
      db.savePillars(pillars);
      return { pillars };
    });
  },

  renamePillar: (oldName, newName) => {
    set((state) => {
      if (!newName || oldName === newName || state.pillars.includes(newName)) return {};
      const pillars = state.pillars.map((p) => (p === oldName ? newName : p));
      const categories = state.categories.map((c) =>
        c.parentCategory === oldName ? { ...c, parentCategory: newName } : c
      );
      db.savePillars(pillars);
      db.saveCategories(categories);
      return { pillars, categories };
    });
  },

  deletePillar: (name) => {
    set((state) => {
      const pillars = state.pillars.filter((p) => p !== name);
      db.savePillars(pillars);
      return { pillars };
    });
  },

  addCategory: (name, parentCategory) => {
    set((state) => {
      const categories = [...state.categories, { id: crypto.randomUUID(), name, order: state.categories.length + 1, sendToKitchen: false, parentCategory }];
      db.saveCategories(categories);
      return { categories };
    });
  },

  updateCategory: (id, updates) => {
    set((state) => {
      const categories = state.categories.map((c) => (c.id === id ? { ...c, ...updates } : c));
      db.saveCategories(categories);
      return { categories };
    });
  },

  deleteCategory: (id) => {
    set((state) => {
      const categories = state.categories.filter((c) => c.id !== id);
      db.saveCategories(categories);
      return { categories };
    });
  },

  addMenuItem: (item) => {
    set((state) => {
      const menuItems = [...state.menuItems, { ...item, id: crypto.randomUUID() }];
      db.saveMenuItems(menuItems);
      return { menuItems };
    });
  },

  updateMenuItem: (id, updates) => {
    set((state) => {
      const menuItems = state.menuItems.map((m) => (m.id === id ? { ...m, ...updates } : m));
      db.saveMenuItems(menuItems);
      return { menuItems };
    });
  },

  deleteMenuItem: (id) => {
    set((state) => {
      const menuItems = state.menuItems.filter((m) => m.id !== id);
      db.saveMenuItems(menuItems);
      return { menuItems };
    });
  },

  getActiveOrder: (tableId) => {
    return get().orders.find(
      (o) => o.tableId === tableId && (o.status === 'active' || o.status === 'billed')
    );
  },

  createOrder: (tableId, tableNumber, takenBy) => {
    const existing = get().getActiveOrder(tableId);
    if (existing) return existing;

    // Auto-fill takenBy from the active staff session when caller didn't supply one.
    let resolvedTakenBy: StaffAttribution | undefined = takenBy;
    if (!resolvedTakenBy) {
      const { currentUser, users } = useStaffStore.getState();
      const activeUser = currentUser ?? users.find((u) => u.active);
      if (activeUser) {
        resolvedTakenBy = { id: activeUser.id, name: getStaffName(activeUser), role: activeUser.role };
      }
    }

    const order: Order = {
      id: crypto.randomUUID(),
      tableId,
      tableNumber,
      items: [],
      status: 'active',
      createdAt: Date.now(),
      ...(resolvedTakenBy ? { takenBy: resolvedTakenBy } : {}),
    };

    set((state) => {
      const orders = [...state.orders, order];
      const tables = state.tables.map((t) =>
        t.id === tableId
          ? { ...t, status: 'occupied' as const, orderId: order.id, orderStartTime: Date.now() }
          : t
      );
      db.saveOrders(orders);
      db.saveTables(tables);
      return { orders, tables };
    });

    return order;
  },

  addItemToOrder: (orderId, item) => {
    set((state) => {
      const orders = state.orders.map((o) => {
        if (o.id !== orderId) return o;
        const existing = o.items.find((i) => i.menuItemId === item.id && i.status !== 'paid' && !i.sentToKitchen);
        const wasPlaced = o.kitchenStatus === 'placed';
        if (existing) {
          return {
            ...o,
            hasUnsentItems: wasPlaced ? true : o.hasUnsentItems,
            items: o.items.map((i) =>
              i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i
            ),
          };
        }
        return {
          ...o,
          hasUnsentItems: wasPlaced ? true : o.hasUnsentItems,
          items: [...o.items, { id: crypto.randomUUID(), menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }],
        };
      });
      db.saveOrders(orders);
      return { orders };
    });
  },

  updateItemQuantity: (orderId, itemId, delta) => {
    set((state) => {
      let updatedOrders = state.orders.map((o) => {
        if (o.id !== orderId) return o;
        const items = o.items
          .map((i) => (i.id === itemId ? { ...i, quantity: i.quantity + delta } : i))
          .filter((i) => i.quantity > 0);
        return { ...o, items };
      });

      const order = updatedOrders.find((o) => o.id === orderId);
      let tables = state.tables;

      if (order && order.items.length === 0) {
        tables = state.tables.map((t) =>
          t.id === order.tableId
            ? { ...t, status: 'free' as const, orderId: undefined, orderStartTime: undefined }
            : t
        );
        updatedOrders = updatedOrders.filter((o) => o.id !== orderId);
        db.saveTables(tables);
      }

      db.saveOrders(updatedOrders);
      return { orders: updatedOrders, tables };
    });
  },

  removeItemFromOrder: (orderId, itemId) => {
    set((state) => {
      let updatedOrders = state.orders.map((o) => {
        if (o.id !== orderId) return o;
        return { ...o, items: o.items.filter((i) => i.id !== itemId) };
      });

      const order = updatedOrders.find((o) => o.id === orderId);
      let tables = state.tables;

      if (order && order.items.length === 0) {
        tables = state.tables.map((t) =>
          t.id === order.tableId
            ? { ...t, status: 'free' as const, orderId: undefined, orderStartTime: undefined }
            : t
        );
        updatedOrders = updatedOrders.filter((o) => o.id !== orderId);
        db.saveTables(tables);
      }

      db.saveOrders(updatedOrders);
      return { orders: updatedOrders, tables };
    });
  },

  updateOrderStatus: (orderId, status) => {
    set((state) => {
      const orders = state.orders.map((o) => (o.id === orderId ? { ...o, status } : o));
      db.saveOrders(orders);
      return { orders };
    });
  },

  sendToKitchen: (orderId) => {
    // Deduct inventory via new inventory store (alcohol, beverage, cigarette mappings)
    const order = get().orders.find((o) => o.id === orderId);
    if (order) {
      const unsentItems = order.items
        .filter((i) => !i.sentToKitchen && i.status !== 'paid')
        .map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity, name: i.name }));
      if (unsentItems.length > 0) {
        useInventoryStore.getState().deductInventoryForSale(unsentItems);
      }
    }
    set((state) => {
      const orders = state.orders.map((o) =>
        o.id === orderId
          ? (() => {
              const markedItems = o.items.map((i) => ({ ...i, sentToKitchen: true }));
              const indexByMenuItemId = new Map<string, number>();
              const mergedItems: typeof markedItems = [];
              for (const item of markedItems) {
                if (item.status === 'paid') {
                  mergedItems.push(item);
                } else {
                  const existing = indexByMenuItemId.get(item.menuItemId);
                  if (existing !== undefined) {
                    mergedItems[existing] = { ...mergedItems[existing], quantity: mergedItems[existing].quantity + item.quantity };
                  } else {
                    indexByMenuItemId.set(item.menuItemId, mergedItems.length);
                    mergedItems.push(item);
                  }
                }
              }
              return { ...o, kitchenStatus: 'placed' as const, hasUnsentItems: false, items: mergedItems };
            })()
          : o
      );
      db.saveOrders(orders);
      return { orders };
    });
  },

  moveOrder: (orderId, newTableId) => {
    set((state) => {
      const order = state.orders.find((o) => o.id === orderId);
      const newTable = state.tables.find((t) => t.id === newTableId);
      if (!order || !newTable || newTable.status !== 'free') return {};

      const oldTableId = order.tableId;
      const oldTable = state.tables.find((t) => t.id === oldTableId);

      const orders = state.orders.map((o) =>
        o.id === orderId ? { ...o, tableId: newTableId, tableNumber: newTable.number } : o
      );
      const tables = state.tables.map((t) => {
        if (t.id === oldTableId) {
          return { ...t, status: 'free' as const, orderId: undefined, orderStartTime: undefined, pax: undefined };
        }
        if (t.id === newTableId) {
          const newStatus = order.status === 'billed' ? 'billing' as const : 'occupied' as const;
          return { ...t, status: newStatus, orderId: order.id, orderStartTime: oldTable?.orderStartTime, pax: oldTable?.pax };
        }
        return t;
      });

      db.saveOrders(orders);
      db.saveTables(tables);
      return { orders, tables };
    });
  },

  clearOrder: (orderId) => {
    set((state) => {
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) return {};
      const orders = state.orders.filter((o) => o.id !== orderId);
      const tables = state.tables.map((t) =>
        t.id === order.tableId
          ? { ...t, status: 'free' as const, orderId: undefined, orderStartTime: undefined, pax: undefined }
          : t
      );
      db.saveOrders(orders);
      db.saveTables(tables);
      return { orders, tables };
    });
  },

  splitOrderItem: (orderId, menuItemId, qty) => {
    const splitKey = `${menuItemId}-sp-${Date.now()}`;
    set((state) => {
      const orders = state.orders.map((o) => {
        if (o.id !== orderId) return o;
        const item = o.items.find((i) => i.menuItemId === menuItemId);
        if (!item || qty >= item.quantity) return o;
        return {
          ...o,
          items: [
            ...o.items.map((i) =>
              i.menuItemId === menuItemId ? { ...i, quantity: i.quantity - qty } : i
            ),
            { id: crypto.randomUUID(), menuItemId: splitKey, name: item.name, price: item.price, quantity: qty },
          ],
        };
      });
      db.saveOrders(orders);
      return { orders };
    });
    return splitKey;
  },

  markItemsPaid: (orderId, menuItemIds, tablePayment) => {
    set((state) => {
      const idSet = new Set(menuItemIds);
      const now = Date.now();
      const orders = state.orders.map((o) => {
        if (o.id !== orderId) return o;
        return {
          ...o,
          items: o.items.map((i) =>
            idSet.has(i.menuItemId)
              ? { ...i, status: 'paid' as const, paidAt: now }
              : i
          ),
          tablePayments: [...(o.tablePayments || []), tablePayment],
        };
      });
      db.saveOrders(orders);
      return { orders };
    });
  },

  addPayment: (payment) => {
    // The payment processor is the active staff member, but the order's
    // original server attribution must remain intact.
    const { currentUser, users } = useStaffStore.getState();
    const activeUser = currentUser ?? users.find((u) => u.active);
    const autoAttrib: StaffAttribution | undefined = activeUser
      ? { id: activeUser.id, name: getStaffName(activeUser), role: activeUser.role }
      : undefined;

    set((state) => {
      const originalOrder = state.orders.find((order) => order.id === payment.orderId);
      const processedBy = payment.processedBy ?? autoAttrib;
      const takenBy = originalOrder?.takenBy ?? payment.takenBy ?? processedBy;
      const payments = [
        ...state.payments,
        { ...payment, processedBy, takenBy, id: crypto.randomUUID() },
      ];
      db.savePayments(payments);
      return { payments };
    });
  },

  updateSettings: (updates) => {
    set((state) => {
      const settings = { ...state.settings, ...updates };
      db.saveSettings(settings);
      return { settings };
    });
  },

  getNextBillNumber: () => {
    const next = get().settings.billCounter + 1;
    set((state) => {
      const settings = { ...state.settings, billCounter: next };
      db.saveSettings(settings);
      return { settings };
    });
    return next;
  },

  getNextKotNumber: () => {
    const s = get().settings;
    const todayStr = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
    // If daily reset is enabled and we haven't reset today, reset counter to 0 first
    const needsReset = s.resetKotDaily && s.kotLastResetDate !== todayStr;
    const baseCounter = needsReset ? 0 : (s.kotCounter ?? 100);
    const next = baseCounter + 1;
    set((state) => {
      const settings = {
        ...state.settings,
        kotCounter: next,
        ...(needsReset ? { kotLastResetDate: todayStr } : {}),
      };
      db.saveSettings(settings);
      return { settings };
    });
    return next;
  },

  addIngredient: (ingredient) => {
    set((state) => {
      const factor = (ingredient.unit === 'L' || ingredient.unit === 'kg') ? 1000 : 1;
      const normalized = normalizeToBase(ingredient.quantity, ingredient.unit, ingredient.costPerUnit);
      const entry: Ingredient = {
        ...ingredient,
        id: crypto.randomUUID(),
        quantity:  normalized.quantity,
        threshold: Math.round(ingredient.threshold * factor * 1000) / 1000,
        unit: normalized.unit,
        costPerUnit: normalized.costPerUnit,
      };
      const ingredients = [...state.ingredients, entry];
      db.saveIngredients(ingredients);
      return { ingredients };
    });
  },

  updateIngredient: (id, updates) => {
    set((state) => {
      const ingredients = state.ingredients.map((i) => {
        if (i.id !== id) return i;
        const merged = { ...i, ...updates };
        // Re-normalize whenever quantity or unit changes
        if (updates.quantity !== undefined || updates.unit !== undefined || updates.threshold !== undefined) {
          const normalized = normalizeToBase(merged.quantity, merged.unit, merged.costPerUnit);
          const factor = (merged.unit === 'L' || merged.unit === 'kg') ? 1000 : 1;
          return {
            ...merged,
            quantity: normalized.quantity,
            threshold: Math.round(merged.threshold * factor * 1000) / 1000,
            unit: normalized.unit,
            costPerUnit: normalized.costPerUnit,
          };
        }
        return merged;
      });
      db.saveIngredients(ingredients);
      return { ingredients };
    });
  },

  deleteIngredient: (id) => {
    set((state) => {
      const ingredients = state.ingredients.filter((i) => i.id !== id);
      const recipes = state.recipes.map((r) => ({
        ...r,
        ingredients: r.ingredients.filter((ri) => ri.ingredientId !== id),
      }));
      db.saveIngredients(ingredients);
      db.saveRecipes(recipes);
      return { ingredients, recipes };
    });
  },

  saveRecipe: (menuItemId, ingredients) => {
    set((state) => {
      const existing = state.recipes.find((r) => r.menuItemId === menuItemId);
      const recipes = existing
        ? state.recipes.map((r) => (r.menuItemId === menuItemId ? { ...r, ingredients } : r))
        : [...state.recipes, { menuItemId, ingredients }];
      db.saveRecipes(recipes);
      return { recipes };
    });
  },

  deleteRecipe: (menuItemId) => {
    set((state) => {
      const recipes = state.recipes.filter((r) => r.menuItemId !== menuItemId);
      db.saveRecipes(recipes);
      return { recipes };
    });
  },

  deductStockForOrder: (orderId) => {
    set((state) => {
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) return {};
      const unsentItems = order.items.filter((i) => !i.sentToKitchen && i.status !== 'paid');
      if (unsentItems.length === 0) return {};

      const deductions: Record<string, { amount: number; sources: string[] }> = {};
      for (const item of unsentItems) {
        const recipe = state.recipes.find((r) => r.menuItemId === item.menuItemId);
        if (!recipe) continue;
        for (const ri of recipe.ingredients) {
          if (!deductions[ri.ingredientId]) deductions[ri.ingredientId] = { amount: 0, sources: [] };
          deductions[ri.ingredientId].amount += ri.quantity * item.quantity;
          deductions[ri.ingredientId].sources.push(`Order: ${item.name}`);
        }
      }

      if (Object.keys(deductions).length === 0) return {};

      const now = Date.now();
      const newMovements: StockMovement[] = Object.entries(deductions).map(([ingId, { amount, sources }]) => ({
        id: crypto.randomUUID(),
        ingredientId: ingId,
        change: -amount,
        source: [...new Set(sources)].join(', '),
        timestamp: now,
      }));

      const ingredients = state.ingredients.map((ing) => {
        const deduct = deductions[ing.id]?.amount ?? 0;
        return deduct > 0 ? { ...ing, quantity: Math.max(0, ing.quantity - deduct) } : ing;
      });
      const stockMovements = [...state.stockMovements, ...newMovements];
      db.saveIngredients(ingredients);
      db.saveStockMovements(stockMovements);
      return { ingredients, stockMovements };
    });
  },

  adjustStock: (ingredientId, change, reason) => {
    set((state) => {
      const ingredients = state.ingredients.map((ing) =>
        ing.id === ingredientId
          ? { ...ing, quantity: Math.max(0, ing.quantity + change) }
          : ing
      );
      const movement: StockMovement = {
        id: crypto.randomUUID(),
        ingredientId,
        change,
        source: `Manual Adjustment: ${reason}`,
        timestamp: Date.now(),
      };
      const stockMovements = [...state.stockMovements, movement];
      db.saveIngredients(ingredients);
      db.saveStockMovements(stockMovements);
      return { ingredients, stockMovements };
    });
  },

  exportData: () => db.exportAll(),

  importData: (json) => {
    db.importAll(json);
    set({
      tables: db.getTables(),
      pillars: db.getPillars(),
      categories: db.getCategories(),
      menuItems: db.getMenuItems(),
      orders: db.getOrders(),
      payments: db.getPayments(),
      settings: db.getSettings(),
      ingredients: db.getIngredients(),
      recipes: db.getRecipes(),
      stockMovements: db.getStockMovements(),
    });
  },

  factoryReset: () => {
    db.clearAll();
    db.seed();
    set({
      tables: db.getTables(),
      pillars: db.getPillars(),
      categories: db.getCategories(),
      menuItems: db.getMenuItems(),
      orders: db.getOrders(),
      payments: db.getPayments(),
      settings: db.getSettings(),
      ingredients: db.getIngredients(),
      recipes: db.getRecipes(),
      stockMovements: db.getStockMovements(),
    });
  },
}));
