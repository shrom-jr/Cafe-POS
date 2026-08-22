/**
 * S Bamboo Cottage & Sekuwa Corner — Master Menu Seed Script
 *
 * Writes ONLY to:
 *   menu/pillars    — top-level pillar list
 *   menu/categories — 17 categories with printRoute & parentCategory
 *   menu/items      — all menu items with name, price, categoryId, printRoute
 *
 * Does NOT touch: orders, tables, customers, inventory, expenses,
 *   users, settings, areaOrder, groceryPurchases, kitchenPurchases,
 *   meatEntries, maintenanceExpenses, invMovements, or pinResets.
 *
 * Run: node scripts/seedMenu.mjs
 */

const DB_URL =
  'https://sanjibcottage-default-rtdb.asia-southeast1.firebasedatabase.app';

// ── Pillars ───────────────────────────────────────────────────────────────────
const pillars = ['Food', 'Beverages', 'Alcohol', 'Others'];

// ── Categories ────────────────────────────────────────────────────────────────
const categories = [
  // ── KOT / Beverages (hot & cold non-alcoholic) ───────────────────────────
  { id: 'c_hot_bev',         name: 'Hot Beverages',              order: 1,  parentCategory: 'Beverages', subGroup: 'Non-Alcoholic', sendToKitchen: true,  printRoute: 'KOT' },
  { id: 'c_cold_crafted',    name: 'Crafted Cold Beverages',     order: 2,  parentCategory: 'Beverages', subGroup: 'Non-Alcoholic', sendToKitchen: true,  printRoute: 'KOT' },
  // ── KOT / Food ───────────────────────────────────────────────────────────
  { id: 'c_soups',           name: 'Soups',                      order: 3,  parentCategory: 'Food',      sendToKitchen: true,  printRoute: 'KOT' },
  { id: 'c_burgers',         name: 'Burgers & Sandwiches',       order: 4,  parentCategory: 'Food',      sendToKitchen: true,  printRoute: 'KOT' },
  { id: 'c_sizzlers',        name: 'Sizzlers & Chhoila',         order: 5,  parentCategory: 'Food',      sendToKitchen: true,  printRoute: 'KOT' },
  { id: 'c_chefs',           name: "Chef's Special & Fish",      order: 6,  parentCategory: 'Food',      sendToKitchen: true,  printRoute: 'KOT' },
  { id: 'c_veg_snacks',      name: 'Vegetarian Snacks & Salads', order: 7,  parentCategory: 'Food',      sendToKitchen: true,  printRoute: 'KOT' },
  { id: 'c_nonveg_snacks',   name: 'Non-Vegetarian Snacks',      order: 8,  parentCategory: 'Food',      sendToKitchen: true,  printRoute: 'KOT' },
  { id: 'c_momo_noodles',    name: 'Platters, Momo & Noodles',   order: 9,  parentCategory: 'Food',      sendToKitchen: true,  printRoute: 'KOT' },
  { id: 'c_rice_curries',    name: 'Rice, Curries & Sets',       order: 10, parentCategory: 'Food',      sendToKitchen: true,  printRoute: 'KOT' },
  { id: 'c_pizza_rolls',     name: 'Pizza, Rolls & Khaja Sets',  order: 11, parentCategory: 'Food',      sendToKitchen: true,  printRoute: 'KOT' },
  { id: 'c_sekuwa',          name: 'Special Sekuwa & Sets',      order: 12, parentCategory: 'Food',      sendToKitchen: true,  printRoute: 'KOT' },
  // ── BOT / Beverages (non-alcoholic) ──────────────────────────────────────
  { id: 'c_soft_drinks',     name: 'Soft Drinks & Energy',       order: 13, parentCategory: 'Beverages', subGroup: 'Non-Alcoholic', sendToKitchen: false, printRoute: 'BOT' },
  // ── BOT / Alcohol ─────────────────────────────────────────────────────────
  { id: 'c_beers_wines',     name: 'Beers & Wines',              order: 14, parentCategory: 'Alcohol',   subGroup: 'Alcoholic',     sendToKitchen: false, printRoute: 'BOT' },
  { id: 'c_domestic_spirits',name: 'Domestic Spirits',           order: 15, parentCategory: 'Alcohol',   subGroup: 'Alcoholic',     sendToKitchen: false, printRoute: 'BOT' },
  { id: 'c_imported_spirits',name: 'Imported Spirits',           order: 16, parentCategory: 'Alcohol',   subGroup: 'Alcoholic',     sendToKitchen: false, printRoute: 'BOT' },
  // ── BOT / Others ──────────────────────────────────────────────────────────
  { id: 'c_hookah_cigs',     name: 'Hookah & Cigarettes',        order: 17, parentCategory: 'Others',    sendToKitchen: false, printRoute: 'BOT' },
];

// ── Helper ────────────────────────────────────────────────────────────────────
let _seq = 1;
const item = (categoryId, name, price, printRoute) => ({
  id: `menu-${String(_seq++).padStart(4, '0')}`,
  categoryId,
  name,
  price,
  printRoute,
});
const kot = (catId, name, price) => item(catId, name, price, 'KOT');
const bot = (catId, name, price) => item(catId, name, price, 'BOT');

// ── Menu Items ────────────────────────────────────────────────────────────────
const menuItems = [

  // ── HOT BEVERAGES (KOT) ───────────────────────────────────────────────────
  kot('c_hot_bev', 'Tea (Black)',                    30),
  kot('c_hot_bev', 'Tea (Milk)',                     60),
  kot('c_hot_bev', 'Tea (Lemon)',                    40),
  kot('c_hot_bev', 'Tea (Masala)',                   70),
  kot('c_hot_bev', 'Coffee (Black)',                 80),
  kot('c_hot_bev', 'Coffee (Milk)',                 120),
  kot('c_hot_bev', 'Hot Lemon',                      80),
  kot('c_hot_bev', 'Hot Lemon with Ginger & Honey', 170),
  kot('c_hot_bev', 'Hot Chocolate',                 250),

  // ── CRAFTED COLD BEVERAGES (KOT) ─────────────────────────────────────────
  kot('c_cold_crafted', 'Sweet Lassi',          150),
  kot('c_cold_crafted', 'Banana Lassi',         180),
  kot('c_cold_crafted', 'Watermelon Juice',     150),
  kot('c_cold_crafted', 'Iced Tea',             130),
  kot('c_cold_crafted', 'Chocolate Milkshake',  250),
  kot('c_cold_crafted', 'Cold Coffee (Black)',  130),
  kot('c_cold_crafted', 'Cold Coffee (Milk)',   150),

  // ── SOUPS (KOT) ───────────────────────────────────────────────────────────
  kot('c_soups', 'Nepali Soup (Veg)',                 200),
  kot('c_soups', 'Nepali Soup (Non-Veg)',             250),
  kot('c_soups', 'Hot & Sour Soup (Veg)',             280),
  kot('c_soups', 'Hot & Sour Soup (Non-Veg)',         300),
  kot('c_soups', 'Creamy Veg Soup',                   200),
  kot('c_soups', 'Creamy Chicken Mushroom Soup',      280),
  kot('c_soups', 'Mutton Khutta Soup',                450),

  // ── BURGERS & SANDWICHES (KOT) ────────────────────────────────────────────
  kot('c_burgers', 'Veg Burger',              150),
  kot('c_burgers', 'Chicken Burger',          180),
  kot('c_burgers', 'Crunchy Chicken Burger',  200),
  kot('c_burgers', 'Cheese Sandwich',         225),
  kot('c_burgers', 'Chicken Sandwich',        250),
  kot('c_burgers', 'Special Club Sandwich',   300),

  // ── SIZZLERS & CHHOILA (KOT) ─────────────────────────────────────────────
  kot('c_sizzlers', 'Veg Sizzler',       350),
  kot('c_sizzlers', 'Fish Sizzler',      400),
  kot('c_sizzlers', 'Chicken Sizzler',   450),
  kot('c_sizzlers', 'Chhoila Chicken',   300),
  kot('c_sizzlers', 'Chhoila Mutton',    450),
  kot('c_sizzlers', 'Chhoila Buff',      280),
  kot('c_sizzlers', 'Chhoila Pork',      280),
  kot('c_sizzlers', 'Mushroom Chhoila',  230),

  // ── CHEF'S SPECIAL & FISH (KOT) ──────────────────────────────────────────
  kot('c_chefs', 'Piro Aalu Paneer',               280),
  kot('c_chefs', 'Mustang Aalu',                   270),
  kot('c_chefs', 'Timmur Chicken',                 350),
  kot('c_chefs', 'Pork Dameko',                    300),
  kot('c_chefs', 'Jhaneko Sekuwa (Chicken)',        400),
  kot('c_chefs', 'Jhaneko Sekuwa (Buff)',           400),
  kot('c_chefs', 'Jhaneko Sekuwa (Pork)',           400),
  kot('c_chefs', 'Jhaneko Sekuwa (Mutton)',         650),
  kot('c_chefs', 'Special Biryani (Non-Veg)',       500),
  kot('c_chefs', 'Hyakula Dameko',                  600),
  kot('c_chefs', 'Newari Platter',                  700),
  kot('c_chefs', 'Special Bamboo Platter (Small)',  450),
  kot('c_chefs', 'Special Bamboo Platter (Large)',  700),
  kot('c_chefs', 'Fish Fingers',                    325),
  kot('c_chefs', 'Fish Fry',                        300),
  kot('c_chefs', 'Fish & Chips',                    450),
  kot('c_chefs', 'Steamed Whole Fish',               550),
  kot('c_chefs', 'Grilled Whole Fish',               600),

  // ── VEGETARIAN SNACKS & SALADS (KOT) ─────────────────────────────────────
  kot('c_veg_snacks', 'Masala Papad',                   150),
  kot('c_veg_snacks', 'Veg Pakoda',                     180),
  kot('c_veg_snacks', 'Paneer Pakoda',                  280),
  kot('c_veg_snacks', 'Onion Pakoda',                   200),
  kot('c_veg_snacks', 'Aalu Jeera',                     180),
  kot('c_veg_snacks', 'French Fries',                   180),
  kot('c_veg_snacks', 'Aalu Sadheko',                   180),
  kot('c_veg_snacks', 'Seasonal Green Bhatmas Sadheko', 200),
  kot('c_veg_snacks', 'Chips Chilli',                   200),
  kot('c_veg_snacks', 'Crispy Aalu',                    200),
  kot('c_veg_snacks', 'Boiled Corn',                    200),
  kot('c_veg_snacks', 'Chiura Bhatmas Sadheko',         230),
  kot('c_veg_snacks', 'Mixed Veg (Boiled)',              225),
  kot('c_veg_snacks', 'Green Corn Sadheko',             250),
  kot('c_veg_snacks', 'Cheese Balls',                   280),
  kot('c_veg_snacks', 'Mushroom Chilli',                280),
  kot('c_veg_snacks', 'Paneer Chilli',                  290),
  kot('c_veg_snacks', 'Tofu Fry',                       200),
  kot('c_veg_snacks', 'Tofu Chilli',                    250),
  kot('c_veg_snacks', 'Nepali Green Salad',             200),
  kot('c_veg_snacks', 'Fruit Salad (Seasonal)',          350),

  // ── NON-VEGETARIAN SNACKS (KOT) ──────────────────────────────────────────
  kot('c_nonveg_snacks', 'Mutton Head (Fry)',         450),
  kot('c_nonveg_snacks', 'Mutton Head (Sadheko)',     460),
  kot('c_nonveg_snacks', 'Mutton Rajkhani',           550),
  kot('c_nonveg_snacks', 'Mutton Hyakula',            600),
  kot('c_nonveg_snacks', 'Mutton Tash',               550),
  kot('c_nonveg_snacks', 'Mutton Bhuttan',            380),
  kot('c_nonveg_snacks', 'Chicken Sadheko',           270),
  kot('c_nonveg_snacks', 'Chicken Chilli',            300),
  kot('c_nonveg_snacks', 'Boiled Chicken',            280),
  kot('c_nonveg_snacks', 'Chicken Lollipop',          300),
  kot('c_nonveg_snacks', 'Chicken Drumstick',         300),
  kot('c_nonveg_snacks', 'Dragon Chicken',            400),
  kot('c_nonveg_snacks', 'Polpal Chicken',            360),
  kot('c_nonveg_snacks', 'Nepali Chicken',            350),
  kot('c_nonveg_snacks', 'Hot & Spicy Chicken Wings', 300),
  kot('c_nonveg_snacks', 'Chicken Pangra',            350),
  kot('c_nonveg_snacks', 'Buff Sukuti Sadheko',       300),
  kot('c_nonveg_snacks', 'Timmur Pork',               350),

  // ── PLATTERS, MOMO & NOODLES (KOT) ───────────────────────────────────────
  // Platters
  kot('c_momo_noodles', 'Momo Platter (Small)',            350),
  kot('c_momo_noodles', 'Momo Platter (Large)',            550),
  kot('c_momo_noodles', 'Newari Platter (Small)',          400),
  kot('c_momo_noodles', 'Newari Platter (Large)',          700),
  kot('c_momo_noodles', 'Special Bamboo Platter (Small)',  450),
  kot('c_momo_noodles', 'Special Bamboo Platter (Large)',  700),
  // Veg Momo
  kot('c_momo_noodles', 'Veg Steam Momo',     150),
  kot('c_momo_noodles', 'Veg Jhol Momo',      170),
  kot('c_momo_noodles', 'Veg Sadheko Momo',   200),
  kot('c_momo_noodles', 'Veg Fry Momo',       150),
  kot('c_momo_noodles', 'Veg Kothey Momo',    160),
  kot('c_momo_noodles', 'Veg Chilli Momo',    220),
  // Buff Momo
  kot('c_momo_noodles', 'Buff Steam Momo',    160),
  kot('c_momo_noodles', 'Buff Jhol Momo',     190),
  kot('c_momo_noodles', 'Buff Sadheko Momo',  240),
  kot('c_momo_noodles', 'Buff Fry Momo',      190),
  kot('c_momo_noodles', 'Buff Kothey Momo',   170),
  kot('c_momo_noodles', 'Buff Chilli Momo',   270),
  // Chicken Momo
  kot('c_momo_noodles', 'Chicken Steam Momo',    180),
  kot('c_momo_noodles', 'Chicken Jhol Momo',     200),
  kot('c_momo_noodles', 'Chicken Sadheko Momo',  250),
  kot('c_momo_noodles', 'Chicken Fry Momo',      200),
  kot('c_momo_noodles', 'Chicken Kothey Momo',   190),
  kot('c_momo_noodles', 'Chicken Chilli Momo',   280),
  // Thukpa
  kot('c_momo_noodles', 'Thukpa (Veg)',      160),
  kot('c_momo_noodles', 'Thukpa (Egg)',      180),
  kot('c_momo_noodles', 'Thukpa (Buff)',     180),
  kot('c_momo_noodles', 'Thukpa (Chicken)', 200),
  kot('c_momo_noodles', 'Thukpa (Pork)',    200),
  kot('c_momo_noodles', 'Thukpa Mixed',     250),
  // Chowmein
  kot('c_momo_noodles', 'Chowmein (Veg)',      150),
  kot('c_momo_noodles', 'Chowmein (Chicken)', 180),
  kot('c_momo_noodles', 'Chowmein (Buff)',    170),
  kot('c_momo_noodles', 'Chowmein (Pork)',    180),
  kot('c_momo_noodles', 'Chowmein Mixed',     250),
  // Keema / Current Noodles
  kot('c_momo_noodles', 'Keema Noodles (Chicken)', 235),
  kot('c_momo_noodles', 'Keema Noodles (Buff)',    225),
  kot('c_momo_noodles', 'Current Noodles (Veg)',   150),
  kot('c_momo_noodles', 'Current Noodles (Egg)',   250),

  // ── RICE, CURRIES & SETS (KOT) ────────────────────────────────────────────
  // Biryani
  kot('c_rice_curries', 'Veg Biryani',     300),
  kot('c_rice_curries', 'Chicken Biryani', 400),
  kot('c_rice_curries', 'Mutton Biryani',  500),
  // Rice
  kot('c_rice_curries', 'Rice (Plain)',  80),
  kot('c_rice_curries', 'Rice (Butter)', 100),
  kot('c_rice_curries', 'Rice (Jeera)',  110),
  // Curries
  kot('c_rice_curries', 'Mixed Veg Curry',        200),
  kot('c_rice_curries', 'Egg Curry',              200),
  kot('c_rice_curries', 'Chicken Curry',          250),
  kot('c_rice_curries', 'Mutton Curry',           400),
  kot('c_rice_curries', 'Chicken Butter Masala',  300),
  kot('c_rice_curries', 'Paneer Butter Masala',   280),
  kot('c_rice_curries', 'Matar Paneer',           240),
  // Nepali Khana Sets
  kot('c_rice_curries', 'Khana Set (Veg)',     325),
  kot('c_rice_curries', 'Khana Set (Chicken)', 400),
  kot('c_rice_curries', 'Khana Set (Mutton)',  550),
  kot('c_rice_curries', 'Khana Set (Fish)',    450),

  // ── PIZZA, ROLLS & KHAJA SETS (KOT) ──────────────────────────────────────
  // Pizza
  kot('c_pizza_rolls', 'Margherita Pizza',      350),
  kot('c_pizza_rolls', 'Smokey Chicken Pizza',  450),
  kot('c_pizza_rolls', 'Sausage Salami Pizza',  500),
  kot('c_pizza_rolls', 'Veg Pizza',             380),
  kot('c_pizza_rolls', 'Mixed Pizza',           550),
  // Rolls
  kot('c_pizza_rolls', 'Katti Roll (Veg)',      200),
  kot('c_pizza_rolls', 'Katti Roll (Non-Veg)',  280),
  kot('c_pizza_rolls', 'Spring Roll (Veg)',     200),
  kot('c_pizza_rolls', 'Spring Roll (Non-Veg)', 280),
  // Chopsuey
  kot('c_pizza_rolls', 'Chinese Chopsuey',  240),
  kot('c_pizza_rolls', 'American Chopsuey', 250),
  // Khaja Sets
  kot('c_pizza_rolls', 'Khaja Set (Veg)',    280),
  kot('c_pizza_rolls', 'Khaja Set (Buff)',   330),
  kot('c_pizza_rolls', 'Khaja Set (Pork)',   330),
  kot('c_pizza_rolls', 'Khaja Set (Chicken)', 350),
  kot('c_pizza_rolls', 'Khaja Set (Pangra)', 400),
  kot('c_pizza_rolls', 'Khaja Set (Bhutan)', 400),

  // ── SPECIAL SEKUWA & SETS (KOT) ───────────────────────────────────────────
  // Sekuwa by weight
  kot('c_sekuwa', 'Chicken Sekuwa (200g)',       300),
  kot('c_sekuwa', 'Chicken Sekuwa (500g)',       650),
  kot('c_sekuwa', 'Chicken Sekuwa (1 Kg)',      1300),
  kot('c_sekuwa', 'Pork Sekuwa (200g)',          300),
  kot('c_sekuwa', 'Pork Sekuwa (500g)',          650),
  kot('c_sekuwa', 'Pork Sekuwa (1 Kg)',         1300),
  kot('c_sekuwa', 'Buff Sekuwa (200g)',          300),
  kot('c_sekuwa', 'Buff Sekuwa (500g)',          650),
  kot('c_sekuwa', 'Buff Sekuwa (1 Kg)',         1300),
  kot('c_sekuwa', 'Chicken Wings Sekuwa (200g)', 350),
  kot('c_sekuwa', 'Chicken Wings Sekuwa (500g)', 680),
  kot('c_sekuwa', 'Chicken Wings Sekuwa (1 Kg)', 1350),
  kot('c_sekuwa', 'Mutton Sekuwa (200g)',        600),
  kot('c_sekuwa', 'Mutton Sekuwa (500g)',       1350),
  kot('c_sekuwa', 'Mutton Sekuwa (1 Kg)',       2700),
  // Specials
  kot('c_sekuwa', 'Paneer Sekuwa (200g)',  300),
  kot('c_sekuwa', 'Mutton Kalejo (200g)',  550),
  kot('c_sekuwa', 'Whole Fish Poleko',     600),
  // Sekuwa Sets
  kot('c_sekuwa', 'Sekuwa Set (Chicken)',      300),
  kot('c_sekuwa', 'Sekuwa Set (Mutton)',       450),
  kot('c_sekuwa', 'Sekuwa Set (Buff)',         300),
  kot('c_sekuwa', 'Sekuwa Set (Pork)',         300),
  kot('c_sekuwa', 'Sekuwa Set (Chicken Wing)', 400),

  // ── SOFT DRINKS & ENERGY (BOT) ────────────────────────────────────────────
  bot('c_soft_drinks', 'Coke',                  100),
  bot('c_soft_drinks', 'Fanta',                 100),
  bot('c_soft_drinks', 'Sprite',                100),
  bot('c_soft_drinks', 'Pepsi',                 100),
  bot('c_soft_drinks', 'Dew',                   100),
  bot('c_soft_drinks', 'Slice',                 100),
  bot('c_soft_drinks', 'Red Bull',              200),
  bot('c_soft_drinks', 'Xtreme Energy Drink',   250),

  // ── BEERS & WINES (BOT) ───────────────────────────────────────────────────
  bot('c_beers_wines', 'Mini Gorkha',   270),
  bot('c_beers_wines', 'Mini Tuborg',   290),
  bot('c_beers_wines', 'Gorkha Strong', 480),
  bot('c_beers_wines', 'Gorkha Pilsner', 550),
  bot('c_beers_wines', 'Gorkha Craft',  575),
  bot('c_beers_wines', 'Tuborg',        600),
  bot('c_beers_wines', 'Carlsberg',     650),
  bot('c_beers_wines', 'Big Master',   1250),
  bot('c_beers_wines', 'Divine',       1250),
  bot('c_beers_wines', 'Robertson',    2300),
  bot('c_beers_wines', "J.P. Chenet", 2800),

  // ── DOMESTIC SPIRITS (BOT) ────────────────────────────────────────────────
  bot('c_domestic_spirits', 'Mustang (60 ml)',           150),
  bot('c_domestic_spirits', 'Mustang (90 ml)',           220),
  bot('c_domestic_spirits', 'Mustang (Quarter)',         390),
  bot('c_domestic_spirits', 'Mustang (Half)',            780),
  bot('c_domestic_spirits', 'Mustang (Full)',           1500),
  bot('c_domestic_spirits', 'Golden Oak (60 ml)',        160),
  bot('c_domestic_spirits', 'Golden Oak (90 ml)',        240),
  bot('c_domestic_spirits', 'Golden Oak (Quarter)',      450),
  bot('c_domestic_spirits', 'Golden Oak (Half)',         800),
  bot('c_domestic_spirits', 'Golden Oak (Full)',        1550),
  bot('c_domestic_spirits', 'Black Oak (60 ml)',         180),
  bot('c_domestic_spirits', 'Black Oak (90 ml)',         260),
  bot('c_domestic_spirits', 'Black Oak (Quarter)',       480),
  bot('c_domestic_spirits', 'Black Oak (Half)',          950),
  bot('c_domestic_spirits', 'Black Oak (Full)',         1800),
  bot('c_domestic_spirits', 'Highlander (60 ml)',        160),
  bot('c_domestic_spirits', 'Highlander (90 ml)',        240),
  bot('c_domestic_spirits', 'Highlander (Quarter)',      450),
  bot('c_domestic_spirits', 'Highlander (Half)',         800),
  bot('c_domestic_spirits', 'Highlander (Full)',        1550),
  bot('c_domestic_spirits', '8848 Vodka (60 ml)',        300),
  bot('c_domestic_spirits', '8848 Vodka (90 ml)',        450),
  bot('c_domestic_spirits', '8848 Vodka (Quarter)',      850),
  bot('c_domestic_spirits', '8848 Vodka (Half)',        1600),
  bot('c_domestic_spirits', '8848 Vodka (Full)',        3050),
  bot('c_domestic_spirits', 'Ruslan Vodka (60 ml)',      300),
  bot('c_domestic_spirits', 'Ruslan Vodka (90 ml)',      425),
  bot('c_domestic_spirits', 'Ruslan Vodka (Quarter)',    800),
  bot('c_domestic_spirits', 'Ruslan Vodka (Half)',      1550),
  bot('c_domestic_spirits', 'Ruslan Vodka (Full)',      2950),
  bot('c_domestic_spirits', 'NUDE Vodka (60 ml)',        300),
  bot('c_domestic_spirits', 'NUDE Vodka (90 ml)',        450),
  bot('c_domestic_spirits', 'NUDE Vodka (Quarter)',      850),
  bot('c_domestic_spirits', 'NUDE Vodka (Half)',        1600),
  bot('c_domestic_spirits', 'NUDE Vodka (Full)',        3050),
  bot('c_domestic_spirits', 'Signature Green (60 ml)',   325),
  bot('c_domestic_spirits', 'Signature Green (90 ml)',   480),
  bot('c_domestic_spirits', 'Signature Green (Quarter)', 900),
  bot('c_domestic_spirits', 'Signature Green (Half)',   1650),
  bot('c_domestic_spirits', 'Signature Green (Full)',   3200),
  bot('c_domestic_spirits', 'Signature Red (60 ml)',     350),
  bot('c_domestic_spirits', 'Signature Red (90 ml)',     500),
  bot('c_domestic_spirits', 'Signature Red (Quarter)',   960),
  bot('c_domestic_spirits', 'Signature Red (Half)',     1800),
  bot('c_domestic_spirits', 'Signature Red (Full)',     3400),
  bot('c_domestic_spirits', 'Old Durbar Red (60 ml)',    380),
  bot('c_domestic_spirits', 'Old Durbar Red (90 ml)',    550),
  bot('c_domestic_spirits', 'Old Durbar Red (Quarter)', 1050),
  bot('c_domestic_spirits', 'Old Durbar Red (Half)',    2000),
  bot('c_domestic_spirits', 'Old Durbar Red (Full)',    3850),
  bot('c_domestic_spirits', 'Old Durbar Black (60 ml)',  480),
  bot('c_domestic_spirits', 'Old Durbar Black (90 ml)',  700),
  bot('c_domestic_spirits', 'Old Durbar Black (Quarter)', 1350),
  bot('c_domestic_spirits', 'Old Durbar Black (Half)',  2500),
  bot('c_domestic_spirits', 'Old Durbar Black (Full)',  4750),
  bot('c_domestic_spirits', 'Gurkhas & Guns (60 ml)',    400),
  bot('c_domestic_spirits', 'Gurkhas & Guns (90 ml)',    600),
  bot('c_domestic_spirits', 'Gurkhas & Guns (Quarter)', 1050),
  bot('c_domestic_spirits', 'Gurkhas & Guns (Half)',    2050),
  bot('c_domestic_spirits', 'Gurkhas & Guns (Full)',    3950),
  bot('c_domestic_spirits', 'Yarchagumba (60 ml)',      1350),
  bot('c_domestic_spirits', 'Yarchagumba (90 ml)',      2200),
  bot('c_domestic_spirits', 'Yarchagumba (Quarter)',    4400),
  bot('c_domestic_spirits', 'Yarchagumba (Half)',       8000),
  bot('c_domestic_spirits', 'Yarchagumba (Full)',      14500),

  // ── IMPORTED SPIRITS (BOT) ────────────────────────────────────────────────
  bot('c_imported_spirits', 'Red Label (30 ml)',      500),
  bot('c_imported_spirits', 'Red Label (60 ml)',      900),
  bot('c_imported_spirits', 'Red Label (90 ml)',     1300),
  bot('c_imported_spirits', 'Red Label (Quarter)',   2350),
  bot('c_imported_spirits', 'Red Label (Half)',      4300),
  bot('c_imported_spirits', 'Red Label (Full)',      8500),
  bot('c_imported_spirits', 'Black Label (30 ml)',    550),
  bot('c_imported_spirits', 'Black Label (60 ml)',    980),
  bot('c_imported_spirits', 'Black Label (90 ml)',   1450),
  bot('c_imported_spirits', 'Black Label (Quarter)', 2750),
  bot('c_imported_spirits', 'Black Label (Half)',    5000),
  bot('c_imported_spirits', 'Black Label (Full)',    9800),
  bot('c_imported_spirits', 'Double Black (30 ml)',   700),
  bot('c_imported_spirits', 'Double Black (60 ml)',  1150),
  bot('c_imported_spirits', 'Double Black (90 ml)',  2200),
  bot('c_imported_spirits', 'Double Black (Quarter)', 4400),
  bot('c_imported_spirits', 'Double Black (Half)',   8000),
  bot('c_imported_spirits', 'Double Black (Full)',  14500),
  bot('c_imported_spirits', "Jack Daniel's (30 ml)",  525),
  bot('c_imported_spirits', "Jack Daniel's (60 ml)",  950),
  bot('c_imported_spirits', "Jack Daniel's (90 ml)", 1350),
  bot('c_imported_spirits', "Jack Daniel's (Quarter)", 2250),
  bot('c_imported_spirits', "Jack Daniel's (Half)",  4600),
  bot('c_imported_spirits', "Jack Daniel's (Full)",  9000),
  bot('c_imported_spirits', 'Chivas Regal (30 ml)',   550),
  bot('c_imported_spirits', 'Chivas Regal (60 ml)',   980),
  bot('c_imported_spirits', 'Chivas Regal (90 ml)',  1450),
  bot('c_imported_spirits', 'Chivas Regal (Quarter)', 2750),
  bot('c_imported_spirits', 'Chivas Regal (Half)',   5000),
  bot('c_imported_spirits', 'Chivas Regal (Full)',   9800),
  bot('c_imported_spirits', 'Jameson (30 ml)',        600),
  bot('c_imported_spirits', 'Jameson (60 ml)',       1050),
  bot('c_imported_spirits', 'Jameson (90 ml)',       1600),
  bot('c_imported_spirits', 'Jameson (Quarter)',     2850),
  bot('c_imported_spirits', 'Jameson (Half)',        5250),
  bot('c_imported_spirits', 'Jameson (Full)',       10500),
  bot('c_imported_spirits', 'Absolut Vodka (30 ml)',  525),
  bot('c_imported_spirits', 'Absolut Vodka (60 ml)',  975),
  bot('c_imported_spirits', 'Absolut Vodka (90 ml)', 1375),
  bot('c_imported_spirits', 'Absolut Vodka (Quarter)', 2625),
  bot('c_imported_spirits', 'Absolut Vodka (Half)',  4750),
  bot('c_imported_spirits', 'Absolut Vodka (Full)',  9500),

  // ── HOOKAH & CIGARETTES (BOT) ─────────────────────────────────────────────
  bot('c_hookah_cigs', 'Hookah Regular (Mint)',         350),
  bot('c_hookah_cigs', 'Hookah Regular (Double Apple)', 380),
  bot('c_hookah_cigs', 'Hookah Regular (Lady Killer)',  400),
  bot('c_hookah_cigs', 'Hookah Cloud (Mint)',           500),
  bot('c_hookah_cigs', 'Hookah Cloud (Double Apple)',   550),
  bot('c_hookah_cigs', 'Hookah Cloud (Lady Killer)',    600),
  bot('c_hookah_cigs', 'Hookah Coil (Normal)',           50),
  bot('c_hookah_cigs', 'Hookah Coil (Coconut)',         120),
  bot('c_hookah_cigs', 'Surya Red',                      30),
  bot('c_hookah_cigs', 'Surya Light',                    30),
  bot('c_hookah_cigs', 'Surya Arctic',                   30),
  bot('c_hookah_cigs', 'Shikhar Ice',                    25),
];

// ── REST helpers ──────────────────────────────────────────────────────────────
async function put(path, data) {
  const url = `${DB_URL}/${path}.json`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PUT ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function main() {
  console.log(
    `\nSeeding ${pillars.length} pillars, ${categories.length} categories, ` +
    `and ${menuItems.length} items to menu/ …\n`
  );

  await put('menu/pillars', pillars);
  console.log(`✅  menu/pillars written   (${pillars.length})`);

  await put('menu/categories', categories);
  console.log(`✅  menu/categories written (${categories.length})`);

  await put('menu/items', menuItems);
  console.log(`✅  menu/items written      (${menuItems.length})`);

  console.log('\n🎉  Done!  Refresh the POS app to see the updated menu.');
}

main().catch((err) => { console.error('❌', err.message); process.exit(1); });
