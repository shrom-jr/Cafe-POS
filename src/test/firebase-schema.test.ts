import { describe, expect, it } from "vitest";
import {
  readFirebaseIdRecords,
  toFirebaseIdRecordMap,
} from "@/utils/firebaseSchema";

describe("Firebase ID-keyed schema contract", () => {
  it("reads legacy arrays and numeric-key maps while preserving stable IDs", () => {
    const legacy = {
      0: { id: "payment-1", amount: 100 },
      1: { id: "payment-2", amount: 200 },
    };

    const result = readFirebaseIdRecords<{ id?: string; amount: number }>(legacy, "payments");

    expect(result.isSafe).toBe(true);
    expect(result.entries.map(({ record }) => record.id)).toEqual(["payment-1", "payment-2"]);
  });

  it("falls back to a nonnumeric Firebase key for old keyed records", () => {
    const result = readFirebaseIdRecords<{ id?: string; name: string }>(
      { "beverage-1": { name: "Soda" } },
      "beverageProducts",
    );

    expect(result.entries[0].record.id).toBe("beverage-1");
    expect(result.isSafe).toBe(true);
  });

  it("reports duplicate or missing legacy identities instead of silently repairing them", () => {
    const result = readFirebaseIdRecords<{ id?: string; amount: number }>(
      {
        0: { id: "payment-1", amount: 100 },
        1: { id: "payment-1", amount: 200 },
        2: { amount: 300 },
      },
      "payments",
    );

    expect(result.isSafe).toBe(false);
    expect(result.issues.map((issue) => issue.kind)).toEqual(["duplicate-id", "missing-id"]);
  });

  it("fails closed for malformed children, roots, and present invalid IDs", () => {
    const malformedChild = readFirebaseIdRecords<{ id?: string; name: string }>(
      { corrupt: "not a record" },
      "beverageProducts",
    );
    const invalidInternalId = readFirebaseIdRecords<{ id?: string; name: string }>(
      { keyed: { id: "", name: "Soda" } },
      "beverageProducts",
    );
    const malformedRoot = readFirebaseIdRecords<{ id?: string; name: string }>(
      "not a Firebase collection",
      "beverageProducts",
    );

    expect(malformedChild.isSafe).toBe(false);
    expect(malformedChild.issues[0].kind).toBe("invalid-record");
    expect(invalidInternalId.isSafe).toBe(false);
    expect(invalidInternalId.issues[0].kind).toBe("invalid-id");
    expect(malformedRoot.isSafe).toBe(false);
    expect(malformedRoot.issues[0].kind).toBe("invalid-root");
  });

  it("serializes only an ID-keyed map and rejects data-loss risks", () => {
    expect(
      toFirebaseIdRecordMap(
        [
          { id: "alcohol-1", name: "Whisky" },
          { id: "alcohol-2", name: "Wine" },
        ],
        "alcoholProducts",
      ),
    ).toEqual({
      "alcohol-1": { id: "alcohol-1", name: "Whisky" },
      "alcohol-2": { id: "alcohol-2", name: "Wine" },
    });

    expect(() =>
      toFirebaseIdRecordMap(
        [{ id: "duplicate" }, { id: "duplicate" }],
        "invMappings",
      ),
    ).toThrow(/duplicate/i);
  });
});