import { CafeTable, Category, Ingredient, MenuItem, Order, Payment, Recipe, Settings, StockMovement } from '@/types/pos';

// ── Immutable day-end financial snapshot ───────────────────────────────────────
export interface ClosedShift {
  shiftId: string;
  date: string;           // 'YYYY-MM-DD' — the business day this covers
  closedAt: string;       // ISO timestamp of when the Z-Report was locked
  closedBy: string;       // staff name or 'Admin'
  grossSales: number;     // sum of all payment subtotals (pre-discount, pre-tax)
  totalDiscounts: number;
  netSales: number;       // grossSales - totalDiscounts
  totalVat: number;       // sum of vatAmount across all payments
  totalRevenue: number;   // actual amount collected (post-discount, post-tax)
  paymentBreakdown: Record<string, number>; // method → total collected
  maintenanceExpenses: number;
  kitchenPurchases: number;
  barRestocks: number;
  totalOperatingExpenses: number;
  netProfit: number;
  transactionCount: number;
}

const KEYS = {
  tables: 'pos_tables',
  categories: 'pos_categories',
  menuItems: 'pos_menuItems',
  orders: 'pos_orders',
  payments: 'pos_payments',
  settings: 'pos_settings',
  ingredients: 'pos_ingredients',
  recipes: 'pos_recipes',
  stockMovements: 'pos_stockMovements',
  pillars: 'pos_pillars',
  areaOrder: 'pos_areaOrder',
  closedShifts: 'pos_closed_shifts',
};

function get<T>(key: string, fallback: T): T {
  try {
    const d = localStorage.getItem(key);
    return d ? JSON.parse(d) : fallback;
  } catch {
    return fallback;
  }
}

function set(key: string, val: unknown) {
  localStorage.setItem(key, JSON.stringify(val));
}

const defaultSettings: Settings = {
  cafeName: 'S Bamboo Cottage & Sekuwa Corner',
  adminPin: '1234',
  esewaId: '',
  esewaPhone: '',
  wallets: {
    esewa: { enabled: true },
    khalti: { enabled: true },
    fonepay: { enabled: true },
  },
  customWallets: [],
  billCounter: 1000,
  kotCounter: 100,
  resetKotDaily: false,
  vatEnabled: true,
  vatRate: 0.13,
  vatMode: 'excluded',
  showLogoOnBill: true,
  receiptFontSize: 10,
  receiptFontFamily: 'sans-serif',
};

const SETTINGS_VERSION = 2;

function migrateSettings() {
  const versionKey = 'pos_settings_version';
  const storedVersion = parseInt(localStorage.getItem(versionKey) || '0', 10);
  if (storedVersion < SETTINGS_VERSION) {
    const raw = localStorage.getItem(KEYS.settings);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        parsed.wallets = {
          esewa: { ...(parsed.wallets?.esewa || {}), enabled: true },
          khalti: { ...(parsed.wallets?.khalti || {}), enabled: true },
          fonepay: { ...(parsed.wallets?.fonepay || {}), enabled: true },
        };
        localStorage.setItem(KEYS.settings, JSON.stringify(parsed));
      } catch {
      }
    }
    localStorage.setItem(versionKey, String(SETTINGS_VERSION));
  }
}

migrateSettings();

// ── Ingredient unit migration (L→ml, kg→g) ────────────────────────────────
// v2 also converts threshold (v1 missed it)
const INGREDIENT_UNIT_VERSION = '2';

function migrateIngredientUnits() {
  const versionKey = 'pos_ingredients_unit_version';
  if (localStorage.getItem(versionKey) === INGREDIENT_UNIT_VERSION) return;
  const raw = localStorage.getItem(KEYS.ingredients);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
      const converted = parsed.map((ing) => {
        const unit = ing.unit as string;
        const quantity = ing.quantity as number;
        const threshold = ing.threshold as number;
        const costPerUnit = ing.costPerUnit as number | undefined;
        if (unit === 'L' || unit === 'kg') {
          const factor = 1000;
          const baseUnit = unit === 'L' ? 'ml' : 'g';
          return {
            ...ing,
            quantity:  Math.round(quantity  * factor * 1000) / 1000,
            threshold: Math.round(threshold * factor * 1000) / 1000,
            unit: baseUnit,
            costPerUnit:
              costPerUnit !== undefined
                ? Math.round((costPerUnit / factor) * 1_000_000) / 1_000_000
                : undefined,
          };
        }
        return ing;
      });
      localStorage.setItem(KEYS.ingredients, JSON.stringify(converted));
    } catch {
      // ignore – corrupted data, leave as-is
    }
  }
  localStorage.setItem(versionKey, INGREDIENT_UNIT_VERSION);
}

migrateIngredientUnits();

export const db = {
  getTables: (): CafeTable[] => {
    const stored = get<CafeTable[] | null>(KEYS.tables, null);
    if (!stored) return [];
    return stored.map((table) => ({
      ...table,
      number: String(table.number),
      section: table.section?.trim() || 'Ground Floor',
    }));
  },
  saveTables: (t: CafeTable[]) => set(KEYS.tables, t),

  getAreaOrder: (): string[] => {
    const stored = get<string[] | null>(KEYS.areaOrder, null);
    if (stored && Array.isArray(stored) && stored.length > 0) return stored;
    return [];
  },
  saveAreaOrder: (order: string[]) => set(KEYS.areaOrder, order),

  getPillars: (): string[] => get(KEYS.pillars, []),
  savePillars: (p: string[]) => set(KEYS.pillars, p),

  getCategories: (): Category[] => get(KEYS.categories, []),
  saveCategories: (c: Category[]) => set(KEYS.categories, c),

  getMenuItems: (): MenuItem[] => get(KEYS.menuItems, []),
  saveMenuItems: (m: MenuItem[]) => set(KEYS.menuItems, m),

  getOrders: (): Order[] => get<Order[]>(KEYS.orders, []).map((order) => ({
    ...order,
    tableNumber: String(order.tableNumber),
    // Guard against corrupted data (e.g. Firebase dropped empty arrays as null)
    items: Array.isArray(order.items) ? order.items : [],
    tablePayments: Array.isArray(order.tablePayments) ? order.tablePayments : undefined,
  })),
  saveOrders: (o: Order[]) => set(KEYS.orders, o),

  getPayments: (): Payment[] => get<Payment[]>(KEYS.payments, []).map((payment) => ({
    ...payment,
    tableNumber: String(payment.tableNumber),
  })),
  savePayments: (p: Payment[]) => set(KEYS.payments, p),

  // ── Closed shift archive (immutable — append-only) ──────────────────────────
  getClosedShifts: (): ClosedShift[] => get<ClosedShift[]>(KEYS.closedShifts, []),
  appendClosedShift: (shift: ClosedShift): void => {
    const existing = get<ClosedShift[]>(KEYS.closedShifts, []);
    set(KEYS.closedShifts, [...existing, shift]);
  },

  getIngredients: (): Ingredient[] => get(KEYS.ingredients, []),
  saveIngredients: (i: Ingredient[]) => set(KEYS.ingredients, i),

  getRecipes: (): Recipe[] => get(KEYS.recipes, []),
  saveRecipes: (r: Recipe[]) => set(KEYS.recipes, r),

  getStockMovements: (): StockMovement[] => get(KEYS.stockMovements, []),
  saveStockMovements: (m: StockMovement[]) => set(KEYS.stockMovements, m),

  getSettings: (): Settings => {
    const stored = get<Partial<Settings>>(KEYS.settings, defaultSettings);
    return {
      ...defaultSettings,
      ...stored,
      wallets: {
        ...defaultSettings.wallets,
        ...stored?.wallets,
      },
    };
  },
  saveSettings: (s: Settings) => set(KEYS.settings, s),

  exportAll: () => {
    const data: Record<string, string | null> = {};
    Object.entries(KEYS).forEach(([k, v]) => {
      data[k] = localStorage.getItem(v);
    });
    return JSON.stringify(data, null, 2);
  },

  /**
   * Schema v2 full backup — structured JSON covering all 23 data domains.
   * Caller must inject live Zustand / Firebase state for the four domains
   * that have no localStorage representation (maintenanceExpenses,
   * alcoholProducts, beverageProducts, cigaretteProducts, invMovements).
   */
  exportFullBackup: (opts: {
    maintenanceExpenses?: unknown[];
    alcoholProducts?:    unknown[];
    beverageProducts?:   unknown[];
    cigaretteProducts?:  unknown[];
    invMovements?:       unknown[];
  } = {}): string => {
    const readLS = (key: string): unknown => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    };

    const payload = {
      app:        'Bamboo POS',
      version:    2,
      exportedAt: new Date().toISOString(),
      data: {
        // ── Core POS ─────────────────────────────────────────────────────────
        tables:         readLS(KEYS.tables),
        areaOrder:      readLS(KEYS.areaOrder),
        pillars:        readLS(KEYS.pillars),
        categories:     readLS(KEYS.categories),
        menuItems:      readLS(KEYS.menuItems),
        orders:         readLS(KEYS.orders),
        payments:       readLS(KEYS.payments),
        settings:       readLS(KEYS.settings),
        // ── Kitchen inventory ─────────────────────────────────────────────────
        ingredients:    readLS(KEYS.ingredients),
        recipes:        readLS(KEYS.recipes),
        stockMovements: readLS(KEYS.stockMovements),
        // ── Customers & Khatta ledger ─────────────────────────────────────────
        customers:      readLS('pos_customers'),
        repayments:     readLS('pos_customer_repayments'),
        // ── Staff ─────────────────────────────────────────────────────────────
        staff:          readLS('pos_staff_users'),
        // ── Kitchen purchases & meat tracker ──────────────────────────────────
        kitchenPurchases: readLS('kitchen_purchases'),
        meatEntries:      readLS('kitchen_meat_tracker'),
        // ── Grocery & inv-mappings (localStorage cache) ───────────────────────
        groceryPurchases: readLS('inv_grocery'),
        invMappings:      readLS('inv_mappings'),
        barRestockEntries: readLS('bar_restock_entries'),
        // ── Closed shift archive (immutable day-end snapshots) ────────────────
        closedShifts:     readLS(KEYS.closedShifts),
        // ── Firebase / Zustand-only domains (injected by caller) ─────────────
        maintenanceExpenses: opts.maintenanceExpenses ?? [],
        alcoholProducts:     opts.alcoholProducts    ?? [],
        beverageProducts:    opts.beverageProducts   ?? [],
        cigaretteProducts:   opts.cigaretteProducts  ?? [],
        invMovements:        opts.invMovements        ?? [],
      },
    };

    return JSON.stringify(payload, null, 2);
  },

  importAll: (json: string) => {
    const data = JSON.parse(json);
    Object.entries(KEYS).forEach(([k, v]) => {
      if (data[k]) localStorage.setItem(v, typeof data[k] === 'string' ? data[k] : JSON.stringify(data[k]));
    });
  },

  /**
   * Restore a Schema v2 or legacy v1 backup JSON string to localStorage.
   * Firebase-only domains (alcohol/beverage/cigarette products, invMovements,
   * maintenanceExpenses) are skipped — Firebase re-syncs them on next connect.
   * Returns { success, version, error? }.
   */
  importFullBackup: (jsonString: string): { success: boolean; version: number; error?: string } => {
    try {
      const parsed = JSON.parse(jsonString);
      if (typeof parsed !== 'object' || parsed === null) throw new Error('Not a valid JSON object');

      const isV2 = parsed.version === 2 && typeof parsed.data === 'object' && parsed.data !== null;

      if (isV2) {
        const d = parsed.data as Record<string, unknown>;
        const writeIf = (lsKey: string, val: unknown) => {
          if (val !== null && val !== undefined) {
            localStorage.setItem(lsKey, JSON.stringify(val));
          }
        };
        // Core POS
        writeIf(KEYS.tables,         d.tables);
        writeIf(KEYS.areaOrder,      d.areaOrder);
        writeIf(KEYS.pillars,        d.pillars);
        writeIf(KEYS.categories,     d.categories);
        writeIf(KEYS.menuItems,      d.menuItems);
        writeIf(KEYS.orders,         d.orders);
        writeIf(KEYS.payments,       d.payments);
        writeIf(KEYS.settings,       d.settings);
        writeIf(KEYS.ingredients,    d.ingredients);
        writeIf(KEYS.recipes,        d.recipes);
        writeIf(KEYS.stockMovements, d.stockMovements);
        // Customers & Khatta
        writeIf('pos_customers',            d.customers);
        writeIf('pos_customer_repayments',  d.repayments);
        // Staff
        writeIf('pos_staff_users', d.staff);
        // Kitchen operational
        writeIf('kitchen_purchases',   d.kitchenPurchases);
        writeIf('kitchen_meat_tracker', d.meatEntries);
        // Grocery & inv-mappings cache
        writeIf('inv_grocery',   d.groceryPurchases);
        writeIf('inv_mappings',  d.invMappings);
        writeIf('bar_restock_entries', d.barRestockEntries);
        // Closed shift archive
        writeIf(KEYS.closedShifts, d.closedShifts);
        // Firebase-only domains are intentionally skipped;
        // they will be re-populated by Firebase subscriptions after reload.

        return { success: true, version: 2 };
      }

      // ── Legacy v1 fallback (flat object, values are raw JSON strings) ──────
      const legacyMap: [string, string][] = [
        ['tables',         KEYS.tables],
        ['areaOrder',      KEYS.areaOrder],
        ['pillars',        KEYS.pillars],
        ['categories',     KEYS.categories],
        ['menuItems',      KEYS.menuItems],
        ['orders',         KEYS.orders],
        ['payments',       KEYS.payments],
        ['settings',       KEYS.settings],
        ['ingredients',    KEYS.ingredients],
        ['recipes',        KEYS.recipes],
        ['stockMovements', KEYS.stockMovements],
      ];
      let restored = 0;
      legacyMap.forEach(([exportKey, lsKey]) => {
        const val = parsed[exportKey];
        if (val !== null && val !== undefined) {
          localStorage.setItem(lsKey, typeof val === 'string' ? val : JSON.stringify(val));
          restored++;
        }
      });
      if (restored === 0) throw new Error('No recognisable data found in file');

      return { success: true, version: 1 };
    } catch (err) {
      return { success: false, version: 0, error: String(err) };
    }
  },

  /**
   * Wipe all operational localStorage data and return the POS to a clean state.
   * PRESERVES hardware / UX keys so printers and theme survive the reset:
   *   printer_kitchen_device_name, printer_reception_device_name,
   *   pos_is_print_hub, pos_theme.
   */
  completeFactoryReset: () => {
    const PRESERVE = new Set([
      'printer_kitchen_device_name',
      'printer_reception_device_name',
      'pos_is_print_hub',
      'pos_theme',
    ]);
    // Collect first — do NOT mutate while iterating localStorage
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !PRESERVE.has(key)) toRemove.push(key);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  },

  // seed() is intentionally a no-op — all initial states start empty.
  // Data is only written to storage via explicit user actions.
  seed: () => {},

  clearAll: () => {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem('pos_initialized');
  },

  clearMenuCache: () => {
    localStorage.removeItem(KEYS.categories);
    localStorage.removeItem(KEYS.menuItems);
    localStorage.removeItem(KEYS.pillars);
  },
};
