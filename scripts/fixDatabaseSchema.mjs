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
 *   FIREBASE_DATABASE_AUTH_TOKEN=… node scripts/fixDatabaseSchema.mjs --confirm --canonical-menu-authoritative
 *
 * Confirmed writes use Firebase ETags and abort if the database changes after
 * the migration snapshot is read.
 *   FIREBASE_DATABASE_AUTH_TOKEN=… node scripts/fixDatabaseSchema.mjs --confirm --canonical-menu-authoritative
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
const canonicalMenuAuthoritative = args.has("--canonical-menu-authoritative");
const dryRun = !confirm || args.has("--dry-run");
const backupDirectory = resolve(process.env.FIREBASE_MIGRATION_BACKUP_DIR ?? "backups/firebase-schema");
const databaseUrl = (process.env.FIREBASE_DATABASE_URL ?? DEFAULT_DATABASE_URL).replace(/\/+$/, "");
const token = process.env.FIREBASE_DATABASE_AUTH_TOKEN;

if (!token) {
  throw new Error("FIREBASE_DATABASE_AUTH_TOKEN must be supplied through Replit Secrets.");
}
if ([...args].some((arg) => !["--dry-run", "--confirm", "--canonical-menu-authoritative"].includes(arg))) {
  throw new Error("Usage: node scripts/fixDatabaseSchema.mjs [--dry-run | --confirm] [--canonical-menu-authoritative]");
}
if (canonicalMenuAuthoritative && !confirm) {
  throw new Error("--canonical-menu-authoritative requires --confirm.");
}

function endpoint(path) {
  return `${databaseUrl}/${path}.json?auth=${encodeURIComponent(token)}`;
}

async function request(path, init = {}) {
  const response = await fetch(endpoint(path), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Firebase ${init.method ?? "GET"} failed for ${path} (${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}

async function requestRootSnapshot() {
  const response = await fetch(endpoint(""), {
    headers: {
      "content-type": "application/json",
      "X-Firebase-ETag": "true",
    },
  });
  if (!response.ok) {
    throw new Error(`Firebase GET failed for root (${response.status}).`);
  }
  return {
    data: response.status === 204 ? null : await response.json(),
    etag: response.headers.get("etag"),
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function main() {
  const snapshot = await requestRootSnapshot();
  const root = snapshot.data;
  const targets = Object.fromEntries(
    ID_KEYED_PATHS.map((path) => [path, normalizeIdKeyedCollection(path, root?.[path])]),
  );
  const menu = analyzeMenu(root?.menu ?? {}, {
    pillars: root?.pillars,
    categories: root?.categories,
    menuItems: root?.menuItems,
  });
  const conflicts = Object.values(targets).flatMap((result) => result.issues);
  const menuSafeToApply =
    menu.safeToDelete ||
    (canonicalMenuAuthoritative && menu.canonicalComplete && menu.pillars.matches === true);
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
    menuPolicy: canonicalMenuAuthoritative ? "canonical-authoritative" : "exact-match-required",
    conflicts,
    safeToApply: conflicts.length === 0 && menuSafeToApply,
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
    if (!snapshot.etag) {
      throw new Error("Firebase did not provide an ETag; refusing an unguarded migration write.");
    }
    await request("", {
      method: "PATCH",
      headers: { "if-match": snapshot.etag },
      body: JSON.stringify(updates),
    });
  }

  const verified = await request("");
  for (const [path, result] of Object.entries(targets)) {
    if (stableJson(verified?.[path] ?? null) !== stableJson(Object.keys(result.records).length ? result.records : null)) {
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