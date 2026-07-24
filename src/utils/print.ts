import { format } from 'date-fns';
import { numberToWords } from './printer';
import { useStaffStore } from '@/store/useStaffStore';
import { tableDisplayName } from '@/utils/tableName';
import type { ReceiptData } from './buildReceiptText';

// ── Module-level store ────────────────────────────────────────────────────────

let _receiptData: ReceiptData | null = null;
let _logo: string | null = null;
let _showLogo: boolean = false;

export function setReceiptData(data: ReceiptData) {
  _receiptData = data;
}

/** @deprecated — migrate callers to setReceiptData */
export function setReceiptText(_text: string) {
  // no-op: HTML layout is now built from structured data via setReceiptData
}

export function setLogoForPrint(logo: string | null, showLogo: boolean) {
  _logo = logo;
  _showLogo = showLogo;
}

export function isReceiptTextReady(): boolean {
  return !!_receiptData;
}

// ── Shared popup CSS ──────────────────────────────────────────────────────────

const POPUP_CSS = `
  @page { size: 80mm auto; margin: 0mm !important; }
  * { box-sizing: border-box !important; color: #000000 !important; }
  body {
    font-family: Consolas, 'Courier New', Courier, monospace !important;
    font-size: 11.5px !important;
    line-height: 1.35 !important;
    letter-spacing: 0.2px !important;
    color: #000000 !important;
    margin: 0 !important;
    padding: 0 1mm !important;
    width: 70mm !important;
    max-width: 70mm !important;
    overflow: hidden !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    text-rendering: optimizeLegibility !important;
    -webkit-font-smoothing: antialiased !important;
  }
  table {
    width: 100% !important;
    table-layout: fixed !important;
    border-collapse: collapse !important;
    color: #000000 !important;
  }
  td, th { word-break: break-word !important; overflow: hidden !important; color: #000000 !important; }
  .header { text-align: center; margin-bottom: 8px; color: #000000 !important; }
  .header h2 { margin: 0; font-size: 13px; font-weight: bold; color: #000000 !important; }
  .header p { margin: 2px 0; font-size: 11.5px; color: #000000 !important; }
  .meta-table td { font-size: 11.5px; padding: 1px 0; color: #000000 !important; }
  .items-table th {
    border-top: 1px dashed #000;
    border-bottom: 1px dashed #000;
    font-size: 11.5px;
    padding: 3px 0;
    text-align: left;
    color: #000000 !important;
  }
  .items-table td { font-size: 11.5px; padding: 2px 0; vertical-align: top; color: #000000 !important; }
  .totals-table { width: 100% !important; table-layout: auto !important; border-collapse: collapse !important; border-top: 1px dashed #000; margin-top: 4px; }
  .totals-table td { font-size: 11.5px !important; padding: 1px 0; white-space: nowrap !important; color: #000000 !important; }
  .totals-table td:first-child { text-align: left !important; }
  .totals-table td:last-child { text-align: right !important; }
  .grand-total td { font-size: 12px !important; font-weight: bold; border-top: 1px solid #000; padding-top: 3px; color: #000000 !important; }
  .text-right { text-align: right !important; padding-right: 0 !important; }
  .text-center { text-align: center !important; }
  .bold { font-weight: bold !important; color: #000000 !important; }
  .receipt-logo { max-width: 45mm; max-height: 20mm; display: block; margin: 0 auto 4px auto;
                  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .divider { border-top: 1px dashed #000; margin: 3px 0; }
  .footer { text-align: center; font-size: 11.5px; margin-top: 5px; color: #000000 !important; }
  .inwords { font-size: 11.5px; margin: 3px 0; color: #000000 !important; }
`;

// ── HTML builder ──────────────────────────────────────────────────────────────

function buildReceiptHtml(data: ReceiptData, logo: string | null, showLogo: boolean): string {
  const dateStr = format(data.createdAt, 'dd/MM/yyyy');
  const timeStr = format(data.createdAt, 'hh:mm aa');
  const taxableAmount = data.subtotal - data.discountAmount;
  const vatPct = Math.round((data.vatRate ?? 0.13) * 100);

  const liveStaff = useStaffStore.getState().currentUser?.name || 'Cashier Desk';
  const servedBy = data.takenBy?.name || data.takenBy?.fullName || data.processedBy?.name || '';
  const cashier  = data.processedBy?.name || data.processedBy?.fullName || data.cashierName || liveStaff;

  const logoHtml = showLogo && logo
    ? `<img src="${logo}" class="receipt-logo" style="display: block !important; margin: 0 auto 4px auto; max-width: 45mm; max-height: 20mm; visibility: visible !important;" />`
    : '';

  const itemRows = data.items.map((item, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${item.name}</td>
      <td class="text-right">${item.quantity}</td>
      <td class="text-right">${item.price.toFixed(0)}</td>
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

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${POPUP_CSS}</style>
</head>
<body>
  ${logoHtml}
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
  <div class="footer">${data.billFooter || 'Thank you for visiting!'}</div>
</body>
</html>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function triggerPrint(_mode: 'receipt' | 'invoice') {
  if (!_receiptData) {
    console.warn('triggerPrint: no receipt data available yet');
    return;
  }

  const html = buildReceiptHtml(_receiptData, _logo, _showLogo);

  const win = window.open('', '_blank', 'width=420,height=700,toolbar=0,scrollbars=0,menubar=0');
  if (!win) {
    alert('Please allow popups to print receipt');
    window.dispatchEvent(new Event('print-blocked'));
    return;
  }

  win.document.write(html);
  win.document.close();
  win.focus();

  // Wait for all images to fully load before printing
  const images = Array.from(win.document.querySelectorAll('img')) as HTMLImageElement[];
  Promise.all(
    images.map(img =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>(res => { img.onload = res; img.onerror = res; })
    )
  ).then(() => {
    win.print();
    win.close();
  });
}
