---
name: Print Engine Architecture
description: Dual-slot WebUSB-only ESC/POS printing — durable constraints on device identity, sync ordering, and hub toggling
---

## Rule
All production printing is silent raw ESC/POS over direct WebUSB. No window.print(), alerts, iframes, network (IP:9100) relays, or printer-mode settings may ever return to the hardware path.

**Why:** Two identical same-model thermal printers are cabled directly to the desktop hub; waiter phones must never pop dialogs, and Wi-Fi/browser fallbacks proved unreliable in the venue.

## Durable constraints
- **Identical printers share vendor/product IDs** — per-slot identity must rely on the USB serial number, reconnects must run one at a time (never concurrently), and an explicit re-pairing must fully displace the other station's stored identity or both slots deadlock reserving the same unit.
- **Never split one logical state change across two Firebase writes.** Orders sync as a whole array; a narrow patch racing the full-array push can silently revert. Flip ticket status and the order's print confirmation in a single store update so the one sync path carries the final state.
- **The `storage` event never fires in the tab that wrote it** — any localStorage-backed toggle (like the auto-print hub flag) needs a same-tab notification or it stays stale until reload.
- Ticket routing precedence: item-level print route > category print route > legacy send-to-kitchen boolean.
- Unpaired/offline printer = silent skip (warn + resolve false). Never throw or open a dialog from the print path.

**How to apply:**
- The legacy iframe/HTML print pipeline exists only for typing and the admin receipt preview — no screen may dispatch through it.
- KOT snapshot must be taken BEFORE calling sendToKitchen — the store marks items as sent immediately.
- A station's print confirmation flips to printed only when no other pending ticket for that station remains on the order.
