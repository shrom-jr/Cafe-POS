/**
 * One-time recovery for bar inventory product collections.
 *
 * Reads the existing invMappings collection and restores only the product
 * records referenced by those mappings. It deliberately does not touch:
 *   - invMappings
 *   - invMovements
 *   - menu data
 *   - orders, payments, staff, or settings
 *
 * Existing product records are preserved. Missing records are created with
 * zero stock so the next opening count can be entered normally.
 *
 * Run: node scripts/restoreInventoryFromMappings.mjs
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase, get, ref, update } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyB8TE_Iz1CcgE1UopHJGYbPCtsx2_xaTh8',
  authDomain: 'sanjibcottage.firebaseapp.com',
  databaseURL: 'https://sanjibcottage-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'sanjibcottage',
  storageBucket: 'sanjibcottage.firebasestorage.app',
  messagingSenderId: '90981516338',
  appId: '1:90981516338:web:565c3e4e0d281375f5a82b',
};

const RESET_META_KEY = '__barInventoryReset';

const alcoholCatalog = {
  'alc-mustang': ['Mustang', 750, 'spirits'],
  'alc-golden-oak': ['Golden Oak', 750, 'spirits'],
  'alc-black-oak': ['Black Oak', 750, 'spirits'],
  'alc-highlander': ['Highlander', 750, 'spirits'],
  'alc-8848-vodka': ['8848 Vodka', 750, 'spirits'],
  'alc-ruslan-vodka': ['Ruslan Vodka', 750, 'spirits'],
  'alc-nude-vodka': ['NUDE Vodka', 750, 'spirits'],
  'alc-sig-green': ['Signature Green', 750, 'spirits'],
  'alc-sig-red': ['Signature Red', 750, 'spirits'],
  'alc-od-red': ['Old Durbar Red', 750, 'spirits'],
  'alc-od-black': ['Old Durbar Black', 750, 'spirits'],
  'alc-gurkhas-guns': ['Gurkhas & Guns', 750, 'spirits'],
  'alc-yarchagumba': ['Yarchagumba', 750, 'spirits'],
  'alc-red-label': ['Red Label', 750, 'spirits'],
  'alc-black-label': ['Black Label', 750, 'spirits'],
  'alc-double-black': ['Double Black', 750, 'spirits'],
  'alc-jack-daniels': ["Jack Daniel's", 750, 'spirits'],
  'alc-chivas-regal': ['Chivas Regal', 750, 'spirits'],
  'alc-jameson': ['Jameson', 750, 'spirits'],
  'alc-absolut-vodka': ['Absolut Vodka', 750, 'spirits'],
  'alc-big-master': ['Big Master', 750, 'wine'],
  'alc-divine': ['Divine', 750, 'wine'],
  'alc-robertson': ['Robertson', 750, 'wine'],
  'alc-jp-chenet': ['J.P. Chenet', 750, 'wine'],
};

const beverageCatalog = {
  'bev-mini-gorkha': ['Mini Gorkha', 'beer', 'btl', '330ml'],
  'bev-mini-tuborg': ['Mini Tuborg', 'beer', 'btl', '330ml'],
  'bev-gorkha-strong': ['Gorkha Strong', 'beer', 'btl', '650ml'],
  'bev-gorkha-pilsner': ['Gorkha Pilsner', 'beer', 'btl', '650ml'],
  'bev-gorkha-craft': ['Gorkha Craft', 'beer', 'btl', '650ml'],
  'bev-tuborg': ['Tuborg', 'beer', 'btl', '650ml'],
  'bev-carlsberg': ['Carlsberg', 'beer', 'btl', '650ml'],
  'bev-coke': ['Coke', 'soft-drinks', 'btl', '250ml'],
  'bev-fanta': ['Fanta', 'soft-drinks', 'btl', '250ml'],
  'bev-sprite': ['Sprite', 'soft-drinks', 'btl', '250ml'],
  'bev-pepsi': ['Pepsi', 'soft-drinks', 'btl', '250ml'],
  'bev-mountain-dew': ['Mountain Dew', 'soft-drinks', 'can', '330ml'],
  'bev-slice': ['Slice', 'soft-drinks', 'btl', '250ml'],
  'bev-red-bull': ['Red Bull', 'soft-drinks', 'can', '250ml'],
  'bev-xtreme': ['Xtreme Energy Drink', 'soft-drinks', 'can', '250ml'],
};

const cigaretteCatalog = {
  'cig-surya-red': ['Surya Red', 20],
  'cig-surya-light': ['Surya Light', 20],
  'cig-surya-arctic': ['Surya Arctic', 20],
  'cig-shikhar-ice': ['Shikhar Ice', 20],
};

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function baselineFor(productType, productId) {
  if (productType === 'alcohol' && alcoholCatalog[productId]) {
    const [name, bottleSizeMl, category] = alcoholCatalog[productId];
    return {
      id: productId, name, category, bottleSizeMl,
      currentStockMl: 0, minStockMl: 0, status: 'active',
    };
  }
  if (productType === 'beverage' && beverageCatalog[productId]) {
    const [name, category, packagingType, sizeLabel] = beverageCatalog[productId];
    return {
      id: productId, name, category, packagingType, sizeLabel,
      currentStock: 0, minStock: 0, status: 'active',
    };
  }
  if (productType === 'cigarette' && cigaretteCatalog[productId]) {
    const [name, sticksPerPacket] = cigaretteCatalog[productId];
    return {
      id: productId, name, sticksPerPacket,
      currentSticks: 0, minSticks: 0, status: 'active',
    };
  }
  return null;
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  await signInAnonymously(auth);
  const db = getDatabase(app, firebaseConfig.databaseURL);

  const mappingsSnapshot = await get(ref(db, 'invMappings'));
  const mappings = Object.values(asRecord(mappingsSnapshot.val()))
    .filter((mapping) => mapping && typeof mapping === 'object' && mapping.id !== RESET_META_KEY);

  const idsByType = {
    alcohol: new Set(),
    beverage: new Set(),
    cigarette: new Set(),
  };
  for (const mapping of mappings) {
    if (idsByType[mapping.productType] && typeof mapping.productId === 'string') {
      idsByType[mapping.productType].add(mapping.productId);
    }
  }

  const collectionPaths = {
    alcohol: 'alcoholProducts',
    beverage: 'beverageProducts',
    cigarette: 'cigaretteProducts',
  };
  const currentSnapshots = await Promise.all(
    Object.values(collectionPaths).map((path) => get(ref(db, path))),
  );
  const currentByPath = Object.fromEntries(
    Object.keys(collectionPaths).map((type, index) => [
      collectionPaths[type], asRecord(currentSnapshots[index].val()),
    ]),
  );

  const updates = {};
  const restored = { alcohol: [], beverage: [], cigarette: [] };
  const unknown = [];
  for (const [type, ids] of Object.entries(idsByType)) {
    const path = collectionPaths[type];
    for (const productId of [...ids].sort()) {
      if (currentByPath[path][productId]) continue;
      const baseline = baselineFor(type, productId);
      if (!baseline) {
        unknown.push(`${type}:${productId}`);
        continue;
      }
      updates[`${path}/${productId}`] = baseline;
      restored[type].push(productId);
    }
  }

  if (unknown.length > 0) {
    throw new Error(`No safe baseline definition for mapped product IDs: ${unknown.join(', ')}`);
  }
  if (Object.keys(updates).length === 0) {
    console.log('No missing mapped inventory products found; nothing was changed.');
    return;
  }

  await update(ref(db), updates);
  console.log(JSON.stringify({
    mappingRecords: mappings.length,
    mappedIds: Object.fromEntries(Object.entries(idsByType).map(([type, ids]) => [type, ids.size])),
    restored: Object.fromEntries(Object.entries(restored).map(([type, ids]) => [type, ids.length])),
    totalRestored: Object.keys(updates).length,
    preservedResetMarker: Boolean(currentByPath.alcoholProducts[RESET_META_KEY]),
    touchedPaths: ['alcoholProducts', 'beverageProducts', 'cigaretteProducts'],
  }, null, 2));
}

main().catch((error) => {
  console.error(`Inventory recovery failed: ${error.message}`);
  process.exitCode = 1;
});