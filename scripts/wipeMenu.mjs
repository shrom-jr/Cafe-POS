/**
 * One-time Bamboo Cottage menu hard reset.
 *
 * This script nullifies ONLY the menu nodes listed below. It never writes to
 * orders, tables, customers, inventory, expenses, users, or settings.
 *
 * Run: node scripts/wipeMenu.mjs
 */

const DB_URL =
  'https://sbamboosekuwa-default-rtdb.asia-southeast1.firebasedatabase.app';

const MENU_PATHS = [
  'menuItems',
  'categories',
  'pillars',
  'alcoholProducts',
  'beverageProducts',
  'cigaretteProducts',
  'menu',
];

async function nullifyNode(path) {
  const res = await fetch(`${DB_URL}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: 'null',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`NULLIFY ${path} failed (${res.status}): ${body}`);
  }

  const verify = await fetch(`${DB_URL}/${path}.json`);
  if (!verify.ok) {
    const body = await verify.text();
    throw new Error(`VERIFY ${path} failed (${verify.status}): ${body}`);
  }

  const value = await verify.json();
  if (value !== null) {
    throw new Error(`VERIFY ${path} failed: node is not null`);
  }

  console.log(`✅ Set and verified /${path} = null`);
}

async function main() {
  console.log(`Purging ${MENU_PATHS.length} Firebase menu nodes only …`);
  for (const path of MENU_PATHS) {
    await nullifyNode(path);
  }
  console.log('🎉 Menu and legacy inventory catalog paths nullified. Protected nodes were not touched.');
}

main().catch((error) => {
  console.error('❌', error.message);
  process.exit(1);
});