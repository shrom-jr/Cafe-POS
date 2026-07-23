// Module-level store — ThermalReceiptLayout registers the text on each render
let _receiptText: string | null = null;

export function setReceiptText(text: string) {
  _receiptText = text;
}

export function isReceiptTextReady(): boolean {
  return !!_receiptText;
}

export function triggerPrint(_mode: 'receipt' | 'invoice') {
  console.log('PRINT VERSION: TEXT_V2_DARK');

  if (!_receiptText) {
    console.warn('triggerPrint: no receipt text available yet');
    return;
  }

  const safe = _receiptText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt</title>
  <style>
    * { 
      margin: 0; 
      padding: 0; 
      box-sizing: border-box; 
    }
    body {
      font-family: 'Consolas', 'Courier New', 'Lucida Console', monospace;
      font-size: 11pt;
      line-height: 1.2;
      letter-spacing: 0.2px;
      color: #000000 !important;
      background: #ffffff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      -webkit-font-smoothing: none !important;
      -moz-osx-font-smoothing: unset !important;
      font-smooth: never !important;
      text-rendering: optimizeSpeed !important;
    }
    pre {
      white-space: pre;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      color: #000000 !important;
      -webkit-text-fill-color: #000000 !important;
      font-weight: 600 !important;
      letter-spacing: 0.2px;
    }
    img {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      display: block !important;
      margin: 0 auto 6px auto !important;
      max-width: 110px !important;
      height: auto !important;
    }
    @page { 
      margin: 4mm; 
      size: auto; 
    }
  </style>
</head>
<body><pre>${safe}</pre></body>
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

  // Wait for any images to finish loading before printing
  const printWhenReady = () => {
    const images = Array.from(win.document.querySelectorAll('img')) as HTMLImageElement[];
    Promise.all(
      images.map((img) =>
        img.complete ? Promise.resolve() : new Promise<void>((res) => { img.onload = res; img.onerror = res; })
      )
    ).then(() => {
      setTimeout(() => { win.print(); setTimeout(() => win.close(), 500); }, 150);
    });
  };
  // Allow the popup document to fully render before checking images
  setTimeout(printWhenReady, 200);
}
