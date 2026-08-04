/**
 * One-time seed script: pushes S Bamboo Cottage & Sekuwa Corner's full menu
 * to Firebase Realtime Database (pillars → categories → menuItems).
 *
 * Run: node scripts/seedMenu.mjs
 */

const DB_URL = 'https://sbamboosekuwa-default-rtdb.asia-southeast1.firebasedatabase.app';

// ── Pillars ───────────────────────────────────────────────────────────────────
const pillars = ['Food', 'Beverages', 'Alcohol', 'Others'];

// ── Categories ────────────────────────────────────────────────────────────────
const categories = [
  // Beverages — Non-Alcoholic
  { id: 'cat-hot-bev',        name: 'Hot Beverages',                  order: 1,  parentCategory: 'Beverages', subGroup: 'Non-Alcoholic', sendToKitchen: false },
  { id: 'cat-cold-bev',       name: 'Cold Beverages',                 order: 2,  parentCategory: 'Beverages', subGroup: 'Non-Alcoholic', sendToKitchen: false },
  // Food
  { id: 'cat-burgers',        name: 'Burgers & Sandwiches',           order: 3,  parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-soups',          name: 'Soups',                          order: 4,  parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-sizzlers',       name: 'Sizzlers',                       order: 5,  parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-chhoila',        name: 'Chhoila',                        order: 6,  parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-chefs-special',  name: "Chef's Special",                 order: 7,  parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-fish',           name: 'Fish Dishes',                    order: 8,  parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-veg-snacks',     name: 'Vegetarian Snacks',              order: 9,  parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-nonveg-snacks',  name: 'Non-Vegetarian Snacks',          order: 10, parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-platters',       name: 'Our Platters',                   order: 11, parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-thukpa',         name: 'Thukpa',                         order: 12, parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-chowmein',       name: 'Chowmein',                       order: 13, parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-keema-noodles',  name: 'Keema Noodles',                  order: 14, parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-momo',           name: 'Momo',                           order: 15, parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-biryani',        name: 'Biryani',                        order: 16, parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-curries',        name: 'Main Curries',                   order: 17, parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-rice',           name: 'Rice Sides',                     order: 18, parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-khana-sets',     name: 'Traditional Nepali Khana Sets',  order: 19, parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-pizza',          name: 'Pizza',                          order: 20, parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-rolls',          name: 'Rolls',                          order: 21, parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-chopsuey',       name: 'Chopsuey',                       order: 22, parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-khaja-sets',     name: 'Khaja Sets',                     order: 23, parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-sekuwa-items',   name: 'Special Sekuwa Items',           order: 24, parentCategory: 'Food', sendToKitchen: true },
  { id: 'cat-sekuwa-sets',    name: 'Sekuwa Sets',                    order: 25, parentCategory: 'Food', sendToKitchen: true },
  // Alcohol
  { id: 'cat-beers',          name: 'Beers',                          order: 26, parentCategory: 'Alcohol', subGroup: 'Alcoholic', sendToKitchen: false },
  { id: 'cat-wines',          name: 'Wines',                          order: 27, parentCategory: 'Alcohol', subGroup: 'Alcoholic', sendToKitchen: false },
  { id: 'cat-dom-spirits',    name: 'Domestic Spirits',               order: 28, parentCategory: 'Alcohol', subGroup: 'Alcoholic', sendToKitchen: false },
  { id: 'cat-imp-spirits',    name: 'Imported Spirits',               order: 29, parentCategory: 'Alcohol', subGroup: 'Alcoholic', sendToKitchen: false },
  // Others
  { id: 'cat-hookah',         name: 'Hookah',                         order: 30, parentCategory: 'Others', sendToKitchen: false },
  { id: 'cat-cigarettes',     name: 'Cigarettes',                     order: 31, parentCategory: 'Others', sendToKitchen: false },
];

// ── Helper ────────────────────────────────────────────────────────────────────
let _seq = 1;
const item = (categoryId, name, price) => ({
  id: `menu-${String(_seq++).padStart(4, '0')}`,
  categoryId,
  name,
  price,
});

// ── Menu Items ────────────────────────────────────────────────────────────────
const menuItems = [
  // HOT BEVERAGES
  item('cat-hot-bev', 'Tea (Black)', 30),
  item('cat-hot-bev', 'Tea (Milk)', 60),
  item('cat-hot-bev', 'Tea (Lemon)', 40),
  item('cat-hot-bev', 'Tea (Masala)', 70),
  item('cat-hot-bev', 'Coffee (Black)', 80),
  item('cat-hot-bev', 'Coffee (Milk)', 120),
  item('cat-hot-bev', 'Hot Lemon', 80),
  item('cat-hot-bev', 'Hot Lemon with Ginger & Honey', 170),
  item('cat-hot-bev', 'Hot Chocolate', 250),

  // COLD BEVERAGES
  item('cat-cold-bev', 'Coke', 100),
  item('cat-cold-bev', 'Fanta', 100),
  item('cat-cold-bev', 'Sprite', 100),
  item('cat-cold-bev', 'Pepsi', 100),
  item('cat-cold-bev', 'Mountain Dew', 100),
  item('cat-cold-bev', 'Slice', 100),
  item('cat-cold-bev', 'Sweet Lassi', 150),
  item('cat-cold-bev', 'Banana Lassi', 180),
  item('cat-cold-bev', 'Watermelon Juice', 150),
  item('cat-cold-bev', 'Iced Tea', 130),
  item('cat-cold-bev', 'Chocolate Milkshake', 250),
  item('cat-cold-bev', 'Cold Coffee (Black)', 130),
  item('cat-cold-bev', 'Cold Coffee (Milk)', 150),
  item('cat-cold-bev', 'Red Bull', 200),
  item('cat-cold-bev', 'Xtreme Energy Drink', 250),

  // BURGERS & SANDWICHES
  item('cat-burgers', 'Veg Burger', 150),
  item('cat-burgers', 'Chicken Burger', 180),
  item('cat-burgers', 'Crunchy Chicken Burger', 200),
  item('cat-burgers', 'Cheese Sandwich', 225),
  item('cat-burgers', 'Chicken Sandwich', 250),
  item('cat-burgers', 'Special Club Sandwich', 300),

  // SOUPS
  item('cat-soups', 'Nepali Soup (Veg)', 200),
  item('cat-soups', 'Nepali Soup (Non-Veg)', 250),
  item('cat-soups', 'Hot & Sour Soup (Veg)', 280),
  item('cat-soups', 'Hot & Sour Soup (Non-Veg)', 300),
  item('cat-soups', 'Veg Soup', 200),
  item('cat-soups', 'Creamy Chicken Mushroom Soup', 280),
  item('cat-soups', 'Mutton Khutta Soup', 450),

  // SIZZLERS
  item('cat-sizzlers', 'Veg Sizzler', 350),
  item('cat-sizzlers', 'Fish Sizzler', 400),
  item('cat-sizzlers', 'Chicken Sizzler', 450),

  // CHHOILA
  item('cat-chhoila', 'Chhoila Chicken', 300),
  item('cat-chhoila', 'Chhoila Mutton', 450),
  item('cat-chhoila', 'Chhoila Buff', 280),
  item('cat-chhoila', 'Chhoila Pork', 280),
  item('cat-chhoila', 'Mushroom Chhoila', 230),

  // CHEF'S SPECIAL
  item('cat-chefs-special', 'Piro Aalu Paneer', 280),
  item('cat-chefs-special', 'Mustang Aalu', 270),
  item('cat-chefs-special', 'Jhaneko Sekuwa (Chicken)', 400),
  item('cat-chefs-special', 'Jhaneko Sekuwa (Buff)', 400),
  item('cat-chefs-special', 'Jhaneko Sekuwa (Pork)', 400),
  item('cat-chefs-special', 'Jhaneko Sekuwa (Mutton)', 650),
  item('cat-chefs-special', 'Pork Dameko', 300),
  item('cat-chefs-special', 'Timmur Chicken', 350),
  item('cat-chefs-special', 'Special Biryani (Non-Veg)', 500),
  item('cat-chefs-special', 'Whole Grill Fish', 600),
  item('cat-chefs-special', 'Hyakula Dameko', 600),
  item('cat-chefs-special', 'Newari Platter', 700),
  item('cat-chefs-special', 'Special Bamboo Platter (Small)', 450),
  item('cat-chefs-special', 'Special Bamboo Platter (Large)', 700),

  // FISH DISHES
  item('cat-fish', 'Fish Fingers', 270),
  item('cat-fish', 'Fish Fry', 300),
  item('cat-fish', 'Fish & Chips', 450),
  item('cat-fish', 'Steamed Whole Fish', 550),
  item('cat-fish', 'Grilled Whole Fish', 600),

  // VEGETARIAN SNACKS
  item('cat-veg-snacks', 'Masala Papad', 150),
  item('cat-veg-snacks', 'Veg Pakoda', 180),
  item('cat-veg-snacks', 'Paneer Pakoda', 280),
  item('cat-veg-snacks', 'Onion Pakoda', 200),
  item('cat-veg-snacks', 'Aalu Jeera', 180),
  item('cat-veg-snacks', 'French Fries', 180),
  item('cat-veg-snacks', 'Aalu Sadheko', 180),
  item('cat-veg-snacks', 'Seasonal Green Bhatmas Sadheko', 200),
  item('cat-veg-snacks', 'Chips Chilli', 200),
  item('cat-veg-snacks', 'Crispy Aalu', 200),
  item('cat-veg-snacks', 'Boiled Corn', 200),
  item('cat-veg-snacks', 'Chiura Bhatmas Sadheko', 230),
  item('cat-veg-snacks', 'Mixed Veg (Boiled)', 225),
  item('cat-veg-snacks', 'Green Corn Sadheko', 250),
  item('cat-veg-snacks', 'Cheese Balls', 280),
  item('cat-veg-snacks', 'Mushroom Chilli', 280),
  item('cat-veg-snacks', 'Paneer Chilli', 290),
  item('cat-veg-snacks', 'Tofu (Fry)', 200),
  item('cat-veg-snacks', 'Tofu (Chilli)', 250),

  // NON-VEGETARIAN SNACKS
  item('cat-nonveg-snacks', 'Mutton Head (Fry)', 450),
  item('cat-nonveg-snacks', 'Mutton Head (Sadheko)', 460),
  item('cat-nonveg-snacks', 'Mutton Rajkhani (Poleko & Sadheko)', 550),
  item('cat-nonveg-snacks', 'Mutton Hyakula (Dameko & Sadheko)', 600),
  item('cat-nonveg-snacks', 'Mutton (Tash)', 550),
  item('cat-nonveg-snacks', 'Mutton (Bhuttan)', 380),
  item('cat-nonveg-snacks', 'Chicken Sadheko', 270),
  item('cat-nonveg-snacks', 'Chicken Chilli', 280),
  item('cat-nonveg-snacks', 'Boiled Chicken', 280),
  item('cat-nonveg-snacks', 'Chicken Lollipop', 300),
  item('cat-nonveg-snacks', 'Chicken Drumstick', 300),
  item('cat-nonveg-snacks', 'Dragon Chicken', 400),
  item('cat-nonveg-snacks', 'Polpal Chicken', 360),
  item('cat-nonveg-snacks', 'Nepali Chicken', 350),
  item('cat-nonveg-snacks', 'Hot & Spicy Chicken Wings', 300),
  item('cat-nonveg-snacks', 'Chicken (Pangra)', 350),
  item('cat-nonveg-snacks', 'Buff Sukuti Sadheko', 300),
  item('cat-nonveg-snacks', 'Timmur Pork', 350),

  // OUR PLATTERS
  item('cat-platters', 'MoMo Platter (Small)', 350),
  item('cat-platters', 'MoMo Platter (Large)', 550),
  item('cat-platters', 'Newari Platter (Small)', 400),
  item('cat-platters', 'Newari Platter (Large)', 700),
  item('cat-platters', 'Special Bamboo Platter (Small)', 450),
  item('cat-platters', 'Special Bamboo Platter (Large)', 700),

  // THUKPA
  item('cat-thukpa', 'Thukpa Veg', 160),
  item('cat-thukpa', 'Thukpa Egg', 180),
  item('cat-thukpa', 'Thukpa Buff', 180),
  item('cat-thukpa', 'Thukpa Chicken', 200),
  item('cat-thukpa', 'Thukpa Pork', 200),
  item('cat-thukpa', 'Thukpa Mixed', 250),

  // CHOWMEIN
  item('cat-chowmein', 'Chowmein Veg', 150),
  item('cat-chowmein', 'Chowmein Chicken', 180),
  item('cat-chowmein', 'Chowmein Buff', 170),
  item('cat-chowmein', 'Chowmein Pork', 180),
  item('cat-chowmein', 'Chowmein Mixed', 250),

  // KEEMA NOODLES
  item('cat-keema-noodles', 'Keema Noodles (Chicken)', 235),
  item('cat-keema-noodles', 'Keema Noodles (Buff)', 225),
  item('cat-keema-noodles', 'Current Noodles (Veg)', 150),
  item('cat-keema-noodles', 'Current Noodles (Egg)', 250),

  // MOMO
  item('cat-momo', 'Veg Steam Momo', 150),
  item('cat-momo', 'Veg Jhol Momo', 170),
  item('cat-momo', 'Veg Sadheko Momo', 200),
  item('cat-momo', 'Veg Fry Momo', 150),
  item('cat-momo', 'Veg Kothey Momo', 160),
  item('cat-momo', 'Veg Chilli Momo', 220),
  item('cat-momo', 'Buff Steam Momo', 160),
  item('cat-momo', 'Buff Jhol Momo', 190),
  item('cat-momo', 'Buff Sadheko Momo', 240),
  item('cat-momo', 'Buff Fry Momo', 190),
  item('cat-momo', 'Buff Kothey Momo', 170),
  item('cat-momo', 'Buff Chilli Momo', 270),
  item('cat-momo', 'Chicken Steam Momo', 180),
  item('cat-momo', 'Chicken Jhol Momo', 200),
  item('cat-momo', 'Chicken Sadheko Momo', 250),
  item('cat-momo', 'Chicken Fry Momo', 200),
  item('cat-momo', 'Chicken Kothey Momo', 190),
  item('cat-momo', 'Chicken Chilli Momo', 280),

  // BIRYANI
  item('cat-biryani', 'Veg Biryani', 300),
  item('cat-biryani', 'Chicken Biryani', 400),
  item('cat-biryani', 'Mutton Biryani', 500),

  // MAIN CURRIES
  item('cat-curries', 'Mixed Veg Curry', 200),
  item('cat-curries', 'Egg Curry', 200),
  item('cat-curries', 'Chicken Curry', 250),
  item('cat-curries', 'Mutton Curry', 400),
  item('cat-curries', 'Chicken Butter Masala', 300),
  item('cat-curries', 'Paneer Butter Masala', 280),
  item('cat-curries', 'Matar Paneer', 240),

  // RICE SIDES
  item('cat-rice', 'Rice (Plain)', 80),
  item('cat-rice', 'Rice (Butter)', 100),
  item('cat-rice', 'Rice (Jeera)', 110),

  // TRADITIONAL NEPALI KHANA SETS
  item('cat-khana-sets', 'Veg Khana Set', 325),
  item('cat-khana-sets', 'Chicken Khana Set', 400),
  item('cat-khana-sets', 'Mutton Khana Set', 550),
  item('cat-khana-sets', 'Fish Khana Set', 450),

  // PIZZA
  item('cat-pizza', 'Margherita Pizza', 350),
  item('cat-pizza', 'Smokey Chicken Pizza', 450),
  item('cat-pizza', 'Sausage Salami Pizza', 500),
  item('cat-pizza', 'Veg Pizza', 380),
  item('cat-pizza', 'Mixed Pizza', 550),

  // ROLLS
  item('cat-rolls', 'Katti Roll (Veg)', 200),
  item('cat-rolls', 'Katti Roll (Non-Veg)', 280),
  item('cat-rolls', 'Spring Roll (Veg)', 200),
  item('cat-rolls', 'Spring Roll (Non-Veg)', 280),

  // CHOPSUEY
  item('cat-chopsuey', 'Chinese Chopsuey', 240),
  item('cat-chopsuey', 'American Chopsuey', 250),

  // KHAJA SETS
  item('cat-khaja-sets', 'Khaja Set (Veg)', 280),
  item('cat-khaja-sets', 'Khaja Set (Buff)', 330),
  item('cat-khaja-sets', 'Khaja Set (Pork)', 330),
  item('cat-khaja-sets', 'Khaja Set (Chicken)', 350),
  item('cat-khaja-sets', 'Khaja Set (Pangra)', 400),
  item('cat-khaja-sets', 'Khaja Set (Bhutan)', 400),

  // SPECIAL SEKUWA ITEMS
  item('cat-sekuwa-items', 'Chicken Sekuwa (200 Grams)', 300),
  item('cat-sekuwa-items', 'Chicken Sekuwa (500 Grams)', 650),
  item('cat-sekuwa-items', 'Chicken Sekuwa (1 Kg)', 1300),
  item('cat-sekuwa-items', 'Pork Sekuwa (200 Grams)', 300),
  item('cat-sekuwa-items', 'Pork Sekuwa (500 Grams)', 650),
  item('cat-sekuwa-items', 'Pork Sekuwa (1 Kg)', 1300),
  item('cat-sekuwa-items', 'Buff Sekuwa (200 Grams)', 300),
  item('cat-sekuwa-items', 'Buff Sekuwa (500 Grams)', 650),
  item('cat-sekuwa-items', 'Buff Sekuwa (1 Kg)', 1300),
  item('cat-sekuwa-items', 'Chicken Wings Sekuwa (200 Grams)', 350),
  item('cat-sekuwa-items', 'Chicken Wings Sekuwa (500 Grams)', 680),
  item('cat-sekuwa-items', 'Chicken Wings Sekuwa (1 Kg)', 1350),
  item('cat-sekuwa-items', 'Mutton Sekuwa (200 Grams)', 600),
  item('cat-sekuwa-items', 'Mutton Sekuwa (500 Grams)', 1350),
  item('cat-sekuwa-items', 'Mutton Sekuwa (1 Kg)', 2700),
  item('cat-sekuwa-items', 'Paneer Sekuwa (200 Grams)', 300),
  item('cat-sekuwa-items', 'Mutton Kalejo (200 Grams)', 550),
  item('cat-sekuwa-items', 'Whole Fish Poleko', 600),

  // SEKUWA SETS
  item('cat-sekuwa-sets', 'Sekuwa Set (Chicken)', 300),
  item('cat-sekuwa-sets', 'Sekuwa Set (Mutton)', 450),
  item('cat-sekuwa-sets', 'Sekuwa Set (Buff)', 300),
  item('cat-sekuwa-sets', 'Sekuwa Set (Pork)', 300),
  item('cat-sekuwa-sets', 'Sekuwa Set (Chicken Wing)', 400),

  // BEERS
  item('cat-beers', 'Mini Gorkha', 270),
  item('cat-beers', 'Mini Tuborg', 290),
  item('cat-beers', 'Gorkha Strong', 480),
  item('cat-beers', 'Gorkha Pilsner', 550),
  item('cat-beers', 'Gorkha Craft', 575),
  item('cat-beers', 'Tuborg', 600),
  item('cat-beers', 'Carlsberg', 650),

  // WINES
  item('cat-wines', 'Big Master', 1250),
  item('cat-wines', 'Divine', 1250),
  item('cat-wines', 'Robertson', 2300),
  item('cat-wines', 'J.P. Chenet', 2800),

  // DOMESTIC SPIRITS
  item('cat-dom-spirits', 'Mustang (60 ml)', 150),
  item('cat-dom-spirits', 'Mustang (90 ml)', 220),
  item('cat-dom-spirits', 'Mustang (Quarter / 180 ml)', 390),
  item('cat-dom-spirits', 'Mustang (Half / 375 ml)', 780),
  item('cat-dom-spirits', 'Mustang (Full / 750 ml)', 1500),
  item('cat-dom-spirits', 'Golden Oak (60 ml)', 160),
  item('cat-dom-spirits', 'Golden Oak (90 ml)', 240),
  item('cat-dom-spirits', 'Golden Oak (Quarter / 180 ml)', 450),
  item('cat-dom-spirits', 'Golden Oak (Half / 375 ml)', 800),
  item('cat-dom-spirits', 'Golden Oak (Full / 750 ml)', 1550),
  item('cat-dom-spirits', 'Black Oak (60 ml)', 180),
  item('cat-dom-spirits', 'Black Oak (90 ml)', 260),
  item('cat-dom-spirits', 'Black Oak (Quarter / 180 ml)', 480),
  item('cat-dom-spirits', 'Black Oak (Half / 375 ml)', 950),
  item('cat-dom-spirits', 'Black Oak (Full / 750 ml)', 1800),
  item('cat-dom-spirits', 'Highlander (60 ml)', 160),
  item('cat-dom-spirits', 'Highlander (90 ml)', 240),
  item('cat-dom-spirits', 'Highlander (Quarter / 180 ml)', 450),
  item('cat-dom-spirits', 'Highlander (Half / 375 ml)', 800),
  item('cat-dom-spirits', 'Highlander (Full / 750 ml)', 1550),
  item('cat-dom-spirits', '8848 Vodka (60 ml)', 300),
  item('cat-dom-spirits', '8848 Vodka (90 ml)', 450),
  item('cat-dom-spirits', '8848 Vodka (Quarter / 180 ml)', 850),
  item('cat-dom-spirits', '8848 Vodka (Half / 375 ml)', 1600),
  item('cat-dom-spirits', '8848 Vodka (Full / 750 ml)', 3050),
  item('cat-dom-spirits', 'Ruslan Vodka (60 ml)', 300),
  item('cat-dom-spirits', 'Ruslan Vodka (90 ml)', 425),
  item('cat-dom-spirits', 'Ruslan Vodka (Quarter / 180 ml)', 800),
  item('cat-dom-spirits', 'Ruslan Vodka (Half / 375 ml)', 1550),
  item('cat-dom-spirits', 'Ruslan Vodka (Full / 750 ml)', 2950),
  item('cat-dom-spirits', 'NUDE Vodka (60 ml)', 300),
  item('cat-dom-spirits', 'NUDE Vodka (90 ml)', 450),
  item('cat-dom-spirits', 'NUDE Vodka (Quarter / 180 ml)', 850),
  item('cat-dom-spirits', 'NUDE Vodka (Half / 375 ml)', 1600),
  item('cat-dom-spirits', 'NUDE Vodka (Full / 750 ml)', 3050),
  item('cat-dom-spirits', 'Signature Green (60 ml)', 325),
  item('cat-dom-spirits', 'Signature Green (90 ml)', 480),
  item('cat-dom-spirits', 'Signature Green (Quarter / 180 ml)', 900),
  item('cat-dom-spirits', 'Signature Green (Half / 375 ml)', 1650),
  item('cat-dom-spirits', 'Signature Green (Full / 750 ml)', 3200),
  item('cat-dom-spirits', 'Signature Red (60 ml)', 350),
  item('cat-dom-spirits', 'Signature Red (90 ml)', 500),
  item('cat-dom-spirits', 'Signature Red (Quarter / 180 ml)', 960),
  item('cat-dom-spirits', 'Signature Red (Half / 375 ml)', 1800),
  item('cat-dom-spirits', 'Signature Red (Full / 750 ml)', 3400),
  item('cat-dom-spirits', 'Old Durbar Red (60 ml)', 380),
  item('cat-dom-spirits', 'Old Durbar Red (90 ml)', 550),
  item('cat-dom-spirits', 'Old Durbar Red (Quarter / 180 ml)', 1050),
  item('cat-dom-spirits', 'Old Durbar Red (Half / 375 ml)', 2000),
  item('cat-dom-spirits', 'Old Durbar Red (Full / 750 ml)', 3850),
  item('cat-dom-spirits', 'Old Durbar Black (60 ml)', 480),
  item('cat-dom-spirits', 'Old Durbar Black (90 ml)', 700),
  item('cat-dom-spirits', 'Old Durbar Black (Quarter / 180 ml)', 1350),
  item('cat-dom-spirits', 'Old Durbar Black (Half / 375 ml)', 2500),
  item('cat-dom-spirits', 'Old Durbar Black (Full / 750 ml)', 4750),
  item('cat-dom-spirits', 'Gurkhas & Guns (60 ml)', 400),
  item('cat-dom-spirits', 'Gurkhas & Guns (90 ml)', 600),
  item('cat-dom-spirits', 'Gurkhas & Guns (Quarter / 180 ml)', 1050),
  item('cat-dom-spirits', 'Gurkhas & Guns (Half / 375 ml)', 2050),
  item('cat-dom-spirits', 'Gurkhas & Guns (Full / 750 ml)', 3950),
  item('cat-dom-spirits', 'Yarchagumba (60 ml)', 1350),
  item('cat-dom-spirits', 'Yarchagumba (90 ml)', 2200),
  item('cat-dom-spirits', 'Yarchagumba (Quarter / 180 ml)', 4400),
  item('cat-dom-spirits', 'Yarchagumba (Half / 375 ml)', 8000),
  item('cat-dom-spirits', 'Yarchagumba (Full / 750 ml)', 14500),

  // IMPORTED SPIRITS
  item('cat-imp-spirits', 'Red Label (30 ml)', 500),
  item('cat-imp-spirits', 'Red Label (60 ml)', 900),
  item('cat-imp-spirits', 'Red Label (90 ml)', 1300),
  item('cat-imp-spirits', 'Red Label (Quarter / 180 ml)', 2350),
  item('cat-imp-spirits', 'Red Label (Half / 375 ml)', 4300),
  item('cat-imp-spirits', 'Red Label (Full / 750 ml)', 8500),
  item('cat-imp-spirits', 'Black Label (30 ml)', 550),
  item('cat-imp-spirits', 'Black Label (60 ml)', 980),
  item('cat-imp-spirits', 'Black Label (90 ml)', 1450),
  item('cat-imp-spirits', 'Black Label (Quarter / 180 ml)', 2750),
  item('cat-imp-spirits', 'Black Label (Half / 375 ml)', 5000),
  item('cat-imp-spirits', 'Black Label (Full / 750 ml)', 9800),
  item('cat-imp-spirits', 'Double Black (30 ml)', 700),
  item('cat-imp-spirits', 'Double Black (60 ml)', 1150),
  item('cat-imp-spirits', 'Double Black (90 ml)', 2200),
  item('cat-imp-spirits', 'Double Black (Quarter / 180 ml)', 4400),
  item('cat-imp-spirits', 'Double Black (Half / 375 ml)', 8000),
  item('cat-imp-spirits', 'Double Black (Full / 750 ml)', 14500),
  item('cat-imp-spirits', "Jack Daniel's (30 ml)", 525),
  item('cat-imp-spirits', "Jack Daniel's (60 ml)", 950),
  item('cat-imp-spirits', "Jack Daniel's (90 ml)", 1350),
  item('cat-imp-spirits', "Jack Daniel's (Quarter / 180 ml)", 2250),
  item('cat-imp-spirits', "Jack Daniel's (Half / 375 ml)", 4600),
  item('cat-imp-spirits', "Jack Daniel's (Full / 750 ml)", 9000),
  item('cat-imp-spirits', 'Chivas Regal (30 ml)', 550),
  item('cat-imp-spirits', 'Chivas Regal (60 ml)', 980),
  item('cat-imp-spirits', 'Chivas Regal (90 ml)', 1450),
  item('cat-imp-spirits', 'Chivas Regal (Quarter / 180 ml)', 2750),
  item('cat-imp-spirits', 'Chivas Regal (Half / 375 ml)', 5000),
  item('cat-imp-spirits', 'Chivas Regal (Full / 750 ml)', 9800),
  item('cat-imp-spirits', 'Jameson (30 ml)', 600),
  item('cat-imp-spirits', 'Jameson (60 ml)', 1050),
  item('cat-imp-spirits', 'Jameson (90 ml)', 1600),
  item('cat-imp-spirits', 'Jameson (Quarter / 180 ml)', 2850),
  item('cat-imp-spirits', 'Jameson (Half / 375 ml)', 5250),
  item('cat-imp-spirits', 'Jameson (Full / 750 ml)', 10500),
  item('cat-imp-spirits', 'Absolut Vodka (30 ml)', 525),
  item('cat-imp-spirits', 'Absolut Vodka (60 ml)', 975),
  item('cat-imp-spirits', 'Absolut Vodka (90 ml)', 1375),
  item('cat-imp-spirits', 'Absolut Vodka (Quarter / 180 ml)', 2625),
  item('cat-imp-spirits', 'Absolut Vodka (Half / 375 ml)', 4750),
  item('cat-imp-spirits', 'Absolut Vodka (Full / 750 ml)', 9500),

  // HOOKAH
  item('cat-hookah', 'Hookah Regular Mint', 350),
  item('cat-hookah', 'Hookah Regular Double Apple', 380),
  item('cat-hookah', 'Hookah Regular Lady Killer', 400),
  item('cat-hookah', 'Hookah Cloud Mint', 500),
  item('cat-hookah', 'Hookah Cloud Double Apple', 550),
  item('cat-hookah', 'Hookah Cloud Lady Killer', 600),
  item('cat-hookah', 'Hookah Coil (Normal)', 50),
  item('cat-hookah', 'Hookah Coil (Coconut)', 120),

  // CIGARETTES
  item('cat-cigarettes', 'Surya Red', 30),
  item('cat-cigarettes', 'Surya Light', 30),
  item('cat-cigarettes', 'Surya Arctic', 30),
  item('cat-cigarettes', 'Shikhar Ice', 25),
];

// ── Push to Firebase via REST API ─────────────────────────────────────────────
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
  console.log(`Seeding ${pillars.length} pillars, ${categories.length} categories, ${menuItems.length} items...`);

  await put('pillars', pillars);
  console.log('✅ Pillars written');

  await put('categories', categories);
  console.log('✅ Categories written');

  await put('menuItems', menuItems);
  console.log(`✅ Menu items written (${menuItems.length} total)`);

  console.log('\n🎉 Done! Refresh the POS app to see the full menu.');
}

main().catch((err) => { console.error('❌', err.message); process.exit(1); });
