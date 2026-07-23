// Module-level store — ThermalReceiptLayout registers the text on each render
let _receiptText: string | null = null;
let _logo: string | null = null;
let _showLogo: boolean = false;

export function setReceiptText(text: string) {
  _receiptText = text;
}

export function setLogoForPrint(logo: string | null, showLogo: boolean) {
  _logo = logo;
  _showLogo = showLogo;
}

export function isReceiptTextReady(): boolean {
  return !!_receiptText;
}

export function triggerPrint(_mode: 'receipt' | 'invoice') {
  console.log('PRINT VERSION: TEXT_V3_SANS');

  if (!_receiptText) {
    console.warn('triggerPrint: no receipt text available yet');
    return;
  }

  const safe = _receiptText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const logoHtml =
    _showLogo && _logo
      ? `<div class="logo-container"><img src="${_logo}" /></div>`
      : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt</title>
  <style>
    @page { margin: 0; size: auto; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, 'Liberation Sans', sans-serif !important;
      font-size: 11px !important;
      line-height: 1.3 !important;
      color: #000000 !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 8px !important;
      background: #ffffff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    .logo-container {
      text-align: center;
      margin-bottom: 8px;
    }
    .logo-container img {
      max-width: 110px !important;
      height: auto !important;
      display: block !important;
      margin: 0 auto !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    b, strong, .bold {
      font-weight: 700 !important;
    }
    table { width: 100%; border-collapse: collapse; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .divider { border-bottom: 1px dashed #000; margin: 6px 0; }
    pre {
      white-space: pre;
      font-family: 'Consolas', 'Courier New', 'Lucida Console', monospace;
      font-size: 11px;
      line-height: 1.3;
      color: #000000 !important;
      -webkit-text-fill-color: #000000 !important;
      font-weight: 600 !important;
      letter-spacing: 0.2px;
    }
  </style>
</head>
<body>${logoHtml}<pre>${safe}</pre></body>
</html>`;

  const win = window.open('', '_blank', 'width=420,height=700,toolbar=0,scrollbars=0,menubar=0');

  if (!win) {
    alert('Please allow popups to print receipt');
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
