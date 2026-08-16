/**
 * One-time Bamboo Cottage menu hard reset.
 *
 * This script deletes ONLY the menu nodes listed below. It never writes to
 * orders, tables, customers, inventory, expenses, users, or settings.
 *
 * Run: node scripts/wipeMenu.mjs
 */

const DB_URL =
  'https://sbamboosekuwa-default-rtdb.asia-southeast1.firebasedatabase.app';

const MENU_PATHS = [
  'menu/categories',
  'menu/items',
  'menu/pillars',
  'categories',
  'menuItems',
  'pillars',
];

async function deleteNode(path) {
  const res = await fetch(`${DB_URL}/${path}.json`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DELETE ${path} failed (${res.status}): ${body}`);
  }

  const verify = await fetch(`${DB_URL}/${path}.json`);
  if (!verify.ok) {
    const body = await verify.text();
    throw new Error(`VERIFY ${path} failed (${verify.status}): ${body}`);
  }

  const value = await verify.json();
  if (value !== null) {
    throw new Error(`VERIFY ${path} failed: node still contains data`);
  }

  console.log(`✅ Deleted and verified /${path}`);
}

async function main() {
  console.log(`Purging ${MENU_PATHS.length} Firebase menu nodes only …`);
  for (const path of MENU_PATHS) {
    await deleteNode(path);
  }
  console.log('🎉 Menu purge complete. Protected non-menu nodes were not touched.');
}

main().catch((error) => {
  console.error('❌', error.message);
  process.exit(1);
});