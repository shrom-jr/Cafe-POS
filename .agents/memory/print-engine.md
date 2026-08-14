---
name: Print Engine Architecture
description: Silent dual-mode ESC/POS printing (WebUSB + network); firePrintJob iframe pipeline is legacy
---

## Rule
All production printing is silent raw ESC/POS — no window.print(), alert, or iframe dialogs anywhere in the hardware path.

- Screens still build structured `PrintJob` objects (KITCHEN_KOT / PRE_BILL / TAX_INVOICE from `printEngine.ts` types) but dispatch them through `fireSilentPrintJob()` in `src/utils/silentPrint.ts`, which converts to ESC/POS bytes and routes via `dispatchEscpos()` in `src/utils/escpos.ts`.
- `dispatchEscpos(buffer, settings, 'kitchen' | 'reception')` routes per configured mode: `'webusb'` → `sendRawToUSB()` (native navigator.usb driver in `src/utils/webusbPrinter.ts`), `'network'` → WebSocket relay to IP:port. Unconfigured/offline = console.warn only, resolves false.
- Kitchen mode: `settings.kitchenPrinterMode` ('webusb'|'network', default network). Reception: `settings.receptionPrinterMode` — legacy 'browser'/'usb' values are treated as 'webusb'.
- WebUSB pairing is a one-time user gesture (`pairUSBPrinter`); `autoReconnectUSB()` silently re-attaches on mount (called by usePrintQueue on the hub device and by the printer settings panel).
- WebUSB connection discovery scans every device configuration and bulk-OUT alternate setting, preferring USB printer class 7 but falling back to vendor-specific interfaces; never assume configuration 1 or interface 0.
- Background KOT/BOT/VOID queue (`usePrintQueue`) runs only on the device where localStorage `pos_is_print_hub === 'true'`; it also uses `dispatchEscpos`.

**Why:** Waiter phones and the cashier hub must never pop a browser print dialog; the Pantum PD-80BW works over direct USB cable (WebUSB) or Wi-Fi (port 9100).

**How to apply:**
- `firePrintJob()` / `openPrintIframe()` in `printEngine.ts` still exist but are LEGACY — no screen should call them. Its HTML builders and PrintJob types are still used for typing and by tests.
- `ThermalReceiptLayout` + `src/utils/print.ts` remain only for AdminPanel ReceiptPreview (visual preview). Do NOT remove.
- Callers keep the last job in a `useRef<PrintJob | null>` for reprint; reprint also goes through `fireSilentPrintJob`.
- KOT snapshot must be taken BEFORE calling `sendToKitchen(order.id)` — the store marks items as sent immediately.
