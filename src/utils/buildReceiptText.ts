import { format } from 'date-fns';
import { numberToWords } from './printer';

// Total line width
const W = 42;

// Column widths (SN=3, Item=16, Qty=5, Rate=8, Amt=8) — sums to 40, +2 trailing fill to W
const C_SN   = 3;
const C_ITEM = 16;
const C_QTY  = 5;
const C_RATE = 8;
const C_AMT  = 8;

function hr(char = '-'): string {
  return char.repeat(W);
}

function center(text: string): string {
  if (text.length >= W) return text.slice(0, W);
  const pad = Math.floor((W - text.length) / 2);
  return ' '.repeat(pad) + text;
}

function formatLine(left: string, right: string): string {
  if (left.length + right.length >= W) {
    return (
      left.slice(0, W - right.length - 1) +
      ' ' +
      right.slice(-right.length)
    );
  }
  const space = W - left.length - right.length;
  return left + ' '.repeat(space) + right;
}

function wrapText(text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if ((current + word).length + 1 > width) {
      lines.push(current.trim());
      current = word + ' ';
    } else {
      current += word + ' ';
    }
  }

  if (current.trim()) lines.push(current.trim());

  return lines;
}

function ljust(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s.padEnd(w);
}

function rjust(s: string | number, w: number): string {
  const str = String(s);
  return str.length >= w ? str.slice(-w) : str.padStart(w);
}

function itemRow(sn: string | number, name: string, qty: string | number, rate: string, amt: string): string {
  return (
    ljust(String(sn), C_SN) +
    ljust(name,        C_ITEM) +
    rjust(qty,         C_QTY) +
    rjust(rate,        C_RATE) +
    rjust(amt,         C_AMT)
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

export interface ReceiptData {
  cafeName: string;
  cafeAddress?: string;
  cafePan?: string;
  billFooter?: string;
  tableNumber: number;
  billNumber: number;
  createdAt: number;
  items: Array<{ name: string; price: number; quantity: number }>;
  subtotal: number;
  discountAmount: number;
  vatEnabled: boolean;
  vatAmount: number;
  vatRate: number;
  total: number;
  method: string;
  /** Name of the server/waiter who took the order */
  serverName?: string;
  /** Name of the cashier who processed payment */
  cashierName?: string;
}

export function buildReceiptText(data: ReceiptData): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);

  const dateStr = format(data.createdAt, 'dd/MM/yyyy');
  const timeStr = format(data.createdAt, 'hh:mm aa');
  const taxableAmount = data.subtotal - data.discountAmount;

  // ── Cafe header ──────────────────────────────────────────────
  push(hr('='));
  push(center(data.cafeName));
  if (data.cafeAddress) push(center(data.cafeAddress));
  if (data.cafePan)     push(center(`PAN: ${data.cafePan}`));
  push(hr('='));
  push(center('TAX INVOICE'));
  push(hr('='));

  // ── Bill meta — each on its own line, left-aligned ───────────
  push(`Payment: ${data.method}`);
  push(`Date: ${dateStr}`);
  push(`Bill No: #${data.billNumber}`);
  push(`Table: ${data.tableNumber}`);
  if (data.serverName)  push(`Served By: ${data.serverName}`);
  if (data.cashierName) push(`Cashier:   ${data.cashierName}`);
  push(hr('-'));

  // ── Item table header ─────────────────────────────────────────
  push(itemRow('SN', 'Particulars', 'Qty', 'Rate', 'Amt'));
  push(hr('-'));

  // ── Item rows ────────────────────────────────────────────────
  data.items.forEach((item, idx) => {
    itemRowMultiline(
      idx + 1,
      item.name,
      item.quantity,
      item.price.toFixed(0),
      (item.price * item.quantity).toFixed(0),
    ).forEach(push);
  });

  // ── Totals ───────────────────────────────────────────────────
  push(hr('-'));
  push(formatLine('Basic Amount:', `Rs. ${data.subtotal.toFixed(2)}`));
  if (data.discountAmount > 0) {
    push(formatLine('Discount:', `-Rs. ${data.discountAmount.toFixed(2)}`));
  }
  push(formatLine('Taxable Amount:', `Rs. ${taxableAmount.toFixed(2)}`));
  if (data.vatEnabled && data.vatAmount > 0) {
    push(formatLine(`VAT (${Math.round(data.vatRate * 100)}%):`, `Rs. ${data.vatAmount.toFixed(2)}`));
  }
  push(hr('='));
  push(formatLine('TOTAL:', `Rs. ${data.total.toFixed(2)}`));
  push(hr('='));

  // ── Footer ───────────────────────────────────────────────────
  wrapText(`In words: ${numberToWords(Math.round(data.total))}`, W).forEach(push);
  push(hr('-'));
  if (data.cashierName) {
    push(formatLine(`Cashier: ${data.cashierName}`, `Time: ${timeStr}`));
  }
  push(hr('='));
  push(center(data.billFooter || 'Thank you for visiting!'));
  push(hr('='));
  push('');

  return lines.join('\n');
}
