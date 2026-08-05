/**
 * One-time seed script: resets the restaurant inventory master data to zero
 * stock and clears inventory transaction logs in Firebase.
 *
 * Run: node scripts/seedInventory.mjs
 */

const DB_URL = 'https://sbamboosekuwa-default-rtdb.asia-southeast1.firebasedatabase.app';

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

// Spirits and wine use the same ml-based schema. This is required so wine
// full-bottle sales and glass pours consume one shared stock balance.
const alc = (id, name, bottleSizeMl = 750, category = 'spirits') => ({
  id, name, category, bottleSizeMl,
  currentStockMl: 0, minStockMl: 0, status: 'active',
});

// Beer and soft drinks are stocked directly as individual bottles/cans/pieces.
const bev = (id, name, category, packagingType, sizeLabel) => ({
  id, name, category, packagingType,
  ...(sizeLabel ? { sizeLabel } : {}),
  currentStock: 0, minStock: 0, status: 'active',
});

const cig = (id, name, sticksPerPacket = 20) => ({
  id, name, sticksPerPacket, currentSticks: 0, minSticks: 0, status: 'active',
});

const alcoholProducts = [
  // Spirits
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
  alc('alc-red-label',     'Red Label'),
  alc('alc-black-label',   'Black Label'),
  alc('alc-double-black',  'Double Black'),
  alc('alc-jack-daniels',  "Jack Daniel's"),
  alc('alc-chivas-regal',  'Chivas Regal'),
  alc('alc-jameson',       'Jameson'),
  alc('alc-absolut-vodka', 'Absolut Vodka'),
  // Wine: ml-tracked for full bottles and glass pours.
  alc('alc-big-master',    'Big Master',    750, 'wine'),
  alc('alc-divine',        'Divine',        750, 'wine'),
  alc('alc-robertson',     'Robertson',     750, 'wine'),
  alc('alc-jp-chenet',     'J.P. Chenet',  750, 'wine'),
];

const beverageProducts = [
  // Beer
  bev('bev-mini-gorkha',    'Mini Gorkha',        'beer', 'btl', '330ml'),
  bev('bev-mini-tuborg',    'Mini Tuborg',        'beer', 'btl', '330ml'),
  bev('bev-gorkha-strong',  'Gorkha Strong',      'beer', 'btl', '650ml'),
  bev('bev-gorkha-pilsner', 'Gorkha Pilsner',     'beer', 'btl', '650ml'),
  bev('bev-gorkha-craft',   'Gorkha Craft',       'beer', 'btl', '650ml'),
  bev('bev-tuborg',         'Tuborg',             'beer', 'btl', '650ml'),
  bev('bev-carlsberg',      'Carlsberg',          'beer', 'btl', '650ml'),
  // Soft drinks and mixers
  bev('bev-coke',           'Coke',               'soft-drinks', 'btl', '250ml'),
  bev('bev-fanta',          'Fanta',              'soft-drinks', 'btl', '250ml'),
  bev('bev-sprite',         'Sprite',             'soft-drinks', 'btl', '250ml'),
  bev('bev-pepsi',          'Pepsi',              'soft-drinks', 'btl', '250ml'),
  bev('bev-mountain-dew',   'Mountain Dew',       'soft-drinks', 'can', '330ml'),
  bev('bev-slice',          'Slice',              'soft-drinks', 'btl', '250ml'),
  bev('bev-red-bull',       'Red Bull',           'soft-drinks', 'can', '250ml'),
  bev('bev-xtreme',         'Xtreme Energy Drink','soft-drinks', 'can', '250ml'),
];

const cigaretteProducts = [
  cig('cig-surya-red',    'Surya Red'),
  cig('cig-surya-light',  'Surya Light'),
  cig('cig-surya-arctic', 'Surya Arctic'),
  cig('cig-shikhar-ice',  'Shikhar Ice'),
];

const PATHS_TO_CLEAR = [
  'invMovements',
  'groceryPurchases',
  'invMappings',
  'purchasesLedger',
  'barRestockAudit',
];

async function main() {
  console.log('──────────────────────────────────────────────');
  console.log('S Bamboo Cottage — Inventory Master Seed');
  console.log('──────────────────────────────────────────────');

  console.log(`\n📦 Writing ${alcoholProducts.length} spirits/wine products...`);
  await put('alcoholProducts', alcoholProducts);
  console.log('   ✅ alcoholProducts written');

  console.log(`📦 Writing ${beverageProducts.length} beer/soft-drink products...`);
  await put('beverageProducts', beverageProducts);
  console.log('   ✅ beverageProducts written');

  console.log(`📦 Writing ${cigaretteProducts.length} cigarette products...`);
  await put('cigaretteProducts', cigaretteProducts);
  console.log('   ✅ cigaretteProducts written');

  console.log('\n🗑  Clearing transaction logs...');
  for (const path of PATHS_TO_CLEAR) await del(path);

  console.log('\n──────────────────────────────────────────────');
  console.log('🎉 Done!');
  console.log(`   Spirits/Wine       : ${alcoholProducts.length} products (0 ml each)`);
  console.log(`   Beer/Soft Drinks   : ${beverageProducts.length} products (0 units each)`);
  console.log(`   Cigarettes         : ${cigaretteProducts.length} variants (0 sticks each)`);
  console.log('   All movement logs cleared → Rs. 0 balance');
  console.log('   Refresh the app to see the populated inventory.');
  console.log('──────────────────────────────────────────────');
}

main().catch((err) => {
  console.error('\n❌', err.message);
  process.exit(1);
});