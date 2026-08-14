/**
 * silentPrint.ts
 *
 * Silent ESC/POS replacement for the legacy firePrintJob() iframe pipeline.
 *
 * Accepts the exact same structured PrintJob objects that screens already
 * build (KITCHEN_KOT / PRE_BILL / TAX_INVOICE) but renders them as raw
 * ESC/POS bytes and dispatches through the unified WebUSB / network
 * dispatcher. If the printer is unconfigured or offline it logs a console
 * warning and resolves false — it NEVER opens window.print(), an iframe
 * print dialog, or an alert.
 *
 * Routing:
 *   KITCHEN_KOT → kitchen printer
 *   PRE_BILL    → reception printer
 *   TAX_INVOICE → reception printer
 */

import { usePOSStore } from '@/store/usePOSStore';
import type { PrintJob } from '@/utils/printEngine';
import {
  buildKOT,
  buildPreBill,
  buildTaxInvoice,
  dispatchEscpos,
} from '@/utils/escpos';
import { Ticket } from '@/types/pos';

/**
 * Dispatch a structured print job silently via ESC/POS.
 * Resolves true when the bytes reached the printer, false otherwise.
 */
export async function fireSilentPrintJob(job: PrintJob): Promise<boolean> {
  const settings = usePOSStore.getState().settings;

  switch (job.type) {
    case 'KITCHEN_KOT': {
      const d = job.data;
      const ticket: Ticket = {
        id: `manual-kot-${d.timestamp}`,
        orderId: 'manual',
        tableId: 'manual',
        tableName: d.tableNumber,
        ticketType: 'KOT',
        ticketNumber: d.kotNumber,
        items: d.items.map((i, idx) => ({ id: `mk-${idx}`, name: i.name, quantity: i.quantity })),
        serverName: d.serverName ?? '',
        createdAt: new Date(d.timestamp).toISOString(),
        status: 'pending',
      };
      const buffer = buildKOT({
        cafeName: d.cafeName,
        ticket,
        pax: d.pax,
        buzzer: settings.kitchenPrinterBuzzer ?? false,
      });
      return dispatchEscpos(buffer, settings, 'kitchen');
    }

    case 'PRE_BILL': {
      const d = job.data;
      const buffer = buildPreBill({
        cafeName: d.cafeName,
        cafeAddress: d.cafeAddress,
        cafePan: d.cafePan,
        tableNumber: d.tableNumber,
        serverName: d.takenBy?.name || d.serverName,
        items: d.items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
        subtotal: d.subtotal,
        discountAmount: d.discountAmount,
        vatEnabled: d.vatEnabled,
        vatAmount: d.vatAmount,
        vatRate: d.vatRate,
        total: d.total,
        timestamp: d.timestamp,
      });
      return dispatchEscpos(buffer, settings, 'reception');
    }

    case 'TAX_INVOICE': {
      const d = job.data;
      const buffer = buildTaxInvoice({
        cafeName: d.cafeName,
        cafeAddress: d.cafeAddress,
        cafePan: d.cafePan,
        billFooter: d.billFooter,
        tableNumber: d.tableNumber,
        billNumber: d.billNumber,
        serverName: d.takenBy?.name || d.takenBy?.fullName || d.serverName,
        cashierName: d.processedBy?.name || d.processedBy?.fullName || d.cashierName,
        method: d.method,
        items: d.items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
        subtotal: d.subtotal,
        discountAmount: d.discountAmount,
        vatEnabled: d.vatEnabled,
        vatAmount: d.vatAmount,
        vatRate: d.vatRate,
        total: d.total,
        dueSettlement: d.dueSettlement,
        amountTendered: d.amountTendered,
        creditSettlement: d.creditSettlement,
        timestamp: d.timestamp,
      });
      return dispatchEscpos(buffer, settings, 'reception');
    }
  }
}
