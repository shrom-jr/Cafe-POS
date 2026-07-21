export interface CafeTable {
  id: string;
  number: number;
  status: 'free' | 'occupied' | 'billing';
  orderId?: string;
  orderStartTime?: number;
  pax?: number;
}

export type CategoryPillar = 'Foods' | 'Beverages' | 'Cigarettes' | 'Hukkah';
export type BeverageSubGroup = 'Non-Alcoholic' | 'Alcoholic';

export interface Category {
  id: string;
  name: string;
  order: number;
  /** When true, items in this category are included on KOT tickets to the kitchen printer */
  sendToKitchen?: boolean;
  /** One of the 4 super-category pillars */
  parentCategory?: CategoryPillar;
  /** Only for Beverages — groups the category under Non-Alcoholic or Alcoholic */
  subGroup?: BeverageSubGroup;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  image?: string;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  status?: 'unpaid' | 'paid';
  paidAt?: number;
  sentToKitchen?: boolean;
}

export interface TablePayment {
  id: string;
  itemIds: string[];
  total: number;
  method: string;
  timestamp: number;
  billNumber: number;
}

export interface Order {
  id: string;
  tableId: string;
  tableNumber: number;
  items: OrderItem[];
  status: 'active' | 'billed' | 'paid';
  kitchenStatus?: 'draft' | 'placed';
  hasUnsentItems?: boolean;
  createdAt: number;
  tablePayments?: TablePayment[];
}

export interface Payment {
  id: string;
  orderId: string;
  tableNumber: number;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  discountType: 'percent' | 'fixed';
  vatAmount: number;
  vatRate: number;
  vatMode: 'excluded' | 'included';
  vatEnabled?: boolean;
  total: number;
  method: string;
  reference: string;
  createdAt: number;
  cafeName: string;
  billNumber: number;
}

export interface WalletConfig {
  enabled: boolean;
  qrImage?: string;
  logoImage?: string;
}

export interface CustomWallet {
  id: string;
  name: string;
  enabled: boolean;
  qrImage?: string;
  logoImage?: string;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  threshold: number;
  category?: string;
  costPerUnit?: number;
}

export interface StockMovement {
  id: string;
  ingredientId: string;
  change: number;
  source: string;
  timestamp: number;
}

export interface RecipeIngredient {
  ingredientId: string;
  quantity: number;
}

export interface Recipe {
  menuItemId: string;
  ingredients: RecipeIngredient[];
}

// ── NEW INVENTORY TYPES ──────────────────────────────────────────────────────

export type InvProductType = 'alcohol' | 'beverage' | 'cigarette';
export type InvMovementType = 'Purchase' | 'Sale' | 'Adjustment' | 'Waste' | 'Correction';

export interface AlcoholProduct {
  id: string;
  name: string;
  bottleSizeMl: number;       // e.g. 750
  currentStockMl: number;     // always stored in ml
  minStockMl: number;         // alert threshold in ml
  costPerBottle?: number;
  status: 'active' | 'inactive';
}

export interface BeverageProduct {
  id: string;
  name: string;
  piecesPerCarton: number;    // e.g. 24
  currentStock: number;       // stored in pieces internally
  minStock: number;           // threshold in pieces internally
  costPerCarton?: number;
  status: 'active' | 'inactive';
}

export interface CigaretteProduct {
  id: string;
  name: string;
  sticksPerPacket: number;    // e.g. 20
  currentSticks: number;      // stored as total sticks internally
  minSticks: number;          // threshold in sticks internally
  costPerPacket?: number;
  status: 'active' | 'inactive';
}

export interface GroceryPurchase {
  id: string;
  item: string;
  qty: number;
  unit: string;               // kg, g, L, pcs, dozen, etc.
  cost: number;
  supplier?: string;
  invoiceNo?: string;
  date: string;               // ISO date string YYYY-MM-DD
  note?: string;
}

export interface InventoryMovement {
  id: string;
  productType: InvProductType;
  productId: string;
  productName: string;
  quantity: number;           // positive = stock in, negative = stock out (base unit)
  unit: string;               // ml / pcs / sticks
  type: InvMovementType;
  reference?: string;         // invoice # or order name
  reason?: string;
  supplier?: string;
  notes?: string;             // human-readable purchase details, e.g. "12 bottles × 750ml"
  timestamp: number;
}

export interface InvMenuMapping {
  id: string;
  menuItemId: string;
  productType: InvProductType;
  productId: string;
  deductQty: number;          // ml for alcohol, pieces for beverage, sticks for cigarette
}

// ── SETTINGS (unchanged) ─────────────────────────────────────────────────────

export interface Settings {
  cafeName: string;
  cafeLogo?: string;
  cafeAddress?: string;
  cafePhone?: string;
  cafePan?: string;
  billFooter?: string;
  adminPin: string;
  esewaId: string;
  esewaPhone: string;
  wallets: {
    esewa: WalletConfig;
    khalti: WalletConfig;
    fonepay: WalletConfig;
  };
  customWallets?: CustomWallet[];
  printerAddress?: string;
  billCounter: number;
  vatEnabled: boolean;
  vatRate: number;
  vatMode: 'excluded' | 'included';
}
