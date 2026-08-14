/**
 * electron.d.ts
 *
 * Global type declarations for the Electron contextBridge API.
 * These properties are injected into `window` by electron/preload.js
 * and are only present when the POS web app is running inside the
 * Electron desktop container — never on the live web or waiter phones.
 *
 * Usage pattern:
 *   if (window.electronAPI?.printSilent) {
 *     window.electronAPI.printSilent(html);   // Electron: silent thermal print
 *   } else {
 *     // web / mobile: iframe window.print() fallback
 *   }
 */

export {};   // make this a module so the `declare global` merges correctly

declare global {
  interface Window {
    /**
     * Present only when the app runs inside the Electron desktop container.
     * Exposed via contextBridge in electron/preload.js.
     */
    electronAPI?: {
      /**
       * Send a complete HTML document string to the Electron main process for
       * silent printing on the default Windows thermal printer.
       * Resolves immediately (fire-and-forget via IPC).
       *
       * @param htmlContent - Full HTML document including embedded <style>.
       */
      printSilent: (htmlContent: string) => void;

      /** True when running inside the Electron desktop container. */
      isElectron: boolean;
    };
  }
}
