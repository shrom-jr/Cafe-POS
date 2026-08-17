/**
 * silentPrint.ts
 *
 * Unified silent print dispatcher for structured PrintJob objects.
 *
 * Every job routes directly to a WebUSB ESC/POS printer — zero browser
 * dialogs, zero window.print() calls:
 *
 *   KITCHEN_KOT → Kitchen USB printer   (slot 'kitchen')
 *   PRE_BILL    → Reception USB printer (slot 'reception')
 *   TAX_INVOICE → Reception USB printer (slot 'reception')
 *
 * All paths resolve true/false — nothing throws or opens alerts.
 */

import { usePOSStore } from '@/store/usePOSStore';
import type { PrintJob } from '@/utils/printEngine';
import {
  buildKOT,
  buildPreBill,
  buildTaxInvoice,
  dispatchEscpos,
  type EscPreBillOptions,
  type EscTaxInvoiceOptions,
} from '@/utils/escpos';
import { Ticket } from '@/types/pos';

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
      return dispatchEscpos(buffer, 'kitchen');
    }

    case 'PRE_BILL': {
      const d = job.data;
      const preBillData: EscPreBillOptions = {
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
      };

      const buffer = buildPreBill(preBillData);
      return dispatchEscpos(buffer, 'reception');
    }

    case 'TAX_INVOICE': {
      const d = job.data;
      const invoiceData: EscTaxInvoiceOptions = {
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
      };

      const buffer = buildTaxInvoice(invoiceData);
      return dispatchEscpos(buffer, 'reception');
    }
  }
}
