/**
 * electron/preload.js — Context Bridge
 *
 * Runs in a sandboxed renderer context before any page scripts.
 * Exposes a minimal, typed API surface to the web app via contextBridge.
 *
 * The web app checks for window.electronAPI at runtime:
 *   if (window.electronAPI?.printSilent) — inside Electron → silent IPC print
 *   else                                 — on web/mobile  → browser print dialog
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Send a complete HTML receipt string to the main process for silent
   * printing on a Windows thermal printer.
   *
   * @param {string}           htmlContent  - Full HTML document including <style> block.
   * @param {string|undefined} printerName  - Optional Windows printer name.
   *                                          When omitted the OS default printer is used.
   *                                          Pass 'Kitchen Printer' for the kitchen thermal
   *                                          and omit (or pass undefined) for the reception printer.
   */
  printSilent: (htmlContent, printerName) => {
    if (typeof htmlContent !== 'string') {
      console.warn('[electronAPI] printSilent: htmlContent must be a string');
      return;
    }
    ipcRenderer.send('silent-print', htmlContent, printerName ?? null);
  },

  /** Runtime flag so the web app can confirm it is inside Electron. */
  isElectron: true,
});
