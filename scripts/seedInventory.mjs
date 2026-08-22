/**
 * S Bamboo Cottage & Sekuwa Corner — Master Bar Inventory Seed Script
 *
 * Writes ONLY to:
 *   alcoholProducts   — spirits + wines (ml-tracked), 0 stock
 *   beverageProducts  — beers + soft drinks (unit-tracked), 0 stock
 *   cigaretteProducts — cigarettes (stick-tracked), 0 stock
 *   invMappings       — auto-generated POS ↔ inventory mappings
 *
 * Also clears:
 *   invMovements      — resets transaction log to zero-baseline
 *
 * Does NOT touch: menu/*, orders, tables, customers, settings, users,
 *   areaOrder, meatEntries, groceryPurchases, kitchenPurchases,
 *   maintenanceExpenses, payments, or pinResets.
 *
 * Run: node scripts/seedInventory.mjs
 */

const DB_URL =
  'https://sanjibcottage-default-rtdb.asia-southeast1.firebasedatabase.app';

// ── Helpers ───────────────────────────────────────────────────────────────────
async function put(path, data) {
  const res = await fetch(`${DB_URL}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`PUT ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function del(path) {
  const res = await fetch(`${DB_URL}/${path}.json`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${path} failed (${res.status}): ${await res.text()}`);
}

async function get(path) {
  const res = await fetch(`${DB_URL}/${path}.json`);
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

function idKeyed(records) {
  const keyed = {};
  for (const record of records) {
    if (!record?.id || keyed[record.id]) {
      throw new Error('Seed data contains a missing or duplicate id.');
    }
    keyed[record.id] = record;
  }
  return keyed;
}

// Spirits and wines — ml-tracked (wine shares the ml schema for bottle/glass deductions)
const alc = (id, name, bottleSizeMl = 750, category = 'spirits') => ({
  id, name, category, bottleSizeMl,
  currentStockMl: 0, minStockMl: 0, status: 'active',
});

// Beer and soft drinks — unit-tracked (bottles / cans)
const bev = (id, name, category, packagingType, sizeLabel) => ({
  id, name, category, packagingType,
  ...(sizeLabel ? { sizeLabel } : {}),
  currentStock: 0, minStock: 0, status: 'active',
});

// Cigarettes — stick-tracked
const cig = (id, name, sticksPerPacket = 20) => ({
  id, name, sticksPerPacket, currentSticks: 0, minSticks: 0, status: 'active',
});

// ── Inventory catalog ─────────────────────────────────────────────────────────

const alcoholProducts = [
  // ── Domestic spirits (13) ─────────────────────────────────────────────────
  alc('alc-mustang',       'Mustang'),
  alc('alc-golden-oak',    'Golden Oak'),
  alc('alc-black-oak',     'Black Oak'),
  alc('alc-highlander',    'Highlander'),
  alc('alc-8848-vodka',    '8848 Vodka'),
  alc('alc-ruslan-vodka',  'Ruslan Vodka'),
  alc('alc-nude-vodka',    'NUDE Vodka'),
  alc('alc-sig-green',     'Signature Green'),
  alc('alc-sig-red',       'Signature Red'),
  alc('alc-od-red',        'Old Durbar Red'),
  alc('alc-od-black',      'Old Durbar Black'),
  alc('alc-gurkhas-guns',  'Gurkhas & Guns'),
  alc('alc-yarchagumba',   'Yarchagumba'),
  // ── Imported spirits (7) ──────────────────────────────────────────────────
  alc('alc-red-label',     'Red Label'),
  alc('alc-black-label',   'Black Label'),
  alc('alc-double-black',  'Double Black'),
  alc('alc-jack-daniels',  "Jack Daniel's"),
  alc('alc-chivas-regal',  'Chivas Regal'),
  alc('alc-jameson',       'Jameson'),
  alc('alc-absolut-vodka', 'Absolut Vodka'),
  // ── Wines (4, ml-tracked per bottle) ─────────────────────────────────────
  alc('alc-big-master',    'Big Master',   750, 'wine'),
  alc('alc-divine',        'Divine',       750, 'wine'),
  alc('alc-robertson',     'Robertson',    750, 'wine'),
  alc('alc-jp-chenet',     'J.P. Chenet', 750, 'wine'),
];

const beverageProducts = [
  // ── Beers (7) ─────────────────────────────────────────────────────────────
  bev('bev-mini-gorkha',    'Mini Gorkha',         'beer',        'btl', '330ml'),
  bev('bev-mini-tuborg',    'Mini Tuborg',          'beer',        'btl', '330ml'),
  bev('bev-gorkha-strong',  'Gorkha Strong',        'beer',        'btl', '650ml'),
  bev('bev-gorkha-pilsner', 'Gorkha Pilsner',       'beer',        'btl', '650ml'),
  bev('bev-gorkha-craft',   'Gorkha Craft',         'beer',        'btl', '650ml'),
  bev('bev-tuborg',         'Tuborg',               'beer',        'btl', '650ml'),
  bev('bev-carlsberg',      'Carlsberg',            'beer',        'btl', '650ml'),
  // ── Soft drinks & mixers (8) ──────────────────────────────────────────────
  bev('bev-coke',           'Coke',                 'soft-drinks', 'btl', '250ml'),
  bev('bev-fanta',          'Fanta',                'soft-drinks', 'btl', '250ml'),
  bev('bev-sprite',         'Sprite',               'soft-drinks', 'btl', '250ml'),
  bev('bev-pepsi',          'Pepsi',                'soft-drinks', 'btl', '250ml'),
  bev('bev-mountain-dew',   'Mountain Dew',         'soft-drinks', 'can', '330ml'),
  bev('bev-slice',          'Slice',                'soft-drinks', 'btl', '250ml'),
  bev('bev-red-bull',       'Red Bull',             'soft-drinks', 'can', '250ml'),
  bev('bev-xtreme',         'Xtreme Energy Drink',  'soft-drinks', 'can', '250ml'),
];

const cigaretteProducts = [
  cig('cig-surya-red',    'Surya Red'),
  cig('cig-surya-light',  'Surya Light'),
  cig('cig-surya-arctic', 'Surya Arctic'),
  cig('cig-shikhar-ice',  'Shikhar Ice'),
];

// ── Auto-mapping: POS menu items → inventory products ─────────────────────────
//
// Spirits: item name pattern "{Brand} ({size})"
//   30 ml → 30 ml deducted; 60 ml → 60; 90 ml → 90;
//   Quarter → 180 ml; Half → 375 ml; Full → 750 ml
//
// Wines: full item name matches brand name → deduct 750 ml per bottle sold
// Beers / Soft drinks: exact name match → deduct 1 unit per item
// Cigarettes: exact name match → deduct 1 stick per item

const SPIRIT_BRANDS = {
  'Mustang':        'alc-mustang',
  'Golden Oak':     'alc-golden-oak',
  'Black Oak':      'alc-black-oak',
  'Highlander':     'alc-highlander',
  '8848 Vodka':     'alc-8848-vodka',
  'Ruslan Vodka':   'alc-ruslan-vodka',
  'NUDE Vodka':     'alc-nude-vodka',
  'Signature Green':'alc-sig-green',
  'Signature Red':  'alc-sig-red',
  'Old Durbar Red': 'alc-od-red',
  'Old Durbar Black':'alc-od-black',
  'Gurkhas & Guns': 'alc-gurkhas-guns',
  'Yarchagumba':    'alc-yarchagumba',
  'Red Label':      'alc-red-label',
  'Black Label':    'alc-black-label',
  'Double Black':   'alc-double-black',
  "Jack Daniel's":  'alc-jack-daniels',
  'Chivas Regal':   'alc-chivas-regal',
  'Jameson':        'alc-jameson',
  'Absolut Vodka':  'alc-absolut-vodka',
};

const WINE_NAMES = {
  'Big Master':  'alc-big-master',
  'Divine':      'alc-divine',
  'Robertson':   'alc-robertson',
  "J.P. Chenet":'alc-jp-chenet',
};

const BEER_NAMES = {
  'Mini Gorkha':   'bev-mini-gorkha',
  'Mini Tuborg':   'bev-mini-tuborg',
  'Gorkha Strong': 'bev-gorkha-strong',
  'Gorkha Pilsner':'bev-gorkha-pilsner',
  'Gorkha Craft':  'bev-gorkha-craft',
  'Tuborg':        'bev-tuborg',
  'Carlsberg':     'bev-carlsberg',
};

const SOFT_DRINK_NAMES = {
  'Coke':                 'bev-coke',
  'Fanta':                'bev-fanta',
  'Sprite':               'bev-sprite',
  'Pepsi':                'bev-pepsi',
  'Dew':                  'bev-mountain-dew',
  'Slice':                'bev-slice',
  'Red Bull':             'bev-red-bull',
  'Xtreme Energy Drink':  'bev-xtreme',
};

const CIGARETTE_NAMES = {
  'Surya Red':    'cig-surya-red',
  'Surya Light':  'cig-surya-light',
  'Surya Arctic': 'cig-surya-arctic',
  'Shikhar Ice':  'cig-shikhar-ice',
};

/** Extract ml volume from suffix patterns like "(60 ml)", "(Quarter)", "(Full)" */
function parseSizeMl(itemName) {
  if (itemName.endsWith('(30 ml)'))  return 30;
  if (itemName.endsWith('(60 ml)'))  return 60;
  if (itemName.endsWith('(90 ml)'))  return 90;
  if (itemName.endsWith('(Quarter)')) return 180;
  if (itemName.endsWith('(Half)'))   return 375;
  if (itemName.endsWith('(Full)'))   return 750;
  return null;
}

function buildMappings(menuItems) {
  const mappings = [];
  let seq = 1;
  const id = () => `map-${String(seq++).padStart(4, '0')}`;

  for (const mi of menuItems) {
    const name = mi.name;

    // 1. Spirits — name starts with brand + ' ('
    let matched = false;
    for (const [brand, productId] of Object.entries(SPIRIT_BRANDS)) {
      if (name.startsWith(brand + ' (')) {
        const ml = parseSizeMl(name);
        if (ml !== null) {
          mappings.push({ id: id(), menuItemId: mi.id, productType: 'alcohol', productId, deductQty: ml });
        }
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // 2. Wines — exact name match → full bottle (750 ml)
    if (WINE_NAMES[name]) {
      mappings.push({ id: id(), menuItemId: mi.id, productType: 'alcohol', productId: WINE_NAMES[name], deductQty: 750 });
      continue;
    }

    // 3. Beers — exact name → 1 bottle
    if (BEER_NAMES[name]) {
      mappings.push({ id: id(), menuItemId: mi.id, productType: 'beverage', productId: BEER_NAMES[name], deductQty: 1 });
      continue;
    }

    // 4. Soft drinks — exact name → 1 unit
    if (SOFT_DRINK_NAMES[name]) {
      mappings.push({ id: id(), menuItemId: mi.id, productType: 'beverage', productId: SOFT_DRINK_NAMES[name], deductQty: 1 });
      continue;
    }

    // 5. Cigarettes — exact name → 1 stick
    if (CIGARETTE_NAMES[name]) {
      mappings.push({ id: id(), menuItemId: mi.id, productType: 'cigarette', productId: CIGARETTE_NAMES[name], deductQty: 1 });
    }
  }

  return mappings;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('──────────────────────────────────────────────────────────');
  console.log('S Bamboo Cottage — Phase 2: Bar Inventory Seed');
  console.log('──────────────────────────────────────────────────────────\n');

  // 1. Seed inventory products (all start at 0 stock)
  await put('alcoholProducts', idKeyed(alcoholProducts));
  console.log(`✅  alcoholProducts    written (${alcoholProducts.length} — spirits + wines)`);

  await put('beverageProducts', idKeyed(beverageProducts));
  console.log(`✅  beverageProducts   written (${beverageProducts.length} — beers + soft drinks)`);

  await put('cigaretteProducts', idKeyed(cigaretteProducts));
  console.log(`✅  cigaretteProducts  written (${cigaretteProducts.length})`);

  // 2. Clear invMovements to zero-baseline
  await del('invMovements');
  console.log('🗑   invMovements      cleared → zero baseline');

  // 3. Fetch live menu/items and auto-generate invMappings
  console.log('\n📡  Fetching menu/items from Firebase...');
  const raw = await get('menu/items');
  const menuItems = Array.isArray(raw)
    ? raw.filter(Boolean)
    : Object.values(raw || {}).filter(Boolean);
  console.log(`    Found ${menuItems.length} menu items`);

  const invMappings = buildMappings(menuItems);
  await put('invMappings', idKeyed(invMappings));
  console.log(`✅  invMappings        written (${invMappings.length} POS ↔ inventory links)`);

  // ── Summary ────────────────────────────────────────────────────────────────
  const spiritMaps  = invMappings.filter((m) => m.productType === 'alcohol').length;
  const bevMaps     = invMappings.filter((m) => m.productType === 'beverage').length;
  const cigMaps     = invMappings.filter((m) => m.productType === 'cigarette').length;

  console.log('\n──────────────────────────────────────────────────────────');
  console.log('🎉  Done!');
  console.log(`   Spirits/Wine (ml)   : ${alcoholProducts.length} products`);
  console.log(`   Beers/Soft Drinks   : ${beverageProducts.length} products`);
  console.log(`   Cigarettes          : ${cigaretteProducts.length} products`);
  console.log(`   Mappings            : ${spiritMaps} alcohol · ${bevMaps} beverage · ${cigMaps} cigarette`);
  console.log('   All stocks at 0 — ready for opening count');
  console.log('──────────────────────────────────────────────────────────');
}

main().catch((err) => {
  console.error('\n❌', err.message);
  process.exit(1);
});
