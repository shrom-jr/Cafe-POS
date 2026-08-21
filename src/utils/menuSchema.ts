import type { Category, MenuItem } from "@/types/pos";
import { readFirebaseIdRecords } from "./firebaseSchema";

type MenuSnapshotResult<T extends { id?: unknown }> = {
  records: T[];
  isSafe: boolean;
  issues: ReturnType<typeof readFirebaseIdRecords<T>>["issues"];
};

export function normalizeMenuItemsSnapshot(data: unknown): MenuSnapshotResult<MenuItem> {
  const normalized = readFirebaseIdRecords<MenuItem>(data, "menu/items");
  return {
    isSafe: normalized.isSafe,
    issues: normalized.issues,
    records: normalized.entries
      .map(({ record }, index) => ({
        ...record,
        available: record.available !== false,
        displayOrder: record.displayOrder ?? index,
      }))
      .sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0)),
  };
}

export function normalizeMenuCategoriesSnapshot(data: unknown): MenuSnapshotResult<Category> {
  const normalized = readFirebaseIdRecords<Category>(data, "menu/categories");
  return {
    isSafe: normalized.isSafe,
    issues: normalized.issues,
    records: normalized.entries
      .map(({ record }, index) => ({
        ...record,
        displayOrder: record.displayOrder ?? index,
      }))
      .sort((left, right) =>
        (left.order ?? left.displayOrder ?? 0) - (right.order ?? right.displayOrder ?? 0),
      ),
  };
}