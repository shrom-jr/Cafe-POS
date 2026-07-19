---
name: Print Engine Architecture
description: How the three print job types work and why the old polling approach was replaced
---

## Rule
All receipt printing goes through `firePrintJob(job: PrintJob)` in `src/utils/printEngine.ts`. Three job types:
- `KITCHEN_KOT` — fired by OrderScreen on "Send to Kitchen"; no financial data
- `PRE_BILL` — fired by ReviewScreen "Print Pre-Bill" button; watermarked pre-bill
- `TAX_INVOICE` — fired by ReviewScreen + PaymentScreen on payment confirmation; official receipt

Callers store the job in a `useRef<PrintJob | null>` for reprint support.

**Why:** The old system used a DOM portal (`ThermalReceiptLayout`) + `setReceiptText()` module-level state + a polling loop (`isReceiptTextReady()`) before calling `triggerPrint()`. This was fragile (race on portal render) and couldn't support kitchen tickets or pre-bills without a full parallel portal system.

**How to apply:**
- `ThermalReceiptLayout` still exists and is used by AdminPanel's ReceiptPreview (visual preview only, not printing). Do NOT remove it.
- `src/utils/print.ts` (`triggerPrint`, `setReceiptText`, `isReceiptTextReady`) still exists because `ThermalReceiptLayout` calls `setReceiptText` in its useEffect. Do NOT call `triggerPrint` from screen components — use `firePrintJob` instead.
- Print Bill buttons carry `data-testid="button-print-pre-bill"` in all three layout branches (mobile/landscape/tablet) in ReviewScreen.
- KOT snapshot must be taken BEFORE calling `sendToKitchen(order.id)` — the store marks items as sent immediately.
