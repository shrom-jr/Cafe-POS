/**
 * electron/main.js — S Bamboo Cottage POS Desktop Container
 *
 * Loads the live cloud POS web app so every web-side update is automatically
 * reflected in the desktop app without rebuilding the installer.
 *
 * Silent printing:
 *   The renderer calls window.electronAPI.printSilent(htmlContent).
 *   The preload forwards it here via IPC.
 *   We open a hidden BrowserWindow, load the HTML, and call
 *   webContents.print({ silent: true, ... }) — zero dialogs, zero previews.
 *
 * The default Windows thermal printer (PD-80BW) receives the job directly
 * from the OS print subsystem with no user interaction required.
 */

'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

// ── Config ─────────────────────────────────────────────────────────────────────

const APP_URL   = 'https://pos.sbamboocottage.com.np';
const ICON_PATH = path.join(__dirname, 'assets', 'icon-512.png');

// ── Main window ────────────────────────────────────────────────────────────────

let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width:     1280,
    height:    800,
    minWidth:  900,
    minHeight: 600,
    title:     'S Bamboo Cottage POS',
    icon:      ICON_PATH,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      // sandbox: false is required for the preload to use require('electron')
      sandbox:          false,
    },
  });

  // Hide the native menu bar — the POS UI is full-screen-style.
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(true);

  mainWindow.loadURL(APP_URL);

  // Open external links in the OS default browser, not a new Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Silent print IPC handler ───────────────────────────────────────────────────

/**
 * Receives an HTML receipt string from the renderer, loads it into a hidden
 * off-screen window, and prints it silently to a Windows thermal printer.
 *
 * Arguments (via IPC):
 *   htmlContent  {string}      — Full HTML document (includes @page 80mm CSS).
 *   printerName  {string|null} — Optional Windows printer name for routing.
 *                                Pass null / omit to use the OS default printer.
 *                                Pass 'Kitchen Printer' (exact Windows name) to
 *                                send the job to a dedicated kitchen thermal printer.
 *
 * The @page CSS inside the HTML already sets size: 80mm auto; margin: 0 so
 * the OS receives exactly the right paper geometry for the thermal roll.
 */
ipcMain.on('silent-print', (_event, htmlContent, printerName) => {
  if (typeof htmlContent !== 'string' || htmlContent.length === 0) {
    console.warn('[electron] silent-print: received empty or non-string payload — ignored.');
    return;
  }

  const printWin = new BrowserWindow({
    show:   false,
    width:  800,   // must be non-zero for layout to render
    height: 600,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
    },
  });

  // data: URLs are the simplest way to inject arbitrary HTML without writing
  // temp files. encodeURIComponent handles all special characters safely.
  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);

  printWin.loadURL(dataUrl);

  printWin.webContents.once('did-finish-load', () => {
    /** @type {Electron.WebContentsPrintOptions} */
    const printOptions = {
      silent:          true,
      printBackground: true,
      margins:         { marginType: 'none' },
      // pageSize can be overridden here; the @page CSS declaration inside
      // the HTML is already setting 80mm × auto, which Chromium honours.
      pageSize: 'A4',   // fallback for drivers that ignore @page
    };

    // Route to a specific Windows printer when a name is provided.
    // The name must match exactly as it appears in Windows Settings → Printers.
    // Example: name the kitchen printer 'Kitchen Printer' in Windows to use it here.
    if (typeof printerName === 'string' && printerName.length > 0) {
      printOptions.deviceName = printerName;
    }

    printWin.webContents.print(
      printOptions,
      (success, errorType) => {
        if (!success) {
          console.warn(`[electron] Print job failed (printer: ${printerName ?? 'default'}):`, errorType);
        }
        // Destroy regardless so hidden windows don't accumulate.
        try { printWin.destroy(); } catch { /* already destroyed */ }
      },
    );
  });

  // Safety net: destroy the print window after 30 s even if load never fires.
  setTimeout(() => {
    try { if (!printWin.isDestroyed()) printWin.destroy(); } catch { /* ok */ }
  }, 30_000);
});

// ── App lifecycle ──────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    // macOS: re-create the window when the dock icon is clicked.
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  // On Windows / Linux, quit when all windows are closed.
  if (process.platform !== 'darwin') app.quit();
});
