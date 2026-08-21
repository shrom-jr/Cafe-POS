import { randomUUID } from "node:crypto";

export const ID_KEYED_PATHS = [
  "users",
  "payments",
  "alcoholProducts",
  "beverageProducts",
  "cigaretteProducts",
  "invMappings",
];
export const BAR_INVENTORY_RESET_META_KEY = "__barInventoryReset";

const INVALID_KEY = /[.#$/\[\]]/;

export function validId(value) {
  return typeof value === "string" && value.trim().length > 0 && !INVALID_KEY.test(value);
}

function entries(data) {
  if (!data || typeof data !== "object") return [];
  return Object.entries(data);
}

export function normalizeIdKeyedCollection(path, data, generateId = () => randomUUID()) {
  const records = {};
  const generatedIds = [];
  const deduplicated = [];
  const issues = [];
  const seen = new Map();
  if (data !== null && (typeof data !== "object" || data === undefined)) {
    return {
      path,
      records,
      sourceCount: 0,
      generatedIds,
      issues: [{ kind: "invalid-root", path, message: "Expected an object or legacy array collection." }],
      changed: false,
    };
  }

  for (const [firebaseKey, raw] of entries(data)) {
    if (firebaseKey === BAR_INVENTORY_RESET_META_KEY) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        issues.push({
          kind: "invalid-record",
          path,
          firebaseKey,
          message: "Reset sentinel must be an object.",
        });
        continue;
      }
      records[firebaseKey] = structuredClone(raw);
      continue;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issues.push({
        kind: "invalid-record",
        path,
        firebaseKey,
        message: "Expected an object record.",
      });
      continue;
    }
    const record = structuredClone(raw);
    const idWasMissing = !Object.prototype.hasOwnProperty.call(record, "id");
    let id = record.id;
    if (idWasMissing) {
      id = generateId();
      record.id = id;
      generatedIds.push({ firebaseKey, id });
    } else if (!validId(id)) {
      issues.push({
        kind: "invalid-id",
        path,
        firebaseKey,
        valueType: typeof id,
        message: "ID is present but is not a valid Firebase key.",
      });
      continue;
    }

    if (seen.has(id)) {
      if (stableStringify(records[id]) === stableStringify(record)) {
        deduplicated.push({
          firebaseKey,
          id,
          canonicalKey: seen.get(id),
        });
        continue;
      }
      issues.push({
        kind: "duplicate-id",
        path,
        id,
        firebaseKeys: [seen.get(id), firebaseKey],
      });
      continue;
    }
    seen.set(id, firebaseKey);
    records[id] = record;
  }

  const sourceCount = entries(data).length;
  return {
    path,
    records,
    sourceCount,
    generatedIds,
    deduplicated,
    issues,
    changed: JSON.stringify(data ?? null) !== JSON.stringify(Object.keys(records).length ? records : null),
  };
}

function recordsById(path, data, side) {
  const result = new Map();
  const duplicates = [];
  const invalidRecords = [];

  for (const [firebaseKey, record] of entries(data)) {
    if (!record || typeof record !== "object" || Array.isArray(record) || !validId(record.id)) {
      invalidRecords.push({ firebaseKey, side });
      continue;
    }
    if (result.has(record.id)) {
      duplicates.push({ id: record.id, firebaseKey, side });
      continue;
    }
    result.set(record.id, record);
  }
  return { records: result, duplicates, invalidRecords, path };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function compareMenuCollection(path, canonical, legacy) {
  const canonicalResult = recordsById(path, canonical, "canonical");
  const legacyResult = recordsById(path, legacy, "legacy");
  const canonicalRecords = canonicalResult.records;
  const legacyRecords = legacyResult.records;
  const missingCanonical = [];
  const missingLegacy = [];
  const differences = [];

  for (const [id, legacyRecord] of legacyRecords) {
    const canonicalRecord = canonicalRecords.get(id);
    if (!canonicalRecord) {
      missingCanonical.push(id);
    } else if (stableStringify(canonicalRecord) !== stableStringify(legacyRecord)) {
      differences.push(id);
    }
  }
  for (const id of canonicalRecords.keys()) {
    if (!legacyRecords.has(id)) missingLegacy.push(id);
  }

  return {
    path,
    canonicalCount: canonicalRecords.size,
    legacyCount: legacyRecords.size,
    missingCanonical,
    missingLegacy,
    differences,
    canonicalIssues: [...canonicalResult.invalidRecords, ...canonicalResult.duplicates],
    legacyIssues: [...legacyResult.invalidRecords, ...legacyResult.duplicates],
    legacyPresent: legacy != null,
    matches:
      legacy == null ||
      (
        missingCanonical.length === 0 &&
        missingLegacy.length === 0 &&
        differences.length === 0 &&
        canonicalResult.invalidRecords.length === 0 &&
        canonicalResult.duplicates.length === 0 &&
        legacyResult.invalidRecords.length === 0 &&
        legacyResult.duplicates.length === 0
      ),
  };
}

export function analyzeMenu(canonicalMenu, legacyRoots) {
  const pillars = Array.isArray(canonicalMenu?.pillars) ? canonicalMenu.pillars.filter(Boolean) : [];
  const categories = compareMenuCollection(
    "categories",
    canonicalMenu?.categories,
    legacyRoots?.categories,
  );
  const items = compareMenuCollection(
    "menuItems",
    canonicalMenu?.items,
    legacyRoots?.menuItems,
  );
  const legacyPillars = Array.isArray(legacyRoots?.pillars)
    ? legacyRoots.pillars.filter(Boolean)
    : [];
  const pillarsMatch =
    legacyRoots?.pillars == null ||
    (pillars.length > 0 && stableStringify(pillars) === stableStringify(legacyPillars));
  const canonicalComplete =
    pillars.length > 0 &&
    categories.canonicalCount > 0 &&
    items.canonicalCount > 0 &&
    categories.canonicalIssues.length === 0 &&
    items.canonicalIssues.length === 0;

  return {
    canonicalComplete,
    pillars: {
      canonicalCount: pillars.length,
      legacyCount: legacyPillars.length,
      matches: pillarsMatch,
    },
    categories,
    items,
    safeToDelete: canonicalComplete && pillarsMatch && categories.matches && items.matches,
  };
}