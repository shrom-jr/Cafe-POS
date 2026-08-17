/**
 * silentPrint.ts
 *
 * Unified silent print dispatcher for structured PrintJob objects.
 *
 * Transport selection (automatic):
 *
 *   Electron desktop  — detected via window.electronAPI?.isElectron
 *     → Renders an 80mm HTML receipt.
 *     → Calls window.electronAPI.printSilent(html, deviceName).
 *     → deviceName is read from localStorage (set by the admin in Settings):
 *         printer_kitchen_device_name   → KOT tickets
 *         printer_reception_device_name → PRE_BILL, TAX_INVOICE
 *     → Returns actual { success } from the native Windows print callback.
 *
 *   Browser / mobile — WebUSB ESC/POS path (unchanged from Phase 5)
 *     → Builds raw ESC/POS bytes.
 *     → Sends directly to the claimed USB printer slot.
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
import {
  browserPrintKOT,
  browserPrintPreBill,
  browserPrintTaxInvoice,
} from '@/utils/browserPrint';
import type { Ticket } from '@/types/pos';

// ── Electron detection ────────────────────────────────────────────────────────

function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
}

function getDeviceName(slot: 'kitchen' | 'reception'): string | undefined {
  try {
    const key = slot === 'kitchen'
      ? 'printer_kitchen_device_name'
      : 'printer_reception_device_name';
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

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

      if (isElectron()) {
        return browserPrintKOT(
          { cafeName: d.cafeName, ticket, pax: d.pax, buzzer: settings.kitchenPrinterBuzzer ?? false },
          getDeviceName('kitchen'),
        );
      }

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

      if (isElectron()) {
        return browserPrintPreBill(preBillData, getDeviceName('reception'));
      }

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

      if (isElectron()) {
        return browserPrintTaxInvoice(invoiceData, getDeviceName('reception'));
      }

      const buffer = buildTaxInvoice(invoiceData);
      return dispatchEscpos(buffer, 'reception');
    }
  }
}
