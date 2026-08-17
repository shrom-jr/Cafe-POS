---
name: Maintenance Expenses Architecture
description: How the MaintenanceExpense feature is wired — store, Firebase sync, Admin tab, and Reports integration.
---

## Rule
`maintenanceExpenses` in Firebase Realtime Database is the single source of truth for expense records. Never read/write from localStorage.

## Architecture

- **Type**: `MaintenanceExpense` in `src/types/pos.ts` — fields: id, title, category, amount, paymentMethod, date (yyyy-MM-dd), loggedBy, createdAt (ISO).
- **Store**: `src/store/useMaintenanceStore.ts` — Zustand, no localStorage, initialises empty (Firebase subscription populates it).
- **Firebase paths**: `maintenanceExpenses` node — subscribe/push functions added to `src/utils/firebaseSync.ts`.
- **Hook**: `src/hooks/useFirebaseSync.ts` — item #19, same ref-guarded subscribe + push pattern as all other collections.
- **UI**: `src/screens/admin/ExpensesSection.tsx` — standalone component; period filter, summary card, log table, add/edit/delete modal.
- **Admin tab**: Added `'expenses'` to `AdminTab` type in `AdminPanel.tsx`; tab sits between Inventory and Settings.
- **Reports integration**: `ReportsSection` in `AdminPanel.tsx` pulls `useMaintenanceStore`, `useKitchenPurchasesStore`, and `useInventoryStore`; filters all three cost streams by the same `periodStart`/`periodEnd`; shows "Maintenance Expenses" KPI card and "Net Profit" card using `Revenue − (Kitchen Purchases + Bar Restocks + Maintenance Expenses)`. Grid changed from 4 to 3 columns to accommodate 6 cards.

**Why:** Requirements asked for Firebase-backed real-time sync consistent with the rest of the inventory module, and for Net Profit in Reports to include all three operating cost streams.

**How to apply:** Any future expense category or cost stream (e.g. staff wages) should follow the same store → firebaseSync → useFirebaseSync → screen pattern.

## Historical reset semantics
An explicitly absent Firebase node is authoritative for the historical kitchen, meat, grocery-purchase, and maintenance-expense collections; it must clear local cached records rather than re-seed them.

**Why:** A deliberate RTDB cleanup otherwise looked identical to a transient empty snapshot and the localStorage fallback could immediately recreate deleted test history.

**How to apply:** Preserve the snapshot-existence signal through subscriptions and set the corresponding store to an empty array before any push effect can run.
