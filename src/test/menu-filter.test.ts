import { describe, expect, it } from 'vitest';
import type { Category, MenuItem } from '@/types/pos';
import { filterMenuItems } from '@/utils/menuFilter';

const categories: Category[] = [
  { id: 'foods', name: 'Foods', order: 1, parentCategory: 'Foods' },
  { id: 'regular-hookah', name: 'Regular Hookah', order: 2, parentCategory: 'Hukkah' },
  { id: 'cloud-hookah', name: 'Cloud Hookah', order: 3, parentCategory: 'Hukkah' },
];

const menuItems: MenuItem[] = [
  { id: 'mint', categoryId: 'regular-hookah', name: 'Mint (Regular)', price: 500 },
  { id: 'apple', categoryId: 'regular-hookah', name: 'Double Apple (Regular)', price: 500 },
  { id: 'berry', categoryId: 'cloud-hookah', name: 'Berry Cloud', price: 700 },
  { id: 'momo', categoryId: 'foods', name: 'Veg Momo', price: 200 },
];

describe('filterMenuItems', () => {
  it('searches every category regardless of the selected tab', () => {
    const results = filterMenuItems(menuItems, categories, 'foods', 'hukkah');

    expect(results.map((item) => item.id)).toEqual(['mint', 'apple', 'berry']);
  });

  it('matches category metadata case-insensitively', () => {
    const results = filterMenuItems(menuItems, categories, 'foods', 'HOOKAH');

    expect(results.map((item) => item.id)).toEqual(['mint', 'apple', 'berry']);
  });

  it('matches item description and keeps tab filtering without search', () => {
    const describedItem: MenuItem = {
      ...menuItems[3],
      description: 'Fresh mint hookah garnish',
    };

    expect(filterMenuItems([describedItem], categories, 'foods', 'mint')).toEqual([describedItem]);
    expect(filterMenuItems(menuItems, categories, 'foods', '')).toEqual([menuItems[3]]);
  });
});