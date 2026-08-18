import { create } from 'zustand';
import { db } from '@/storage/db';
import { CafeTable, Category, Customer, Ingredient, MenuItem, Order, Payment, Recipe, RecipeIngredient, Settings, StaffAttribution, StockMovement, TablePayment } from '@/types/pos';
import { normalizeToBase } from '@/utils/units';
import { useInventoryStore } from '@/store/useInventoryStore';
import { useStaffStore } from '@/store/useStaffStore';
import { useCustomerStore } from '@/store/useCustomerStore';
import { getStaffName } from '@/utils/staffName';
import { tableNameKey } from '@/utils/tableName';
import { buildTicket, nextTicketNumber, resolveItemDestination, splitDraftItems } from '@/utils/ticketSplitter';
import { writeTableRecord, writeOrderRecord, writePaymentRecord, deleteTableRecord, deleteOrderRecord } from '../utils/firebaseSync';

type DynamicPillar = string;

interface POSState {
  tables: CafeTable[];
  setTables: (tables: CafeTable[]) => void;
  areaOrder: string[];
  setAreaOrder: (areaOrder: string[]) => void;
  pillars: string[];
  setPillars: (pillars: DynamicPillar[]) => void;
  categories: Category[];
  setCategories: (categories: Category[]) => void;
  menuItems: MenuItem[];
  setMenuItems: (menuItems: MenuItem[]) => void;
  orders: Order[];
  setOrders: (orders: Order[]) => void;
  payments: Payment[];
  setPayments: (payments: Payment[]) => void;
  settings: Settings;
  setSettings: (settings: Settings) => void;

  addTable: (number: string, section?: string) => void;
  updateTable: (id: string, updates: Partial<CafeTable>) => void;
  /** Update the guest count for an occupied or free table. */
  updateTableGuests: (id: string, guests: number) => void;
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
  voidOrderItem: (orderId: string, itemId: string, qty: number, reason: string, cancelledBy: string) => void;

  moveOrder: (orderId: string, newTableId: string) => void;
  clearOrder: (orderId: string) => void;

  splitOrderItem: (orderId: string, menuItemId: string, qty: number) => string;
  markItemsPaid: (orderId: string, menuItemIds: string[], tablePayment: TablePayment) => void;

  addPayment: (payment: Omit<Payment, 'id'>) => void;
  /** Attach or detach a customer (for Khatta tracking) from an active order. */
  attachCustomerToOrder: (orderId: string, customer: Customer | null) => void;
  /** Attach a customer to a table, creating its empty draft order when needed. */
  attachCustomerToTable: (tableId: string, tableNumber: string, customer: Customer | null) => void;

  updateSettings: (updates: Partial<Settings>) => void;
  getNextBillNumber: () => number;
  getNextKotNumber: () => number;

  ingredients: Ingredient[];
  setIngredients: (ingredients: Ingredient[]) => void;
  recipes: Recipe[];
  setRecipes: (recipes: Recipe[]) => void;

  addIngredient: (ingredient: Omit<Ingredient, 'id'>) => void;
  updateIngredient: (id: string, updates: Partial<Ingredient>) => void;
  deleteIngredient: (id: string) => void;

  stockMovements: StockMovement[];
  setStockMovements: (stockMovements: StockMovement[]) => void;

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
  setTables: (tables) => {
    db.saveTables(tables);
    set({ tables });
  },
  areaOrder: db.getAreaOrder(),
  setAreaOrder: (areaOrder) => set({ areaOrder }),
  pillars: db.getPillars(),
  setPillars: (pillars) => set({ pillars }),
  categories: db.getCategories(),
  setCategories: (categories) => set({ categories }),
  menuItems: db.getMenuItems(),
  setMenuItems: (menuItems) => set({ menuItems }),
  orders: (() => {
    const raw = db.getOrders();
    let dirty = false;
    const migrated = raw.map((o) => ({
      ...o,
      items: (o.items ?? []).map((i) => {
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
  setOrders: (orders) => {
    db.saveOrders(orders);
    set({ orders });
  },
  payments: db.getPayments(),
  setPayments: (payments) => set({ payments }),
  settings: db.getSettings(),
  setSettings: (settings) => set((state) => ({
    settings: {
      ...state.settings,
      ...settings,
      wallets: {
        ...state.settings.wallets,
        ...settings.wallets,
      },
      customWallets: settings.customWallets ?? state.settings.customWallets ?? [],
    },
  })),
  ingredients: db.getIngredients(),
  setIngredients: (ingredients) => set({ ingredients }),
  recipes: db.getRecipes(),
  setRecipes: (recipes) => set({ recipes }),
  stockMovements: db.getStockMovements(),
  setStockMovements: (stockMovements) => set({ stockMovements }),

  addTable: (number, section = 'Ground Floor') => {
    const name = number.trim();
    if (!name) return;
    const area = section.trim() || 'Ground Floor';
    set((state) => {
      if (state.tables.some((table) => tableNameKey(table.number) === tableNameKey(name))) return state;
      const tables = [...state.tables, { id: crypto.randomUUID(), number: name, section: area, status: 'free' as const }];
      db.saveTables(tables);
      return { tables };
    });
  },

  updateTable: (id, updates) => {
    set((state) => {
      const current = state.tables.find((table) => table.id === id);
      if (!current || current.status !== 'free') return state;
      if (updates.number !== undefined) {
        const name = updates.number.trim();
        if (!name || state.tables.some((table) =>
          table.id !== id && tableNameKey(table.number) === tableNameKey(name)
        )) return state;
        updates = { ...updates, number: name };
      }
      if (updates.section !== undefined) {
        updates = { ...updates, section: updates.section.trim() || 'Ground Floor' };
      }
      const tables = state.tables.map((t) => (t.id === id ? { ...t, ...updates } : t));
      db.saveTables(tables);
      return { tables };
    });
    const updatedTable = get().tables.find((t) => t.id === id);
    if (updatedTable) writeTableRecord(updatedTable);
  },

  updateTableGuests: (id, guests) => {
    set((state) => {
      const current = state.tables.find((table) => table.id === id);
      if (!current) return state;

      const pax = Math.max(1, Math.floor(guests));
      if (current.pax === pax) return state;

      const tables = state.tables.map((table) =>
        table.id === id ? { ...table, pax } : table,
      );
      db.saveTables(tables);
      return { tables };
    });
    const updatedTable = get().tables.find((t) => t.id === id);
    if (updatedTable) writeTableRecord(updatedTable);
  },

  deleteTable: (id) => {
    set((state) => {
      const table = state.tables.find((candidate) => candidate.id === id);
      if (!table || table.status !== 'free') return state;
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
    // Sync freed table and any orders that were marked paid
    const clearedTable = get().tables.find((t) => t.id === id);
    if (clearedTable) writeTableRecord(clearedTable);
    get().orders
      .filter((o) => o.tableId === id && o.status === 'paid')
      .forEach((o) => writeOrderRecord(o));
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
    // Granular Firebase sync: new order + occupied table
    writeOrderRecord(order);
    const occupiedTable = get().tables.find((t) => t.id === tableId);
    if (occupiedTable) writeTableRecord(occupiedTable);

    return order;
  },

  addItemToOrder: (orderId, item) => {
    set((state) => {
      const orders = state.orders.map((o) => {
        if (o.id !== orderId) return o;
        // Only merge into a draft (unsent) line for the same menu item
        const existing = o.items.find(
          (i) => i.menuItemId === item.id && i.status !== 'paid' && i.kitchenStatus !== 'sent' && !i.sentToKitchen,
        );
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
          items: [
            ...o.items,
            {
              id: crypto.randomUUID(),
              menuItemId: item.id,
              name: item.name,
              price: item.price,
              quantity: 1,
              kitchenStatus: 'draft' as const,
            },
          ],
        };
      });
      db.saveOrders(orders);
      return { orders };
    });
  },

  updateItemQuantity: (orderId, itemId, delta) => {
    set((state) => {
      const updatedOrders = state.orders.map((o) => {
        if (o.id !== orderId) return o;
        const items = o.items
          .map((i) => (i.id === itemId ? { ...i, quantity: i.quantity + delta } : i))
          .filter((i) => i.quantity > 0);
        // Keep the draft order when the last item is removed. Spreading the
        // existing order preserves its customer, pax-related table state, and
        // assigned server until staff explicitly clears the table.
        return { ...o, items };
      });

      db.saveOrders(updatedOrders);
      return { orders: updatedOrders };
    });
  },

  removeItemFromOrder: (orderId, itemId) => {
    set((state) => {
      const updatedOrders = state.orders.map((o) => {
        if (o.id !== orderId) return o;
        // Removing the last item only empties the draft. Keep the full order
        // object so attachedCustomer and the assigned server are retained.
        return { ...o, items: o.items.filter((i) => i.id !== itemId) };
      });

      db.saveOrders(updatedOrders);
      return { orders: updatedOrders };
    });
  },

  updateOrderStatus: (orderId, status) => {
    set((state) => {
      const orders = state.orders.map((o) => (o.id === orderId ? { ...o, status } : o));
      db.saveOrders(orders);
      return { orders };
    });
    const updatedOrder = get().orders.find((order) => order.id === orderId);
    if (updatedOrder) {
      writeOrderRecord(updatedOrder);
      const table = get().tables.find((candidate) => candidate.id === updatedOrder.tableId);
      if (table) writeTableRecord(table);
    }
  },

  sendToKitchen: (orderId) => {
    const state0 = get();
    const order = state0.orders.find((o) => o.id === orderId);
    if (!order) return;

    // Collect draft items for inventory deduction (snapshot before marking sent)
    const draftItems = order.items.filter(
      (i) => i.kitchenStatus !== 'sent' && !i.sentToKitchen && i.status !== 'paid',
    );
    if (draftItems.length === 0) return;

    const unsentForInventory = draftItems.map((i) => ({
      menuItemId: i.menuItemId,
      quantity: i.quantity,
      name: i.name,
    }));
    useInventoryStore.getState().deductInventoryForSale(unsentForInventory);

    // Build lookup maps for ticket splitting (printRoute-aware)
    const menuItemMap = new Map<string, MenuItem>(
      state0.menuItems.map((m) => [m.id, m]),
    );
    const categoryMap = new Map<string, Category>(
      state0.categories.map((c) => [c.id, c]),
    );

    // Split draft items into kitchen vs bar groups
    const { kitchenItems, barItems } = splitDraftItems(draftItems, menuItemMap, categoryMap);

    const nowIso = new Date().toISOString();
    const serverName = order.takenBy?.name ?? '';
    const customerName = order.attachedCustomer?.name;
    const existingTickets = order.tickets ?? [];

    const newTickets = [];

    if (kitchenItems.length > 0) {
      const kotNumber = nextTicketNumber(existingTickets, 'KOT');
      newTickets.push(
        buildTicket({
          orderId: order.id,
          tableId: order.tableId,
          tableName: order.tableNumber,
          ticketType: 'KOT',
          ticketNumber: kotNumber,
          items: kitchenItems,
          serverName,
          customerName,
        }),
      );
    }

    if (barItems.length > 0) {
      const botNumber = nextTicketNumber(existingTickets, 'BOT');
      newTickets.push(
        buildTicket({
          orderId: order.id,
          tableId: order.tableId,
          tableName: order.tableNumber,
          ticketType: 'BOT',
          ticketNumber: botNumber,
          items: barItems,
          serverName,
          customerName,
        }),
      );
    }

    set((state) => {
      const orders = state.orders.map((o) =>
        o.id === orderId
          ? (() => {
              // Mark every draft item as sent (both legacy bool and new kitchenStatus)
              const markedItems = o.items.map((i) => ({
                ...i,
                sentToKitchen: true,
                kitchenStatus: 'sent' as const,
                sentAt: i.kitchenStatus === 'sent' ? i.sentAt : nowIso,
              }));
              // Merge duplicate unsent lines (same menuItemId, not paid)
              const indexByMenuItemId = new Map<string, number>();
              const mergedItems: typeof markedItems = [];
              for (const item of markedItems) {
                if (item.status === 'paid') {
                  mergedItems.push(item);
                } else {
                  const existing = indexByMenuItemId.get(item.menuItemId);
                  if (existing !== undefined) {
                    mergedItems[existing] = {
                      ...mergedItems[existing],
                      quantity: mergedItems[existing].quantity + item.quantity,
                    };
                  } else {
                    indexByMenuItemId.set(item.menuItemId, mergedItems.length);
                    mergedItems.push(item);
                  }
                }
              }
              // Mark the print queue state for the auto-print hub: any station
              // receiving a new ticket flips (back) to 'pending'.
              const printStatus = {
                ...(o.printStatus ?? {}),
                ...(kitchenItems.length > 0 ? { kot: 'pending' as const } : {}),
                ...(barItems.length > 0 ? { bot: 'pending' as const } : {}),
              };
              return {
                ...o,
                kitchenStatus: 'placed' as const,
                hasUnsentItems: false,
                items: mergedItems,
                tickets: [...(o.tickets ?? []), ...newTickets],
                ...(kitchenItems.length > 0 || barItems.length > 0 ? { printStatus } : {}),
              };
            })()
          : o
      );
      db.saveOrders(orders);
      return { orders };
    });
    // Granular Firebase sync: updated order + table (sendToKitchen doesn't change table status but keeps it fresh)
    const updatedOrder = get().orders.find((o) => o.id === orderId);
    if (updatedOrder) {
      writeOrderRecord(updatedOrder);
      const updatedTable = get().tables.find((t) => t.id === updatedOrder.tableId);
      if (updatedTable) writeTableRecord(updatedTable);
    }
  },

  voidOrderItem: (orderId, itemId, qty, reason, cancelledBy) => {
    const state0 = get();

    // Restore inventory for already-sent bar/beverage items before modifying order state
    const targetOrder = state0.orders.find((o) => o.id === orderId);
    const targetItem  = targetOrder?.items.find((i) => i.id === itemId);
    if (targetItem && (targetItem.kitchenStatus === 'sent' || targetItem.sentToKitchen)) {
      useInventoryStore.getState().restoreInventoryForVoid([{
        menuItemId: targetItem.menuItemId,
        quantity:   qty,
        name:       targetItem.name,
      }]);
    }

    // Build lookup maps once (needed for VOID ticket routing, printRoute-aware)
    const menuItemMap = new Map<string, MenuItem>(
      state0.menuItems.map((m) => [m.id, m]),
    );
    const categoryMap = new Map<string, Category>(
      state0.categories.map((c) => [c.id, c]),
    );

    set((state) => {
      const orders = state.orders.map((o) => {
        if (o.id !== orderId) return o;
        const target = o.items.find((i) => i.id === itemId);
        if (!target) return o;

        const remaining = target.quantity - qty;
        const updatedItems =
          remaining <= 0
            ? o.items.filter((i) => i.id !== itemId)
            : o.items.map((i) => (i.id === itemId ? { ...i, quantity: remaining } : i));

        const nowIso = new Date().toISOString();

        const voidRecord = {
          id: crypto.randomUUID(),
          itemId,
          name: target.name,
          quantity: qty,
          price: target.price,
          reason,
          cancelledBy,
          cancelledAt: nowIso,
        };

        // Generate a VOID_KOT or VOID_BOT ticket only for sent items
        const existingTickets = o.tickets ?? [];
        const voidTickets = [];
        if (target.kitchenStatus === 'sent' || target.sentToKitchen) {
          const destination = resolveItemDestination(target.menuItemId, menuItemMap, categoryMap);
          const voidType = destination === 'KOT' ? 'VOID_KOT' as const : 'VOID_BOT' as const;
          // Count existing VOID tickets of the same type to get the next number
          const existingVoids = existingTickets.filter((t) => t.ticketType === voidType);
          const voidNumber = existingVoids.length + 1;
          voidTickets.push(
            buildTicket({
              orderId: o.id,
              tableId: o.tableId,
              tableName: o.tableNumber,
              ticketType: voidType,
              ticketNumber: voidNumber,
              items: [{ id: target.id, name: target.name, quantity: qty }],
              serverName: o.takenBy?.name ?? '',
              customerName: o.attachedCustomer?.name,
              voidReason: reason,
              voidedBy: cancelledBy,
            }),
          );
        }

        return {
          ...o,
          items: updatedItems,
          voidHistory: [...(o.voidHistory ?? []), voidRecord],
          tickets: [...existingTickets, ...voidTickets],
        };
      });
      db.saveOrders(orders);
      return { orders };
    });
    // Granular Firebase sync: voided order
    const voidedOrder = get().orders.find((o) => o.id === orderId);
    if (voidedOrder) writeOrderRecord(voidedOrder);
  },

  moveOrder: (orderId, newTableId) => {
    const orderBeforeMove = get().orders.find((order) => order.id === orderId);
    const oldTableId = orderBeforeMove?.tableId;
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
    const movedOrder = get().orders.find((order) => order.id === orderId);
    if (movedOrder) writeOrderRecord(movedOrder);
    if (oldTableId) {
      const oldTable = get().tables.find((table) => table.id === oldTableId);
      if (oldTable) writeTableRecord(oldTable);
    }
    const newTable = get().tables.find((table) => table.id === newTableId);
    if (newTable) writeTableRecord(newTable);
  },

  attachCustomerToOrder: (orderId, customer) => {
    set((state) => {
      const orders = state.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              attachedCustomer: customer
                ? { id: customer.id, name: customer.name, phone: customer.phone, currentDue: customer.currentDue }
                : undefined,
            }
          : o
      );
      db.saveOrders(orders);
      return { orders };
    });
  },

  attachCustomerToTable: (tableId, tableNumber, customer) => {
    set((state) => {
      const existingOrder = state.orders.find(
        (o) => o.tableId === tableId && (o.status === 'active' || o.status === 'billed')
      );

      // Detaching an empty, non-existent draft must not create an order.
      if (!existingOrder && !customer) return state;

      const attachedCustomer = customer
        ? { id: customer.id, name: customer.name, phone: customer.phone, currentDue: customer.currentDue }
        : undefined;

      if (existingOrder) {
        const orders = state.orders.map((o) =>
          o.id === existingOrder.id ? { ...o, attachedCustomer } : o
        );
        db.saveOrders(orders);
        return { orders };
      }

      const { currentUser, users } = useStaffStore.getState();
      const activeUser = currentUser ?? users.find((u) => u.active);
      const takenBy = activeUser
        ? { id: activeUser.id, name: getStaffName(activeUser), role: activeUser.role }
        : undefined;
      const order: Order = {
        id: crypto.randomUUID(),
        tableId,
        tableNumber,
        items: [],
        status: 'active',
        createdAt: Date.now(),
        ...(takenBy ? { takenBy } : {}),
        attachedCustomer,
      };
      const orders = [...state.orders, order];
      const tables = state.tables.map((table) =>
        table.id === tableId
          ? { ...table, status: 'occupied' as const, orderId: order.id, orderStartTime: order.createdAt }
          : table
      );
      db.saveOrders(orders);
      db.saveTables(tables);
      return { orders, tables };
    });
    // Granular Firebase sync: updated/new order + table (covers both branches)
    const syncedOrder = get().orders.find(
      (o) => o.tableId === tableId && (o.status === 'active' || o.status === 'billed'),
    );
    if (syncedOrder) writeOrderRecord(syncedOrder);
    const syncedTable = get().tables.find((t) => t.id === tableId);
    if (syncedTable) writeTableRecord(syncedTable);
  },

  clearOrder: (orderId) => {
    // Pre-lookup before set so we have the tableId for Firebase writes
    const orderToDelete = get().orders.find((o) => o.id === orderId);
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
    // Granular Firebase sync: remove order node + update freed table
    if (orderToDelete) {
      deleteOrderRecord(orderId);
      const clearedTable = get().tables.find((t) => t.id === orderToDelete.tableId);
      if (clearedTable) writeTableRecord(clearedTable);
    }
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
    // Granular Firebase sync: new payment record + settled order + associated table
    const allPayments = get().payments;
    const fbNewPayment = allPayments[allPayments.length - 1];
    if (fbNewPayment) writePaymentRecord(fbNewPayment);
    const fbSettledOrder = get().orders.find((o) => o.id === payment.orderId);
    if (fbSettledOrder) writeOrderRecord(fbSettledOrder);
    const fbSettledTable = fbSettledOrder ? get().tables.find((t) => t.id === fbSettledOrder.tableId) : undefined;
    if (fbSettledTable) writeTableRecord(fbSettledTable);

    // ── Customer consumption metrics ─────────────────────────────────────────
    // When the settled order has an attached customer, record the visit,
    // spend, food/beverage tallies, and top-order ranking. Pay Later (khatta)
    // settlements skip visit/spend because addToCustomerDue already counts them.
    const settledOrder = get().orders.find((o) => o.id === payment.orderId);
    const attached = settledOrder?.attachedCustomer;
    if (attached) {
      const { menuItems, categories } = get();
      const isBeverageCategory = (categoryId: string): boolean => {
        const category = categories.find((c) => c.id === categoryId);
        const pillar = category?.parentCategory ?? '';
        const name = category?.name ?? '';
        return /beverage|drink|bar|alcohol|liquor|beer|wine|cocktail|juice|coffee|tea/i.test(
          `${pillar} ${name}`,
        );
      };
      let foodItems = 0;
      let beverageItems = 0;
      const consumedItems: Array<{ itemId: string; name: string; quantity: number; category: string }> = [];
      for (const item of payment.items ?? []) {
        const menuItem = menuItems.find((m) => m.id === item.menuItemId);
        const category = menuItem ? categories.find((c) => c.id === menuItem.categoryId) : undefined;
        const beverage = menuItem ? isBeverageCategory(menuItem.categoryId) : false;
        if (beverage) beverageItems += item.quantity;
        else foodItems += item.quantity;
        consumedItems.push({
          itemId: item.menuItemId,
          name: item.name,
          quantity: item.quantity,
          category: category?.parentCategory ?? category?.name ?? (beverage ? 'Beverage' : 'Food'),
        });
      }
      useCustomerStore.getState().recordOrderConsumption(attached.id, {
        orderTotal: payment.total,
        countVisitAndSpend: payment.method !== 'khatta',
        foodItems,
        beverageItems,
        items: consumedItems,
      });
    }
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
    const todayStr = new Date().toISOString().slice(0, 10);
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
    set({
      tables: [],
      pillars: [],
      categories: [],
      menuItems: [],
      orders: [],
      payments: [],
      settings: db.getSettings(),
      ingredients: [],
      recipes: [],
      stockMovements: [],
    });
  },
}));
