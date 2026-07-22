import type { Category, MenuItem } from '@/types/pos';

const text = (value: unknown): string =>
  typeof value === 'string' ? value.toLocaleLowerCase() : '';

/**
 * Search the complete menu when a query is present. Without a query, retain
 * the currently selected sub-category view.
 */
export const filterMenuItems = (
  menuItems: MenuItem[],
  categories: Category[],
  activeSubCategoryId: string,
  searchQuery: string,
): MenuItem[] => {
  const query = text(searchQuery.trim());

  if (!query) {
    return menuItems.filter((item) => item.categoryId === activeSubCategoryId);
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return menuItems.filter((item) => {
    const category = categoryById.get(item.categoryId);
    const searchableText = [
      item.name,
      item.category,
      item.categoryName,
      item.subcategory,
      item.subcategoryName,
      item.description,
      category?.name,
      category?.parentCategory,
      category?.subGroup,
    ]
      .map(text)
      .filter(Boolean)
      .join(' ');

    return searchableText.includes(query);
  });
};