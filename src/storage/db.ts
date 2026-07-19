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

const defaultTables: CafeTable[] = Array.from({ length: 8 }, (_, i) => ({
  id: `table-${i + 1}`,
  number: i + 1,
  status: 'free' as const,
}));

// ── Bamboo Restaurant Menu ────────────────────────────────────────────────────
// Parsed from Bamboo Restaurant Menu.pdf — Kathmandu, Nepal
// sendToKitchen=true  → food categories routed to kitchen printer (KOT)
// sendToKitchen=false → bar/counter categories, counter printer only

const defaultCategories: Category[] = [
  // ── Beverages (counter only) ──────────────────────────────────────────────
  { id: 'cat-hot-bev',        name: 'Hot Beverages',                  order:  1, sendToKitchen: false },
  { id: 'cat-cold-bev',       name: 'Cold Beverages',                 order:  2, sendToKitchen: false },
  // ── Food — Burgers, Soups, Sizzlers ───────────────────────────────────────
  { id: 'cat-burger',         name: 'Burgers & Sandwiches',           order:  3, sendToKitchen: true  },
  { id: 'cat-soup',           name: 'Soups',                          order:  4, sendToKitchen: true  },
  { id: 'cat-sizzler',        name: 'Sizzlers',                       order:  5, sendToKitchen: true  },
  // ── Food — Snacks ─────────────────────────────────────────────────────────
  { id: 'cat-veg-snack',      name: 'Vegetarian Snacks',              order:  6, sendToKitchen: true  },
  { id: 'cat-nonveg-snack',   name: 'Main Non-Veg Snacks',            order:  7, sendToKitchen: true  },
  { id: 'cat-chhoila',        name: 'Chhoila',                        order:  8, sendToKitchen: true  },
  // ── Food — Noodles & Dumplings ────────────────────────────────────────────
  { id: 'cat-thukpa',         name: 'Thukpa',                         order:  9, sendToKitchen: true  },
  { id: 'cat-chowmein',       name: 'Chowmein',                       order: 10, sendToKitchen: true  },
  { id: 'cat-momo',           name: 'Momo Varieties',                 order: 11, sendToKitchen: true  },
  { id: 'cat-fried-rice',     name: 'Fried Rice',                     order: 12, sendToKitchen: true  },
  // ── Food — Mains ──────────────────────────────────────────────────────────
  { id: 'cat-biryani',        name: 'Biryani',                        order: 13, sendToKitchen: true  },
  { id: 'cat-curry',          name: 'Main Curries',                   order: 14, sendToKitchen: true  },
  { id: 'cat-rice',           name: 'Rice Sides',                     order: 15, sendToKitchen: true  },
  { id: 'cat-khana',          name: 'Traditional Dhido & Khana Sets', order: 16, sendToKitchen: true  },
  // ── Food — International ──────────────────────────────────────────────────
  { id: 'cat-pizza',          name: 'Pizza',                          order: 17, sendToKitchen: true  },
  { id: 'cat-rolls',          name: 'Rolls',                          order: 18, sendToKitchen: true  },
  { id: 'cat-chop-suey',      name: 'Chop Suey',                      order: 19, sendToKitchen: true  },
  { id: 'cat-fish',           name: 'Fish Dishes',                    order: 20, sendToKitchen: true  },
  // ── Food — Sekuwa & Sets ──────────────────────────────────────────────────
  { id: 'cat-sekuwa',         name: 'Special Sekuwa',                 order: 21, sendToKitchen: true  },
  { id: 'cat-sekuwa-combo',   name: 'Sekuwa Combo Sets',              order: 22, sendToKitchen: true  },
  { id: 'cat-khaja',          name: 'Traditional Khaja Sets',         order: 23, sendToKitchen: true  },
  { id: 'cat-platter',        name: 'Sharing Platters',               order: 24, sendToKitchen: true  },
  // ── Bar / Counter ─────────────────────────────────────────────────────────
  { id: 'cat-beer',           name: 'Beers',                          order: 25, sendToKitchen: false },
  { id: 'cat-wine',           name: 'Wines',                          order: 26, sendToKitchen: false },
  { id: 'cat-dom-spirit',     name: 'Domestic Spirits',               order: 27, sendToKitchen: false },
  { id: 'cat-imp-spirit',     name: 'Imported Spirits',               order: 28, sendToKitchen: false },
  { id: 'cat-hookah-reg',     name: 'Regular Hookah',                 order: 29, sendToKitchen: false },
  { id: 'cat-hookah-cloud',   name: 'Cloud Hookah',                   order: 30, sendToKitchen: false },
  { id: 'cat-cig',            name: 'Cigarettes (Per Stick)',          order: 31, sendToKitchen: false },
];

const defaultMenuItems: MenuItem[] = [
  // ── Hot Beverages ─────────────────────────────────────────────────────────
  { id: 'mi-hb-1',  categoryId: 'cat-hot-bev',      name: 'Black Tea',                         price:    30 },
  { id: 'mi-hb-2',  categoryId: 'cat-hot-bev',      name: 'Lemon Tea',                         price:    40 },
  { id: 'mi-hb-3',  categoryId: 'cat-hot-bev',      name: 'Milk Tea',                          price:    50 },
  { id: 'mi-hb-4',  categoryId: 'cat-hot-bev',      name: 'Masala Milk Tea',                   price:    60 },
  { id: 'mi-hb-5',  categoryId: 'cat-hot-bev',      name: 'Black Coffee',                      price:    80 },
  { id: 'mi-hb-6',  categoryId: 'cat-hot-bev',      name: 'Hot Lemon',                         price:    80 },
  { id: 'mi-hb-7',  categoryId: 'cat-hot-bev',      name: 'Milk Coffee',                       price:   120 },
  { id: 'mi-hb-8',  categoryId: 'cat-hot-bev',      name: 'Hot Lemon with Ginger & Honey',     price:   180 },
  { id: 'mi-hb-9',  categoryId: 'cat-hot-bev',      name: 'Hot Chocolate',                     price:   250 },
  // ── Cold Beverages ────────────────────────────────────────────────────────
  { id: 'mi-cb-1',  categoryId: 'cat-cold-bev',     name: 'Coke / Fanta / Sprite',             price:   100 },
  { id: 'mi-cb-2',  categoryId: 'cat-cold-bev',     name: 'Pepsi / Dew / Slice',               price:   100 },
  { id: 'mi-cb-3',  categoryId: 'cat-cold-bev',     name: 'Sweet Lassi',                       price:   150 },
  { id: 'mi-cb-4',  categoryId: 'cat-cold-bev',     name: 'Watermelon Juice',                  price:   150 },
  { id: 'mi-cb-5',  categoryId: 'cat-cold-bev',     name: 'Banana Lassi',                      price:   180 },
  { id: 'mi-cb-6',  categoryId: 'cat-cold-bev',     name: 'Red Bull',                          price:   200 },
  { id: 'mi-cb-7',  categoryId: 'cat-cold-bev',     name: 'Xtreme Energy Drink',               price:   250 },
  { id: 'mi-cb-8',  categoryId: 'cat-cold-bev',     name: 'Iced Tea',                          price:   130 },
  { id: 'mi-cb-9',  categoryId: 'cat-cold-bev',     name: 'Chocolate Milkshake',               price:   250 },
  { id: 'mi-cb-10', categoryId: 'cat-cold-bev',     name: 'Cold Coffee (Black)',               price:   130 },
  { id: 'mi-cb-11', categoryId: 'cat-cold-bev',     name: 'Cold Coffee (Milk)',                price:   150 },
  // ── Burgers & Sandwiches ──────────────────────────────────────────────────
  { id: 'mi-bg-1',  categoryId: 'cat-burger',       name: 'Veg Burger',                        price:   150 },
  { id: 'mi-bg-2',  categoryId: 'cat-burger',       name: 'Chicken Burger',                    price:   180 },
  { id: 'mi-bg-3',  categoryId: 'cat-burger',       name: 'Crunchy Chicken Burger',            price:   200 },
  { id: 'mi-bg-4',  categoryId: 'cat-burger',       name: 'Cheese Sandwich',                   price:   220 },
  { id: 'mi-bg-5',  categoryId: 'cat-burger',       name: 'Chicken Sandwich',                  price:   250 },
  { id: 'mi-bg-6',  categoryId: 'cat-burger',       name: 'Special Club Sandwich',             price:   300 },
  // ── Soups ─────────────────────────────────────────────────────────────────
  { id: 'mi-sp-1',  categoryId: 'cat-soup',         name: 'Creamy Veg Soup',                   price:   200 },
  { id: 'mi-sp-2',  categoryId: 'cat-soup',         name: 'Nepali Soup (Veg)',                 price:   200 },
  { id: 'mi-sp-3',  categoryId: 'cat-soup',         name: 'Nepali Soup (Non-Veg)',             price:   250 },
  { id: 'mi-sp-4',  categoryId: 'cat-soup',         name: 'Creamy Chicken Mushroom Soup',      price:   280 },
  { id: 'mi-sp-5',  categoryId: 'cat-soup',         name: 'Hot & Sour Soup (Veg)',             price:   280 },
  { id: 'mi-sp-6',  categoryId: 'cat-soup',         name: 'Hot & Sour Soup (Non-Veg)',         price:   300 },
  // ── Sizzlers ──────────────────────────────────────────────────────────────
  { id: 'mi-sz-1',  categoryId: 'cat-sizzler',      name: 'Veg Sizzler',                       price:   350 },
  { id: 'mi-sz-2',  categoryId: 'cat-sizzler',      name: 'Fish Sizzler',                      price:   400 },
  { id: 'mi-sz-3',  categoryId: 'cat-sizzler',      name: 'Chicken Sizzler',                   price:   450 },
  // ── Vegetarian Snacks ─────────────────────────────────────────────────────
  { id: 'mi-vs-1',  categoryId: 'cat-veg-snack',    name: 'Masala Papad',                      price:   150 },
  { id: 'mi-vs-2',  categoryId: 'cat-veg-snack',    name: 'Veg Pakoda',                        price:   180 },
  { id: 'mi-vs-3',  categoryId: 'cat-veg-snack',    name: 'Aloo Jeera',                        price:   180 },
  { id: 'mi-vs-4',  categoryId: 'cat-veg-snack',    name: 'French Fries',                      price:   180 },
  { id: 'mi-vs-5',  categoryId: 'cat-veg-snack',    name: 'Aloo Sadheko',                      price:   180 },
  { id: 'mi-vs-6',  categoryId: 'cat-veg-snack',    name: 'Seasonal Green Bhatmas Sadheko',    price:   200 },
  { id: 'mi-vs-7',  categoryId: 'cat-veg-snack',    name: 'Onion Pakoda',                      price:   200 },
  { id: 'mi-vs-8',  categoryId: 'cat-veg-snack',    name: 'Chips Chili',                       price:   200 },
  { id: 'mi-vs-9',  categoryId: 'cat-veg-snack',    name: 'Crispy Aloo',                       price:   200 },
  { id: 'mi-vs-10', categoryId: 'cat-veg-snack',    name: 'Boiled Corn',                       price:   200 },
  { id: 'mi-vs-11', categoryId: 'cat-veg-snack',    name: 'Chura Bhatmas Sadheko',             price:   220 },
  { id: 'mi-vs-12', categoryId: 'cat-veg-snack',    name: 'Mixed Veg (Boiled)',                price:   220 },
  { id: 'mi-vs-13', categoryId: 'cat-veg-snack',    name: 'Crispy Corn',                       price:   240 },
  { id: 'mi-vs-14', categoryId: 'cat-veg-snack',    name: 'Green Corn Sadheko',                price:   250 },
  { id: 'mi-vs-15', categoryId: 'cat-veg-snack',    name: 'Cheese Balls',                      price:   250 },
  { id: 'mi-vs-16', categoryId: 'cat-veg-snack',    name: 'Mustang Aloo',                      price:   270 },
  { id: 'mi-vs-17', categoryId: 'cat-veg-snack',    name: 'Mushroom Chili',                    price:   280 },
  { id: 'mi-vs-18', categoryId: 'cat-veg-snack',    name: 'Paneer Pakoda',                     price:   280 },
  { id: 'mi-vs-19', categoryId: 'cat-veg-snack',    name: 'Paneer Chili',                      price:   290 },
  // ── Main Non-Veg Snacks ───────────────────────────────────────────────────
  { id: 'mi-nv-1',  categoryId: 'cat-nonveg-snack', name: 'Chicken Sadheko',                   price:   270 },
  { id: 'mi-nv-2',  categoryId: 'cat-nonveg-snack', name: 'Chicken Chili',                     price:   280 },
  { id: 'mi-nv-3',  categoryId: 'cat-nonveg-snack', name: 'Boiled Chicken',                    price:   280 },
  { id: 'mi-nv-4',  categoryId: 'cat-nonveg-snack', name: 'Chicken Lollipop',                  price:   300 },
  { id: 'mi-nv-5',  categoryId: 'cat-nonveg-snack', name: 'Chicken Drumstick',                 price:   300 },
  { id: 'mi-nv-6',  categoryId: 'cat-nonveg-snack', name: 'Buff Sukuti Sadheko',               price:   300 },
  { id: 'mi-nv-7',  categoryId: 'cat-nonveg-snack', name: 'Hot & Spicy Chicken Wings',         price:   300 },
  { id: 'mi-nv-8',  categoryId: 'cat-nonveg-snack', name: 'Pork Dameko',                       price:   300 },
  { id: 'mi-nv-9',  categoryId: 'cat-nonveg-snack', name: 'Timur Chicken',                     price:   350 },
  { id: 'mi-nv-10', categoryId: 'cat-nonveg-snack', name: 'Nepali Chicken',                    price:   350 },
  { id: 'mi-nv-11', categoryId: 'cat-nonveg-snack', name: 'Timur Pork',                        price:   350 },
  { id: 'mi-nv-12', categoryId: 'cat-nonveg-snack', name: 'Pangra Fry',                        price:   350 },
  { id: 'mi-nv-13', categoryId: 'cat-nonveg-snack', name: 'Palpali Chicken',                   price:   360 },
  { id: 'mi-nv-14', categoryId: 'cat-nonveg-snack', name: 'Bhutan',                            price:   380 },
  { id: 'mi-nv-15', categoryId: 'cat-nonveg-snack', name: 'Dragon Chicken',                    price:   400 },
  { id: 'mi-nv-16', categoryId: 'cat-nonveg-snack', name: 'Head Fry (Gidi Fry)',               price:   450 },
  { id: 'mi-nv-17', categoryId: 'cat-nonveg-snack', name: 'Head Sadheko (Gidi Sadheko)',       price:   460 },
  { id: 'mi-nv-18', categoryId: 'cat-nonveg-snack', name: 'Rajkhani Poleko & Sadheko',         price:   550 },
  { id: 'mi-nv-19', categoryId: 'cat-nonveg-snack', name: 'Pakku',                             price:   550 },
  { id: 'mi-nv-20', categoryId: 'cat-nonveg-snack', name: 'Hyakula Dameko & Sadheko',          price:   600 },
  // ── Chhoila ───────────────────────────────────────────────────────────────
  { id: 'mi-ch-1',  categoryId: 'cat-chhoila',      name: 'Mushroom Chhoila',                  price:   200 },
  { id: 'mi-ch-2',  categoryId: 'cat-chhoila',      name: 'Buff Chhoila',                      price:   280 },
  { id: 'mi-ch-3',  categoryId: 'cat-chhoila',      name: 'Pork Chhoila',                      price:   280 },
  { id: 'mi-ch-4',  categoryId: 'cat-chhoila',      name: 'Chicken Chhoila',                   price:   300 },
  { id: 'mi-ch-5',  categoryId: 'cat-chhoila',      name: 'Mutton Chhoila',                    price:   450 },
  // ── Thukpa ────────────────────────────────────────────────────────────────
  { id: 'mi-th-1',  categoryId: 'cat-thukpa',       name: 'Veg Thukpa',                        price:   160 },
  { id: 'mi-th-2',  categoryId: 'cat-thukpa',       name: 'Buff Thukpa',                       price:   180 },
  { id: 'mi-th-3',  categoryId: 'cat-thukpa',       name: 'Egg Thukpa',                        price:   180 },
  { id: 'mi-th-4',  categoryId: 'cat-thukpa',       name: 'Chicken Thukpa',                    price:   200 },
  { id: 'mi-th-5',  categoryId: 'cat-thukpa',       name: 'Pork Thukpa',                       price:   200 },
  { id: 'mi-th-6',  categoryId: 'cat-thukpa',       name: 'Mixed Thukpa',                      price:   250 },
  // ── Chowmein ──────────────────────────────────────────────────────────────
  { id: 'mi-cw-1',  categoryId: 'cat-chowmein',     name: 'Veg Chowmein',                      price:   150 },
  { id: 'mi-cw-2',  categoryId: 'cat-chowmein',     name: 'Buff Chowmein',                     price:   170 },
  { id: 'mi-cw-3',  categoryId: 'cat-chowmein',     name: 'Chicken Chowmein',                  price:   180 },
  { id: 'mi-cw-4',  categoryId: 'cat-chowmein',     name: 'Pork Chowmein',                     price:   180 },
  { id: 'mi-cw-5',  categoryId: 'cat-chowmein',     name: 'Mixed Chowmein',                    price:   250 },
  // ── Momo Varieties ────────────────────────────────────────────────────────
  { id: 'mi-mm-1',  categoryId: 'cat-momo',         name: 'Veg Momo (Steam)',                  price:   150 },
  { id: 'mi-mm-2',  categoryId: 'cat-momo',         name: 'Veg Momo (Jhol)',                   price:   170 },
  { id: 'mi-mm-3',  categoryId: 'cat-momo',         name: 'Veg Momo (Sadheko)',                price:   200 },
  { id: 'mi-mm-4',  categoryId: 'cat-momo',         name: 'Veg Momo (Fry)',                    price:   150 },
  { id: 'mi-mm-5',  categoryId: 'cat-momo',         name: 'Veg Momo (Kothey)',                 price:   160 },
  { id: 'mi-mm-6',  categoryId: 'cat-momo',         name: 'Veg Momo (Chili)',                  price:   220 },
  { id: 'mi-mm-7',  categoryId: 'cat-momo',         name: 'Buff Momo (Steam)',                 price:   160 },
  { id: 'mi-mm-8',  categoryId: 'cat-momo',         name: 'Buff Momo (Jhol)',                  price:   190 },
  { id: 'mi-mm-9',  categoryId: 'cat-momo',         name: 'Buff Momo (Sadheko)',               price:   240 },
  { id: 'mi-mm-10', categoryId: 'cat-momo',         name: 'Buff Momo (Fry)',                   price:   190 },
  { id: 'mi-mm-11', categoryId: 'cat-momo',         name: 'Buff Momo (Kothey)',                price:   170 },
  { id: 'mi-mm-12', categoryId: 'cat-momo',         name: 'Buff Momo (Chili)',                 price:   270 },
  { id: 'mi-mm-13', categoryId: 'cat-momo',         name: 'Chicken Momo (Steam)',              price:   180 },
  { id: 'mi-mm-14', categoryId: 'cat-momo',         name: 'Chicken Momo (Jhol)',               price:   200 },
  { id: 'mi-mm-15', categoryId: 'cat-momo',         name: 'Chicken Momo (Sadheko)',            price:   250 },
  { id: 'mi-mm-16', categoryId: 'cat-momo',         name: 'Chicken Momo (Fry)',                price:   200 },
  { id: 'mi-mm-17', categoryId: 'cat-momo',         name: 'Chicken Momo (Kothey)',             price:   190 },
  { id: 'mi-mm-18', categoryId: 'cat-momo',         name: 'Chicken Momo (Chili)',              price:   280 },
  // ── Fried Rice ────────────────────────────────────────────────────────────
  { id: 'mi-fr-1',  categoryId: 'cat-fried-rice',   name: 'Veg Fried Rice',                    price:   150 },
  { id: 'mi-fr-2',  categoryId: 'cat-fried-rice',   name: 'Egg Fried Rice',                    price:   180 },
  { id: 'mi-fr-3',  categoryId: 'cat-fried-rice',   name: 'Chicken Fried Rice',                price:   200 },
  { id: 'mi-fr-4',  categoryId: 'cat-fried-rice',   name: 'Buff Fried Rice',                   price:   200 },
  { id: 'mi-fr-5',  categoryId: 'cat-fried-rice',   name: 'Pork Fried Rice',                   price:   200 },
  { id: 'mi-fr-6',  categoryId: 'cat-fried-rice',   name: 'Mixed Fried Rice',                  price:   250 },
  // ── Biryani ───────────────────────────────────────────────────────────────
  { id: 'mi-br-1',  categoryId: 'cat-biryani',      name: 'Veg Biryani',                       price:   300 },
  { id: 'mi-br-2',  categoryId: 'cat-biryani',      name: 'Chicken Biryani',                   price:   400 },
  { id: 'mi-br-3',  categoryId: 'cat-biryani',      name: 'Mutton Biryani',                    price:   480 },
  // ── Main Curries ──────────────────────────────────────────────────────────
  { id: 'mi-cr-1',  categoryId: 'cat-curry',        name: 'Mixed Veg Curry',                   price:   200 },
  { id: 'mi-cr-2',  categoryId: 'cat-curry',        name: 'Egg Curry',                         price:   200 },
  { id: 'mi-cr-3',  categoryId: 'cat-curry',        name: 'Matar Paneer',                      price:   240 },
  { id: 'mi-cr-4',  categoryId: 'cat-curry',        name: 'Chicken Curry',                     price:   250 },
  { id: 'mi-cr-5',  categoryId: 'cat-curry',        name: 'Paneer Butter Masala',              price:   280 },
  { id: 'mi-cr-6',  categoryId: 'cat-curry',        name: 'Chicken Butter Masala',             price:   300 },
  { id: 'mi-cr-7',  categoryId: 'cat-curry',        name: 'Mutton Curry',                      price:   400 },
  // ── Rice Sides ────────────────────────────────────────────────────────────
  { id: 'mi-rs-1',  categoryId: 'cat-rice',         name: 'Plain Rice',                        price:    80 },
  { id: 'mi-rs-2',  categoryId: 'cat-rice',         name: 'Butter Rice',                       price:   100 },
  { id: 'mi-rs-3',  categoryId: 'cat-rice',         name: 'Jeera Rice',                        price:   110 },
  // ── Traditional Dhido & Khana Sets ───────────────────────────────────────
  { id: 'mi-kh-1',  categoryId: 'cat-khana',        name: 'Veg Khana Set',                     price:   325 },
  { id: 'mi-kh-2',  categoryId: 'cat-khana',        name: 'Chicken Khana Set',                 price:   400 },
  { id: 'mi-kh-3',  categoryId: 'cat-khana',        name: 'Fish Khana Set',                    price:   450 },
  { id: 'mi-kh-4',  categoryId: 'cat-khana',        name: 'Mutton Khana Set',                  price:   500 },
  // ── Pizza ─────────────────────────────────────────────────────────────────
  { id: 'mi-pz-1',  categoryId: 'cat-pizza',        name: 'Margherita Pizza',                  price:   350 },
  { id: 'mi-pz-2',  categoryId: 'cat-pizza',        name: 'Veg Pizza',                         price:   380 },
  { id: 'mi-pz-3',  categoryId: 'cat-pizza',        name: 'Smoky Chicken Pizza',               price:   450 },
  { id: 'mi-pz-4',  categoryId: 'cat-pizza',        name: 'Sausage Salami Pizza',              price:   500 },
  { id: 'mi-pz-5',  categoryId: 'cat-pizza',        name: 'Mixed Pizza',                       price:   550 },
  // ── Rolls ─────────────────────────────────────────────────────────────────
  { id: 'mi-rl-1',  categoryId: 'cat-rolls',        name: 'Katti Roll (Veg)',                  price:   180 },
  { id: 'mi-rl-2',  categoryId: 'cat-rolls',        name: 'Katti Roll (Non-Veg)',              price:   280 },
  { id: 'mi-rl-3',  categoryId: 'cat-rolls',        name: 'Spring Roll (Veg)',                 price:   200 },
  { id: 'mi-rl-4',  categoryId: 'cat-rolls',        name: 'Spring Roll (Non-Veg)',             price:   300 },
  { id: 'mi-rl-5',  categoryId: 'cat-rolls',        name: 'Shawarma Roll (Veg)',               price:   250 },
  { id: 'mi-rl-6',  categoryId: 'cat-rolls',        name: 'Shawarma Roll (Non-Veg)',           price:   350 },
  // ── Chop Suey ─────────────────────────────────────────────────────────────
  { id: 'mi-cs-1',  categoryId: 'cat-chop-suey',    name: 'Chinese Chop Suey',                 price:   225 },
  { id: 'mi-cs-2',  categoryId: 'cat-chop-suey',    name: 'American Chop Suey',                price:   250 },
  // ── Fish Dishes ───────────────────────────────────────────────────────────
  { id: 'mi-fd-1',  categoryId: 'cat-fish',         name: 'Fish Fingers',                      price:   270 },
  { id: 'mi-fd-2',  categoryId: 'cat-fish',         name: 'Fish Fry',                          price:   300 },
  { id: 'mi-fd-3',  categoryId: 'cat-fish',         name: 'Fish & Chips',                      price:   325 },
  { id: 'mi-fd-4',  categoryId: 'cat-fish',         name: 'Steamed Whole Fish',                price:   550 },
  { id: 'mi-fd-5',  categoryId: 'cat-fish',         name: 'Grilled Whole Fish',                price:   600 },
  { id: 'mi-fd-6',  categoryId: 'cat-fish',         name: 'Whole Fish Poleko',                 price:   600 },
  // ── Special Sekuwa ────────────────────────────────────────────────────────
  { id: 'mi-sk-1',  categoryId: 'cat-sekuwa',       name: 'Chicken Sekuwa (200g)',             price:   300 },
  { id: 'mi-sk-2',  categoryId: 'cat-sekuwa',       name: 'Chicken Sekuwa (500g)',             price:   650 },
  { id: 'mi-sk-3',  categoryId: 'cat-sekuwa',       name: 'Chicken Sekuwa (1kg)',              price:  1300 },
  { id: 'mi-sk-4',  categoryId: 'cat-sekuwa',       name: 'Pork Sekuwa (200g)',                price:   300 },
  { id: 'mi-sk-5',  categoryId: 'cat-sekuwa',       name: 'Pork Sekuwa (500g)',                price:   650 },
  { id: 'mi-sk-6',  categoryId: 'cat-sekuwa',       name: 'Pork Sekuwa (1kg)',                 price:  1300 },
  { id: 'mi-sk-7',  categoryId: 'cat-sekuwa',       name: 'Buff Sekuwa (200g)',                price:   300 },
  { id: 'mi-sk-8',  categoryId: 'cat-sekuwa',       name: 'Buff Sekuwa (500g)',                price:   650 },
  { id: 'mi-sk-9',  categoryId: 'cat-sekuwa',       name: 'Buff Sekuwa (1kg)',                 price:  1300 },
  { id: 'mi-sk-10', categoryId: 'cat-sekuwa',       name: 'Chicken Wings Sekuwa (200g)',       price:   350 },
  { id: 'mi-sk-11', categoryId: 'cat-sekuwa',       name: 'Chicken Wings Sekuwa (500g)',       price:   680 },
  { id: 'mi-sk-12', categoryId: 'cat-sekuwa',       name: 'Chicken Wings Sekuwa (1kg)',        price:  1350 },
  { id: 'mi-sk-13', categoryId: 'cat-sekuwa',       name: 'Mutton Sekuwa (200g)',              price:   600 },
  { id: 'mi-sk-14', categoryId: 'cat-sekuwa',       name: 'Mutton Sekuwa (500g)',              price:  1350 },
  { id: 'mi-sk-15', categoryId: 'cat-sekuwa',       name: 'Mutton Sekuwa (1kg)',               price:  2700 },
  { id: 'mi-sk-16', categoryId: 'cat-sekuwa',       name: 'Paneer Sekuwa (200g)',              price:   300 },
  { id: 'mi-sk-17', categoryId: 'cat-sekuwa',       name: 'Mushroom Sekuwa (200g)',            price:   300 },
  // ── Sekuwa Combo Sets ─────────────────────────────────────────────────────
  { id: 'mi-sc-1',  categoryId: 'cat-sekuwa-combo', name: 'Chicken Sekuwa Set',                price:   300 },
  { id: 'mi-sc-2',  categoryId: 'cat-sekuwa-combo', name: 'Pork Sekuwa Set',                   price:   300 },
  { id: 'mi-sc-3',  categoryId: 'cat-sekuwa-combo', name: 'Buff Sekuwa Set',                   price:   300 },
  { id: 'mi-sc-4',  categoryId: 'cat-sekuwa-combo', name: 'Chicken Wings Sekuwa Set',          price:   400 },
  { id: 'mi-sc-5',  categoryId: 'cat-sekuwa-combo', name: 'Mutton Sekuwa Set',                 price:   450 },
  // ── Traditional Khaja Sets ────────────────────────────────────────────────
  { id: 'mi-kj-1',  categoryId: 'cat-khaja',        name: 'Veg Khaja Set',                     price:   280 },
  { id: 'mi-kj-2',  categoryId: 'cat-khaja',        name: 'Buff Khaja Set',                    price:   320 },
  { id: 'mi-kj-3',  categoryId: 'cat-khaja',        name: 'Pork Khaja Set',                    price:   320 },
  { id: 'mi-kj-4',  categoryId: 'cat-khaja',        name: 'Chicken Khaja Set',                 price:   350 },
  { id: 'mi-kj-5',  categoryId: 'cat-khaja',        name: 'Pangra Khaja Set',                  price:   400 },
  { id: 'mi-kj-6',  categoryId: 'cat-khaja',        name: 'Bhutan Khaja Set',                  price:   400 },
  // ── Sharing Platters ──────────────────────────────────────────────────────
  { id: 'mi-pl-1',  categoryId: 'cat-platter',      name: 'Momo Platter (Small)',              price:   350 },
  { id: 'mi-pl-2',  categoryId: 'cat-platter',      name: 'Momo Platter (Large)',              price:   550 },
  { id: 'mi-pl-3',  categoryId: 'cat-platter',      name: 'Newari Platter (Small)',            price:   400 },
  { id: 'mi-pl-4',  categoryId: 'cat-platter',      name: 'Newari Platter (Large)',            price:   650 },
  { id: 'mi-pl-5',  categoryId: 'cat-platter',      name: 'Special Bamboo Platter (Small)',    price:   450 },
  { id: 'mi-pl-6',  categoryId: 'cat-platter',      name: 'Special Bamboo Platter (Large)',    price:   700 },
  // ── Beers ─────────────────────────────────────────────────────────────────
  { id: 'mi-be-1',  categoryId: 'cat-beer',         name: 'Mini Gorkha',                       price:   250 },
  { id: 'mi-be-2',  categoryId: 'cat-beer',         name: 'Mini Tuborg',                       price:   280 },
  { id: 'mi-be-3',  categoryId: 'cat-beer',         name: 'Gorkha',                            price:   480 },
  { id: 'mi-be-4',  categoryId: 'cat-beer',         name: 'Gorkha Pilsner',                    price:   550 },
  { id: 'mi-be-5',  categoryId: 'cat-beer',         name: 'Gorkha Craft',                      price:   575 },
  { id: 'mi-be-6',  categoryId: 'cat-beer',         name: 'Tuborg',                            price:   600 },
  { id: 'mi-be-7',  categoryId: 'cat-beer',         name: 'Carlsberg',                         price:   650 },
  // ── Wines ─────────────────────────────────────────────────────────────────
  { id: 'mi-wi-1',  categoryId: 'cat-wine',         name: 'Big Master',                        price:  1250 },
  { id: 'mi-wi-2',  categoryId: 'cat-wine',         name: 'Divine',                            price:  1250 },
  { id: 'mi-wi-3',  categoryId: 'cat-wine',         name: 'Robertson',                         price:  2300 },
  { id: 'mi-wi-4',  categoryId: 'cat-wine',         name: 'J.P. Chenet',                       price:  2800 },
  // ── Domestic Spirits ──────────────────────────────────────────────────────
  { id: 'mi-ds-1',  categoryId: 'cat-dom-spirit',   name: 'Mustang (60ml)',                    price:   150 },
  { id: 'mi-ds-2',  categoryId: 'cat-dom-spirit',   name: 'Mustang (90ml)',                    price:   220 },
  { id: 'mi-ds-3',  categoryId: 'cat-dom-spirit',   name: 'Mustang (Quarter)',                 price:   390 },
  { id: 'mi-ds-4',  categoryId: 'cat-dom-spirit',   name: 'Mustang (Half)',                    price:   780 },
  { id: 'mi-ds-5',  categoryId: 'cat-dom-spirit',   name: 'Mustang (Full)',                    price:  1500 },
  { id: 'mi-ds-6',  categoryId: 'cat-dom-spirit',   name: 'Golden Oak (60ml)',                 price:   160 },
  { id: 'mi-ds-7',  categoryId: 'cat-dom-spirit',   name: 'Golden Oak (90ml)',                 price:   240 },
  { id: 'mi-ds-8',  categoryId: 'cat-dom-spirit',   name: 'Golden Oak (Quarter)',              price:   450 },
  { id: 'mi-ds-9',  categoryId: 'cat-dom-spirit',   name: 'Golden Oak (Half)',                 price:   800 },
  { id: 'mi-ds-10', categoryId: 'cat-dom-spirit',   name: 'Golden Oak (Full)',                 price:  1550 },
  { id: 'mi-ds-11', categoryId: 'cat-dom-spirit',   name: 'Highlander (60ml)',                 price:   160 },
  { id: 'mi-ds-12', categoryId: 'cat-dom-spirit',   name: 'Highlander (90ml)',                 price:   240 },
  { id: 'mi-ds-13', categoryId: 'cat-dom-spirit',   name: 'Highlander (Quarter)',              price:   450 },
  { id: 'mi-ds-14', categoryId: 'cat-dom-spirit',   name: 'Highlander (Half)',                 price:   800 },
  { id: 'mi-ds-15', categoryId: 'cat-dom-spirit',   name: 'Highlander (Full)',                 price:  1550 },
  { id: 'mi-ds-16', categoryId: 'cat-dom-spirit',   name: 'Black Oak (60ml)',                  price:   180 },
  { id: 'mi-ds-17', categoryId: 'cat-dom-spirit',   name: 'Black Oak (90ml)',                  price:   260 },
  { id: 'mi-ds-18', categoryId: 'cat-dom-spirit',   name: 'Black Oak (Quarter)',               price:   480 },
  { id: 'mi-ds-19', categoryId: 'cat-dom-spirit',   name: 'Black Oak (Half)',                  price:   950 },
  { id: 'mi-ds-20', categoryId: 'cat-dom-spirit',   name: 'Black Oak (Full)',                  price:  1800 },
  { id: 'mi-ds-21', categoryId: 'cat-dom-spirit',   name: '8848 Vodka (60ml)',                 price:   299 },
  { id: 'mi-ds-22', categoryId: 'cat-dom-spirit',   name: '8848 Vodka (90ml)',                 price:   450 },
  { id: 'mi-ds-23', categoryId: 'cat-dom-spirit',   name: '8848 Vodka (Quarter)',              price:   850 },
  { id: 'mi-ds-24', categoryId: 'cat-dom-spirit',   name: '8848 Vodka (Half)',                 price:  1600 },
  { id: 'mi-ds-25', categoryId: 'cat-dom-spirit',   name: '8848 Vodka (Full)',                 price:  3050 },
  { id: 'mi-ds-26', categoryId: 'cat-dom-spirit',   name: 'Ruslan Vodka (60ml)',               price:   299 },
  { id: 'mi-ds-27', categoryId: 'cat-dom-spirit',   name: 'Ruslan Vodka (90ml)',               price:   425 },
  { id: 'mi-ds-28', categoryId: 'cat-dom-spirit',   name: 'Ruslan Vodka (Quarter)',            price:   800 },
  { id: 'mi-ds-29', categoryId: 'cat-dom-spirit',   name: 'Ruslan Vodka (Half)',               price:  1550 },
  { id: 'mi-ds-30', categoryId: 'cat-dom-spirit',   name: 'Ruslan Vodka (Full)',               price:  2950 },
  { id: 'mi-ds-31', categoryId: 'cat-dom-spirit',   name: 'Nude Vodka (60ml)',                 price:   299 },
  { id: 'mi-ds-32', categoryId: 'cat-dom-spirit',   name: 'Nude Vodka (90ml)',                 price:   450 },
  { id: 'mi-ds-33', categoryId: 'cat-dom-spirit',   name: 'Nude Vodka (Quarter)',              price:   850 },
  { id: 'mi-ds-34', categoryId: 'cat-dom-spirit',   name: 'Nude Vodka (Half)',                 price:  1600 },
  { id: 'mi-ds-35', categoryId: 'cat-dom-spirit',   name: 'Nude Vodka (Full)',                 price:  3050 },
  { id: 'mi-ds-36', categoryId: 'cat-dom-spirit',   name: 'Signature Green (60ml)',            price:   325 },
  { id: 'mi-ds-37', categoryId: 'cat-dom-spirit',   name: 'Signature Green (90ml)',            price:   480 },
  { id: 'mi-ds-38', categoryId: 'cat-dom-spirit',   name: 'Signature Green (Quarter)',         price:   899 },
  { id: 'mi-ds-39', categoryId: 'cat-dom-spirit',   name: 'Signature Green (Half)',            price:  1650 },
  { id: 'mi-ds-40', categoryId: 'cat-dom-spirit',   name: 'Signature Green (Full)',            price:  3200 },
  { id: 'mi-ds-41', categoryId: 'cat-dom-spirit',   name: 'Signature Red (60ml)',              price:   350 },
  { id: 'mi-ds-42', categoryId: 'cat-dom-spirit',   name: 'Signature Red (90ml)',              price:   500 },
  { id: 'mi-ds-43', categoryId: 'cat-dom-spirit',   name: 'Signature Red (Quarter)',           price:   960 },
  { id: 'mi-ds-44', categoryId: 'cat-dom-spirit',   name: 'Signature Red (Half)',              price:  1800 },
  { id: 'mi-ds-45', categoryId: 'cat-dom-spirit',   name: 'Signature Red (Full)',              price:  3400 },
  { id: 'mi-ds-46', categoryId: 'cat-dom-spirit',   name: 'Old Durbar Red (60ml)',             price:   380 },
  { id: 'mi-ds-47', categoryId: 'cat-dom-spirit',   name: 'Old Durbar Red (90ml)',             price:   550 },
  { id: 'mi-ds-48', categoryId: 'cat-dom-spirit',   name: 'Old Durbar Red (Quarter)',          price:  1050 },
  { id: 'mi-ds-49', categoryId: 'cat-dom-spirit',   name: 'Old Durbar Red (Half)',             price:  2000 },
  { id: 'mi-ds-50', categoryId: 'cat-dom-spirit',   name: 'Old Durbar Red (Full)',             price:  3850 },
  { id: 'mi-ds-51', categoryId: 'cat-dom-spirit',   name: 'Gurkhas & Guns (60ml)',             price:   400 },
  { id: 'mi-ds-52', categoryId: 'cat-dom-spirit',   name: 'Gurkhas & Guns (90ml)',             price:   600 },
  { id: 'mi-ds-53', categoryId: 'cat-dom-spirit',   name: 'Gurkhas & Guns (Quarter)',          price:  1050 },
  { id: 'mi-ds-54', categoryId: 'cat-dom-spirit',   name: 'Gurkhas & Guns (Half)',             price:  2050 },
  { id: 'mi-ds-55', categoryId: 'cat-dom-spirit',   name: 'Gurkhas & Guns (Full)',             price:  3950 },
  { id: 'mi-ds-56', categoryId: 'cat-dom-spirit',   name: 'Old Durbar Black Chimney (60ml)',   price:   480 },
  { id: 'mi-ds-57', categoryId: 'cat-dom-spirit',   name: 'Old Durbar Black Chimney (90ml)',   price:   700 },
  { id: 'mi-ds-58', categoryId: 'cat-dom-spirit',   name: 'Old Durbar Black Chimney (Quarter)',price:  1350 },
  { id: 'mi-ds-59', categoryId: 'cat-dom-spirit',   name: 'Old Durbar Black Chimney (Half)',   price:  2500 },
  { id: 'mi-ds-60', categoryId: 'cat-dom-spirit',   name: 'Old Durbar Black Chimney (Full)',   price:  4750 },
  { id: 'mi-ds-61', categoryId: 'cat-dom-spirit',   name: 'Yarsagumba (60ml)',                 price:  1350 },
  { id: 'mi-ds-62', categoryId: 'cat-dom-spirit',   name: 'Yarsagumba (90ml)',                 price:  2200 },
  { id: 'mi-ds-63', categoryId: 'cat-dom-spirit',   name: 'Yarsagumba (Quarter)',              price:  4400 },
  { id: 'mi-ds-64', categoryId: 'cat-dom-spirit',   name: 'Yarsagumba (Half)',                 price:  8000 },
  { id: 'mi-ds-65', categoryId: 'cat-dom-spirit',   name: 'Yarsagumba (Full)',                 price: 14500 },
  // ── Imported Spirits ──────────────────────────────────────────────────────
  { id: 'mi-is-1',  categoryId: 'cat-imp-spirit',   name: 'Red Label (30ml)',                  price:   499 },
  { id: 'mi-is-2',  categoryId: 'cat-imp-spirit',   name: 'Red Label (60ml)',                  price:   900 },
  { id: 'mi-is-3',  categoryId: 'cat-imp-spirit',   name: 'Red Label (90ml)',                  price:  1300 },
  { id: 'mi-is-4',  categoryId: 'cat-imp-spirit',   name: 'Red Label (Quarter)',               price:  2350 },
  { id: 'mi-is-5',  categoryId: 'cat-imp-spirit',   name: 'Red Label (Half)',                  price:  4300 },
  { id: 'mi-is-6',  categoryId: 'cat-imp-spirit',   name: 'Red Label (Full)',                  price:  8500 },
  { id: 'mi-is-7',  categoryId: 'cat-imp-spirit',   name: "Jack Daniel's (30ml)",              price:   525 },
  { id: 'mi-is-8',  categoryId: 'cat-imp-spirit',   name: "Jack Daniel's (60ml)",              price:   950 },
  { id: 'mi-is-9',  categoryId: 'cat-imp-spirit',   name: "Jack Daniel's (90ml)",              price:  1350 },
  { id: 'mi-is-10', categoryId: 'cat-imp-spirit',   name: "Jack Daniel's (Quarter)",           price:  2550 },
  { id: 'mi-is-11', categoryId: 'cat-imp-spirit',   name: "Jack Daniel's (Half)",              price:  4600 },
  { id: 'mi-is-12', categoryId: 'cat-imp-spirit',   name: "Jack Daniel's (Full)",              price:  9000 },
  { id: 'mi-is-13', categoryId: 'cat-imp-spirit',   name: 'Absolut Vodka (30ml)',              price:   525 },
  { id: 'mi-is-14', categoryId: 'cat-imp-spirit',   name: 'Absolut Vodka (60ml)',              price:   975 },
  { id: 'mi-is-15', categoryId: 'cat-imp-spirit',   name: 'Absolut Vodka (90ml)',              price:  1375 },
  { id: 'mi-is-16', categoryId: 'cat-imp-spirit',   name: 'Absolut Vodka (Quarter)',           price:  2625 },
  { id: 'mi-is-17', categoryId: 'cat-imp-spirit',   name: 'Absolut Vodka (Half)',              price:  4750 },
  { id: 'mi-is-18', categoryId: 'cat-imp-spirit',   name: 'Absolut Vodka (Full)',              price:  9500 },
  { id: 'mi-is-19', categoryId: 'cat-imp-spirit',   name: 'Black Label (30ml)',                price:   550 },
  { id: 'mi-is-20', categoryId: 'cat-imp-spirit',   name: 'Black Label (60ml)',                price:   980 },
  { id: 'mi-is-21', categoryId: 'cat-imp-spirit',   name: 'Black Label (90ml)',                price:  1450 },
  { id: 'mi-is-22', categoryId: 'cat-imp-spirit',   name: 'Black Label (Quarter)',             price:  2750 },
  { id: 'mi-is-23', categoryId: 'cat-imp-spirit',   name: 'Black Label (Half)',                price:  5000 },
  { id: 'mi-is-24', categoryId: 'cat-imp-spirit',   name: 'Black Label (Full)',                price:  9800 },
  { id: 'mi-is-25', categoryId: 'cat-imp-spirit',   name: 'Chivas Regal (30ml)',               price:   550 },
  { id: 'mi-is-26', categoryId: 'cat-imp-spirit',   name: 'Chivas Regal (60ml)',               price:   980 },
  { id: 'mi-is-27', categoryId: 'cat-imp-spirit',   name: 'Chivas Regal (90ml)',               price:  1450 },
  { id: 'mi-is-28', categoryId: 'cat-imp-spirit',   name: 'Chivas Regal (Quarter)',            price:  2750 },
  { id: 'mi-is-29', categoryId: 'cat-imp-spirit',   name: 'Chivas Regal (Half)',               price:  5000 },
  { id: 'mi-is-30', categoryId: 'cat-imp-spirit',   name: 'Chivas Regal (Full)',               price:  9800 },
  { id: 'mi-is-31', categoryId: 'cat-imp-spirit',   name: 'Jameson (30ml)',                    price:   599 },
  { id: 'mi-is-32', categoryId: 'cat-imp-spirit',   name: 'Jameson (60ml)',                    price:  1050 },
  { id: 'mi-is-33', categoryId: 'cat-imp-spirit',   name: 'Jameson (90ml)',                    price:  1600 },
  { id: 'mi-is-34', categoryId: 'cat-imp-spirit',   name: 'Jameson (Quarter)',                 price:  2850 },
  { id: 'mi-is-35', categoryId: 'cat-imp-spirit',   name: 'Jameson (Half)',                    price:  5250 },
  { id: 'mi-is-36', categoryId: 'cat-imp-spirit',   name: 'Jameson (Full)',                    price: 10500 },
  { id: 'mi-is-37', categoryId: 'cat-imp-spirit',   name: 'Double Black (30ml)',               price:   700 },
  { id: 'mi-is-38', categoryId: 'cat-imp-spirit',   name: 'Double Black (60ml)',               price:  1150 },
  { id: 'mi-is-39', categoryId: 'cat-imp-spirit',   name: 'Double Black (90ml)',               price:  2200 },
  { id: 'mi-is-40', categoryId: 'cat-imp-spirit',   name: 'Double Black (Quarter)',            price:  4400 },
  { id: 'mi-is-41', categoryId: 'cat-imp-spirit',   name: 'Double Black (Half)',               price:  8000 },
  { id: 'mi-is-42', categoryId: 'cat-imp-spirit',   name: 'Double Black (Full)',               price: 14500 },
  // ── Regular Hookah ────────────────────────────────────────────────────────
  { id: 'mi-hr-1',  categoryId: 'cat-hookah-reg',   name: 'Mint (Regular)',                    price:   350 },
  { id: 'mi-hr-2',  categoryId: 'cat-hookah-reg',   name: 'Double Apple (Regular)',            price:   380 },
  { id: 'mi-hr-3',  categoryId: 'cat-hookah-reg',   name: 'Lady Killer (Regular)',             price:   400 },
  // ── Cloud Hookah ──────────────────────────────────────────────────────────
  { id: 'mi-hc-1',  categoryId: 'cat-hookah-cloud', name: 'Mint (Cloud)',                      price:   500 },
  { id: 'mi-hc-2',  categoryId: 'cat-hookah-cloud', name: 'Double Apple (Cloud)',              price:   550 },
  { id: 'mi-hc-3',  categoryId: 'cat-hookah-cloud', name: 'Lady Killer (Cloud)',               price:   600 },
  // ── Cigarettes (Per Stick) ────────────────────────────────────────────────
  { id: 'mi-cg-1',  categoryId: 'cat-cig',          name: 'Shikhar Ice',                       price:    25 },
  { id: 'mi-cg-2',  categoryId: 'cat-cig',          name: 'Surya Red',                         price:    30 },
  { id: 'mi-cg-3',  categoryId: 'cat-cig',          name: 'Surya Lite',                        price:    30 },
  { id: 'mi-cg-4',  categoryId: 'cat-cig',          name: 'Surya Arctic',                      price:    35 },
];

const defaultSettings: Settings = {
  cafeName: 'Café Brew',
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
  vatEnabled: true,
  vatRate: 0.13,
  vatMode: 'excluded',
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

/** Bump this string any time defaultCategories or defaultMenuItems change. */
const MENU_VERSION = 'bamboo-v1';

export const db = {
  getTables: (): CafeTable[] => get(KEYS.tables, defaultTables),
  saveTables: (t: CafeTable[]) => set(KEYS.tables, t),

  getCategories: (): Category[] => get(KEYS.categories, defaultCategories),
  saveCategories: (c: Category[]) => set(KEYS.categories, c),

  getMenuItems: (): MenuItem[] => get(KEYS.menuItems, defaultMenuItems),
  saveMenuItems: (m: MenuItem[]) => set(KEYS.menuItems, m),

  getOrders: (): Order[] => get(KEYS.orders, []),
  saveOrders: (o: Order[]) => set(KEYS.orders, o),

  getPayments: (): Payment[] => get(KEYS.payments, []),
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

  seed: () => {
    if (!localStorage.getItem('pos_initialized')) {
      // ── Fresh install ───────────────────────────────────────────────────
      set(KEYS.tables, defaultTables);
      set(KEYS.categories, defaultCategories);
      set(KEYS.menuItems, defaultMenuItems);
      set(KEYS.orders, []);
      set(KEYS.payments, []);
      set(KEYS.settings, defaultSettings);
      localStorage.setItem('pos_initialized', 'true');
      localStorage.setItem('pos_menu_version', MENU_VERSION);
    } else if (localStorage.getItem('pos_menu_version') !== MENU_VERSION) {
      // ── Menu migration: replace categories + items, preserve all other data ──
      set(KEYS.categories, defaultCategories);
      set(KEYS.menuItems, defaultMenuItems);
      localStorage.setItem('pos_menu_version', MENU_VERSION);
    }
  },

  clearAll: () => {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem('pos_initialized');
  },
};
