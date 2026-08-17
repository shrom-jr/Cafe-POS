/**
 * electron/preload.js — Context Bridge
 *
 * Runs in a sandboxed renderer context before any page scripts.
 * Exposes a minimal, typed API surface to the web app via contextBridge.
 *
 * The web app checks window.electronAPI?.isElectron at runtime to decide
 * whether to use native IPC printing or the WebUSB ESC/POS path.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Fetch the list of printers installed on this Windows host.
   * Returns an array of Electron PrinterInfo objects.
   * Used to populate the kitchen/reception printer dropdowns in Settings.
   *
   * @returns {Promise<Array<{ name: string, isDefault: boolean, status: string, description: string }>>}
   */
  getPrinters: () => ipcRenderer.invoke('get-printers'),

  /**
   * Send a complete HTML receipt string to the main process for silent
   * printing on a named Windows thermal printer.
   *
   * @param {string}           html        - Full HTML document including <style> block.
   * @param {string|undefined} deviceName  - Exact Windows printer name.
   *                                         When omitted the OS default printer is used.
   *                                         Pass 'Kitchen' for the kitchen station and
   *                                         'Reception' for the reception/bar station,
   *                                         or whatever name is configured in Windows
   *                                         Settings → Printers & scanners.
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  printSilent: (html, deviceName) => {
    if (typeof html !== 'string') {
      console.warn('[electronAPI] printSilent: html must be a string');
      return Promise.resolve({ success: false, error: 'invalid-payload' });
    }
    return ipcRenderer.invoke('silent-print', { html, deviceName: deviceName ?? undefined });
  },

  /** Runtime flag so the web app can confirm it is running inside Electron. */
  isElectron: true,
});
