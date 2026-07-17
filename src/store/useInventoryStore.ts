import { create } from 'zustand';
import {
  AlcoholProduct, BeverageProduct, CigaretteProduct,
  GroceryPurchase, InvMenuMapping, InvMovementType,
  InventoryMovement, InvProductType,
} from '@/types/pos';

// ── LocalStorage helpers ──────────────────────────────────────────────────────
function getLS<T>(key: string, fallback: T): T {
  try {
    const d = localStorage.getItem(key);
    return d ? JSON.parse(d) : fallback;
  } catch { return fallback; }
}
function setLS(key: string, val: unknown) {
  localStorage.setItem(key, JSON.stringify(val));
}

const INV_KEYS = {
  alcohol:    'inv_alcohol',
  beverages:  'inv_beverages',
  cigarettes: 'inv_cigarettes',
  grocery:    'inv_grocery',
  movements:  'inv_movements',
  mappings:   'inv_mappings',
};

// ── State interface ───────────────────────────────────────────────────────────
interface InventoryState {
  alcoholProducts:   AlcoholProduct[];
  beverageProducts:  BeverageProduct[];
  cigaretteProducts: CigaretteProduct[];
  groceryPurchases:  GroceryPurchase[];
  invMovements:      InventoryMovement[];
  invMappings:       InvMenuMapping[];

  // ── Alcohol ──
  addAlcohol:     (p: Omit<AlcoholProduct, 'id'>) => void;
  updateAlcohol:  (id: string, u: Partial<AlcoholProduct>) => void;
  deleteAlcohol:  (id: string) => void;
  purchaseAlcohol: (args: {
    productId: string; bottles: number;
    supplier?: string; invoiceNo?: string; costPerBottle?: number;
  }) => void;
  adjustAlcohol: (args: {
    productId: string; changeMl: number; type: InvMovementType; reason: string;
  }) => void;

  // ── Beverage ──
  addBeverage:     (p: Omit<BeverageProduct, 'id'>) => void;
  updateBeverage:  (id: string, u: Partial<BeverageProduct>) => void;
  deleteBeverage:  (id: string) => void;
  purchaseBeverage: (args: {
    productId: string;
    purchaseUnit: 'piece' | 'carton';
    qty: number;
    supplier?: string; invoiceNo?: string; cost?: number;
  }) => void;
  adjustBeverage: (args: {
    productId: string; changePieces: number; type: InvMovementType; reason: string;
  }) => void;

  // ── Cigarette ──
  addCigarette:     (p: Omit<CigaretteProduct, 'id'>) => void;
  updateCigarette:  (id: string, u: Partial<CigaretteProduct>) => void;
  deleteCigarette:  (id: string) => void;
  purchaseCigarette: (args: {
    productId: string;
    purchaseUnit: 'stick' | 'packet';
    qty: number;
    supplier?: string; invoiceNo?: string; cost?: number;
  }) => void;
  adjustCigarette: (args: {
    productId: string; changeSticks: number; type: InvMovementType; reason: string;
  }) => void;

  // ── Grocery ──
  addGroceryPurchase:    (p: Omit<GroceryPurchase, 'id'>) => void;
  deleteGroceryPurchase: (id: string) => void;

  // ── Mappings ──
  addMapping:    (m: Omit<InvMenuMapping, 'id'>) => void;
  deleteMapping: (id: string) => void;

  // ── POS integration ──
  deductInventoryForSale: (
    items: Array<{ menuItemId: string; quantity: number; name: string }>
  ) => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useInventoryStore = create<InventoryState>((set, get) => ({
  alcoholProducts:   getLS(INV_KEYS.alcohol,    []),
  beverageProducts:  getLS(INV_KEYS.beverages,  []),
  cigaretteProducts: getLS(INV_KEYS.cigarettes, []),
  groceryPurchases:  getLS(INV_KEYS.grocery,    []),
  invMovements:      getLS(INV_KEYS.movements,  []),
  invMappings:       getLS(INV_KEYS.mappings,   []),

  // ── ALCOHOL ──────────────────────────────────────────────────────────────
  addAlcohol: (p) => set((s) => {
    const products = [...s.alcoholProducts, { ...p, id: crypto.randomUUID() }];
    setLS(INV_KEYS.alcohol, products);
    return { alcoholProducts: products };
  }),

  updateAlcohol: (id, u) => set((s) => {
    const products = s.alcoholProducts.map((p) => p.id === id ? { ...p, ...u } : p);
    setLS(INV_KEYS.alcohol, products);
    return { alcoholProducts: products };
  }),

  deleteAlcohol: (id) => set((s) => {
    const products = s.alcoholProducts.filter((p) => p.id !== id);
    const mappings = s.invMappings.filter(
      (m) => !(m.productType === 'alcohol' && m.productId === id)
    );
    setLS(INV_KEYS.alcohol, products);
    setLS(INV_KEYS.mappings, mappings);
    return { alcoholProducts: products, invMappings: mappings };
  }),

  purchaseAlcohol: ({ productId, bottles, supplier, invoiceNo, costPerBottle }) => set((s) => {
    const product = s.alcoholProducts.find((p) => p.id === productId);
    if (!product) return {};
    const addMl = bottles * product.bottleSizeMl;
    let products = s.alcoholProducts.map((p) =>
      p.id === productId
        ? { ...p, currentStockMl: p.currentStockMl + addMl, ...(costPerBottle ? { costPerBottle } : {}) }
        : p
    );
    const movement: InventoryMovement = {
      id: crypto.randomUUID(),
      productType: 'alcohol',
      productId,
      productName: product.name,
      quantity: addMl,
      unit: 'ml',
      type: 'Purchase',
      reference: invoiceNo,
      supplier,
      notes: `${bottles} bottle${bottles !== 1 ? 's' : ''} × ${product.bottleSizeMl}ml`,
      timestamp: Date.now(),
    };
    const movements = [...s.invMovements, movement];
    setLS(INV_KEYS.alcohol, products);
    setLS(INV_KEYS.movements, movements);
    return { alcoholProducts: products, invMovements: movements };
  }),

  adjustAlcohol: ({ productId, changeMl, type, reason }) => set((s) => {
    const product = s.alcoholProducts.find((p) => p.id === productId);
    if (!product) return {};
    const products = s.alcoholProducts.map((p) =>
      p.id === productId
        ? { ...p, currentStockMl: Math.max(0, p.currentStockMl + changeMl) }
        : p
    );
    const movement: InventoryMovement = {
      id: crypto.randomUUID(),
      productType: 'alcohol',
      productId,
      productName: product.name,
      quantity: changeMl,
      unit: 'ml',
      type,
      reason,
      timestamp: Date.now(),
    };
    const movements = [...s.invMovements, movement];
    setLS(INV_KEYS.alcohol, products);
    setLS(INV_KEYS.movements, movements);
    return { alcoholProducts: products, invMovements: movements };
  }),

  // ── BEVERAGE ─────────────────────────────────────────────────────────────
  addBeverage: (p) => set((s) => {
    const products = [...s.beverageProducts, { ...p, id: crypto.randomUUID() }];
    setLS(INV_KEYS.beverages, products);
    return { beverageProducts: products };
  }),

  updateBeverage: (id, u) => set((s) => {
    const products = s.beverageProducts.map((p) => p.id === id ? { ...p, ...u } : p);
    setLS(INV_KEYS.beverages, products);
    return { beverageProducts: products };
  }),

  deleteBeverage: (id) => set((s) => {
    const products = s.beverageProducts.filter((p) => p.id !== id);
    const mappings = s.invMappings.filter(
      (m) => !(m.productType === 'beverage' && m.productId === id)
    );
    setLS(INV_KEYS.beverages, products);
    setLS(INV_KEYS.mappings, mappings);
    return { beverageProducts: products, invMappings: mappings };
  }),

  purchaseBeverage: ({ productId, purchaseUnit, qty, supplier, invoiceNo }) => set((s) => {
    const product = s.beverageProducts.find((p) => p.id === productId);
    if (!product) return {};
    let addPieces = qty;
    let notes = `${qty} piece${qty !== 1 ? 's' : ''}`;
    if (purchaseUnit === 'carton') {
      addPieces = qty * product.piecesPerCarton;
      notes = `${qty} carton${qty !== 1 ? 's' : ''} × ${product.piecesPerCarton} pcs = ${addPieces} pcs`;
    }
    const products = s.beverageProducts.map((p) =>
      p.id === productId ? { ...p, currentStock: p.currentStock + addPieces } : p
    );
    const movement: InventoryMovement = {
      id: crypto.randomUUID(),
      productType: 'beverage',
      productId,
      productName: product.name,
      quantity: addPieces,
      unit: 'pcs',
      type: 'Purchase',
      reference: invoiceNo,
      supplier,
      notes,
      timestamp: Date.now(),
    };
    const movements = [...s.invMovements, movement];
    setLS(INV_KEYS.beverages, products);
    setLS(INV_KEYS.movements, movements);
    return { beverageProducts: products, invMovements: movements };
  }),

  adjustBeverage: ({ productId, changePieces, type, reason }) => set((s) => {
    const product = s.beverageProducts.find((p) => p.id === productId);
    if (!product) return {};
    const products = s.beverageProducts.map((p) =>
      p.id === productId
        ? { ...p, currentStock: Math.max(0, p.currentStock + changePieces) }
        : p
    );
    const movement: InventoryMovement = {
      id: crypto.randomUUID(),
      productType: 'beverage',
      productId,
      productName: product.name,
      quantity: changePieces,
      unit: 'pcs',
      type,
      reason,
      timestamp: Date.now(),
    };
    const movements = [...s.invMovements, movement];
    setLS(INV_KEYS.beverages, products);
    setLS(INV_KEYS.movements, movements);
    return { beverageProducts: products, invMovements: movements };
  }),

  // ── CIGARETTE ────────────────────────────────────────────────────────────
  addCigarette: (p) => set((s) => {
    const products = [...s.cigaretteProducts, { ...p, id: crypto.randomUUID() }];
    setLS(INV_KEYS.cigarettes, products);
    return { cigaretteProducts: products };
  }),

  updateCigarette: (id, u) => set((s) => {
    const products = s.cigaretteProducts.map((p) => p.id === id ? { ...p, ...u } : p);
    setLS(INV_KEYS.cigarettes, products);
    return { cigaretteProducts: products };
  }),

  deleteCigarette: (id) => set((s) => {
    const products = s.cigaretteProducts.filter((p) => p.id !== id);
    const mappings = s.invMappings.filter(
      (m) => !(m.productType === 'cigarette' && m.productId === id)
    );
    setLS(INV_KEYS.cigarettes, products);
    setLS(INV_KEYS.mappings, mappings);
    return { cigaretteProducts: products, invMappings: mappings };
  }),

  purchaseCigarette: ({ productId, purchaseUnit, qty, supplier, invoiceNo }) => set((s) => {
    const product = s.cigaretteProducts.find((p) => p.id === productId);
    if (!product) return {};
    let addSticks = qty;
    let notes = `${qty} stick${qty !== 1 ? 's' : ''}`;
    if (purchaseUnit === 'packet') {
      addSticks = qty * product.sticksPerPacket;
      notes = `${qty} packet${qty !== 1 ? 's' : ''} × ${product.sticksPerPacket} sticks = ${addSticks} sticks`;
    }
    const products = s.cigaretteProducts.map((p) =>
      p.id === productId ? { ...p, currentSticks: p.currentSticks + addSticks } : p
    );
    const movement: InventoryMovement = {
      id: crypto.randomUUID(),
      productType: 'cigarette',
      productId,
      productName: product.name,
      quantity: addSticks,
      unit: 'sticks',
      type: 'Purchase',
      reference: invoiceNo,
      supplier,
      notes,
      timestamp: Date.now(),
    };
    const movements = [...s.invMovements, movement];
    setLS(INV_KEYS.cigarettes, products);
    setLS(INV_KEYS.movements, movements);
    return { cigaretteProducts: products, invMovements: movements };
  }),

  adjustCigarette: ({ productId, changeSticks, type, reason }) => set((s) => {
    const product = s.cigaretteProducts.find((p) => p.id === productId);
    if (!product) return {};
    const products = s.cigaretteProducts.map((p) =>
      p.id === productId
        ? { ...p, currentSticks: Math.max(0, p.currentSticks + changeSticks) }
        : p
    );
    const movement: InventoryMovement = {
      id: crypto.randomUUID(),
      productType: 'cigarette',
      productId,
      productName: product.name,
      quantity: changeSticks,
      unit: 'sticks',
      type,
      reason,
      timestamp: Date.now(),
    };
    const movements = [...s.invMovements, movement];
    setLS(INV_KEYS.cigarettes, products);
    setLS(INV_KEYS.movements, movements);
    return { cigaretteProducts: products, invMovements: movements };
  }),

  // ── GROCERY ──────────────────────────────────────────────────────────────
  addGroceryPurchase: (p) => set((s) => {
    const purchases = [...s.groceryPurchases, { ...p, id: crypto.randomUUID() }];
    setLS(INV_KEYS.grocery, purchases);
    return { groceryPurchases: purchases };
  }),

  deleteGroceryPurchase: (id) => set((s) => {
    const purchases = s.groceryPurchases.filter((p) => p.id !== id);
    setLS(INV_KEYS.grocery, purchases);
    return { groceryPurchases: purchases };
  }),

  // ── MAPPINGS ─────────────────────────────────────────────────────────────
  addMapping: (m) => set((s) => {
    const mappings = [...s.invMappings, { ...m, id: crypto.randomUUID() }];
    setLS(INV_KEYS.mappings, mappings);
    return { invMappings: mappings };
  }),

  deleteMapping: (id) => set((s) => {
    const mappings = s.invMappings.filter((m) => m.id !== id);
    setLS(INV_KEYS.mappings, mappings);
    return { invMappings: mappings };
  }),

  // ── POS INTEGRATION ──────────────────────────────────────────────────────
  deductInventoryForSale: (items) => {
    const s = get();
    let updatedAlcohol    = [...s.alcoholProducts];
    let updatedBeverages  = [...s.beverageProducts];
    let updatedCigarettes = [...s.cigaretteProducts];
    const newMovements: InventoryMovement[] = [];
    const now = Date.now();

    for (const item of items) {
      const mappings = s.invMappings.filter((m) => m.menuItemId === item.menuItemId);
      for (const mapping of mappings) {
        const totalDeduct = mapping.deductQty * item.quantity;

        if (mapping.productType === 'alcohol') {
          const product = updatedAlcohol.find((p) => p.id === mapping.productId);
          if (product) {
            updatedAlcohol = updatedAlcohol.map((p) =>
              p.id === mapping.productId
                ? { ...p, currentStockMl: Math.max(0, p.currentStockMl - totalDeduct) }
                : p
            );
            newMovements.push({
              id: crypto.randomUUID(),
              productType: 'alcohol',
              productId: mapping.productId,
              productName: product.name,
              quantity: -totalDeduct,
              unit: 'ml',
              type: 'Sale',
              reference: item.name,
              notes: `${item.quantity} × ${mapping.deductQty}ml`,
              timestamp: now,
            });
          }
        } else if (mapping.productType === 'beverage') {
          const product = updatedBeverages.find((p) => p.id === mapping.productId);
          if (product) {
            updatedBeverages = updatedBeverages.map((p) =>
              p.id === mapping.productId
                ? { ...p, currentStock: Math.max(0, p.currentStock - totalDeduct) }
                : p
            );
            newMovements.push({
              id: crypto.randomUUID(),
              productType: 'beverage',
              productId: mapping.productId,
              productName: product.name,
              quantity: -totalDeduct,
              unit: 'pcs',
              type: 'Sale',
              reference: item.name,
              notes: `${item.quantity} × ${mapping.deductQty} pcs`,
              timestamp: now,
            });
          }
        } else if (mapping.productType === 'cigarette') {
          const product = updatedCigarettes.find((p) => p.id === mapping.productId);
          if (product) {
            updatedCigarettes = updatedCigarettes.map((p) =>
              p.id === mapping.productId
                ? { ...p, currentSticks: Math.max(0, p.currentSticks - totalDeduct) }
                : p
            );
            newMovements.push({
              id: crypto.randomUUID(),
              productType: 'cigarette',
              productId: mapping.productId,
              productName: product.name,
              quantity: -totalDeduct,
              unit: 'sticks',
              type: 'Sale',
              reference: item.name,
              notes: `${item.quantity} × ${mapping.deductQty} sticks`,
              timestamp: now,
            });
          }
        }
      }
    }

    if (newMovements.length === 0) return;

    const movements = [...s.invMovements, ...newMovements];
    setLS(INV_KEYS.alcohol,    updatedAlcohol);
    setLS(INV_KEYS.beverages,  updatedBeverages);
    setLS(INV_KEYS.cigarettes, updatedCigarettes);
    setLS(INV_KEYS.movements,  movements);
    set({
      alcoholProducts:   updatedAlcohol,
      beverageProducts:  updatedBeverages,
      cigaretteProducts: updatedCigarettes,
      invMovements:      movements,
    });
  },
}));
