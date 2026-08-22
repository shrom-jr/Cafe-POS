/**
 * usePrintQueue.ts
 *
 * Background auto-print listener. Activates only on the designated print-hub
 * device — i.e. the browser where localStorage key 'pos_is_print_hub' === 'true'.
 * All other devices (waiter phones, etc.) write tickets to Firebase and never
 * attempt to print; this hook's effect becomes a no-op for them.
 *
 * Transport selection (automatic per ticket):
 *
 *   Electron desktop  — detected via window.electronAPI?.isElectron
 *     → Renders HTML receipts and calls window.electronAPI.printSilent()
 *       routed to the Windows printer names stored in localStorage.
 *
 *   Browser / print-hub  — WebUSB ESC/POS
 *     → buildKOT / buildBOT / buildVoidTicket → dispatchEscpos → sendRawToUSB
 *
 *   KOT / VOID_KOT  → kitchen station
 *   BOT / VOID_BOT  → reception station
 *
 * After dispatching, the ticket status and order printStatus flip in one
 * setOrders call so the /orders Firebase sync carries 'printed' atomically.
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
} from '@/utils/escpos';
import {
  browserPrintKOT,
  browserPrintBOT,
  browserPrintVoidTicket,
} from '@/utils/browserPrint';
import { autoReconnectUSB } from '@/utils/webusbPrinter';
import { isTrainingSandboxActive } from '@/utils/trainingSandbox';

const PRINT_HUB_KEY = 'pos_is_print_hub';

/**
 * Same-tab notification channel. The browser `storage` event only fires in
 * OTHER tabs, so writers must call setPrintHubEnabled (or dispatch this event)
 * for the change to take effect in the tab where it was made.
 */
export const PRINT_HUB_EVENT = 'pos-print-hub-changed';

/** Returns true only when this browser has explicitly been marked as the print hub. */
function isPrintHub(): boolean {
  return localStorage.getItem(PRINT_HUB_KEY) === 'true';
}

/**
 * Persist the hub flag AND notify the current tab immediately.
 * All UI toggles must go through this helper — writing localStorage directly
 * would leave the local listener stale until the next reload.
 */
export function setPrintHubEnabled(enabled: boolean): void {
  if (isTrainingSandboxActive()) return;
  localStorage.setItem(PRINT_HUB_KEY, enabled ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent(PRINT_HUB_EVENT, { detail: enabled }));
}

// ── Electron helpers ──────────────────────────────────────────────────────────

function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
}

function getElectronDeviceName(slot: 'kitchen' | 'reception'): string | undefined {
  try {
    const key = slot === 'kitchen'
      ? 'printer_kitchen_device_name'
      : 'printer_reception_device_name';
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

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
    // Cross-tab changes arrive via the storage event…
    const onStorage = (e: StorageEvent) => {
      if (e.key === PRINT_HUB_KEY) setIsHub(e.newValue === 'true');
    };
    // …same-tab changes via the custom event fired by setPrintHubEnabled.
    const onLocalChange = () => setIsHub(isPrintHub());
    window.addEventListener('storage', onStorage);
    window.addEventListener(PRINT_HUB_EVENT, onLocalChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(PRINT_HUB_EVENT, onLocalChange);
    };
  }, []);

  // On the hub device, silently re-attach both USB printers so direct-cable
  // printing works right after a page refresh (no prompt required).
  // Skipped in Electron mode — native Windows printing needs no WebUSB.
  useEffect(() => {
    if (isTrainingSandboxActive()) return;
    if (!isHub) return;
    if (isElectron()) return;
    void Promise.all([
      autoReconnectUSB('kitchen'),
      autoReconnectUSB('reception'),
    ]);
  }, [isHub]);

  useEffect(() => {
    if (isTrainingSandboxActive()) return;
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
        void dispatchTicket(ticket, pax, order.id);
      }
    }

    function isCurrentSessionTicket(ticket: Ticket): boolean {
      const createdAt = Date.parse(ticket.createdAt);
      return Number.isFinite(createdAt) && createdAt > sessionStartTime.current;
    }

    async function dispatchTicket(ticket: Ticket, pax: number, orderId: string) {
      const cafeName = settings.cafeName || 'Cafe';
      const isKitchenTicket = ticket.ticketType === 'KOT' || ticket.ticketType === 'VOID_KOT';
      const target = isKitchenTicket ? 'kitchen' : 'reception';

      let success = false;

      if (isElectron()) {
        // ── Electron path: HTML → native Windows print ──────────────────────
        const deviceName = getElectronDeviceName(target);

        if (ticket.ticketType === 'KOT') {
          success = await browserPrintKOT(
            { cafeName, ticket, pax, buzzer: settings.kitchenPrinterBuzzer ?? false },
            deviceName,
          );
        } else if (ticket.ticketType === 'BOT') {
          success = await browserPrintBOT({ cafeName, ticket, pax }, deviceName);
        } else if (ticket.ticketType === 'VOID_KOT' || ticket.ticketType === 'VOID_BOT') {
          success = await browserPrintVoidTicket({ cafeName, ticket }, deviceName);
        }
      } else {
        // ── WebUSB ESC/POS path ─────────────────────────────────────────────
        let buffer: Uint8Array | null = null;

        if (ticket.ticketType === 'KOT') {
          buffer = buildKOT({
            cafeName,
            ticket,
            pax,
            buzzer: settings.kitchenPrinterBuzzer ?? false,
          });
        } else if (ticket.ticketType === 'BOT') {
          buffer = buildBOT({ cafeName, ticket, pax });
        } else if (ticket.ticketType === 'VOID_KOT' || ticket.ticketType === 'VOID_BOT') {
          buffer = buildVoidTicket({ cafeName, ticket });
        }

        if (!buffer) return;

        // dispatchEscpos routes directly to the correct USB slot and is fully
        // silent on failure (console warning only — no dialogs, no window.print).
        success = await dispatchEscpos(buffer, target);
      }

      if (!success) {
        console.warn(
          `[print-queue] Could not dispatch ${ticket.ticketType} #${ticket.ticketNumber}.`,
        );
      }

      if (success) {
        // Single atomic persistence path: the ticket status AND the order's
        // printStatus flip in ONE setOrders call, so the full /orders sync
        // (useFirebaseSync) carries 'printed' to Firebase. A separate narrow
        // printStatus patch would race the full-array write and could be
        // reverted to 'pending' by whichever request lands last.
        const slot = isKitchenTicket ? ('kot' as const) : ('bot' as const);
        markPrinted(ticket.id, orderId, slot);
      }
    }

    function markPrinted(ticketId: string, orderId: string, slot: 'kot' | 'bot') {
      const currentOrders = usePOSStore.getState().orders;
      const updatedOrders = currentOrders.map((o) => {
        if (!o.tickets?.some((t) => t.id === ticketId)) return o;

        const updatedTickets = o.tickets.map((t) =>
          t.id === ticketId ? { ...t, status: 'printed' as const } : t,
        );

        // Flip the station's printStatus to 'printed' only when no OTHER
        // pending ticket for the same station remains on this order.
        const stationHasPending = updatedTickets.some((t) => {
          const isKitchen = t.ticketType === 'KOT' || t.ticketType === 'VOID_KOT';
          const tSlot = isKitchen ? 'kot' : 'bot';
          return tSlot === slot && t.status === 'pending';
        });

        const printStatus =
          o.id === orderId && !stationHasPending
            ? { ...(o.printStatus ?? {}), [slot]: 'printed' as const }
            : o.printStatus;

        return { ...o, tickets: updatedTickets, printStatus };
      });
      setOrders(updatedOrders);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, isHub]);
}
