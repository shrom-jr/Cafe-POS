export type TableNameValue = string | number;

/** Returns a natural display label without duplicating a "Table" prefix. */
export const tableDisplayName = (value: TableNameValue): string => {
  const name = String(value).trim();
  if (!name) return 'Table';
  if (/^table\b/i.test(name)) return name;
  return /^\d+$/.test(name) ? `Table ${name}` : name;
};

/** Normalized display label used for case-insensitive uniqueness checks. */
export const tableNameKey = (value: TableNameValue): string =>
  tableDisplayName(value).trim().toLocaleLowerCase();

/** Sorts numeric table names numerically, then custom names alphabetically. */
export const compareTableNames = (a: TableNameValue, b: TableNameValue): number => {
  const left = String(a).trim();
  const right = String(b).trim();
  const leftNumber = /^\d+$/.test(left) ? Number(left) : null;
  const rightNumber = /^\d+$/.test(right) ? Number(right) : null;
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
  if (leftNumber !== null) return -1;
  if (rightNumber !== null) return 1;
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
};