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

// ── Seed constants removed — app starts with a clean slate.
// Exported as empty arrays so any remaining imports continue to compile.
export const SEED_ALCOHOL: AlcoholProduct[] = [];
export const SEED_BEVERAGES: BeverageProduct[] = [];
export const SEED_CIGARETTES: CigaretteProduct[] = [];

const INV_KEYS = {
  grocery:   'inv_grocery',
  mappings:  'inv_mappings',
};

// ── State interface ───────────────────────────────────────────────────────────
interface InventoryState {
  alcoholProducts:   AlcoholProduct[];
  setAlcoholProducts: (products: AlcoholProduct[]) => void;
  beverageProducts:  BeverageProduct[];
  setBeverageProducts: (products: BeverageProduct[]) => void;
  cigaretteProducts: CigaretteProduct[];
  setCigaretteProducts: (products: CigaretteProduct[]) => void;
  groceryPurchases:  GroceryPurchase[];
  setGroceryPurchases: (purchases: GroceryPurchase[]) => void;
  invMovements:      InventoryMovement[];
  setInvMovements:   (movements: InventoryMovement[]) => void;
  invMappings:       InvMenuMapping[];
  setInvMappings:    (mappings: InvMenuMapping[]) => void;

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

  // ── Bar Portal unified movements ──
  addBarMovement: (args: {
    productType: InvProductType;
    productId: string;
    productName: string;
    entryType: 'Restock' | 'Spill/Loss';
    containerQty: number;
    containerUnit: string;
    baseUnitChange: number;   // signed: positive = stock in, negative = stock out
    totalCost: number;
    supplier: string;
    loggedBy: string;
    /** portionMl / bottleSizeMl — used to normalize costPerBottle back to full-bottle basis */
    sizeMultiplier?: number;
  }) => void;
  updateBarMovement: (args: {
    id: string;
    containerQty: number;
    newBaseUnitChange: number;
    totalCost: number;
    supplier: string;
  }) => void;
  deleteBarMovement: (id: string) => void;

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
  // Firebase is the single source of truth for products and movements.
  // Initialize as empty arrays — Firebase subscription populates them on connect
  // (or seeds them if the nodes are absent). Never read these from localStorage.
  alcoholProducts:   [],
  setAlcoholProducts:   (products) => set({ alcoholProducts: products }),
  beverageProducts:  [],
  setBeverageProducts:  (products) => set({ beverageProducts: products }),
  cigaretteProducts: [],
  setCigaretteProducts: (products) => set({ cigaretteProducts: products }),
  invMovements:      [],
  setInvMovements:   (movements) => set({ invMovements: movements }),
  // Grocery purchases and mappings use localStorage as a secondary cache.
  groceryPurchases:  getLS(INV_KEYS.grocery,  []),
  setGroceryPurchases: (purchases) => set({ groceryPurchases: purchases }),
  invMappings:       getLS(INV_KEYS.mappings, []),
  setInvMappings:    (mappings) => set({ invMappings: mappings }),

  // ── ALCOHOL ──────────────────────────────────────────────────────────────
  // NOTE: No localStorage writes here. Firebase is the single source of truth
  // for product state. The push effects in useFirebaseSync push Zustand state
  // changes to Firebase, which then fans back to all connected clients.
  addAlcohol: (p) => set((s) => {
    const products = [...s.alcoholProducts, { ...p, id: crypto.randomUUID() }];
    return { alcoholProducts: products };
  }),

  updateAlcohol: (id, u) => set((s) => {
    const products = s.alcoholProducts.map((p) => p.id === id ? { ...p, ...u } : p);
    return { alcoholProducts: products };
  }),

  deleteAlcohol: (id) => set((s) => {
    const products = s.alcoholProducts.filter((p) => p.id !== id);
    const mappings = s.invMappings.filter(
      (m) => !(m.productType === 'alcohol' && m.productId === id)
    );
    setLS(INV_KEYS.mappings, mappings);
    return { alcoholProducts: products, invMappings: mappings };
  }),

  purchaseAlcohol: ({ productId, bottles, supplier, invoiceNo, costPerBottle }) => set((s) => {
    const product = s.alcoholProducts.find((p) => p.id === productId);
    if (!product) return {};
    const addMl = bottles * product.bottleSizeMl;
    // Auto-sync cost price if cost was provided
    const updatedCost = costPerBottle ? { costPerBottle } : {};
    const products = s.alcoholProducts.map((p) =>
      p.id === productId
        ? { ...p, currentStockMl: p.currentStockMl + addMl, ...updatedCost }
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
      source: 'inventory',
      containerQty: bottles,
      containerUnit: 'btl',
    };
    const movements = [...s.invMovements, movement];
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
    return { alcoholProducts: products, invMovements: movements };
  }),

  // ── BEVERAGE ─────────────────────────────────────────────────────────────
  addBeverage: (p) => set((s) => {
    const products = [...s.beverageProducts, { ...p, id: crypto.randomUUID() }];
    return { beverageProducts: products };
  }),

  updateBeverage: (id, u) => set((s) => {
    const products = s.beverageProducts.map((p) => p.id === id ? { ...p, ...u } : p);
    return { beverageProducts: products };
  }),

  deleteBeverage: (id) => set((s) => {
    const products = s.beverageProducts.filter((p) => p.id !== id);
    const mappings = s.invMappings.filter(
      (m) => !(m.productType === 'beverage' && m.productId === id)
    );
    setLS(INV_KEYS.mappings, mappings);
    return { beverageProducts: products, invMappings: mappings };
  }),

  purchaseBeverage: ({ productId, qty, supplier, invoiceNo, cost }) => set((s) => {
    const product = s.beverageProducts.find((p) => p.id === productId);
    if (!product) return {};
    const addPieces = qty;
    const notes = `${qty} ${product.packagingType}${product.sizeLabel ? ` (${product.sizeLabel})` : ''}`;
    const containerQty = qty;
    const containerUnit = product.packagingType;
    const costPerUnit = cost && cost > 0 && qty > 0 ? cost / qty : undefined;
    const products = s.beverageProducts.map((p) =>
      p.id === productId
        ? { ...p, currentStock: p.currentStock + addPieces, ...(costPerUnit ? { costPerUnit } : {}) }
        : p
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
      source: 'inventory',
      containerQty,
      containerUnit,
    };
    const movements = [...s.invMovements, movement];
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
    return { beverageProducts: products, invMovements: movements };
  }),

  // ── CIGARETTE ────────────────────────────────────────────────────────────
  addCigarette: (p) => set((s) => {
    const products = [...s.cigaretteProducts, { ...p, id: crypto.randomUUID() }];
    return { cigaretteProducts: products };
  }),

  updateCigarette: (id, u) => set((s) => {
    const products = s.cigaretteProducts.map((p) => p.id === id ? { ...p, ...u } : p);
    return { cigaretteProducts: products };
  }),

  deleteCigarette: (id) => set((s) => {
    const products = s.cigaretteProducts.filter((p) => p.id !== id);
    const mappings = s.invMappings.filter(
      (m) => !(m.productType === 'cigarette' && m.productId === id)
    );
    setLS(INV_KEYS.mappings, mappings);
    return { cigaretteProducts: products, invMappings: mappings };
  }),

  purchaseCigarette: ({ productId, purchaseUnit, qty, supplier, invoiceNo, cost }) => set((s) => {
    const product = s.cigaretteProducts.find((p) => p.id === productId);
    if (!product) return {};
    let addSticks = qty;
    let notes = `${qty} stick${qty !== 1 ? 's' : ''}`;
    let containerQty = qty;
    let containerUnit = 'sticks';
    if (purchaseUnit === 'packet') {
      addSticks = qty * product.sticksPerPacket;
      notes = `${qty} packet${qty !== 1 ? 's' : ''} × ${product.sticksPerPacket} sticks = ${addSticks} sticks`;
      containerQty = qty;
      containerUnit = 'packets';
    }
    // Auto-sync cost price from total cost supplied
    const costPerPacket = cost && cost > 0 && qty > 0
      ? (purchaseUnit === 'packet'
          ? cost / qty
          : (cost / qty) * product.sticksPerPacket)
      : undefined;
    const products = s.cigaretteProducts.map((p) =>
      p.id === productId
        ? { ...p, currentSticks: p.currentSticks + addSticks, ...(costPerPacket ? { costPerPacket } : {}) }
        : p
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
      source: 'inventory',
      containerQty,
      containerUnit,
    };
    const movements = [...s.invMovements, movement];
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

  // ── BAR PORTAL UNIFIED MOVEMENTS ─────────────────────────────────────────
  addBarMovement: ({ productType, productId, productName, entryType, containerQty, containerUnit, baseUnitChange, totalCost, supplier, loggedBy, sizeMultiplier = 1 }) => set((s) => {
    const baseUnit = productType === 'alcohol' ? 'ml' : productType === 'beverage' ? 'pcs' : 'sticks';
    const movType = entryType === 'Restock' ? 'Purchase' : 'Waste';

    // Update product stock + auto-sync cost price
    let updatedAlcohol   = s.alcoholProducts;
    let updatedBeverages = s.beverageProducts;
    let updatedCigarettes = s.cigaretteProducts;

    if (productType === 'alcohol') {
      updatedAlcohol = s.alcoholProducts.map((p) => {
        if (p.id !== productId) return p;
        const newStockMl = Math.max(0, p.currentStockMl + baseUnitChange);
        // Weighted-average master cost — only on Restock with a valid invoice total.
        // Formula: ((existingStock × existingCostPerBottle) + invoiceTotal)
        //          / (existingStock + restockStock)   [both in bottle equivalents]
        // The raw invoiceTotal is preserved untouched on the movement record.
        let costPatch: Partial<AlcoholProduct> = {};
        if (entryType === 'Restock' && totalCost > 0 && baseUnitChange > 0 && p.bottleSizeMl > 0) {
          const existingBottles = p.currentStockMl / p.bottleSizeMl;
          const restockBottles  = baseUnitChange    / p.bottleSizeMl;
          const totalBottles    = existingBottles + restockBottles;
          if (totalBottles > 0) {
            const existingValue   = existingBottles * (p.costPerBottle ?? 0);
            costPatch = { costPerBottle: (existingValue + totalCost) / totalBottles };
          }
        }
        return { ...p, currentStockMl: newStockMl, ...costPatch };
      });
    } else if (productType === 'beverage') {
      updatedBeverages = s.beverageProducts.map((p) => {
        if (p.id !== productId) return p;
        const newStock = Math.max(0, p.currentStock + baseUnitChange);
        // Weighted-average master cost in individual unit units.
        let costPatch: Partial<BeverageProduct> = {};
        if (entryType === 'Restock' && totalCost > 0 && baseUnitChange > 0) {
          const existingPcs           = p.currentStock;
          const totalPcs              = existingPcs + baseUnitChange;
          const existingCostPerPiece  = p.costPerUnit ?? (p.costPerCarton && p.piecesPerCarton ? p.costPerCarton / p.piecesPerCarton : 0);
          const weightedCostPerPiece  = (existingPcs * existingCostPerPiece + totalCost) / totalPcs;
          costPatch = { costPerUnit: weightedCostPerPiece };
        }
        return { ...p, currentStock: newStock, ...costPatch };
      });
    } else {
      updatedCigarettes = s.cigaretteProducts.map((p) => {
        if (p.id !== productId) return p;
        const newSticks = Math.max(0, p.currentSticks + baseUnitChange);
        // Weighted-average master cost in stick units, converted back to per-packet.
        let costPatch: Partial<CigaretteProduct> = {};
        if (entryType === 'Restock' && totalCost > 0 && baseUnitChange > 0 && p.sticksPerPacket > 0) {
          const existingSticks        = p.currentSticks;
          const totalSticks           = existingSticks + baseUnitChange;
          const existingCostPerStick  = p.costPerPacket ? p.costPerPacket / p.sticksPerPacket : 0;
          const weightedCostPerStick  = (existingSticks * existingCostPerStick + totalCost) / totalSticks;
          costPatch = { costPerPacket: weightedCostPerStick * p.sticksPerPacket };
        }
        return { ...p, currentSticks: newSticks, ...costPatch };
      });
    }

    const movement: InventoryMovement = {
      id:           crypto.randomUUID(),
      productType,
      productId,
      productName,
      quantity:     baseUnitChange,
      unit:         baseUnit,
      type:         movType,
      supplier:     supplier || undefined,
      notes:        entryType === 'Spill/Loss' ? 'Spill/Loss via Bar Portal' : undefined,
      timestamp:    Date.now(),
      totalCost:    totalCost > 0 ? totalCost : undefined,
      loggedBy:     loggedBy || undefined,
      source:       'bar',
      containerQty,
      containerUnit,
    };

    return {
      alcoholProducts:   updatedAlcohol,
      beverageProducts:  updatedBeverages,
      cigaretteProducts: updatedCigarettes,
      invMovements:      [...s.invMovements, movement],
    };
  }),

  updateBarMovement: ({ id, containerQty, newBaseUnitChange, totalCost, supplier }) => set((s) => {
    const existing = s.invMovements.find((m) => m.id === id);
    if (!existing) return {};

    const delta = newBaseUnitChange - existing.quantity;

    let updatedAlcohol   = s.alcoholProducts;
    let updatedBeverages = s.beverageProducts;
    let updatedCigarettes = s.cigaretteProducts;

    if (existing.productType === 'alcohol') {
      // Combine stock-delta and cost-normalization in one pass.
      // Derive the portion's sizeMultiplier from the stored movement:
      //   mlPerContainer = |original baseUnitChange| / |original containerQty|
      //   sizeMultiplier = mlPerContainer / bottleSizeMl
      // This preserves the original portion size even when only cost is being edited.
      updatedAlcohol = s.alcoholProducts.map((p) => {
        if (p.id !== existing.productId) return p;
        const patch: Partial<AlcoholProduct> = {};
        if (Math.abs(delta) > 0.001) {
          patch.currentStockMl = Math.max(0, p.currentStockMl + delta);
        }
        // Only update cost for restocks (positive quantity) when cost is provided
        if (existing.quantity > 0 && totalCost > 0 && containerQty > 0 && p.bottleSizeMl > 0) {
          const origContainerQty = Math.abs(existing.containerQty ?? 1);
          const mlPerContainer   = origContainerQty > 0
            ? Math.abs(existing.quantity) / origContainerQty
            : p.bottleSizeMl;
          const sm = mlPerContainer / p.bottleSizeMl;
          if (sm > 0) patch.costPerBottle = totalCost / (containerQty * sm);
        }
        return { ...p, ...patch };
      });
    } else if (Math.abs(delta) > 0.001) {
      if (existing.productType === 'beverage') {
        updatedBeverages = s.beverageProducts.map((p) =>
          p.id === existing.productId
            ? { ...p, currentStock: Math.max(0, p.currentStock + delta) } : p
        );
      } else {
        updatedCigarettes = s.cigaretteProducts.map((p) =>
          p.id === existing.productId
            ? { ...p, currentSticks: Math.max(0, p.currentSticks + delta) } : p
        );
      }
    }

    const movements = s.invMovements.map((m) =>
      m.id === id
        ? { ...m, quantity: newBaseUnitChange, containerQty, totalCost: totalCost > 0 ? totalCost : undefined, supplier: supplier || undefined }
        : m
    );

    return {
      alcoholProducts:   updatedAlcohol,
      beverageProducts:  updatedBeverages,
      cigaretteProducts: updatedCigarettes,
      invMovements:      movements,
    };
  }),

  deleteBarMovement: (id) => set((s) => {
    const existing = s.invMovements.find((m) => m.id === id);
    if (!existing) return {};

    // Reverse the stock effect of this movement
    let updatedAlcohol   = s.alcoholProducts;
    let updatedBeverages = s.beverageProducts;
    let updatedCigarettes = s.cigaretteProducts;

    if (existing.productType === 'alcohol') {
      updatedAlcohol = s.alcoholProducts.map((p) =>
        p.id === existing.productId
          ? { ...p, currentStockMl: Math.max(0, p.currentStockMl - existing.quantity) } : p
      );
    } else if (existing.productType === 'beverage') {
      updatedBeverages = s.beverageProducts.map((p) =>
        p.id === existing.productId
          ? { ...p, currentStock: Math.max(0, p.currentStock - existing.quantity) } : p
      );
    } else {
      updatedCigarettes = s.cigaretteProducts.map((p) =>
        p.id === existing.productId
          ? { ...p, currentSticks: Math.max(0, p.currentSticks - existing.quantity) } : p
      );
    }

    return {
      alcoholProducts:   updatedAlcohol,
      beverageProducts:  updatedBeverages,
      cigaretteProducts: updatedCigarettes,
      invMovements:      s.invMovements.filter((m) => m.id !== id),
    };
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
    set({
      alcoholProducts:   updatedAlcohol,
      beverageProducts:  updatedBeverages,
      cigaretteProducts: updatedCigarettes,
      invMovements:      movements,
    });
  },
}));
