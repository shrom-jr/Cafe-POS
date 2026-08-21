/**
 * Scoped Firebase optimization for settings logos and canonical menu records.
 * It is dry-run by default. Confirmed writes are ETag-protected per target,
 * backed up first, and verified after every changed path is written.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { normalizeIdKeyedCollection } from "./lib/schemaMigration.mjs";

const DEFAULT_DATABASE_URL = "https://sbamboosekuwa-default-rtdb.asia-southeast1.firebasedatabase.app";
const args = new Set(process.argv.slice(2));
const confirm = args.has("--confirm");
const dryRun = !confirm || args.has("--dry-run");
const token = process.env.FIREBASE_DATABASE_AUTH_TOKEN;
const databaseUrl = (process.env.FIREBASE_DATABASE_URL ?? DEFAULT_DATABASE_URL).replace(/\/+$/, "");
const backupDirectory = resolve(process.env.FIREBASE_MIGRATION_BACKUP_DIR ?? "backups/firebase-pos-optimization");

if (!token) throw new Error("FIREBASE_DATABASE_AUTH_TOKEN must be supplied through Replit Secrets.");
if ([...args].some((arg) => !["--dry-run", "--confirm"].includes(arg))) {
  throw new Error("Usage: node scripts/optimizeFirebasePos.mjs [--dry-run | --confirm]");
}

const endpoint = (path) => `${databaseUrl}/${path}.json?auth=${encodeURIComponent(token)}`;
const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

async function snapshot(path) {
  const response = await fetch(endpoint(path), { headers: { "X-Firebase-ETag": "true" } });
  if (!response.ok) throw new Error(`Firebase GET failed for /${path} (${response.status}).`);
  return { data: response.status === 204 ? null : await response.json(), etag: response.headers.get("etag") };
}

async function guardedPut(path, data, etag) {
  if (!etag) throw new Error(`Firebase did not provide an ETag for /${path}; refusing unguarded write.`);
  const response = await fetch(endpoint(path), {
    method: "PUT",
    headers: { "content-type": "application/json", "if-match": etag },
    body: JSON.stringify(data),
  });
  if (response.status === 412) throw new Error(`/${path} changed during migration. No later paths were written.`);
  if (!response.ok) throw new Error(`Firebase PUT failed for /${path} (${response.status}).`);
}

function normalizeMenu(path, data) {
  const normalized = normalizeIdKeyedCollection(path, data);
  const issues = [...normalized.issues];
  if (normalized.generatedIds.length > 0) {
    issues.push({ kind: "missing-id", path, message: "Menu records without IDs are blocked; no generated IDs may be applied." });
  }
  if (normalized.deduplicated.length > 0) {
    issues.push({ kind: "duplicate-id", path, message: "Duplicate menu IDs are blocked, even where record content matches." });
  }
  const records = Object.fromEntries(
    Object.entries(normalized.records).map(([id, record], index) => [
      id,
      { ...record, id, displayOrder: Number.isFinite(record.displayOrder) ? record.displayOrder : index },
    ]),
  );
  return {
    ...normalized,
    records,
    issues,
    changed: stableJson(data ?? null) !== stableJson(Object.keys(records).length ? records : null),
  };
}

function safeLogo(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048 || trimmed.startsWith("data:")) return null;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("\\")) return trimmed;
  try {
    const url = new URL(trimmed);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeSettings(raw) {
  if (raw !== null && (typeof raw !== "object" || Array.isArray(raw))) {
    return { data: raw, changed: false, issues: [{ kind: "invalid-root", path: "settings", message: "Settings must be an object." }] };
  }
  if (!raw) return { data: raw, changed: false, issues: [] };
  const settings = structuredClone(raw);
  const legacyData = [settings.logo, settings.cafeLogo, settings.logoUrl]
    .some((value) => typeof value === "string" && value.trim().startsWith("data:"));
  const logo = safeLogo(settings.logo) ?? safeLogo(settings.cafeLogo) ?? safeLogo(settings.logoUrl)
    ?? (legacyData ? "/icon-192.png" : null);
  delete settings.cafeLogo;
  delete settings.logoUrl;
  if (logo) settings.logo = logo;
  else delete settings.logo;
  return { data: settings, changed: stableJson(raw) !== stableJson(settings), issues: [] };
}

async function main() {
  const [settingsSnapshot, categoriesSnapshot, itemsSnapshot] = await Promise.all([
    snapshot("settings"),
    snapshot("menu/categories"),
    snapshot("menu/items"),
  ]);
  const settings = normalizeSettings(settingsSnapshot.data);
  const categories = normalizeMenu("menu/categories", categoriesSnapshot.data);
  const items = normalizeMenu("menu/items", itemsSnapshot.data);
  const issues = [...settings.issues, ...categories.issues, ...items.issues];
  const report = {
    generatedAt: new Date().toISOString(),
    mode: dryRun ? "dry-run" : "confirmed",
    scope: ["settings", "menu/categories", "menu/items"],
    safeToApply: issues.length === 0,
    settings: { changed: settings.changed, issues: settings.issues },
    categories: {
      sourceCount: categories.sourceCount, outputCount: Object.keys(categories.records).length,
      changed: categories.changed, generatedIds: categories.generatedIds, issues: categories.issues,
    },
    items: {
      sourceCount: items.sourceCount, outputCount: Object.keys(items.records).length,
      changed: items.changed, generatedIds: items.generatedIds, issues: items.issues,
    },
    issues,
  };

  await mkdir(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const backupPath = resolve(backupDirectory, `firebase-pos-backup-${stamp}.json`);
  const reportPath = resolve(backupDirectory, `firebase-pos-report-${stamp}.json`);
  await writeFile(backupPath, JSON.stringify({
    exportedAt: new Date().toISOString(),
    settings: settingsSnapshot.data,
    menu: { categories: categoriesSnapshot.data, items: itemsSnapshot.data },
  }, null, 2));
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ mode: report.mode, safeToApply: report.safeToApply, backupPath, reportPath, issues: issues.length }, null, 2));

  if (dryRun) return;
  if (!report.safeToApply) throw new Error("Validation failed. No live data was changed; inspect the report and backup.");
  const targets = [
    ["settings", settings, settingsSnapshot],
    ["menu/categories", categories, categoriesSnapshot],
    ["menu/items", items, itemsSnapshot],
  ];
  for (const [path, target, source] of targets) {
    if (target.changed) await guardedPut(path, target.data ?? target.records, source.etag);
  }
  for (const [path, target] of targets) {
    const verified = (await snapshot(path)).data;
    const expected = Object.prototype.hasOwnProperty.call(target, "data")
      ? target.data
      : (Object.keys(target.records).length ? target.records : null);
    if (stableJson(verified) !== stableJson(expected)) {
      throw new Error(`Final verification failed for /${path}. Stop and restore from the backup before retrying.`);
    }
  }
  console.log("Firebase settings and menu optimization applied and verified.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Firebase optimization failed.");
  process.exitCode = 1;
});