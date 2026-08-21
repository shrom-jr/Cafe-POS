export type FirebaseRecord = Record<string, unknown>;
export const BAR_INVENTORY_RESET_META_KEY = "__barInventoryReset";

export type FirebaseSchemaIssue =
  | {
      kind: "invalid-root";
      collection: string;
      message: string;
    }
  | {
      kind: "invalid-record";
      collection: string;
      firebaseKey: string;
      message: string;
    }
  | {
      kind: "missing-id";
      collection: string;
      firebaseKey: string;
      message: string;
    }
  | {
      kind: "duplicate-id";
      collection: string;
      id: string;
      firebaseKeys: string[];
      message: string;
    }
  | {
      kind: "invalid-id";
      collection: string;
      firebaseKey: string;
      message: string;
    };

export type FirebaseRecordEntry<T extends { id?: unknown }> = {
  firebaseKey: string;
  record: T;
};

const INVALID_FIREBASE_KEY = /[.#$/\[\]]/;

export function isValidFirebaseRecordId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !INVALID_FIREBASE_KEY.test(value)
  );
}

/**
 * Read Firebase arrays, numeric-key maps, and canonical ID-keyed maps without
 * mutating the remote data. Entries missing an ID may fall back to a nonnumeric
 * Firebase key so legacy object records remain readable. Numeric legacy entries
 * without an internal ID are reported and excluded because they have no stable
 * canonical identity.
 */
export function readFirebaseIdRecords<T extends { id?: unknown }>(
  data: unknown,
  collection: string,
): {
  entries: FirebaseRecordEntry<T>[];
  issues: FirebaseSchemaIssue[];
  isSafe: boolean;
} {
  const issues: FirebaseSchemaIssue[] = [];
  const byId = new Map<string, FirebaseRecordEntry<T>>();
  if (data !== null && (typeof data !== "object" || data === undefined)) {
    issues.push({
      kind: "invalid-root",
      collection,
      message: `${collection} must be an object or legacy array.`,
    });
  }

  const rawEntries = data && typeof data === "object"
    ? Object.entries(data as Record<string, unknown>)
    : [];
  for (const [firebaseKey, value] of rawEntries) {
    if (firebaseKey === BAR_INVENTORY_RESET_META_KEY) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      issues.push({
        kind: "invalid-record",
        collection,
        firebaseKey,
        message: `${collection}/${firebaseKey} must be an object record.`,
      });
      continue;
    }

    const rawRecord = value as FirebaseRecord;
    const hasInternalId = Object.prototype.hasOwnProperty.call(rawRecord, "id");
    if (hasInternalId && !isValidFirebaseRecordId(rawRecord.id)) {
      issues.push({
        kind: "invalid-id",
        collection,
        firebaseKey,
        message: `${collection}/${firebaseKey} has an invalid internal id.`,
      });
      continue;
    }
    const id = hasInternalId
      ? rawRecord.id
      : !/^\d+$/.test(firebaseKey) && isValidFirebaseRecordId(firebaseKey)
        ? firebaseKey
        : undefined;

    if (!id) {
      issues.push({
        kind: "missing-id",
        collection,
        firebaseKey,
        message: `${collection}/${firebaseKey} has no valid internal id.`,
      });
      continue;
    }

    const entry = {
      firebaseKey,
      record: { ...rawRecord, id } as T,
    };
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, entry);
      continue;
    }

    issues.push({
      kind: "duplicate-id",
      collection,
      id,
      firebaseKeys: [existing.firebaseKey, firebaseKey],
      message: `${collection} contains more than one record for id "${id}".`,
    });

    // Prefer an already canonical Firebase key for display only. Never repair
    // or overwrite duplicate records from a browser listener.
    if (firebaseKey === id && existing.firebaseKey !== id) {
      byId.set(id, entry);
    }
  }

  return {
    entries: [...byId.values()],
    issues,
    isSafe: issues.length === 0,
  };
}

/**
 * Serialize records for an ID-keyed Firebase collection. Writers fail closed
 * on malformed or duplicate IDs so they cannot turn a local state bug into
 * remote data loss.
 */
export function toFirebaseIdRecordMap<T extends { id?: unknown }>(
  records: T[],
  collection: string,
): Record<string, T> {
  const keyed: Record<string, T> = {};
  for (const record of records) {
    if (!record || !isValidFirebaseRecordId(record.id)) {
      throw new Error(`${collection} contains a record without a valid id.`);
    }
    if (Object.prototype.hasOwnProperty.call(keyed, record.id)) {
      throw new Error(`${collection} contains duplicate id "${record.id}".`);
    }
    keyed[record.id] = record;
  }
  return keyed;
}