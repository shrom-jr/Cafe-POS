import { describe, expect, it } from "vitest";
import {
  analyzeMenu,
  normalizeIdKeyedCollection,
} from "../../scripts/lib/schemaMigration.mjs";

describe("Firebase schema migration analysis", () => {
  it("converts legacy arrays to ID-keyed records and generates IDs only when absent", () => {
    const result = normalizeIdKeyedCollection(
      "payments",
      [{ id: "payment-1", amount: 100 }, { amount: 200 }],
      () => "generated-payment",
    );

    expect(result.issues).toEqual([]);
    expect(result.records).toEqual({
      "payment-1": { id: "payment-1", amount: 100 },
      "generated-payment": { id: "generated-payment", amount: 200 },
    });
    expect(result.generatedIds).toEqual([{ firebaseKey: "1", id: "generated-payment" }]);
  });

  it("preserves every staff field while converting numeric user keys", () => {
    const result = normalizeIdKeyedCollection("users", {
      0: {
        id: "staff-admin",
        name: "Admin",
        role: "ADMIN",
        permissions: { pos: true, admin: true },
        pinHash: "hash",
        salt: "salt",
        pinLength: 6,
        mustChangePin: false,
        active: true,
      },
      1: {
        id: "staff-kitchen",
        name: "Kitchen",
        role: "KITCHEN",
        permissions: { kitchen: true },
        pin: "1234",
        active: false,
      },
    });

    expect(result.issues).toEqual([]);
    expect(result.records).toEqual({
      "staff-admin": {
        id: "staff-admin",
        name: "Admin",
        role: "ADMIN",
        permissions: { pos: true, admin: true },
        pinHash: "hash",
        salt: "salt",
        pinLength: 6,
        mustChangePin: false,
        active: true,
      },
      "staff-kitchen": {
        id: "staff-kitchen",
        name: "Kitchen",
        role: "KITCHEN",
        permissions: { kitchen: true },
        pin: "1234",
        active: false,
      },
    });
  });

  it("reports duplicate IDs and never treats the collection as safely migratable", () => {
    const result = normalizeIdKeyedCollection("invMappings", {
      first: { id: "map-1", quantity: 1 },
      second: { id: "map-1", quantity: 2 },
    });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ kind: "duplicate-id", id: "map-1" });
  });

  it("deduplicates identical legacy copies while preserving the canonical record", () => {
    const result = normalizeIdKeyedCollection("users", {
      0: { id: "staff-1", role: "ADMIN", permissions: { admin: true }, pinHash: "hash", salt: "salt" },
      "staff-1": { id: "staff-1", role: "ADMIN", permissions: { admin: true }, pinHash: "hash", salt: "salt" },
    });

    expect(result.issues).toEqual([]);
    expect(result.deduplicated).toEqual([
      { firebaseKey: "staff-1", id: "staff-1", canonicalKey: "0" },
    ]);
    expect(result.records).toEqual({
      "staff-1": { id: "staff-1", role: "ADMIN", permissions: { admin: true }, pinHash: "hash", salt: "salt" },
    });
  });

  it("blocks malformed collection values and present-but-invalid IDs", () => {
    const result = normalizeIdKeyedCollection("payments", {
      malformed: "not a record",
      invalid: { id: "" },
      recoverable: { amount: 100 },
    }, () => "generated-payment");

    expect(result.issues.map((issue) => issue.kind)).toEqual(["invalid-record", "invalid-id"]);
    expect(result.records).toEqual({
      "generated-payment": { id: "generated-payment", amount: 100 },
    });
  });

  it("blocks malformed roots and never rewrites them as an empty collection", () => {
    const result = normalizeIdKeyedCollection("payments", "corrupt root");

    expect(result.issues).toMatchObject([{ kind: "invalid-root" }]);
    expect(result.changed).toBe(false);
    expect(result.records).toEqual({});
  });

  it("only permits legacy menu deletion when canonical records match", () => {
    const canonical = {
      pillars: ["Food"],
      categories: { cat: { id: "cat", name: "Main" } },
      items: { item: { id: "item", name: "Momo", categoryId: "cat" } },
    };
    const matching = analyzeMenu(canonical, {
      pillars: ["Food"],
      categories: [{ id: "cat", name: "Main" }],
      menuItems: [{ id: "item", name: "Momo", categoryId: "cat" }],
    });
    const divergent = analyzeMenu(canonical, {
      pillars: ["Food"],
      categories: [{ id: "cat", name: "Changed" }],
      menuItems: [{ id: "item", name: "Momo", categoryId: "cat" }],
    });

    expect(matching.safeToDelete).toBe(true);
    expect(divergent.safeToDelete).toBe(false);
    expect(divergent.categories.differences).toEqual(["cat"]);
  });

  it("requires exact ID sets and unique valid records before deleting a legacy root", () => {
    const canonical = {
      pillars: ["Food"],
      categories: {
        first: { id: "first", name: "First" },
        second: { id: "second", name: "Second" },
      },
      items: { item: { id: "item", name: "Momo", categoryId: "first" } },
    };
    const missingLegacyId = analyzeMenu(canonical, {
      pillars: ["Food"],
      categories: [{ id: "first", name: "First" }],
      menuItems: [{ id: "item", name: "Momo", categoryId: "first" }],
    });
    const duplicateLegacyId = analyzeMenu(canonical, {
      pillars: ["Food"],
      categories: [
        { id: "first", name: "First" },
        { id: "first", name: "First" },
        { id: "second", name: "Second" },
      ],
      menuItems: [{ id: "item", name: "Momo", categoryId: "first" }],
    });

    expect(missingLegacyId.categories.missingLegacy).toEqual(["second"]);
    expect(missingLegacyId.safeToDelete).toBe(false);
    expect(duplicateLegacyId.categories.legacyIssues).toHaveLength(1);
    expect(duplicateLegacyId.safeToDelete).toBe(false);
  });
});