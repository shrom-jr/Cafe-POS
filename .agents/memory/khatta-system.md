---
name: Khatta Customer Ledger System
description: Architecture of the customer credit/tab system (Khatta) — types, store, UI, and settlement logic
---

## Data Model
- `Customer` interface added to `src/types/pos.ts`: `{ id, name, phone, currentDue, totalSpend, visits }`
- `Order.attachedCustomer?: { id, name, phone, currentDue }` — snapshot stored on the order itself
- `StaffPermissions` extended with optional `canAttachCustomer`, `canSettleDues`, `canViewCustomers` booleans

## Store
- `src/store/useCustomerStore.ts` — Zustand + localStorage (`pos_customers`)
- Seeds 3 demo customers on first run (Ramesh, Sunita, Binod)
- Actions: `addCustomer`, `updateCustomer`, `addToCustomerDue`, `settleCustomerDue`, `getCustomer`
- `usePOSStore.attachCustomerToOrder(orderId, Customer|null)` — writes snapshot into the order + persists

## Components
- `src/components/orders/CustomerPicker.tsx` — modal overlay with search-by-name/phone, avatar list, inline "+ New Customer" form
- `OrderPanel` — new `attachedCustomer` + `onAttachCustomer` props; customer row below Pax row
- `OrderScreen` — manages `attachedCustomer` state, `handleAttachCustomer` fn, `showCustomerPicker` state; passes to landscape OrderPanel; renders CustomerPicker in portrait drawer

## Settlement Logic (ReviewScreen)
- Khatta path (method === 'khatta'): addPayment with method='khatta', addToCustomerDue(orderId total), markItemsPaid, resetTable — no printed receipt
- Include Previous Due checkbox: `prevDueAmount` added to display; after allDone, `settleCustomerDue` resets currentDue to 0
- Khatta button shown only when `attachedCustomer` is set and not in split-payment mode

**Why:**
No Firebase sync for customers — localStorage only; keeps it fast and avoids Firebase coupling for a feature that is primarily local-device UX. Add Firebase sync later if multi-device customer ledger is needed.
