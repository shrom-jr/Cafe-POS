/**
 * ticketSplitter.ts
 *
 * Determines whether each OrderItem routes to the Kitchen (KOT) or the
 * Bar / Reception (BOT) based on the Category.sendToKitchen flag that admins
 * manage through the AdminPanel.
 *
 * Routing rules (mirrors the spec):
 *   KOT — Category.sendToKitchen === true
 *       Food items, Hot Beverages, Milk Shakes, Smoothies, etc.
 *   BOT — Category.sendToKitchen === false / undefined
 *       Alcohol, Cold Drinks, Energy Drinks, Juices, Water, Cigarettes, Hookah
 *
 * The admin already controls this via the per-category KOT toggle in AdminPanel,
 * so we simply trust that flag rather than hard-coding name patterns.
 */

import { Category, OrderItem, Ticket, TicketItem, TicketType } from '@/types/pos';

/**
 * Classify a list of draft OrderItems into kitchen vs bar groups.
 * Returns two arrays of TicketItem ready to attach to tickets.
 */
export function splitDraftItems(
  draftItems: OrderItem[],
  menuItemCategoryMap: Map<string, string>,   // menuItemId → categoryId
  categoryMap: Map<string, Category>,          // categoryId → Category
): { kitchenItems: TicketItem[]; barItems: TicketItem[] } {
  const kitchenItems: TicketItem[] = [];
  const barItems: TicketItem[] = [];

  for (const item of draftItems) {
    const categoryId = menuItemCategoryMap.get(item.menuItemId);
    const category = categoryId ? categoryMap.get(categoryId) : undefined;
    const isKitchen = category?.sendToKitchen === true;

    const ticketItem: TicketItem = {
      id: item.id,
      name: item.name,
      quantity: item.quantity,
    };

    if (isKitchen) {
      kitchenItems.push(ticketItem);
    } else {
      barItems.push(ticketItem);
    }
  }

  return { kitchenItems, barItems };
}

/**
 * Count how many tickets of a given type already exist on an order.
 * Used to assign the next sequential ticketNumber (KOT #1, KOT #2, …).
 */
export function nextTicketNumber(
  existingTickets: Ticket[],
  ticketType: 'KOT' | 'BOT',
): number {
  const relevant = existingTickets.filter((t) => t.ticketType === ticketType);
  if (relevant.length === 0) return 1;
  return Math.max(...relevant.map((t) => t.ticketNumber)) + 1;
}

/**
 * Determine whether a sent item's category routes it to the kitchen or bar.
 * Used when generating VOID tickets for a single item.
 */
export function resolveItemDestination(
  menuItemId: string,
  menuItemCategoryMap: Map<string, string>,
  categoryMap: Map<string, Category>,
): 'KOT' | 'BOT' {
  const categoryId = menuItemCategoryMap.get(menuItemId);
  const category = categoryId ? categoryMap.get(categoryId) : undefined;
  return category?.sendToKitchen === true ? 'KOT' : 'BOT';
}

/**
 * Build a new Ticket object given all required fields.
 */
export function buildTicket(params: {
  orderId: string;
  tableId: string;
  tableName: string;
  ticketType: TicketType;
  ticketNumber: number;
  items: TicketItem[];
  serverName: string;
  customerName?: string;
  voidReason?: string;
  voidedBy?: string;
}): Ticket {
  return {
    id: crypto.randomUUID(),
    orderId: params.orderId,
    tableId: params.tableId,
    tableName: params.tableName,
    ticketType: params.ticketType,
    ticketNumber: params.ticketNumber,
    items: params.items,
    serverName: params.serverName,
    customerName: params.customerName,
    createdAt: new Date().toISOString(),
    status: 'pending',
    voidReason: params.voidReason,
    voidedBy: params.voidedBy,
  };
}
