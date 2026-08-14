/**
 * browserPrint.ts
 *
 * System / Browser Print path for the 80mm thermal receipt pipeline.
 *
 * Renders structured receipt data as a clean HTML page styled for an 80mm
 * thermal roll (Pantum PD-80BW or any Windows-recognised thermal printer)
 * and delivers it to the OS print dialog via an invisible iframe.
 *
 * Rules:
 *   - @page sets size: 80mm auto with zero margins — suppresses browser
 *     headers/footers on all Chromium and Firefox builds.
 *   - window.print() is only called from inside the hidden iframe, so the
 *     main app UI is never disrupted.
 *   - All failures resolve false; nothing throws.
 *
 * Exported surface:
 *   browserPrintBOT(data)         — Bar Order Ticket
 *   browserPrintPreBill(data)     — Pre-bill / estimate slip
 *   browserPrintTaxInvoice(data)  — Final tax invoice / receipt
 */

import type { EscBOTOptions, EscPreBillOptions, EscTaxInvoiceOptions } from '@/utils/escpos';

// ── Shared CSS ────────────────────────────────────────────────────────────────

const RECEIPT_CSS = `
  @page {
    size: 80mm auto;
    margin: 0;
  }
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  html, body {
    width: 80mm;
    background: #fff;
    color: #000;
    font-family: 'Courier New', Courier, monospace;
    font-size: 9.5pt;
    line-height: 1.4;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .receipt {
    width: 80mm;
    padding: 4mm 3mm 8mm;
  }
  .center { text-align: center; }
  .right  { text-align: right;  }
  .bold   { font-weight: bold;  }
  .cafe-name {
    font-size: 13.5pt;
    font-weight: bold;
    text-align: center;
    margin-bottom: 1mm;
  }
  .cafe-sub {
    font-size: 8.5pt;
    text-align: center;
    margin-bottom: 0.5mm;
  }
  .doc-title {
    font-size: 10pt;
    font-weight: bold;
    text-align: center;
    margin: 1.5mm 0;
    letter-spacing: 0.5px;
  }
  hr {
    border: none;
    border-top: 1px dashed #000;
    margin: 2mm 0;
  }
  hr.solid {
    border-top: 1px solid #000;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    font-size: 8.5pt;
    margin-bottom: 0.8mm;
  }
  table.items {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1mm;
  }
  table.items thead th {
    font-size: 8.5pt;
    font-weight: bold;
    padding: 0.5mm 0;
    border-bottom: 1px solid #000;
  }
  table.items thead th.r { text-align: right; }
  table.items tbody td {
    font-size: 9pt;
    padding: 1mm 0;
    vertical-align: top;
  }
  table.items tbody td.r {
    text-align: right;
    white-space: nowrap;
    padding-left: 2mm;
  }
  table.items tbody td.name {
    padding-right: 2mm;
    word-break: break-word;
  }
  .totals {
    margin-top: 1mm;
    width: 100%;
  }
  .totals .t-row {
    display: flex;
    justify-content: space-between;
    font-size: 9pt;
    padding: 0.5mm 0;
  }
  .totals .t-row.grand {
    font-weight: bold;
    font-size: 11pt;
    border-top: 1px solid #000;
    margin-top: 1mm;
    padding-top: 1.5mm;
  }
  .totals .t-row.settlement {
    font-style: italic;
    font-size: 8.5pt;
  }
  .footer {
    text-align: center;
    font-size: 8.5pt;
    margin-top: 4mm;
  }
  /* KOT/BOT item list */
  .ticket-items { margin-top: 1mm; }
  .ticket-item {
    display: flex;
    gap: 2mm;
    margin-bottom: 1.5mm;
    font-size: 9.5pt;
  }
  .ticket-item .tqty {
    flex-shrink: 0;
    font-weight: bold;
    min-width: 8mm;
  }
  .ticket-item .tname {
    flex: 1;
    word-break: break-word;
  }
  .ticket-item .tnotes {
    font-size: 8pt;
    color: #333;
    margin-top: 0.5mm;
    margin-left: 10mm;
    font-style: italic;
  }
  .notice {
    text-align: center;
    font-size: 8pt;
    margin-top: 2mm;
    font-style: italic;
  }
`;

// ── Core printer ──────────────────────────────────────────────────────────────

function buildFullHTML(bodyHTML: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>${RECEIPT_CSS}</style>
</head>
<body>
<div class="receipt">
${bodyHTML}
</div>
</body>
</html>`;
}

/**
 * Deliver an HTML receipt string to the appropriate print path:
 *
 *   Electron desktop app → window.electronAPI.printSilent()
 *     The Electron main process opens a hidden off-screen BrowserWindow,
 *     loads the HTML, and calls webContents.print({ silent: true }) —
 *     zero dialogs, zero previews, direct to the Windows default printer.
 *
 *   Web / mobile browsers → hidden iframe + window.print()
 *     Opens the OS print dialog pre-styled for 80mm thermal paper.
 *     The caller (System/Browser Print mode) has already explained to the
 *     user that a dialog will appear.
 */
function fireBrowserPrint(html: string): Promise<boolean> {
  // ── Electron path ──────────────────────────────────────────────────────────
  if (typeof window !== 'undefined' && window.electronAPI?.printSilent) {
    try {
      window.electronAPI.printSilent(html);
      return Promise.resolve(true);
    } catch (err) {
      console.warn('[browserPrint] electronAPI.printSilent threw:', err);
      return Promise.resolve(false);
    }
  }

  // ── Web / mobile path (iframe + window.print) ──────────────────────────────
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;left:-99999px;top:-99999px;width:0;height:0;border:none;visibility:hidden;';
    document.body.appendChild(iframe);

    const cleanup = () => {
      try { document.body.removeChild(iframe); } catch { /* already removed */ }
    };

    try {
      const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (!doc) { cleanup(); resolve(false); return; }

      doc.open();
      doc.write(html);
      doc.close();

      // Give the iframe time to parse styles before printing.
      const doPrint = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          resolve(true);
        } catch (err) {
          console.warn('[browserPrint] window.print() failed:', err);
          resolve(false);
        } finally {
          // Remove iframe after a short delay so the print job is queued.
          setTimeout(cleanup, 1500);
        }
      };

      if (iframe.contentDocument?.readyState === 'complete') {
        doPrint();
      } else {
        iframe.addEventListener('load', doPrint, { once: true });
        // Fallback if load event doesn't fire (some browsers don't for srcdoc).
        setTimeout(doPrint, 400);
      }
    } catch (err) {
      console.warn('[browserPrint] iframe setup failed:', err);
      cleanup();
      resolve(false);
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(ts: number | string): string {
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtRs(n: number): string {
  return `Rs. ${n.toFixed(2)}`;
}

// ── BOT (Bar Order Ticket) ────────────────────────────────────────────────────

export async function browserPrintBOT({ cafeName, ticket, pax = 1 }: EscBOTOptions): Promise<boolean> {
  const itemRows = ticket.items.map((item) => `
    <div class="ticket-item">
      <div class="tqty">${item.quantity}×</div>
      <div class="tname">
        ${esc(item.name)}
        ${item.notes ? `<div class="tnotes">&raquo; ${esc(item.notes)}</div>` : ''}
      </div>
    </div>`).join('');

  const body = `
    <div class="cafe-name">${esc(cafeName)}</div>
    <div class="doc-title">BAR / RECEPTION ORDER TICKET</div>
    <div class="doc-title">BOT #${ticket.ticketNumber}</div>
    <hr>
    <div class="meta-row"><span>Table: <b>${esc(ticket.tableName)}</b></span><span>Pax: ${pax}</span></div>
    <div class="meta-row"><span>Waiter: ${esc(ticket.serverName || 'N/A')}</span><span>${formatDate(ticket.createdAt)}</span></div>
    ${ticket.customerName ? `<div class="meta-row"><span>Customer: ${esc(ticket.customerName)}</span></div>` : ''}
    <hr>
    <div class="bold" style="font-size:8.5pt;margin-bottom:1mm;">QTY  ITEM</div>
    <hr class="solid">
    <div class="ticket-items">${itemRows}</div>
    <hr>
    <div class="notice">*** BAR COPY — NO PRICING ***</div>
  `;

  return fireBrowserPrint(buildFullHTML(body));
}

// ── Pre-Bill ──────────────────────────────────────────────────────────────────

export async function browserPrintPreBill(data: EscPreBillOptions): Promise<boolean> {
  const vatPct = Math.round((data.vatRate ?? 0.13) * 100);

  const itemRows = data.items.map((item, i) => `
    <tr>
      <td class="name">${i + 1}. ${esc(item.name)}</td>
      <td class="r">${item.quantity}</td>
      <td class="r">${fmtRs(item.price * item.quantity)}</td>
    </tr>`).join('');

  const body = `
    <div class="cafe-name">${esc(data.cafeName)}</div>
    ${data.cafeAddress ? `<div class="cafe-sub">${esc(data.cafeAddress)}</div>` : ''}
    ${data.cafePan ? `<div class="cafe-sub">PAN: ${esc(data.cafePan)}</div>` : ''}
    <div class="doc-title">PRE-BILL / FOR VERIFICATION ONLY</div>
    <hr>
    <div class="meta-row">
      <span>Table: <b>${esc(data.tableNumber)}</b></span>
      <span>${formatDate(data.timestamp)}</span>
    </div>
    ${data.serverName ? `<div class="meta-row"><span>Served By: ${esc(data.serverName)}</span></div>` : ''}
    <hr>
    <table class="items">
      <thead>
        <tr>
          <th>ITEM</th>
          <th class="r">QTY</th>
          <th class="r">AMT</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <hr>
    <div class="totals">
      <div class="t-row"><span>Basic Amount:</span><span>${fmtRs(data.subtotal)}</span></div>
      ${data.discountAmount > 0 ? `<div class="t-row"><span>Discount:</span><span>-${fmtRs(data.discountAmount)}</span></div>` : ''}
      ${data.vatEnabled && data.vatAmount > 0 ? `<div class="t-row"><span>VAT (${vatPct}%):</span><span>${fmtRs(data.vatAmount)}</span></div>` : ''}
      <div class="t-row grand"><span>TOTAL:</span><span>${fmtRs(data.total)}</span></div>
    </div>
    <div class="notice">** SUBJECT TO CHANGE BEFORE FINAL BILL **</div>
  `;

  return fireBrowserPrint(buildFullHTML(body));
}

// ── Tax Invoice ───────────────────────────────────────────────────────────────

export async function browserPrintTaxInvoice(data: EscTaxInvoiceOptions): Promise<boolean> {
  const vatPct = Math.round((data.vatRate ?? 0.13) * 100);
  const settlementAmt = data.dueSettlement?.amount ?? 0;
  const collected = data.amountTendered ?? data.total + settlementAmt;

  const itemRows = data.items.map((item, i) => `
    <tr>
      <td class="name">${i + 1}. ${esc(item.name)}</td>
      <td class="r">${item.quantity}</td>
      <td class="r">${fmtRs(item.price)}</td>
      <td class="r">${fmtRs(item.price * item.quantity)}</td>
    </tr>`).join('');

  const creditRow = data.creditSettlement
    ? `<div class="t-row settlement">
        <span>Added to Due${data.creditSettlement.customerName ? ` (${esc(data.creditSettlement.customerName)})` : ''}:</span>
        <span>${fmtRs(data.creditSettlement.amount)}</span>
       </div>`
    : '';

  const dueRows = settlementAmt > 0
    ? `<div class="t-row settlement">
        <span>Prev Due${data.dueSettlement?.customerName ? ` (${esc(data.dueSettlement.customerName)})` : ''}:</span>
        <span>${fmtRs(settlementAmt)}</span>
       </div>
       <div class="t-row grand"><span>AMOUNT PAID:</span><span>${fmtRs(collected)}</span></div>`
    : '';

  const body = `
    <div class="cafe-name">${esc(data.cafeName)}</div>
    ${data.cafeAddress ? `<div class="cafe-sub">${esc(data.cafeAddress)}</div>` : ''}
    ${data.cafePan ? `<div class="cafe-sub">PAN: ${esc(data.cafePan)}</div>` : ''}
    <div class="doc-title">TAX INVOICE</div>
    <hr>
    <div class="meta-row">
      <span>Payment: <b>${esc(data.method)}</b></span>
      <span>${formatDate(data.timestamp)}</span>
    </div>
    <div class="meta-row">
      <span>Bill No: <b>#${data.billNumber}</b></span>
      <span>Table: ${esc(data.tableNumber)}</span>
    </div>
    ${data.serverName ? `<div class="meta-row"><span>Served By: ${esc(data.serverName)}</span></div>` : ''}
    ${data.cashierName ? `<div class="meta-row"><span>Cashier: ${esc(data.cashierName)}</span></div>` : ''}
    <hr>
    <table class="items">
      <thead>
        <tr>
          <th>ITEM</th>
          <th class="r">QTY</th>
          <th class="r">RATE</th>
          <th class="r">AMT</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <hr>
    <div class="totals">
      <div class="t-row"><span>Basic Amount:</span><span>${fmtRs(data.subtotal)}</span></div>
      ${data.discountAmount > 0 ? `<div class="t-row"><span>Discount:</span><span>-${fmtRs(data.discountAmount)}</span></div>` : ''}
      ${data.vatEnabled && data.vatAmount > 0 ? `<div class="t-row"><span>VAT (${vatPct}%):</span><span>${fmtRs(data.vatAmount)}</span></div>` : ''}
      <div class="t-row grand"><span>TOTAL:</span><span>${fmtRs(data.total)}</span></div>
      ${dueRows}
      ${creditRow}
    </div>
    <div class="footer">${esc(data.billFooter || 'Thank you for visiting!')}</div>
  `;

  return fireBrowserPrint(buildFullHTML(body));
}
