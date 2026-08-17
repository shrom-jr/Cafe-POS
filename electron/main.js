/**
 * electron/main.js — S Bamboo Cottage POS Desktop Container
 *
 * Loads the live cloud POS web app so every web-side update is automatically
 * reflected in the desktop app without rebuilding the installer.
 *
 * Silent printing (Phase 6):
 *   The renderer calls window.electronAPI.printSilent(html, deviceName).
 *   The preload forwards it via ipcRenderer.invoke('silent-print', { html, deviceName }).
 *   We open a hidden BrowserWindow, load the HTML, and call
 *   webContents.print({ silent: true, deviceName }) — zero dialogs, zero previews.
 *   The result ({ success, error? }) is returned to the renderer so it can
 *   update print status only after the native callback confirms delivery.
 *
 * Printer discovery (Phase 6):
 *   The renderer calls window.electronAPI.getPrinters() to get the list of
 *   installed Windows printers for display in the Settings UI.
 */

'use strict';

const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');

// ── Config ─────────────────────────────────────────────────────────────────────

const APP_URL   = 'https://pos.sbamboocottage.com.np';
const ICON_PATH = path.join(__dirname, 'assets', 'icon-512.png');

// ── Splash window ──────────────────────────────────────────────────────────────

/**
 * Opens a frameless branded splash screen immediately, before the main window
 * starts loading the cloud app.  Destroyed once the main window is ready to show.
 */
function createSplashWindow() {
  const splash = new BrowserWindow({
    width:           500,
    height:          380,
    frame:           false,
    transparent:     false,
    alwaysOnTop:     true,
    resizable:       false,
    center:          true,
    backgroundColor: '#0b0f17',
    webPreferences:  { nodeIntegration: false },
  });

  splash.loadFile(path.join(__dirname, 'splash.html'));
  return splash;
}

// ── App-quit guard ─────────────────────────────────────────────────────────────

// Tracks whether the quit was intentional (menu, taskbar, or confirmed dialog).
// Set to true before calling app.quit() or mainWindow.destroy() so the 'close'
// handler knows to skip the confirmation dialog.
app.isQuitting = false;

// ── Main window ────────────────────────────────────────────────────────────────

let mainWindow = null;

function createMainWindow() {
  const splash = createSplashWindow();

  mainWindow = new BrowserWindow({
    width:     1280,
    height:    800,
    minWidth:  900,
    minHeight: 600,
    title:     'S Bamboo Cottage POS',
    icon:      ICON_PATH,
    show:      false,   // revealed after splash delay
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

  // Once the app has painted, hold the splash for 1 s then transition.
  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      try { splash.destroy(); } catch { /* already closed */ }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.maximize();
        mainWindow.show();
      }
    }, 1000);
  });

  // Open external links in the OS default browser, not a new Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // ── Accidental-close guard ────────────────────────────────────────────────
  // Intercept the close event and show a native confirmation dialog unless the
  // app is already in an intentional quit flow (app.isQuitting === true).
  mainWindow.on('close', (e) => {
    if (app.isQuitting) return; // intentional — let the close proceed
    e.preventDefault();
    dialog.showMessageBox(mainWindow, {
      type:      'question',
      title:     'Exit Bamboo POS',
      message:   'Are you sure you want to exit the POS terminal?',
      detail:    'Please ensure all active orders and table receipts are settled or saved.',
      buttons:   ['Cancel', 'Exit POS'],
      defaultId: 0,   // Cancel is default — accidental Ctrl+W does nothing
      cancelId:  0,
    }).then(({ response }) => {
      if (response === 1) {
        app.isQuitting = true;
        mainWindow.destroy();
      }
    }).catch(() => { /* dialog dismissed */ });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Printer discovery IPC ──────────────────────────────────────────────────────

/**
 * Returns the list of printers installed on the Windows host.
 * The renderer uses this to populate the kitchen/reception station dropdowns.
 */
ipcMain.handle('get-printers', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return [];
    return await win.webContents.getPrintersAsync();
  } catch (err) {
    console.error('[electron] get-printers failed:', err);
    return [];
  }
});

// ── Silent print IPC handler ───────────────────────────────────────────────────

/**
 * Receives an HTML receipt string from the renderer, loads it into a hidden
 * off-screen window, and prints it silently to a Windows thermal printer.
 *
 * Payload: { html: string, deviceName?: string }
 *   html        — Full HTML document (includes @page 80mm CSS).
 *   deviceName  — Exact Windows printer name (e.g. "Kitchen", "Reception").
 *                 When omitted the OS default printer is used.
 *
 * Returns: { success: true } | { success: false, error: string }
 * The renderer waits for this result before marking a ticket as printed.
 */
ipcMain.handle('silent-print', async (_event, { html, deviceName }) => {
  if (typeof html !== 'string' || html.length === 0) {
    console.warn('[electron] silent-print: received empty or non-string payload — ignored.');
    return { success: false, error: 'empty-payload' };
  }

  const printWin = new BrowserWindow({
    show:   false,
    // 302 px ≈ 80 mm at 96 dpi — keeps the layout engine honest for 80mm paper.
    width:  302,
    height: 600,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
    },
  });

  // data: URLs are the simplest way to inject arbitrary HTML without writing
  // temp files. encodeURIComponent handles all special characters safely.
  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);

  try {
    await printWin.loadURL(dataUrl);
  } catch (loadErr) {
    console.warn('[electron] silent-print: HTML load failed:', loadErr);
    try { printWin.destroy(); } catch { /* ok */ }
    return { success: false, error: String(loadErr) };
  }

  return new Promise((resolve) => {
    /** @type {Electron.WebContentsPrintOptions} */
    const printOptions = {
      silent:          true,
      printBackground: true,
      margins:         { marginType: 'none' },
      // Let the @page CSS in the HTML control paper size (80mm auto).
      // Do not force a specific pageSize here — thermal drivers honour @page.
    };

    // Route to a specific Windows printer when a name is provided.
    // The name must match exactly as shown in Windows Settings → Printers & scanners.
    if (typeof deviceName === 'string' && deviceName.length > 0) {
      printOptions.deviceName = deviceName;
    }

    printWin.webContents.print(printOptions, (success, failureReason) => {
      try { printWin.destroy(); } catch { /* already destroyed */ }
      if (success) {
        resolve({ success: true });
      } else {
        console.warn(`[electron] Print job failed (printer: ${deviceName ?? 'default'}):`, failureReason);
        resolve({ success: false, error: failureReason });
      }
    });

    // Safety net: resolve + destroy after 30 s even if the callback never fires.
    setTimeout(() => {
      try {
        if (!printWin.isDestroyed()) {
          printWin.destroy();
          resolve({ success: false, error: 'timeout' });
        }
      } catch { /* ok */ }
    }, 30_000);
  });
});

// ── Windows auto-launch IPC ────────────────────────────────────────────────────

/**
 * Returns whether the app opens automatically on Windows boot.
 * The renderer reads this on mount to initialise the auto-launch toggle.
 */
ipcMain.handle('get-autostart', () => {
  return app.getLoginItemSettings().openAtLogin;
});

/**
 * Enables or disables auto-launch on Windows startup.
 * Returns the new openAtLogin value as confirmed by the OS.
 */
ipcMain.handle('set-autostart', (_event, enable) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(enable) });
  return app.getLoginItemSettings().openAtLogin;
});

// ── App lifecycle ──────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    // macOS: re-create the window when the dock icon is clicked.
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', () => {
  // Mark quit as intentional so the close-guard dialog is skipped.
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  // On Windows / Linux, quit when all windows are closed.
  if (process.platform !== 'darwin') app.quit();
});
