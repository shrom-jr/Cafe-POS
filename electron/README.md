# S Bamboo Cottage POS — Electron Desktop App

Packages the live POS web app (`https://pos.sbamboocottage.com.np`) into a
Windows desktop container with **100% silent thermal printing** — zero dialogs,
zero previews.

## How it works

| Layer | File | Role |
|---|---|---|
| Main process | `main.js` | Loads the live app URL; handles `silent-print` IPC |
| Preload | `preload.js` | Exposes `window.electronAPI.printSilent()` via contextBridge |
| Web app | `src/utils/browserPrint.ts` | Detects Electron and routes receipts through `printSilent` |

When `window.electronAPI` is **present** (desktop), the web app sends the HTML
receipt string to the main process, which opens a hidden off-screen window and
calls `webContents.print({ silent: true, ... })` — the OS delivers it directly
to the PD-80BW without any UI.

When `window.electronAPI` is **absent** (browsers / waiter phones), the
existing iframe `window.print()` fallback runs as before.

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

## Printer setup (Windows, one time)

1. Install the Pantum PD-80BW Windows driver (from Pantum website).
2. Set **PD-80BW** as the **Default Printer** in Windows Settings → Bluetooth & devices → Printers.
3. Launch the installed POS desktop app — all receipts print silently from that point on.

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
