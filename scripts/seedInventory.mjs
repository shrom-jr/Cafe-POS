/**
 * One-time seed script: populates Inventory Master products with zero stock
 * and wipes all historical movement logs in Firebase.
 *
 * Run: node scripts/seedInventory.mjs
 */

const DB_URL = 'https://sbamboosekuwa-default-rtdb.asia-southeast1.firebasedatabase.app';

// ── REST helpers ──────────────────────────────────────────────────────────────
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
  console.log(`🗑  Cleared /${path}`);
}

// ── AlcoholProduct factory (tracked in ml) ────────────────────────────────────
// bottleSizeMl=750 for all spirits (standard full bottle)
// minStockMl=750 → alert when stock drops below 1 full bottle
const alc = (id, name, bottleSizeMl = 750, minStockMl = 750) => ({
  id,
  name,
  bottleSizeMl,
  currentStockMl: 0,
  minStockMl,
  status: 'active',
});

// ── BeverageProduct factory (tracked in pieces) ───────────────────────────────
// minStock = 1 carton worth by default
const bev = (id, name, piecesPerCarton, minStock) => ({
  id,
  name,
  piecesPerCarton,
  currentStock: 0,
  minStock: minStock ?? piecesPerCarton,
  status: 'active',
});

// ── CigaretteProduct factory (tracked in sticks) ─────────────────────────────
const cig = (id, name, sticksPerPacket = 25, minSticks = 25) => ({
  id,
  name,
  sticksPerPacket,
  currentSticks: 0,
  minSticks,
  status: 'active',
});

// ── ALCOHOL PRODUCTS ──────────────────────────────────────────────────────────
// All hard spirits — domestic and imported — tracked by ml (750ml bottle std)
const alcoholProducts = [
  // ── Domestic Spirits ──
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
  // ── Imported Spirits ──
  alc('alc-red-label',     'Red Label'),
  alc('alc-black-label',   'Black Label'),
  alc('alc-double-black',  'Double Black'),
  alc('alc-jack-daniels',  "Jack Daniel's"),
  alc('alc-chivas-regal',  'Chivas Regal'),
  alc('alc-jameson',       'Jameson'),
  alc('alc-absolut-vodka', 'Absolut Vodka'),
];

// ── BEVERAGE PRODUCTS ─────────────────────────────────────────────────────────
// Beers (24/carton), Wines (12/case), Soft Drinks (24/carton), Energy Drinks (24/carton)
const beverageProducts = [
  // Beers
  bev('bev-mini-gorkha',   'Mini Gorkha',       24),
  bev('bev-mini-tuborg',   'Mini Tuborg',        24),
  bev('bev-gorkha-strong', 'Gorkha Strong',      24),
  bev('bev-gorkha-pilsner','Gorkha Pilsner',     24),
  bev('bev-gorkha-craft',  'Gorkha Craft',       24),
  bev('bev-tuborg',        'Tuborg',             24),
  bev('bev-carlsberg',     'Carlsberg',          24),
  // Wines
  bev('bev-big-master',    'Big Master',         12),
  bev('bev-divine',        'Divine',             12),
  bev('bev-robertson',     'Robertson',          12),
  bev('bev-jp-chenet',     'J.P. Chenet',        12),
  // Soft Drinks
  bev('bev-coke',          'Coke',               24),
  bev('bev-fanta',         'Fanta',              24),
  bev('bev-sprite',        'Sprite',             24),
  bev('bev-pepsi',         'Pepsi',              24),
  bev('bev-mountain-dew',  'Mountain Dew',       24),
  bev('bev-slice',         'Slice',              24),
  // Energy Drinks
  bev('bev-red-bull',      'Red Bull',           24),
  bev('bev-xtreme',        'Xtreme Energy Drink',24),
];

// ── CIGARETTE PRODUCTS ────────────────────────────────────────────────────────
// All variants — 25 sticks/packet (standard Nepali pack), alert at 1 packet
const cigaretteProducts = [
  cig('cig-surya-red',    'Surya Red',    25, 25),
  cig('cig-surya-light',  'Surya Light',  25, 25),
  cig('cig-surya-arctic', 'Surya Arctic', 25, 25),
  cig('cig-shikhar-ice',  'Shikhar Ice',  25, 25),
];

// ── PATHS TO WIPE (movement / transaction logs) ───────────────────────────────
const PATHS_TO_CLEAR = [
  'invMovements',      // all inventory movement records (bar restock, sales deductions, adjustments)
  'groceryPurchases',  // kitchen grocery purchase ledger
  'invMappings',       // POS-to-inventory mappings (orphan-safe to clear alongside products)
  // The paths below may or may not exist — DELETE is a no-op if absent
  'purchasesLedger',
  'barRestockAudit',
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('──────────────────────────────────────────────');
  console.log('S Bamboo Cottage — Inventory Master Seed');
  console.log('──────────────────────────────────────────────');

  // 1. Write products
  console.log(`\n📦 Writing ${alcoholProducts.length} alcohol products...`);
  await put('alcoholProducts', alcoholProducts);
  console.log('   ✅ alcoholProducts written');

  console.log(`📦 Writing ${beverageProducts.length} beverage products...`);
  await put('beverageProducts', beverageProducts);
  console.log('   ✅ beverageProducts written');

  console.log(`📦 Writing ${cigaretteProducts.length} cigarette products...`);
  await put('cigaretteProducts', cigaretteProducts);
  console.log('   ✅ cigaretteProducts written');

  // 2. Clear transaction logs
  console.log('\n🗑  Clearing transaction logs...');
  for (const path of PATHS_TO_CLEAR) {
    await del(path);
  }

  // 3. Summary
  console.log('\n──────────────────────────────────────────────');
  console.log('🎉 Done!');
  console.log(`   Spirits   : ${alcoholProducts.length} brands (0 ml each)`);
  console.log(`   Beverages : ${beverageProducts.length} products (0 units each)`);
  console.log(`   Cigarettes: ${cigaretteProducts.length} variants (0 sticks each)`);
  console.log('   All movement logs cleared → Rs. 0 balance');
  console.log('   Refresh the app to see the populated inventory.');
  console.log('──────────────────────────────────────────────');
}

main().catch((err) => { console.error('\n❌', err.message); process.exit(1); });
