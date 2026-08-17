# S Bamboo Cottage POS — Electron Desktop App

Packages the live POS web app (`https://pos.sbamboocottage.com.np`) into a
Windows desktop container with **100% silent thermal printing** — zero dialogs,
zero previews.

## How it works

| Layer | File | Role |
|---|---|---|
| Main process | `main.js` | Loads the live app URL; handles `get-printers` and `silent-print` IPC |
| Preload | `preload.js` | Exposes `window.electronAPI.getPrinters()` and `window.electronAPI.printSilent()` via contextBridge |
| Web app — detect | `src/utils/silentPrint.ts` | Checks `window.electronAPI?.isElectron`; routes to HTML path in Electron, WebUSB path in browser |
| Web app — dispatch | `src/utils/browserPrint.ts` | Builds 80mm HTML receipts and calls `printSilent(html, deviceName)` |
| Web app — auto queue | `src/hooks/usePrintQueue.ts` | Background listener; uses HTML path in Electron, ESC/POS path in browser |
| Web app — settings | `src/components/settings/PrinterSettingsModal.tsx` | OS printer dropdown (Electron) or USB pair button (browser) |

### Electron path (desktop)

```
waiter creates order
  → Firebase ticket written
  → auto-print hub picks it up (usePrintQueue)
  → browserPrintKOT / browserPrintBOT / browserPrintVoidTicket
  → window.electronAPI.printSilent(html, deviceName)   [preload → IPC]
  → main.js: hidden BrowserWindow.loadURL(data:...) → webContents.print({ silent: true, deviceName })
  → Windows delivers job to the named printer — zero dialogs
```

### Browser / WebUSB path (Chrome hub tab)

```
usePrintQueue → buildKOT / buildBOT → dispatchEscpos → sendRawToUSB → USB cable → printer
```

## Printer names (Windows, one time)

1. Install the thermal printer driver (Pantum PD-80BW or similar).
2. In **Windows Settings → Printers & scanners**, rename the two printers to whatever
   names you prefer (e.g. **Kitchen** and **Reception**).
3. In the POS app: **Admin → Settings → Printers**.
   - Under *Kitchen Station*, open the dropdown and select the kitchen printer name.
   - Under *Reception / Bar Station*, select the reception printer name.
   - Click **Save Printer Settings**.
4. Use **Test Print KOT / BOT** to verify delivery before going live.

The admin can change the assigned printer at any time without rebuilding the app.

## Build the installer

```bash
# From the repo root:
npm run build:electron

# Or from this directory:
cd electron
npm install
npm run build
```

The NSIS one-click installer lands at `../dist-electron/S Bamboo Cottage POS Setup 1.0.0.exe`.

## Adding the icon

Place a 512×512 PNG at `electron/assets/icon-512.png` before building:

```bash
cp public/icon-512.png electron/assets/icon-512.png
```

electron-builder converts it to `.ico` automatically during the Windows build.

## Development (live reload against the cloud app)

```bash
cd electron
npm install
npm start
```
