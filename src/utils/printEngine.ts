// ─────────────────────────────────────────────────────────────────────────────
// Dual-Printer Layout Switching Engine
//
// Handles three structured print job types:
//   KITCHEN_KOT  — kitchen ticket, no financial data (Printer A: Kitchen)
//   PRE_BILL     — customer pre-bill with watermark   (Printer B: Counter)
//   TAX_INVOICE  — official sequential tax invoice    (Printer B: Counter)
//
// All layouts target 80mm thermal paper (≈ 42 mono chars wide).
// Jobs are dispatched via a popup window so the main-app DOM is never
// interrupted, no CSS @media print overrides on #root are needed.
// ─────────────────────────────────────────────────────────────────────────────

import { format } from 'date-fns';
import { numberToWords } from './printer';
import { useStaffStore } from '@/store/useStaffStore';

// ── Typed job interfaces ──────────────────────────────────────────────────────

export type PrintJobType = 'KITCHEN_KOT' | 'PRE_BILL' | 'TAX_INVOICE';

export interface KOTData {
  cafeName:    string;
  tableNumber: number;
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
  tableNumber:    number;
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
}

export interface TaxInvoiceData {
  cafeName:       string;
  cafeAddress?:   string;
  cafePan?:       string;
  billFooter?:    string;
  tableNumber:    number;
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
}

export type PrintJob =
  | { type: 'KITCHEN_KOT'; data: KOTData }
  | { type: 'PRE_BILL';    data: PreBillData }
  | { type: 'TAX_INVOICE'; data: TaxInvoiceData };

// ── Text-layout helpers (80 mm ≈ 38 chars safe printable area) ───────────────
// W=38 leaves a comfortable margin buffer so right-edge content (dates, prices)
// is not clipped by the Pantum PD-80BW's physical paper guides.

const W = 38;

function hr(char = '-'): string { return char.repeat(W); }

function center(text: string): string {
  if (text.length >= W) return text.slice(0, W);
  const pad = Math.floor((W - text.length) / 2);
  return ' '.repeat(pad) + text;
}

function formatLine(left: string, right: string): string {
  if (left.length + right.length >= W)
    return left.slice(0, W - right.length - 1) + ' ' + right;
  return left + ' '.repeat(W - left.length - right.length) + right;
}

function ljust(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s.padEnd(w);
}

function rjust(s: string | number, w: number): string {
  const str = String(s);
  return str.length >= w ? str.slice(-w) : str.padStart(w);
}

function wrapText(text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + word).length + 1 > width) { lines.push(current.trim()); current = word + ' '; }
    else current += word + ' ';
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

// ── Column widths for the item table (must sum to W = 38) ────────────────────
// SN(3) + Item(14) + Qty(4) + Rate(8) + Amt(9) = 38
const C_SN = 3; const C_ITEM = 14; const C_QTY = 4; const C_RATE = 8; const C_AMT = 9;

function itemRow(sn: string | number, name: string, qty: string | number, rate: string, amt: string): string {
  return (
    ljust(String(sn), C_SN) +
    ljust(name,       C_ITEM) +
    rjust(qty,        C_QTY) +
    rjust(rate,       C_RATE) +
    rjust(amt,        C_AMT)
  );
}

// Wraps long item names across continuation lines so nothing is truncated.
function itemRowMultiline(sn: string | number, name: string, qty: string | number, rate: string, amt: string): string[] {
  const nameLines = wrapText(name, C_ITEM);
  const rows = [
    ljust(String(sn), C_SN) + ljust(nameLines[0], C_ITEM) + rjust(qty, C_QTY) + rjust(rate, C_RATE) + rjust(amt, C_AMT),
  ];
  for (let i = 1; i < nameLines.length; i++) {
    rows.push(' '.repeat(C_SN) + nameLines[i]);
  }
  return rows;
}

// ── KITCHEN_KOT builder ───────────────────────────────────────────────────────
// Strips ALL financial data — prints only what the kitchen needs.
// Items are pre-filtered to food-only categories by the caller (OrderScreen).

function buildKOTText(data: KOTData): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  const dateStr = format(data.timestamp, 'dd/MM/yyyy');
  const timeStr = format(data.timestamp, 'hh:mm aa');

  push(hr('='));
  push(center(data.cafeName));
  push(hr('='));
  push(center('KITCHEN ORDER TICKET  (KOT)'));
  push(center(`KOT #${data.kotNumber}`));
  push(hr('='));
  push(formatLine(`Table: ${data.tableNumber}`, `Pax: ${data.pax}`));
  push(formatLine(`Date:  ${dateStr}`, timeStr));
  push(`Taken By: ${data.serverName || 'N/A'}`);
  push(hr('-'));
  // "Qty x Item" header — matches the "2 x Garlic Bread" row format below
  push(ljust('QTY', 5) + 'ITEM');
  push(hr('-'));

  for (const item of data.items) {
    // Format: "  2 x French Fries" — qty right-justified in 4 chars, then " x name"
    const qtyPart = rjust(item.quantity, 4);
    const label = `${qtyPart} x ${item.name}`;
    push(label.slice(0, W));
  }

  push(hr('-'));
  push(center('*** KITCHEN COPY  —  NO PRICING ***'));
  push(hr('='));
  push('');

  return lines.join('\n');
}

// ── PRE_BILL builder ──────────────────────────────────────────────────────────
// Full itemisation + financials, prominent watermark header.

function buildPreBillText(data: PreBillData): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  const dateStr = format(data.timestamp, 'dd/MM/yyyy');
  const taxableAmount = data.subtotal - data.discountAmount;

  push(hr('='));
  push(center(data.cafeName));
  if (data.cafeAddress) push(center(data.cafeAddress));
  if (data.cafePan)     push(center(`PAN: ${data.cafePan}`));
  push(hr('='));
  push(center('PRE-BILL / FOR VERIFICATION ONLY'));
  push(hr('='));
  push(formatLine(`Table: ${data.tableNumber}`, `Date: ${dateStr}`));
  const preBillServer = data.takenBy?.name || data.serverName;
  if (preBillServer) push(`Served By: ${preBillServer}`);
  push(hr('-'));

  push(itemRow('SN', 'Particulars', 'Qty', 'Rate', 'Amt'));
  push(hr('-'));
  data.items.forEach((item, idx) => {
    itemRowMultiline(idx + 1, item.name, item.quantity, item.price.toFixed(0), (item.price * item.quantity).toFixed(0)).forEach(push);
  });

  push(hr('-'));
  push(formatLine('Basic Amount:',    `Rs. ${data.subtotal.toFixed(2)}`));
  if (data.discountAmount > 0)
    push(formatLine('Discount:',      `-Rs. ${data.discountAmount.toFixed(2)}`));
  push(formatLine('Taxable Amount:',  `Rs. ${taxableAmount.toFixed(2)}`));
  if (data.vatEnabled && data.vatAmount > 0)
    push(formatLine(`VAT (${Math.round(data.vatRate * 100)}%):`, `Rs. ${data.vatAmount.toFixed(2)}`));
  push(hr('='));
  push(formatLine('TOTAL:', `Rs. ${data.total.toFixed(2)}`));
  push(hr('='));
  push(center('** SUBJECT TO CHANGE BEFORE FINAL BILL **'));
  push(hr('='));
  push('');

  return lines.join('\n');
}

// ── TAX_INVOICE builder ───────────────────────────────────────────────────────
// Official receipt: sequential bill no., payment channel, VAT, amount-in-words.

function buildTaxInvoiceText(data: TaxInvoiceData): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  const dateStr = format(data.timestamp, 'dd/MM/yyyy');
  const timeStr = format(data.timestamp, 'hh:mm aa');
  const taxableAmount = data.subtotal - data.discountAmount;

  push(hr('='));
  push(center(data.cafeName));
  if (data.cafeAddress) push(center(data.cafeAddress));
  if (data.cafePan)     push(center(`PAN: ${data.cafePan}`));
  push(hr('='));
  push(center('TAX INVOICE'));
  push(hr('='));
  const liveStaff = useStaffStore.getState().currentUser?.name || 'Cashier Desk';
  const servedBy = data.takenBy?.fullName     || data.takenBy?.name     || data.serverName  || data.processedBy?.fullName || data.processedBy?.name || data.cashierName || liveStaff;
  const cashier  = data.processedBy?.fullName || data.processedBy?.name || data.cashierName || data.takenBy?.fullName     || data.takenBy?.name     || data.serverName  || liveStaff;
  push(`Payment:   ${data.method}`);
  push(`Date:      ${dateStr}`);
  push(`Bill No:   #${data.billNumber}`);
  push(`Table:     ${data.tableNumber}`);
  push(`Served By: ${servedBy}`);
  push(hr('-'));

  push(itemRow('SN', 'Particulars', 'Qty', 'Rate', 'Amt'));
  push(hr('-'));
  data.items.forEach((item, idx) => {
    itemRowMultiline(idx + 1, item.name, item.quantity, item.price.toFixed(0), (item.price * item.quantity).toFixed(0)).forEach(push);
  });

  push(hr('-'));
  push(formatLine('Basic Amount:',   `Rs. ${data.subtotal.toFixed(2)}`));
  if (data.discountAmount > 0)
    push(formatLine('Discount:',     `-Rs. ${data.discountAmount.toFixed(2)}`));
  push(formatLine('Taxable Amount:', `Rs. ${taxableAmount.toFixed(2)}`));
  if (data.vatEnabled && data.vatAmount > 0)
    push(formatLine(`VAT (${Math.round(data.vatRate * 100)}%):`, `Rs. ${data.vatAmount.toFixed(2)}`));
  push(hr('='));
  push(formatLine('TOTAL:', `Rs. ${data.total.toFixed(2)}`));
  push(hr('='));
  wrapText(`In words: ${numberToWords(Math.round(data.total))}`, W).forEach(push);
  push(hr('-'));
  push(formatLine(`Cashier: ${cashier}`, `Time: ${timeStr}`));
  push(hr('='));
  push(center(data.billFooter || 'Thank you for visiting!'));
  push(hr('='));
  push('');

  return lines.join('\n');
}

// ── Popup dispatcher ──────────────────────────────────────────────────────────
// Opens a minimal popup window, writes the plain-text receipt as <pre>, and
// fires window.print(). CSS @media print in the popup hides everything except
// the receipt, matching an 80 mm thermal roll.

function openPrintPopup(text: string): void {
  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Print</title>
  <style>
    /* Physical paper: Pantum PD-80BW 80 mm roll.
       margin:0 on @page removes browser chrome margins;
       body margin 0.3cm is the safe inner printable inset. */
    @page { margin: 0; size: 80mm auto; }
    * { box-sizing: border-box; }
    body {
      margin: 0.3cm;
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      line-height: 1.2;
      color: #000000 !important;
      background: #ffffff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      -webkit-font-smoothing: none !important;
    }
    pre {
      white-space: pre;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      color: #000000 !important;
      -webkit-text-fill-color: #000000 !important;
      font-weight: 900 !important;
    }
    @media print {
      @page { margin: 0; size: 80mm auto; }
      body { margin: 0.3cm; }
      body > *:not(pre) { display: none !important; }
    }
  </style>
</head>
<body><pre>${safe}</pre></body>
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
  setTimeout(() => { win.print(); setTimeout(() => win.close(), 500); }, 350);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fire a structured print job.
 *
 * Builds the correct 80 mm plain-text layout for the given job type and
 * dispatches it to a dedicated popup printer window. The main-app DOM,
 * navigation, and CSS are never touched during the print cycle.
 *
 * Callers should store the job in a ref if they need to support reprints:
 *   const lastJobRef = useRef<PrintJob | null>(null);
 *   lastJobRef.current = job;
 *   firePrintJob(job);
 */
export function firePrintJob(job: PrintJob): void {
  let text: string;
  switch (job.type) {
    case 'KITCHEN_KOT':  text = buildKOTText(job.data);        break;
    case 'PRE_BILL':     text = buildPreBillText(job.data);    break;
    case 'TAX_INVOICE':  text = buildTaxInvoiceText(job.data); break;
  }
  openPrintPopup(text);
}
