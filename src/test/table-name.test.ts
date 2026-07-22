import { describe, expect, it } from 'vitest';
import { compareTableNames, tableDisplayName } from '@/utils/tableName';

describe('table naming', () => {
  it('formats numeric-only names with one Table prefix', () => {
    expect(tableDisplayName('9')).toBe('Table 9');
    expect(tableDisplayName('Table 9')).toBe('Table 9');
    expect(tableDisplayName(1)).toBe('Table 1');
  });

  it('preserves custom table names', () => {
    expect(tableDisplayName('VIP Lounge')).toBe('VIP Lounge');
    expect(tableDisplayName('Rooftop A')).toBe('Rooftop A');
  });

  it('sorts numeric names before custom names without mutating the source', () => {
    const values = ['VIP A', '10', '2', 'Rooftop 1'];
    expect([...values].sort(compareTableNames)).toEqual(['2', '10', 'Rooftop 1', 'VIP A']);
  });
});