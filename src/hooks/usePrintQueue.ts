/**
 * usePrintQueue.ts
 *
 * Background auto-print listener.  Activates only on the designated print-hub
 * device — i.e. the browser where localStorage key 'pos_is_print_hub' === 'true'.
 * All other devices (waiter phones, etc.) write tickets to Firebase and never
 * attempt to print; this hook's effect becomes a no-op for them.
 *
 *   KOT        → kitchen printer  (IP / buzzer from settings)
 *   BOT        → reception printer (IP or browser)
 *   VOID_KOT   → kitchen printer
 *   VOID_BOT   → reception printer
 *
 * After dispatching, the ticket status is updated to 'printed' on the order
 * so other devices don't re-print the same ticket.
 *
 * Mount this hook once in App.tsx (inside <App>, after useFirebaseSync).
 */

import { useEffect, useRef, useState } from 'react';
import { usePOSStore } from '@/store/usePOSStore';
import { Ticket } from '@/types/pos';
import {
  buildKOT,
  buildBOT,
  buildVoidTicket,
  dispatchEscpos,
  resolvePrinterMode,
} from '@/utils/escpos';
import { browserPrintKOT } from '@/utils/browserPrint';
import { autoReconnectUSB } from '@/utils/webusbPrinter';

const PRINT_HUB_KEY = 'pos_is_print_hub';

/** Returns true only when this browser has explicitly been marked as the print hub. */
function isPrintHub(): boolean {
  return localStorage.getItem(PRINT_HUB_KEY) === 'true';
}

export function usePrintQueue() {
  const orders    = usePOSStore((s) => s.orders);
  const settings  = usePOSStore((s) => s.settings);
  const setOrders = usePOSStore((s) => s.setOrders);

  // Tickets created before this hook's session started are historical backlog
  // and must never be sent to a printer after a refresh.
  const sessionStartTime = useRef(Date.now());

  // This lock covers both successful and failed attempts. A failed hardware
  // dispatch must not repeatedly retry or open anything in the background.
  const processedTicketIds = useRef(new Set<string>());

  // Reactively track the localStorage flag so another tab can activate or
  // deactivate the listener without a page reload.
  const [isHub, setIsHub] = useState(isPrintHub);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PRINT_HUB_KEY) setIsHub(e.newValue === 'true');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // On the hub device, silently re-attach an already-paired WebUSB printer so
  // direct-cable printing works right after a page refresh (no prompt).
  useEffect(() => {
    if (isHub) void autoReconnectUSB();
  }, [isHub]);

  useEffect(() => {
    const tables = usePOSStore.getState().tables;
    let cleanedHistoricalTickets = false;

    // Mark legacy pending tickets as printed in the persisted order data.
    // This cleanup also runs on non-hub devices so a refresh cannot leave an
    // old pending backlog waiting for a future hub session.
    const cleanedOrders = orders.map((order) => {
      if (!order.tickets?.some(
        (ticket) => ticket.status === 'pending' && !isCurrentSessionTicket(ticket),
      )) {
        return order;
      }

      cleanedHistoricalTickets = true;
      return {
        ...order,
        tickets: order.tickets.map((ticket) =>
          ticket.status === 'pending' && !isCurrentSessionTicket(ticket)
            ? { ...ticket, status: 'printed' as const }
            : ticket,
        ),
      };
    });

    if (cleanedHistoricalTickets) {
      setOrders(cleanedOrders);
    }

    if (!isHub) return;

    for (const order of cleanedOrders) {
      if (!order.tickets) continue;

      const pax = tables.find((t) => t.id === order.tableId)?.pax ?? 1;

      for (const ticket of order.tickets) {
        if (ticket.status === 'printed') continue;
        if (!isCurrentSessionTicket(ticket)) continue;
        if (processedTicketIds.current.has(ticket.id)) continue;

        processedTicketIds.current.add(ticket.id);
        void dispatchTicket(ticket, pax);
      }
    }

    function isCurrentSessionTicket(ticket: Ticket): boolean {
      const createdAt = Date.parse(ticket.createdAt);
      return Number.isFinite(createdAt) && createdAt > sessionStartTime.current;
    }

    async function dispatchTicket(ticket: Ticket, pax: number) {
      const cafeName = settings.cafeName || 'Cafe';

      const isKitchenTicket = ticket.ticketType === 'KOT' || ticket.ticketType === 'VOID_KOT';
      const target = isKitchenTicket ? 'kitchen' : 'reception';

      // ── System/Browser Print path for KOT ─────────────────────────────────
      // When the kitchen printer is set to 'System / Browser Print', route KOT
      // tickets through the HTML renderer instead of raw ESC/POS bytes.
      // In Electron this prints silently to the named kitchen printer;
      // in a web browser it opens the OS print dialog.
      if (ticket.ticketType === 'KOT' && resolvePrinterMode(settings, 'kitchen') === 'system') {
        const success = await browserPrintKOT({
          cafeName,
          ticket,
          pax,
          buzzer: settings.kitchenPrinterBuzzer ?? false,
        });
        if (!success) {
          console.warn(
            `[print-queue] browserPrintKOT failed for KOT #${ticket.ticketNumber} in system mode.`,
          );
        }
        if (success) markPrinted(ticket.id);
        return;
      }

      // ── ESC/POS path (WebUSB or network) ──────────────────────────────────
      let buffer: Uint8Array | null = null;

      if (ticket.ticketType === 'KOT') {
        buffer = buildKOT({ cafeName, ticket, pax, buzzer: settings.kitchenPrinterBuzzer ?? false });
      } else if (ticket.ticketType === 'BOT') {
        buffer = buildBOT({ cafeName, ticket, pax });
      } else if (ticket.ticketType === 'VOID_KOT' || ticket.ticketType === 'VOID_BOT') {
        buffer = buildVoidTicket({ cafeName, ticket });
      }

      if (!buffer) return;

      // dispatchEscpos routes to WebUSB or network per settings and is fully
      // silent on failure (console warning only — no dialogs, no window.print).
      const success = await dispatchEscpos(buffer, settings, target);

      if (!success) {
        // Hardware failures are deliberately silent to the user. The ticket
        // stays pending for visibility, while processedTicketIds prevents a
        // retry loop during this browser session.
        console.warn(
          `[print-queue] Could not dispatch ${ticket.ticketType} #${ticket.ticketNumber}.`,
        );
      }

      if (success) markPrinted(ticket.id);
    }

    function markPrinted(ticketId: string) {
      const currentOrders = usePOSStore.getState().orders;
      const updatedOrders = currentOrders.map((o) => {
        if (!o.tickets?.some((t) => t.id === ticketId)) return o;
        return {
          ...o,
          tickets: o.tickets.map((t) =>
            t.id === ticketId ? { ...t, status: 'printed' as const } : t,
          ),
        };
      });
      setOrders(updatedOrders);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, isHub]);
}
