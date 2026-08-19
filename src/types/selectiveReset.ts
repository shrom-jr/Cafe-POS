export const SELECTIVE_RESET_MODULES = [
  {
    id: 'salesHistory',
    title: 'Sales & billing history',
    description: 'Clears completed orders, payments, and bill/KOT counters. Running tables stay open unless Active floor is also selected.',
  },
  {
    id: 'activeFloor',
    title: 'Active floor & carts',
    description: 'Removes running orders and frees every table while retaining the complete table and floor layout.',
  },
  {
    id: 'customerCredit',
    title: 'Customer Directory & Credit Ledgers',
    description: 'Completely wipes all saved customer profiles, phone numbers, visit histories, outstanding dues, and repayment ledgers.',
  },
  {
    id: 'kitchenOperations',
    title: 'Kitchen purchases & meat tracking',
    description: 'Clears kitchen purchase, grocery purchase, and meat preparation logs.',
  },
  {
    id: 'barInventory',
    title: 'Bar inventory logs & stock',
    description: 'Clears inventory movements and the restock audit, then resets bar stock counts to zero without deleting product definitions or mappings.',
  },
  {
    id: 'maintenanceExpenses',
    title: 'Maintenance expenses',
    description: 'Clears the maintenance expense history only.',
  },
] as const;

export type SelectiveResetModuleId = (typeof SELECTIVE_RESET_MODULES)[number]['id'];
export type SelectiveResetSelection = Record<SelectiveResetModuleId, boolean>;

export const EMPTY_SELECTIVE_RESET_SELECTION: SelectiveResetSelection = {
  salesHistory: false,
  activeFloor: false,
  customerCredit: false,
  kitchenOperations: false,
  barInventory: false,
  maintenanceExpenses: false,
};

export function hasSelectedResetModule(selection: SelectiveResetSelection): boolean {
  return SELECTIVE_RESET_MODULES.some((module) => selection[module.id]);
}
