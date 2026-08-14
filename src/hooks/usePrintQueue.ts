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
  sendToNetworkPrinter,
} from '@/utils/escpos';
import { firePrintJob } from '@/utils/printEngine';

const PRINT_HUB_KEY = 'pos_is_print_hub';

/** Returns true only when this browser has explicitly been marked as the print hub. */
function isPrintHub(): boolean {
  return localStorage.getItem(PRINT_HUB_KEY) === 'true';
}

export function usePrintQueue() {
  const orders    = usePOSStore((s) => s.orders);
  const settings  = usePOSStore((s) => s.settings);
  const setOrders = usePOSStore((s) => s.setOrders);

  // Reactively track the localStorage flag so toggling the setting in the same
  // browser session activates/deactivates the listener without a page reload.
  const [isHub, setIsHub] = useState(isPrintHub);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PRINT_HUB_KEY) setIsHub(e.newValue === 'true');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Track which ticket ids have already been dispatched this session so
  // rapid Zustand re-renders don't double-fire while the async send is in
  // flight (before the 'printed' write comes back from Firebase).
  const dispatched = useRef(new Set<string>());

  useEffect(() => {
    if (!isHub) return;

    const tables = usePOSStore.getState().tables;

    for (const order of orders) {
      if (!order.tickets) continue;

      const pax = tables.find((t) => t.id === order.tableId)?.pax ?? 1;

      for (const ticket of order.tickets) {
        if (ticket.status === 'printed') continue;
        if (dispatched.current.has(ticket.id)) continue;

        dispatched.current.add(ticket.id);
        void dispatchTicket(ticket, pax);
      }
    }

    async function dispatchTicket(ticket: Ticket, pax: number) {
      const cafeName = settings.cafeName || 'Cafe';

      const isKitchenTicket = ticket.ticketType === 'KOT' || ticket.ticketType === 'VOID_KOT';
      const printerIp   = isKitchenTicket ? settings.kitchenPrinterIp   : settings.receptionPrinterIp;
      const printerPort = isKitchenTicket ? (settings.kitchenPrinterPort ?? 9100) : (settings.receptionPrinterPort ?? 9100);
      const useNetwork  = isKitchenTicket
        ? Boolean(printerIp)
        : (settings.receptionPrinterMode === 'network' && Boolean(printerIp));

      // Build the ESC/POS buffer
      let buffer: Uint8Array | null = null;

      if (ticket.ticketType === 'KOT') {
        buffer = buildKOT({ cafeName, ticket, pax, buzzer: settings.kitchenPrinterBuzzer ?? false });
      } else if (ticket.ticketType === 'BOT') {
        buffer = buildBOT({ cafeName, ticket, pax });
      } else if (ticket.ticketType === 'VOID_KOT' || ticket.ticketType === 'VOID_BOT') {
        buffer = buildVoidTicket({ cafeName, ticket });
      }

      if (!buffer) return;

      let success = false;

      if (useNetwork && printerIp) {
        const result = await sendToNetworkPrinter(buffer, printerIp, printerPort);
        success = result === 'ok';
      }

      if (!success) {
        // Browser fallback: dispatch via the existing iframe print engine so
        // the ticket still comes out of the locally-installed printer.
        const headerName =
          ticket.ticketType === 'BOT'      ? `${cafeName} — BAR/BOT` :
          ticket.ticketType === 'VOID_KOT' ? `${cafeName} — ** VOID KOT **` :
          ticket.ticketType === 'VOID_BOT' ? `${cafeName} — ** VOID BOT **` :
          cafeName;
        firePrintJob({
          type: 'KITCHEN_KOT',
          data: {
            cafeName:    headerName,
            tableNumber: ticket.tableName,
            pax,
            kotNumber:   ticket.ticketNumber,
            timestamp:   new Date(ticket.createdAt).getTime(),
            items:       ticket.items.map((i) => ({
              name: ticket.voidReason ? `${i.name} (VOID: ${ticket.voidReason})` : i.name,
              quantity: i.quantity,
            })),
            serverName:  ticket.serverName,
          },
        });
        success = true;
      }

      if (success) {
        // Mark ticket as printed so other devices skip it
        const currentOrders = usePOSStore.getState().orders;
        const updatedOrders = currentOrders.map((o) => {
          if (!o.tickets?.some((t) => t.id === ticket.id)) return o;
          return {
            ...o,
            tickets: o.tickets.map((t) =>
              t.id === ticket.id ? { ...t, status: 'printed' as const } : t,
            ),
          };
        });
        setOrders(updatedOrders);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, isHub]);
}
