/**
 * escpos.ts
 *
 * Zero-install ESC/POS byte-level formatter for 80mm thermal printers.
 * Produces Uint8Array buffers that can be sent directly to a network printer
 * via a WebSocket relay or a browser-based serial/USB API.
 *
 * Supported ticket types:
 *   buildKOT       — Kitchen Order Ticket
 *   buildBOT       — Bar Order Ticket
 *   buildVoidTicket — VOID_KOT / VOID_BOT cancellation slip
 *   buildPreBill   — Estimate slip before payment
 *   buildTaxInvoice — Official tax receipt
 *
 * 80mm paper = 48 characters wide in monospace at normal density.
 */

import { Ticket } from '@/types/pos';

// ── ESC/POS command constants ─────────────────────────────────────────────────

const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

/** Initialize printer (ESC @) */
const CMD_INIT       = [ESC, 0x40];
/** Full paper cut (GS V 0) */
const CMD_CUT        = [GS, 0x56, 0x00];
/** Bold ON (ESC E 1) */
const CMD_BOLD_ON    = [ESC, 0x45, 0x01];
/** Bold OFF (ESC E 0) */
const CMD_BOLD_OFF   = [ESC, 0x45, 0x00];
/** Center align (ESC a 1) */
const CMD_CENTER     = [ESC, 0x61, 0x01];
/** Left align (ESC a 0) */
const CMD_LEFT       = [ESC, 0x61, 0x00];
/** Double width + height (GS ! 0x11) */
const CMD_DOUBLE_ON  = [GS, 0x21, 0x11];
/** Normal size (GS ! 0x00) */
const CMD_DOUBLE_OFF = [GS, 0x21, 0x00];
/** Buzzer / open drawer pulse (ESC p 0 T1 T2) — triggers bell on supported printers */
const CMD_BUZZER     = [ESC, 0x70, 0x00, 0x19, 0x19];

const WIDTH = 48; // characters per line on 80mm paper

// ── Low-level helpers ─────────────────────────────────────────────────────────

function enc(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function line(text: string = ''): number[] {
  return [...enc(text), LF];
}

function divider(char = '-'): number[] {
  return line(char.repeat(WIDTH));
}

function center(text: string): number[] {
  const padded = text.length >= WIDTH ? text : text.padStart(Math.floor((WIDTH + text.length) / 2)).padEnd(WIDTH);
  return line(padded);
}

/** Left-right two-column line. Left gets leftW chars, right fills the rest. */
function twoCol(left: string, right: string, leftW = 32): number[] {
  const l = left.slice(0, leftW).padEnd(leftW);
  const r = right.slice(0, WIDTH - leftW).padStart(WIDTH - leftW);
  return line(l + r);
}

/** Word-wrap a string to WIDTH, return array of wrapped lines. */
function wrap(text: string, maxW = WIDTH): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxW) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function timestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

function concat(...parts: number[][]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    buf.set(p, offset);
    offset += p.length;
  }
  return buf;
}

// ── Public ticket builders ────────────────────────────────────────────────────

export interface EscKOTOptions {
  cafeName: string;
  ticket: Ticket;
  pax?: number;
  buzzer?: boolean;
}

/** Build a KOT (Kitchen Order Ticket) ESC/POS buffer. */
export function buildKOT({ cafeName, ticket, pax = 1, buzzer = false }: EscKOTOptions): Uint8Array {
  const parts: number[][] = [
    CMD_INIT,
    CMD_CENTER,
    CMD_BOLD_ON, CMD_DOUBLE_ON, line(cafeName), CMD_DOUBLE_OFF, CMD_BOLD_OFF,
    line('KITCHEN ORDER TICKET'),
    CMD_BOLD_ON, line(`KOT #${ticket.ticketNumber}`), CMD_BOLD_OFF,
    divider(),
    CMD_LEFT,
    twoCol(`Table: ${ticket.tableName}`, `Pax: ${pax}`),
    line(`Waiter: ${ticket.serverName || 'N/A'}`),
    ...(ticket.customerName ? [line(`Customer: ${ticket.customerName}`)] : []),
    line(`Time: ${timestamp(ticket.createdAt)}`),
    divider(),
    CMD_BOLD_ON, line('QTY  ITEM'), CMD_BOLD_OFF,
    divider('-'),
  ];

  for (const item of ticket.items) {
    const qty = String(item.quantity).padEnd(5);
    // wrap long item names
    const nameLines = wrap(item.name, WIDTH - 5);
    parts.push(line(`${qty}${nameLines[0] || ''}`));
    for (let i = 1; i < nameLines.length; i++) {
      parts.push(line(`     ${nameLines[i]}`));
    }
    if (item.notes) {
      parts.push(line(`     >> ${item.notes}`));
    }
  }

  parts.push(
    divider(),
    CMD_CENTER,
    line('*** KITCHEN COPY — NO PRICING ***'),
    line(''),
    line(''),
  );

  if (buzzer) parts.push(CMD_BUZZER);
  parts.push(CMD_CUT);

  return concat(...parts);
}

export interface EscBOTOptions {
  cafeName: string;
  ticket: Ticket;
  pax?: number;
}

/** Build a BOT (Bar Order Ticket) ESC/POS buffer. */
export function buildBOT({ cafeName, ticket, pax = 1 }: EscBOTOptions): Uint8Array {
  const parts: number[][] = [
    CMD_INIT,
    CMD_CENTER,
    CMD_BOLD_ON, CMD_DOUBLE_ON, line(cafeName), CMD_DOUBLE_OFF, CMD_BOLD_OFF,
    line('BAR / RECEPTION ORDER TICKET'),
    CMD_BOLD_ON, line(`BOT #${ticket.ticketNumber}`), CMD_BOLD_OFF,
    divider(),
    CMD_LEFT,
    twoCol(`Table: ${ticket.tableName}`, `Pax: ${pax}`),
    line(`Waiter: ${ticket.serverName || 'N/A'}`),
    ...(ticket.customerName ? [line(`Customer: ${ticket.customerName}`)] : []),
    line(`Time: ${timestamp(ticket.createdAt)}`),
    divider(),
    CMD_BOLD_ON, line('QTY  ITEM'), CMD_BOLD_OFF,
    divider('-'),
  ];

  for (const item of ticket.items) {
    const qty = String(item.quantity).padEnd(5);
    const nameLines = wrap(item.name, WIDTH - 5);
    parts.push(line(`${qty}${nameLines[0] || ''}`));
    for (let i = 1; i < nameLines.length; i++) {
      parts.push(line(`     ${nameLines[i]}`));
    }
    if (item.notes) {
      parts.push(line(`     >> ${item.notes}`));
    }
  }

  parts.push(
    divider(),
    CMD_CENTER,
    line('*** BAR COPY — NO PRICING ***'),
    line(''),
    line(''),
    CMD_CUT,
  );

  return concat(...parts);
}

export interface EscVoidOptions {
  cafeName: string;
  ticket: Ticket;
}

/** Build a VOID_KOT or VOID_BOT cancellation slip ESC/POS buffer. */
export function buildVoidTicket({ cafeName, ticket }: EscVoidOptions): Uint8Array {
  const isKitchen = ticket.ticketType === 'VOID_KOT';
  const label = isKitchen ? 'KITCHEN' : 'BAR';

  const parts: number[][] = [
    CMD_INIT,
    CMD_CENTER,
    CMD_BOLD_ON, CMD_DOUBLE_ON, line('** VOID / CANCELLED **'), CMD_DOUBLE_OFF,
    line(cafeName),
    line(`${label} VOID TICKET #${ticket.ticketNumber}`),
    CMD_BOLD_OFF,
    divider(),
    CMD_LEFT,
    line(`Table: ${ticket.tableName}`),
    line(`Waiter: ${ticket.serverName || 'N/A'}`),
    line(`Voided By: ${ticket.voidedBy || 'N/A'}`),
    line(`Time: ${timestamp(ticket.createdAt)}`),
    divider(),
    CMD_BOLD_ON, line('QTY  ITEM'), CMD_BOLD_OFF,
    divider('-'),
  ];

  for (const item of ticket.items) {
    const qty = String(item.quantity).padEnd(5);
    const nameLines = wrap(item.name, WIDTH - 5);
    parts.push(line(`${qty}${nameLines[0] || ''}`));
    for (let i = 1; i < nameLines.length; i++) {
      parts.push(line(`     ${nameLines[i]}`));
    }
  }

  parts.push(
    divider(),
    ...(ticket.voidReason ? [CMD_BOLD_ON, line(`REASON: ${ticket.voidReason}`), CMD_BOLD_OFF] : []),
    CMD_CENTER,
    line('*** CANCELLATION RECORD ***'),
    line(''),
    line(''),
    CMD_CUT,
  );

  return concat(...parts);
}

export interface EscPreBillOptions {
  cafeName: string;
  cafeAddress?: string;
  cafePan?: string;
  tableNumber: string;
  serverName?: string;
  items: Array<{ name: string; price: number; quantity: number }>;
  subtotal: number;
  discountAmount: number;
  vatEnabled: boolean;
  vatAmount: number;
  vatRate: number;
  total: number;
  timestamp: number;
}

/** Build a pre-bill estimate ESC/POS buffer. */
export function buildPreBill(data: EscPreBillOptions): Uint8Array {
  const dt = timestamp(new Date(data.timestamp).toISOString());
  const vatPct = Math.round((data.vatRate ?? 0.13) * 100);

  const parts: number[][] = [
    CMD_INIT,
    CMD_CENTER,
    CMD_BOLD_ON, CMD_DOUBLE_ON, line(data.cafeName), CMD_DOUBLE_OFF, CMD_BOLD_OFF,
    ...(data.cafeAddress ? [center(data.cafeAddress)] : []),
    ...(data.cafePan ? [center(`PAN: ${data.cafePan}`)] : []),
    line('PRE-BILL / FOR VERIFICATION ONLY'),
    divider(),
    CMD_LEFT,
    twoCol(`Table: ${data.tableNumber}`, dt, 24),
    ...(data.serverName ? [line(`Served By: ${data.serverName}`)] : []),
    divider(),
    CMD_BOLD_ON, ...twoColHeader(), CMD_BOLD_OFF,
    divider('-'),
  ];

  let sn = 1;
  for (const item of data.items) {
    const amt = (item.price * item.quantity).toFixed(0);
    const nameLines = wrap(`${sn++}. ${item.name}`, 30);
    const firstLine = nameLines[0].padEnd(30) + String(item.quantity).padStart(4) + amt.padStart(8);
    parts.push(line(firstLine.slice(0, WIDTH)));
    for (let i = 1; i < nameLines.length; i++) {
      parts.push(line(`   ${nameLines[i]}`));
    }
  }

  parts.push(
    divider(),
    ...twoColTotals('Basic Amount:', `Rs. ${data.subtotal.toFixed(2)}`),
    ...(data.discountAmount > 0
      ? twoColTotals('Discount:', `-Rs. ${data.discountAmount.toFixed(2)}`)
      : []),
    ...(data.vatEnabled && data.vatAmount > 0
      ? twoColTotals(`VAT (${vatPct}%):`, `Rs. ${data.vatAmount.toFixed(2)}`)
      : []),
    CMD_BOLD_ON, ...twoColTotals('TOTAL:', `Rs. ${data.total.toFixed(2)}`), CMD_BOLD_OFF,
    divider(),
    CMD_CENTER,
    line('** SUBJECT TO CHANGE BEFORE FINAL BILL **'),
    line(''),
    line(''),
    CMD_CUT,
  );

  return concat(...parts);
}

export interface EscTaxInvoiceOptions {
  cafeName: string;
  cafeAddress?: string;
  cafePan?: string;
  billFooter?: string;
  tableNumber: string;
  billNumber: number;
  serverName?: string;
  cashierName?: string;
  method: string;
  items: Array<{ name: string; price: number; quantity: number }>;
  subtotal: number;
  discountAmount: number;
  vatEnabled: boolean;
  vatAmount: number;
  vatRate: number;
  total: number;
  dueSettlement?: { customerName?: string; amount: number };
  amountTendered?: number;
  creditSettlement?: { customerName?: string; amount: number };
  timestamp: number;
}

/** Build a final Tax Invoice ESC/POS buffer. */
export function buildTaxInvoice(data: EscTaxInvoiceOptions): Uint8Array {
  const dt = timestamp(new Date(data.timestamp).toISOString());
  const vatPct = Math.round((data.vatRate ?? 0.13) * 100);
  const settlementAmt = data.dueSettlement?.amount ?? 0;
  const collected = data.amountTendered ?? data.total + settlementAmt;

  const parts: number[][] = [
    CMD_INIT,
    CMD_CENTER,
    CMD_BOLD_ON, CMD_DOUBLE_ON, line(data.cafeName), CMD_DOUBLE_OFF, CMD_BOLD_OFF,
    ...(data.cafeAddress ? [center(data.cafeAddress)] : []),
    ...(data.cafePan ? [center(`PAN: ${data.cafePan}`)] : []),
    CMD_BOLD_ON, line('TAX INVOICE'), CMD_BOLD_OFF,
    divider(),
    CMD_LEFT,
    twoCol(`Payment: ${data.method}`, dt, 24),
    twoCol(`Bill No: #${data.billNumber}`, `Table: ${data.tableNumber}`, 24),
    ...(data.serverName ? [line(`Served By: ${data.serverName}`)] : []),
    ...(data.cashierName ? [line(`Cashier: ${data.cashierName}`)] : []),
    divider(),
    CMD_BOLD_ON, ...twoColHeaderFull(), CMD_BOLD_OFF,
    divider('-'),
  ];

  let sn = 1;
  for (const item of data.items) {
    const amt = (item.price * item.quantity).toFixed(0);
    const rate = item.price.toFixed(0);
    const nameLines = wrap(`${sn++}. ${item.name}`, 26);
    const firstLine = nameLines[0].padEnd(26)
      + String(item.quantity).padStart(4)
      + rate.padStart(8)
      + amt.padStart(8);
    parts.push(line(firstLine.slice(0, WIDTH)));
    for (let i = 1; i < nameLines.length; i++) {
      parts.push(line(`   ${nameLines[i]}`));
    }
  }

  parts.push(
    divider(),
    ...twoColTotals('Basic Amount:', `Rs. ${data.subtotal.toFixed(2)}`),
    ...(data.discountAmount > 0
      ? twoColTotals('Discount:', `-Rs. ${data.discountAmount.toFixed(2)}`)
      : []),
    ...(data.vatEnabled && data.vatAmount > 0
      ? twoColTotals(`VAT (${vatPct}%):`, `Rs. ${data.vatAmount.toFixed(2)}`)
      : []),
    CMD_BOLD_ON, ...twoColTotals('TOTAL:', `Rs. ${data.total.toFixed(2)}`), CMD_BOLD_OFF,
    ...(settlementAmt > 0
      ? [
          ...twoColTotals(
            `Prev Due${data.dueSettlement?.customerName ? ` (${data.dueSettlement.customerName})` : ''}:`,
            `Rs. ${settlementAmt.toFixed(2)}`,
          ),
          CMD_BOLD_ON,
          ...twoColTotals('AMOUNT PAID:', `Rs. ${collected.toFixed(2)}`),
          CMD_BOLD_OFF,
        ]
      : []),
    ...(data.creditSettlement
      ? twoColTotals(
          `Added to Due${data.creditSettlement.customerName ? ` (${data.creditSettlement.customerName})` : ''}:`,
          `Rs. ${data.creditSettlement.amount.toFixed(2)}`,
        )
      : []),
    divider(),
    CMD_CENTER,
    line(data.billFooter || 'Thank you for visiting!'),
    line(''),
    line(''),
    CMD_CUT,
  );

  return concat(...parts);
}

// ── Private column helpers ────────────────────────────────────────────────────

function twoColHeader(): number[][] {
  const h = 'QTY'.padStart(4) + 'AMT'.padStart(8);
  return [line(`${'ITEM'.padEnd(WIDTH - 12)}${h}`)];
}

function twoColHeaderFull(): number[][] {
  const h = 'QTY'.padStart(4) + 'RATE'.padStart(8) + 'AMT'.padStart(8);
  return [line(`${'ITEM'.padEnd(WIDTH - 20)}${h}`)];
}

function twoColTotals(label: string, value: string): number[][] {
  return [twoCol(label, value, WIDTH - value.length - 1)];
}

// ── Network print dispatcher ──────────────────────────────────────────────────

/**
 * Send an ESC/POS buffer to a network printer at `ip:port` via a
 * browser-accessible WebSocket relay.  The relay listens on ws://ip:port/ws
 * and proxies raw bytes to the TCP socket.
 *
 * If no relay is reachable the function falls back gracefully (no throw).
 * For now the implementation is a no-op stub — real relay integration
 * requires a sidecar service (e.g. node-escpos-server) running on the LAN.
 *
 * The hook usePrintQueue calls this for KOT/BOT/VOID tickets when the
 * autoPrint listener is enabled on this terminal.
 */
export async function sendToNetworkPrinter(
  buffer: Uint8Array,
  ip: string,
  port = 9100,
): Promise<'ok' | 'error'> {
  const wsUrl = `ws://${ip}:${port}/ws`;
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      const timer = setTimeout(() => {
        ws.close();
        resolve('error');
      }, 4000);
      ws.onopen = () => {
        ws.send(buffer);
        clearTimeout(timer);
        setTimeout(() => { ws.close(); resolve('ok'); }, 200);
      };
      ws.onerror = () => { clearTimeout(timer); resolve('error'); };
    } catch {
      resolve('error');
    }
  });
}
