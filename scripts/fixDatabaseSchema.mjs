/**
 * Safely normalize legacy Firebase Realtime Database collections.
 *
 * Default mode is dry-run. A write requires both a successful validation and
 * --confirm. The caller must supply an auth token through Replit Secrets; the
 * command never prints it.
 *
 * Examples:
 *   FIREBASE_DATABASE_AUTH_TOKEN=… node scripts/fixDatabaseSchema.mjs --dry-run
 *   FIREBASE_DATABASE_AUTH_TOKEN=… node scripts/fixDatabaseSchema.mjs --confirm
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ID_KEYED_PATHS,
  analyzeMenu,
  normalizeIdKeyedCollection,
} from "./lib/schemaMigration.mjs";

const DEFAULT_DATABASE_URL =
  "https://sbamboosekuwa-default-rtdb.asia-southeast1.firebasedatabase.app";
const args = new Set(process.argv.slice(2));
const confirm = args.has("--confirm");
const dryRun = !confirm || args.has("--dry-run");
const backupDirectory = resolve(process.env.FIREBASE_MIGRATION_BACKUP_DIR ?? "backups/firebase-schema");
const databaseUrl = (process.env.FIREBASE_DATABASE_URL ?? DEFAULT_DATABASE_URL).replace(/\/+$/, "");
const token = process.env.FIREBASE_DATABASE_AUTH_TOKEN;

if (!token) {
  throw new Error("FIREBASE_DATABASE_AUTH_TOKEN must be supplied through Replit Secrets.");
}
if ([...args].some((arg) => !["--dry-run", "--confirm"].includes(arg))) {
  throw new Error("Usage: node scripts/fixDatabaseSchema.mjs [--dry-run | --confirm]");
}

function endpoint(path) {
  return `${databaseUrl}/${path}.json?auth=${encodeURIComponent(token)}`;
}

async function request(path, init = {}) {
  const response = await fetch(endpoint(path), {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`Firebase ${init.method ?? "GET"} failed for ${path} (${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}

async function main() {
  const root = await request("");
  const targets = Object.fromEntries(
    ID_KEYED_PATHS.map((path) => [path, normalizeIdKeyedCollection(path, root?.[path])]),
  );
  const menu = analyzeMenu(root?.menu ?? {}, {
    pillars: root?.pillars,
    categories: root?.categories,
    menuItems: root?.menuItems,
  });
  const conflicts = Object.values(targets).flatMap((result) => result.issues);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: dryRun ? "dry-run" : "confirmed",
    targets: Object.fromEntries(
      Object.entries(targets).map(([path, result]) => [
        path,
        {
          sourceCount: result.sourceCount,
          outputCount: Object.keys(result.records).length,
          changed: result.changed,
          generatedIds: result.generatedIds,
          issues: result.issues,
        },
      ]),
    ),
    menu,
    conflicts,
    safeToApply: conflicts.length === 0 && menu.safeToDelete,
  };

  await mkdir(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const backupPath = resolve(backupDirectory, `firebase-schema-backup-${stamp}.json`);
  const reportPath = resolve(backupDirectory, `firebase-schema-report-${stamp}.json`);
  await writeFile(backupPath, JSON.stringify({
    exportedAt: new Date().toISOString(),
    payments: root?.payments ?? null,
    alcoholProducts: root?.alcoholProducts ?? null,
    beverageProducts: root?.beverageProducts ?? null,
    cigaretteProducts: root?.cigaretteProducts ?? null,
    invMappings: root?.invMappings ?? null,
    menu: root?.menu ?? null,
    pillars: root?.pillars ?? null,
    categories: root?.categories ?? null,
    menuItems: root?.menuItems ?? null,
  }, null, 2));
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    mode: report.mode,
    safeToApply: report.safeToApply,
    reportPath,
    backupPath,
    conflicts: conflicts.length,
  }, null, 2));

  if (dryRun) return;
  if (!report.safeToApply) {
    throw new Error("Migration validation failed. No live data was changed; inspect the report and backup.");
  }

  const updates = {};
  for (const [path, result] of Object.entries(targets)) {
    if (result.changed) updates[path] = Object.keys(result.records).length ? result.records : null;
  }
  for (const path of ["pillars", "categories", "menuItems"]) {
    if (root?.[path] !== undefined) updates[path] = null;
  }

  if (Object.keys(updates).length > 0) {
    await request("", { method: "PATCH", body: JSON.stringify(updates) });
  }

  const verified = await request("");
  for (const [path, result] of Object.entries(targets)) {
    if (JSON.stringify(verified?.[path] ?? null) !== JSON.stringify(Object.keys(result.records).length ? result.records : null)) {
      throw new Error(`Final verification failed for ${path}. Stop and restore from the backup before retrying.`);
    }
  }
  for (const path of ["pillars", "categories", "menuItems"]) {
    if (verified?.[path] !== undefined && verified?.[path] !== null) {
      throw new Error(`Final verification failed: deprecated /${path} still exists.`);
    }
  }
  console.log("Migration applied and verified. Preserve the reported backup before any further changes.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exitCode = 1;
});