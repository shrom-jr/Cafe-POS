/**
 * electron.d.ts
 *
 * Global type declarations for the Electron contextBridge API.
 * These properties are injected into `window` by electron/preload.js
 * and are only present when the POS web app is running inside the
 * Electron desktop container — never on the live web or waiter phones.
 *
 * Usage pattern:
 *   if (window.electronAPI?.isElectron) {
 *     const printers = await window.electronAPI.getPrinters();
 *     const result = await window.electronAPI.printSilent(html, 'Kitchen');
 *   } else {
 *     // WebUSB ESC/POS path (browser / mobile)
 *   }
 */

export {};   // make this a module so the `declare global` merges correctly

/** Mirrors Electron's PrinterInfo subset we expose. */
export interface ElectronPrinterInfo {
  /** Exact Windows printer name — pass this to printSilent's deviceName. */
  name: string;
  /** True when this is the Windows default printer. */
  isDefault: boolean;
  /** "idle" | "printing" | "stopped" | "unknown" — driver-reported. */
  status: string;
  /** Human-readable printer description from the driver. */
  description: string;
}

declare global {
  interface Window {
    /**
     * Present only when the app runs inside the Electron desktop container.
     * Exposed via contextBridge in electron/preload.js.
     */
    electronAPI?: {
      /**
       * Fetch the list of printers installed on the Windows host.
       * Used to populate the kitchen / reception printer dropdowns in Settings.
       * Call on mount and again when the user clicks "Refresh Printers".
       */
      getPrinters(): Promise<ElectronPrinterInfo[]>;

      /**
       * Send a complete HTML document string to the Electron main process for
       * silent printing on a named Windows thermal printer.
       *
       * Returns a settled result so the caller can update print status only
       * after the native Windows print callback confirms delivery.
       *
       * @param html        - Full HTML document including embedded <style>.
       * @param deviceName  - Exact Windows printer name (e.g. "Kitchen").
       *                      When omitted the OS default printer is used.
       */
      printSilent(
        html: string,
        deviceName?: string,
      ): Promise<{ success: boolean; error?: string }>;

      /**
       * Returns whether the app is configured to open automatically on Windows boot.
       * Reads the OS login-item setting; call on mount to initialise the toggle.
       */
      getAutoStart(): Promise<boolean>;

      /**
       * Enable or disable auto-launch on Windows startup.
       * Returns the new openAtLogin value as confirmed by the OS.
       *
       * @param enable - true to register the app as a startup item; false to remove it.
       */
      setAutoStart(enable: boolean): Promise<boolean>;

      /** True when running inside the Electron desktop container. */
      isElectron: boolean;
    };
  }
}
