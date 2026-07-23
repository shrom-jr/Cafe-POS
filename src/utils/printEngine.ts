// ─────────────────────────────────────────────────────────────────────────────
// Dual-Printer Layout Switching Engine
//
// Handles three structured print job types:
//   KITCHEN_KOT  — kitchen ticket, no financial data (Printer A: Kitchen)
//   PRE_BILL     — customer pre-bill with watermark   (Printer B: Counter)
//   TAX_INVOICE  — official sequential tax invoice    (Printer B: Counter)
//
// All layouts target 80mm thermal paper, rendered as clean HTML/CSS tables.
// Jobs are dispatched via a popup window so the main-app DOM is never
// interrupted, no CSS @media print overrides on #root are needed.
// ─────────────────────────────────────────────────────────────────────────────

import { format } from 'date-fns';
import { numberToWords } from './printer';
import { useStaffStore } from '@/store/useStaffStore';
import { tableDisplayName } from '@/utils/tableName';

// ── Typed job interfaces ──────────────────────────────────────────────────────

export type PrintJobType = 'KITCHEN_KOT' | 'PRE_BILL' | 'TAX_INVOICE';

export interface KOTData {
  cafeName:    string;
  tableNumber: string;
  pax:         number;
  kotNumber:   number;
  timestamp:   number;
  items:       Array<{ name: string; quantity: number }>;
  /** Name of the server/waiter who took the order */
  serverName?: string;
}

export interface PreBillData {
  cafeName:       string;
  cafeAddress?:   string;
  cafePan?:       string;
  tableNumber:    string;
  timestamp:      number;
  items:          Array<{ name: string; price: number; quantity: number }>;
  subtotal:       number;
  discountAmount: number;
  vatEnabled:     boolean;
  vatAmount:      number;
  vatRate:        number;
  total:          number;
  /** Plain-string fallback (legacy) */
  serverName?:    string;
  /** Full attribution object — preferred over serverName */
  takenBy?:       { id?: string; name: string; role?: string };
  /** Logo base64/data-URI to embed at the top of the printed receipt */
  logo?:          string;
  showLogoOnBill?: boolean;
}

export interface TaxInvoiceData {
  cafeName:       string;
  cafeAddress?:   string;
  cafePan?:       string;
  billFooter?:    string;
  tableNumber:    string;
  billNumber:     number;
  timestamp:      number;
  items:          Array<{ name: string; price: number; quantity: number }>;
  subtotal:       number;
  discountAmount: number;
  vatEnabled:     boolean;
  vatAmount:      number;
  vatRate:        number;
  total:          number;
  method:         string;
  /** Plain-string fallbacks (legacy) */
  serverName?:    string;
  cashierName?:   string;
  /** Full attribution objects — preferred over plain strings */
  takenBy?:       { id?: string; name?: string; fullName?: string; role?: string };
  processedBy?:   { id?: string; name?: string; fullName?: string; role?: string };
  /** Logo base64/data-URI to embed at the top of the printed receipt */
  logo?:          string;
  showLogoOnBill?: boolean;
}

export type PrintJob =
  | { type: 'KITCHEN_KOT'; data: KOTData }
  | { type: 'PRE_BILL';    data: PreBillData }
  | { type: 'TAX_INVOICE'; data: TaxInvoiceData };

// ── Shared popup CSS ──────────────────────────────────────────────────────────

const POPUP_CSS = `
  @page { size: 80mm auto; margin: 0mm !important; }
  * { box-sizing: border-box !important; }
  body {
    font-family: Arial, Helvetica, sans-serif !important;
    font-size: 10px !important;
    line-height: 1.2 !important;
    color: #000000 !important;
    margin: 0 !important;
    padding: 0 1mm !important;
    width: 66mm !important;
    max-width: 66mm !important;
    overflow: hidden !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  table {
    width: 100% !important;
    table-layout: fixed !important;
    border-collapse: collapse !important;
  }
  td, th { word-break: break-word !important; overflow: hidden !important; }
  .header { text-align: center; margin-bottom: 8px; }
  .header h2 { margin: 0; font-size: 13px; font-weight: bold; }
  .header p { margin: 2px 0; font-size: 10px; }
  .meta-table td { font-size: 10px; padding: 1px 0; }
  .items-table th {
    border-top: 1px dashed #000;
    border-bottom: 1px dashed #000;
    font-size: 10px;
    padding: 3px 0;
    text-align: left;
  }
  .items-table td { font-size: 10px; padding: 2px 0; vertical-align: top; }
  .totals-table td { font-size: 10px; padding: 1px 0; }
  .grand-total td { font-size: 11px; font-weight: bold; border-top: 1px solid #000; padding-top: 3px; }
  .text-right { text-align: right !important; padding-right: 0 !important; }
  .text-center { text-align: center !important; }
  .bold { font-weight: bold !important; }
  .logo { max-width: 90px; height: auto; margin: 0 auto 6px auto; display: block;
          -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .divider { border-top: 1px dashed #000; margin: 3px 0; }
  .footer { text-align: center; font-size: 10px; margin-top: 5px; }
  .inwords { font-size: 10px; margin: 3px 0; }
  .watermark { text-align: center; font-size: 10px; font-style: italic; margin-top: 5px; }
`;

// ── KITCHEN_KOT HTML builder ──────────────────────────────────────────────────

function buildKOTHtml(data: KOTData): string {
  const dateStr = format(data.timestamp, 'dd/MM/yyyy');
  const timeStr = format(data.timestamp, 'hh:mm aa');

  const itemRows = data.items.map(item => `
    <tr>
      <td class="bold" style="width:20%">${item.quantity}</td>
      <td>${item.name}</td>
    </tr>`).join('');

  return `
    <div class="header">
      <h2>${data.cafeName}</h2>
      <p><strong>KITCHEN ORDER TICKET (KOT)</strong></p>
      <p>KOT #${data.kotNumber}</p>
    </div>
    <div class="divider"></div>
    <table class="meta-table">
      <tr>
        <td><strong>Table:</strong> ${tableDisplayName(data.tableNumber)}</td>
        <td class="text-right"><strong>Pax:</strong> ${data.pax}</td>
      </tr>
      <tr>
        <td><strong>Date:</strong> ${dateStr}</td>
        <td class="text-right">${timeStr}</td>
      </tr>
      <tr><td colspan="2"><strong>Taken By:</strong> ${data.serverName || 'N/A'}</td></tr>
    </table>
    <div class="divider"></div>
    <table class="items-table">
      <thead>
        <tr>
          <th style="width:20%">QTY</th>
          <th>ITEM</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="divider"></div>
    <p class="text-center" style="font-size:10px">*** KITCHEN COPY — NO PRICING ***</p>`;
}

// ── PRE_BILL HTML builder ─────────────────────────────────────────────────────

function buildPreBillHtml(data: PreBillData): string {
  const dateStr = format(data.timestamp, 'dd/MM/yyyy');
  const taxableAmount = data.subtotal - data.discountAmount;
  const vatPct = Math.round((data.vatRate ?? 0.13) * 100);
  const servedBy = data.takenBy?.name || data.serverName;

  const itemRows = data.items.map((item, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${item.name}</td>
      <td class="text-right">${item.quantity}</td>
      <td class="text-right">${(item.price * item.quantity).toFixed(0)}</td>
    </tr>`).join('');

  const discountRow = data.discountAmount > 0
    ? `<tr><td>Discount:</td><td class="text-right">-Rs. ${data.discountAmount.toFixed(2)}</td></tr>`
    : '';
  const vatRow = (data.vatEnabled && data.vatAmount > 0)
    ? `<tr><td>VAT (${vatPct}%):</td><td class="text-right">Rs. ${data.vatAmount.toFixed(2)}</td></tr>`
    : '';
  const servedRow = servedBy
    ? `<tr><td colspan="2"><strong>Served By:</strong> ${servedBy}</td></tr>`
    : '';

  return `
    <div class="header">
      <h2>${data.cafeName}</h2>
      ${data.cafeAddress ? `<p>${data.cafeAddress}</p>` : ''}
      ${data.cafePan ? `<p>PAN: ${data.cafePan}</p>` : ''}
      <p><strong>PRE-BILL / FOR VERIFICATION ONLY</strong></p>
    </div>
    <div class="divider"></div>
    <table class="meta-table">
      <tr>
        <td><strong>Table:</strong> ${tableDisplayName(data.tableNumber)}</td>
        <td class="text-right"><strong>Date:</strong> ${dateStr}</td>
      </tr>
      ${servedRow}
    </table>
    <div class="divider"></div>
    <table class="items-table">
      <thead>
        <tr>
          <th style="width:8%">SN</th>
          <th style="width:52%;text-align:left">Particulars</th>
          <th style="width:16%;text-align:right">Qty</th>
          <th style="width:24%;text-align:right">Amt</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <table class="totals-table">
      <tr><td>Basic Amount:</td><td class="text-right">Rs. ${data.subtotal.toFixed(2)}</td></tr>
      ${discountRow}
      <tr><td>Taxable Amount:</td><td class="text-right">Rs. ${taxableAmount.toFixed(2)}</td></tr>
      ${vatRow}
      <tr class="grand-total"><td>TOTAL:</td><td class="text-right">Rs. ${data.total.toFixed(2)}</td></tr>
    </table>
    <div class="divider"></div>
    <p class="watermark">** SUBJECT TO CHANGE BEFORE FINAL BILL **</p>`;
}

// ── TAX_INVOICE HTML builder ──────────────────────────────────────────────────

function buildTaxInvoiceHtml(data: TaxInvoiceData): string {
  const dateStr = format(data.timestamp, 'dd/MM/yyyy');
  const timeStr = format(data.timestamp, 'hh:mm aa');
  const taxableAmount = data.subtotal - data.discountAmount;
  const vatPct = Math.round((data.vatRate ?? 0.13) * 100);

  const liveStaff = useStaffStore.getState().currentUser?.name || 'Cashier Desk';
  const servedBy  = data.takenBy?.name    || data.takenBy?.fullName    || data.serverName  || '';
  const cashier   = data.processedBy?.name || data.processedBy?.fullName || data.cashierName || liveStaff;

  const itemRows = data.items.map((item, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${item.name}</td>
      <td class="text-right">${item.quantity}</td>
      <td class="text-right">${item.price.toFixed(0)}</td>
      <td class="text-right">${(item.price * item.quantity).toFixed(0)}</td>
    </tr>`).join('');

  const discountRow = data.discountAmount > 0
    ? `<tr><td>Discount:</td><td class="text-right" colspan="4">-Rs. ${data.discountAmount.toFixed(2)}</td></tr>`
    : '';
  const vatRow = (data.vatEnabled && data.vatAmount > 0)
    ? `<tr><td>VAT (${vatPct}%):</td><td class="text-right" colspan="4">Rs. ${data.vatAmount.toFixed(2)}</td></tr>`
    : '';
  const servedRow = servedBy
    ? `<tr><td colspan="2"><strong>Served By:</strong> ${servedBy}</td></tr>`
    : '';

  return `
    <div class="header">
      <h2>${data.cafeName}</h2>
      ${data.cafeAddress ? `<p>${data.cafeAddress}</p>` : ''}
      ${data.cafePan ? `<p>PAN: ${data.cafePan}</p>` : ''}
    </div>
    <div class="divider"></div>
    <div class="text-center bold" style="font-size:12px;letter-spacing:1px;margin-bottom:4px">TAX INVOICE</div>
    <div class="divider"></div>
    <table class="meta-table">
      <tr>
        <td><strong>Payment:</strong> ${data.method}</td>
        <td class="text-right"><strong>Date:</strong> ${dateStr}</td>
      </tr>
      <tr>
        <td><strong>Bill No:</strong> #${data.billNumber}</td>
        <td class="text-right"><strong>Table:</strong> ${tableDisplayName(data.tableNumber)}</td>
      </tr>
      ${servedRow}
    </table>
    <div class="divider"></div>
    <table class="items-table">
      <thead>
        <tr>
          <th style="width:8%">SN</th>
          <th style="width:42%">Particulars</th>
          <th style="width:10%;text-align:right">Qty</th>
          <th style="width:18%;text-align:right">Rate</th>
          <th style="width:22%;text-align:right">Amt</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <table class="totals-table">
      <tr><td>Basic Amount:</td><td class="text-right">Rs. ${data.subtotal.toFixed(2)}</td></tr>
      ${discountRow}
      <tr><td>Taxable Amount:</td><td class="text-right">Rs. ${taxableAmount.toFixed(2)}</td></tr>
      ${vatRow}
      <tr class="grand-total"><td>TOTAL:</td><td class="text-right">Rs. ${data.total.toFixed(2)}</td></tr>
    </table>
    <div class="divider"></div>
    <div class="inwords">In words: ${numberToWords(Math.round(data.total))}</div>
    <div class="divider"></div>
    <table class="meta-table">
      <tr>
        <td>Cashier: ${cashier}</td>
        <td class="text-right">Time: ${timeStr}</td>
      </tr>
    </table>
    <div class="divider"></div>
    <div class="footer">${data.billFooter || 'Thank you for visiting!'}</div>`;
}

// ── Popup dispatcher ──────────────────────────────────────────────────────────
// Opens a minimal popup window, writes the HTML receipt, and fires window.print().

function openPrintPopup(bodyContent: string, logo?: string): void {
  const logoHtml = logo
    ? `<img src="${logo}" class="logo" />`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Print</title>
  <style>${POPUP_CSS}</style>
</head>
<body>${logoHtml}${bodyContent}</body>
</html>`;

  const win = window.open('', '_blank', 'width=420,height=700,toolbar=0,scrollbars=0,menubar=0');
  if (!win) {
    alert('Please allow popups for this site to enable printing.');
    window.dispatchEvent(new Event('print-blocked'));
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();

  // Wait for image inside popup to render before printing
  setTimeout(() => {
    win.print();
    win.close();
  }, 300);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fire a structured print job.
 *
 * Builds the correct HTML table layout for the given job type and dispatches
 * it to a dedicated popup printer window. The main-app DOM, navigation, and
 * CSS are never touched during the print cycle.
 *
 * Callers should store the job in a ref if they need to support reprints:
 *   const lastJobRef = useRef<PrintJob | null>(null);
 *   lastJobRef.current = job;
 *   firePrintJob(job);
 */
export function firePrintJob(job: PrintJob): void {
  switch (job.type) {
    case 'KITCHEN_KOT':
      openPrintPopup(buildKOTHtml(job.data));
      break;
    case 'PRE_BILL':
      openPrintPopup(
        buildPreBillHtml(job.data),
        job.data.showLogoOnBill && job.data.logo ? job.data.logo : undefined,
      );
      break;
    case 'TAX_INVOICE':
      openPrintPopup(
        buildTaxInvoiceHtml(job.data),
        job.data.showLogoOnBill && job.data.logo ? job.data.logo : undefined,
      );
      break;
  }
}
