/**
 * Print-status persistence regression test.
 *
 * The hub must flip BOTH the ticket status and the order-level printStatus in
 * a single store update, so the one-and-only Firebase persistence path (the
 * full /orders sync of that same array) carries 'printed' atomically. A
 * separate narrow patch racing the full-array write could be reverted to
 * 'pending' — this test proves the store state that gets synced is already
 * final.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePOSStore } from '@/store/usePOSStore';
import { usePrintQueue } from '@/hooks/usePrintQueue';
import type { Order, Ticket } from '@/types/pos';

vi.mock('@/utils/escpos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/escpos')>();
  return {
    ...actual,
    dispatchEscpos: vi.fn().mockResolvedValue(true),
  };
});
vi.mock('@/utils/webusbPrinter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/webusbPrinter')>();
  return {
    ...actual,
    autoReconnectUSB: vi.fn().mockResolvedValue(true),
  };
});

const makeTicket = (overrides: Partial<Ticket>): Ticket => ({
  id: 'ticket-1',
  orderId: 'order-1',
  tableId: 'table-1',
  tableName: '1',
  ticketType: 'KOT',
  ticketNumber: 1,
  items: [{ id: 'ti-1', name: 'Chicken Sekuwa', quantity: 1 }],
  serverName: 'Ram',
  createdAt: new Date(Date.now() + 50).toISOString(), // after session start
  status: 'pending',
  ...overrides,
});

const makeOrder = (tickets: Ticket[]): Order =>
  ({
    id: 'order-1',
    tableId: 'table-1',
    tableNumber: '1',
    items: [],
    status: 'active',
    createdAt: Date.now(),
    tickets,
    printStatus: { kot: 'pending' as const, bot: 'pending' as const },
  }) as unknown as Order;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('pos_is_print_hub', 'true');
  usePOSStore.setState({ orders: [], tables: [] });
});

describe('hub print-status persistence', () => {
  it('flips ticket status and order printStatus to printed in one store update', async () => {
    renderHook(() => usePrintQueue());

    // Ticket arrives after the hub session started (as from a waiter device).
    await new Promise((r) => setTimeout(r, 60));
    act(() => {
      usePOSStore.setState({ orders: [makeOrder([makeTicket({})])] });
    });

    await waitFor(() => {
      const order = usePOSStore.getState().orders[0];
      expect(order.tickets?.[0].status).toBe('printed');
      // The SAME array that useFirebaseSync pushes already carries 'printed' —
      // no separate write can race it back to 'pending'.
      expect(order.printStatus?.kot).toBe('printed');
      // BOT untouched: no bar ticket was printed.
      expect(order.printStatus?.bot).toBe('pending');
    });
  });

  it('keeps kot pending while another kitchen ticket on the order is still unprinted', async () => {
    const { dispatchEscpos } = await import('@/utils/escpos');
    // First dispatch succeeds, second fails (printer ran out mid-batch).
    vi.mocked(dispatchEscpos).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    renderHook(() => usePrintQueue());

    await new Promise((r) => setTimeout(r, 60));
    const t1 = makeTicket({ id: 'ticket-a', ticketNumber: 1 });
    const t2 = makeTicket({ id: 'ticket-b', ticketNumber: 2 });
    act(() => {
      usePOSStore.setState({ orders: [makeOrder([t1, t2])] });
    });

    await waitFor(() => {
      const order = usePOSStore.getState().orders[0];
      const printed = order.tickets?.filter((t) => t.status === 'printed') ?? [];
      expect(printed).toHaveLength(1);
    });

    // One kitchen ticket is still pending, so the station must NOT report printed.
    expect(usePOSStore.getState().orders[0].printStatus?.kot).toBe('pending');
  });
});
