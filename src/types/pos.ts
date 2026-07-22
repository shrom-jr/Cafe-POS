export interface CafeTable {
  id: string;
  /** Raw table name entered by the user; numeric names are stored as strings. */
  number: string;
  /** Area or floor used to organize tables in the overview. */
  section?: string;
  status: 'free' | 'occupied' | 'billing';
  orderId?: string;
  orderStartTime?: number;
  pax?: number;
}

export type CategoryPillar = string;
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
  /** Optional descriptive fields used by menu search and imported menu data. */
  category?: string;
  categoryName?: string;
  subcategory?: string;
  subcategoryName?: string;
  description?: string;
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

export interface StaffAttribution {
  id: string;
  /** Normalised display name — always set via getStaffName() at write time */
  name: string;
  /** Forward-compat: some records may store the field as fullName */
  fullName?: string;
  role: string;
}

export interface Order {
  id: string;
  tableId: string;
  tableNumber: string;
  items: OrderItem[];
  status: 'active' | 'billed' | 'paid';
  kitchenStatus?: 'draft' | 'placed';
  hasUnsentItems?: boolean;
  createdAt: number;
  tablePayments?: TablePayment[];
  /** Staff member who created/took the order */
  takenBy?: StaffAttribution;
}

export interface Payment {
  id: string;
  orderId: string;
  tableNumber: string;
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
  /** Staff member who took the original order */
  takenBy?: StaffAttribution;
  /** Staff member who processed the payment */
  processedBy?: StaffAttribution;
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
  kotCounter: number;
  resetKotDaily: boolean;
  kotLastResetDate?: string;
  vatEnabled: boolean;
  vatRate: number;
  vatMode: 'excluded' | 'included';
}
