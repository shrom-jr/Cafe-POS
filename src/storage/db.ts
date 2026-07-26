import { CafeTable, Category, Ingredient, MenuItem, Order, Payment, Recipe, Settings, StockMovement } from '@/types/pos';

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

  importAll: (json: string) => {
    const data = JSON.parse(json);
    Object.entries(KEYS).forEach(([k, v]) => {
      if (data[k]) localStorage.setItem(v, typeof data[k] === 'string' ? data[k] : JSON.stringify(data[k]));
    });
  },

  // seed() is intentionally a no-op — all initial states start empty.
  // Data is only written to storage via explicit user actions.
  seed: () => {},

  clearAll: () => {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem('pos_initialized');
  },
};
