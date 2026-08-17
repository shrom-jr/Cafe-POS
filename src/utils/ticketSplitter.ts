/**
 * ticketSplitter.ts
 *
 * Determines whether each OrderItem routes to the Kitchen (KOT) or the
 * Bar / Reception (BOT).
 *
 * Routing precedence (highest first):
 *   1. MenuItem.printRoute  — explicit per-item route ('KOT' | 'BOT')
 *   2. Category.printRoute  — explicit per-category route
 *   3. Category.sendToKitchen === true → KOT, otherwise BOT
 *
 * Typical routes:
 *   KOT — Food items, Hot Beverages, Milk Shakes, Smoothies, etc.
 *   BOT — Alcohol, Cold Drinks, Energy Drinks, Juices, Water, Cigarettes, Hookah
 */

import { Category, MenuItem, OrderItem, PrintRoute, Ticket, TicketItem, TicketType } from '@/types/pos';

/** Resolve the print route for one menu item with full precedence rules. */
export function resolvePrintRoute(
  menuItemId: string,
  menuItemMap: Map<string, MenuItem>,
  categoryMap: Map<string, Category>,
): PrintRoute {
  const menuItem = menuItemMap.get(menuItemId);

  // 1. Explicit per-item route wins
  if (menuItem?.printRoute === 'KOT' || menuItem?.printRoute === 'BOT') {
    return menuItem.printRoute;
  }

  const category = menuItem?.categoryId ? categoryMap.get(menuItem.categoryId) : undefined;

  // 2. Explicit per-category route
  if (category?.printRoute === 'KOT' || category?.printRoute === 'BOT') {
    return category.printRoute;
  }

  // 3. Legacy sendToKitchen flag
  return category?.sendToKitchen === true ? 'KOT' : 'BOT';
}

/**
 * Classify a list of draft OrderItems into kitchen vs bar groups.
 * Returns two arrays of TicketItem ready to attach to tickets.
 */
export function splitDraftItems(
  draftItems: OrderItem[],
  menuItemMap: Map<string, MenuItem>,       // menuItemId → MenuItem
  categoryMap: Map<string, Category>,        // categoryId → Category
): { kitchenItems: TicketItem[]; barItems: TicketItem[] } {
  const kitchenItems: TicketItem[] = [];
  const barItems: TicketItem[] = [];

  for (const item of draftItems) {
    const route = resolvePrintRoute(item.menuItemId, menuItemMap, categoryMap);

    const ticketItem: TicketItem = {
      id: item.id,
      name: item.name,
      quantity: item.quantity,
    };

    if (route === 'KOT') {
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
 * Determine whether a sent item's route sends it to the kitchen or bar.
 * Used when generating VOID tickets for a single item.
 */
export function resolveItemDestination(
  menuItemId: string,
  menuItemMap: Map<string, MenuItem>,
  categoryMap: Map<string, Category>,
): 'KOT' | 'BOT' {
  return resolvePrintRoute(menuItemId, menuItemMap, categoryMap);
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
