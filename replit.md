# Bamboo POS — Product and Technical Specification

**Document purpose:** This file is the current project brief for collaborators and external AI tools. Use it as the source of context when brainstorming, planning enhancements, reviewing architecture, or proposing product changes.

**Last verified:** August 21, 2026
**Product:** S Bamboo Cottage / Bamboo POS  
**Primary environment:** Replit development workspace  
**Business context:** A café/restaurant POS for dine-in operations, kitchen and bar workflows, customer credit ledgers, inventory, reporting, and multi-terminal synchronization.

---

## 1. Product Summary

Bamboo POS is a browser-based, multi-terminal point-of-sale system designed for a café/restaurant. It supports:

- PIN-based staff login and permission-controlled workspaces.
- A spatial venue/table blueprint for fast table selection.
- Order creation, item-level kitchen state, KOT/BOT tickets, voids, discounts, VAT, payments, and receipts.
- Kitchen and bar operational portals.
- Customer “Khatta” credit accounts, repayments, due settlement, and customer history.
- Menu, table, staff, wallet, printer, company, reporting, inventory, expense, backup, and data-management administration.
- Firebase Realtime Database synchronization across POS terminals.
- Local persistence and an offline mutation queue for temporary connectivity loss.
- Browser and USB thermal-print workflows, including a desktop auto-print hub.

The app is client-heavy, but it is **not backend-free**: Firebase Realtime Database is the shared operational backend and source of truth for synchronized business data. LocalStorage/Zustand provide local state, caching, and offline fallback.

---

## 2. Current Technology Stack

- React 18
- TypeScript
- Vite 5
- React Router 6
- Zustand 5
- Firebase Realtime Database
- Tailwind CSS 3
- shadcn/ui and Radix UI
- Vitest + Testing Library
- Playwright configuration is present
- Recharts for reporting
- `qrcode.react` for payment QR displays
- `lucide-react` for icons
- `date-fns` for date formatting
- Vite PWA plugin/service worker
- Optional Electron wrapper in `electron/`

Useful commands:

```bash
npm run dev       # Start Vite development server on port 5000
npm run build     # Production build
npm test          # Full Vitest suite
npm run lint      # ESLint
npm run preview   # Preview the production build
```

The configured Replit workflow is `Start application` and runs `npm run dev`.

---

## 3. Application Routes and Workspaces

Authentication is shown before the main router. Once a staff member is logged in, route guards use the staff permission matrix.

| Route | Workspace | Permission |
|---|---|---|
| `/` | Table overview / POS home | `pos` |
| `/order/:tableId` | Order entry for a table | POS workflow |
| `/review/:tableId` | Review, discount, QR, Khatta, and settlement flow | POS workflow |
| `/payment/:tableId` | Legacy cash-payment route; currently marked unused in `App.tsx` | POS workflow |
| `/history` | Bill/payment history | `pos` |
| `/customers` | Customer directory and Khatta management | `canViewCustomers` |
| `/admin` | Administration | `admin` |
| `/kitchen` | Kitchen portal and tickets | `kitchen` |
| `/bar` | Bar portal and tickets | `bar` |

Permission roles currently include `ADMIN`, `CASHIER`, `WAITER`, and `KITCHEN`. Permissions are explicit and include POS, admin, kitchen, bar, customer viewing, customer attachment, and due settlement capabilities.

---

## 4. Core Operational Workflows

### 4.1 Table and order lifecycle

1. Staff selects a table from the venue blueprint.
2. A table session creates or opens an order.
3. Items are added from the menu, with variants and quantities where applicable.
4. Items remain draft until sent to the relevant station.
5. Sending items creates incremental KOT/BOT tickets and updates item kitchen state.
6. Additional items create additional tickets rather than rewriting the full ticket history.
7. Items can be voided with a reason and authorisation metadata; void tickets are recorded.
8. The order proceeds to review and settlement.
9. Payment is recorded, the table is freed, and the receipt/pre-bill workflow is triggered.

### 4.2 Order model requirements

Orders have UUID IDs and include:

- Table identity and display name.
- Order items with separate payment status and kitchen status.
- `draft`/`sent` or placed kitchen state.
- Staff attribution for the person who took the order.
- Optional attached Khatta customer snapshot.
- Void history.
- KOT/BOT/void ticket history.
- Per-station print status (`pending`/`printed`).
- Sync metadata and reset-generation metadata.

### 4.3 Billing and payment

`src/utils/calcBill.ts` is the shared billing calculation source of truth. Payments capture:

- Subtotal.
- Fixed or percentage discount.
- VAT amount, rate, mode, and enabled state.
- Total.
- Payment method and wallet/reference information.
- Bill number.
- Taken-by and processed-by staff attribution.
- Customer ID when linked to Khatta.
- Previous-due settlement details.
- Amount actually tendered.

The system supports cash and configured wallets such as eSewa, Khalti, Fonepay, and custom wallets. Payment records are separate from order records and are used for reports and bill history.

Settlement safeguards now include:

- Final online settlements claim `/settlementClaims/{orderId}` in Firebase before payment creation.
- Claims use a persisted per-order idempotency key, accept safe retries, reject competing active claims, and expire after a short recovery lease.
- Split payments use `finalizeOrder: false` until the final allocation; partial item-payment state and `tablePayments` are re-synchronized after allocation.
- Empty/zero-value settlements and payment lines that do not match current unpaid order lines are rejected before bill-counter, payment-row, or print side effects.

### 4.4 Khatta customer credit

The customer system supports:

- Customer directory records.
- Current due balance.
- Total spend, visits, and consumption history.
- Repayment records.
- Attaching a customer to an order.
- Recording a new credit/due amount.
- Including previous due during settlement.
- Recording a repayment through supported repayment methods.
- Customer financials, visits, consumption/top items, and audit-oriented views.

Credit creation rejects non-finite and non-positive amounts and rounds accepted amounts to two decimal places before updating due and spend metrics. Repayment validation separately prevents non-positive amounts and repayment above the current due.

Important current reset rule: **customer-directory and credit-ledger reset is a complete wipe.** It removes customer profiles, repayment records, and customer reset tombstone data from Firebase and clears local customer state/localStorage. It must not preserve customer profiles with a zero balance.

---

## 5. Venue and Table Blueprint

Firebase `/tables` is the shared source of truth for table state. The venue seed is idempotent and adds missing canonical tables without overwriting active orders.

### Canonical areas

```text
First Floor (Huts & Hall)
Sofa & Lounge
Bar Counter
Private Huts
Private Cabins
```

The current venue blueprint contains 21 canonical tables, with overflow/admin-created tables still supported.

### Blueprint presentation

- First Floor is shown as the upper section.
- Ground Floor is a composite layout:
  - Sofa & Lounge
  - Bar Counter and landmarks
  - Private Huts
  - Private Cabins
- Table cards show status, timers, item counts, and running totals.
- Non-table landmarks such as Parking and Main Gate are presentational only and never create Firebase table records.
- Unknown/admin areas fall back to a responsive grid.
- Filtered area views retain area-specific layouts where possible.

Table statuses are `free`, `occupied`, and `billing`. Occupied tables carry order linkage and an active-floor reset generation.

---

## 6. Menu and Print Routing

The canonical menu Firebase paths are:

```text
/menu/pillars
/menu/categories
/menu/items
```

The menu seed must never overwrite orders, tables, customers, inventory, expenses, users, or settings.

Current Phase 1 menu dataset:

- 4 pillars: `Food`, `Beverages`, `Alcohol`, `Others`
- 17 categories
- 328 menu items
- Category IDs use the `c_` prefix.

Each category/item can carry an explicit `printRoute`:

- `KOT` — kitchen ticket.
- `BOT` — bar/bottle ticket.

`printRoute` takes precedence over the older `sendToKitchen` compatibility flag. Menu items may have availability, descriptions, category metadata, images, and price variants such as peg/portion sizes.

Menu Management writes must use the dedicated Firebase menu write functions and update the Zustand store. The generic Firebase sync effect must not independently write menu collections.

---

## 7. Printing Architecture

The current print system has structured print jobs rather than one generic receipt trigger:

```text
KITCHEN_KOT  — kitchen ticket, no financial data
PRE_BILL     — customer verification/pre-bill with watermark
TAX_INVOICE  — official sequential tax invoice
```

Print targets are 80mm thermal layouts.

Supported behavior includes:

- KOT printing with item quantities, table, pax, time, and server.
- Pre-bills with items, discounts, VAT, and verification watermark.
- Tax invoices with bill number, payment mode, VAT, due settlement, credit settlement, amount tendered, staff attribution, logo, and footer.
- Explicit KOT/BOT station routing.
- Pending/printed status synchronized on orders.
- Desktop auto-print listener for tickets created by another device.
- Browser popup/print dispatch and WebUSB/dual-slot printer support where configured.

Do not introduce a second receipt template or a parallel print engine without first reconciling it with `src/utils/printEngine.ts`, the printer settings, print queue, and existing tests.

---

## 8. Inventory and Stock Control

Firebase is the single source of truth for:

```text
/alcoholProducts
/beverageProducts
/cigaretteProducts
/invMovements
/invMappings
```

These collections must not be read from or written to LocalStorage as a competing master.

### Operational inventory categories

- Spirits/alcohol tracked in millilitres.
- Wine tracked in millilitres so bottle and glass pours share one balance.
- Beer tracked as packaged bottle/can units.
- Soft drinks and mixers tracked as packaged bottle/can/piece units.
- Cigarettes tracked as sticks, with packet size convention of 20 sticks.
- Groceries and legacy ingredients have their own operational/local structures.

Packaged products use `packagingType` such as `btl`, `can`, or `pcs`, with optional labels like `650ml`, `330ml`, or `250ml`. Restocking uses raw units; carton multipliers are not used.

POS inventory deduction behavior:

- Sending an item to the kitchen deducts through `invMappings`.
- Voiding a previously sent item restores the deducted inventory.
- Unsaved/draft items do not deduct stock.
- Inventory movement records are retained for audit/history.
- `scripts/seedInventory.mjs` seeds the inventory master with categorized products, zero stock, and minimum stock values, then clears inventory logs.

Stock enforcement behavior:

- Admin settings expose `flexible` and `strict` stock-enforcement modes.
- Flexible mode permits negative inventory and surfaces deficits for reconciliation.
- Strict mode blocks mapped sales whose projected stock is insufficient.
- Admin/Manager PIN authorization can override a strict-mode deficit at the order-send boundary.
- Deficit calculations use mapped alcohol millilitres, beverage package units, and cigarette sticks, with sequential deductions across the current send batch.

---

## 9. Administration

The Admin workspace currently includes:

- **Dashboard** — performance summary.
- **Menu** — categories, items, pricing, availability, and KOT/BOT routing.
- **Tables** — table creation, editing, area assignment, and removal.
- **Reports** — sales, kitchen/meat analytics, closed-day history, CSV exports, revenue, VAT, expenses, and net profit.
- **Customers** — customer balances, repayments, and customer analytics.
- **Inventory** — alcohol, beverage, cigarette, grocery, mappings, and stock movement operations.
- **Expenses** — maintenance expense tracking.
- **Settings** — company profile, billing/receipts, payment wallets, printers, staff/users, and data management.

Company settings include café name, phone, address, PAN, footer, logo, bill counters, VAT configuration, wallet configuration, and receipt preview.

Maintenance expenses are Firebase-backed. Reports calculate:

```text
Net Profit = Revenue − Operating Expenses
```

The expense model is intended to support maintenance and operating-cost reporting without mixing expenses into sales payments.

---

## 10. Data Storage and Ownership

### Local state

Zustand stores and `src/storage/db.ts` provide local persistence for operational fallback and UI state. LocalStorage is appropriate for:

- Current POS state and cached records.
- Staff local state/fallback.
- Customer local offline fallback.
- Offline mutation queue.
- Local report/closed-shift snapshots where applicable.

### Firebase shared state

Firebase is authoritative for synchronized operational records:

- Orders and order tombstones.
- Tables and reset markers.
- Payments and sales-history reset marker.
- Customers and repayment-related customer data.
- Staff accounts.
- Menu data.
- Settings and wallets.
- Inventory master, mappings, and movements.
- Kitchen purchases, meat entries, grocery purchases.
- Maintenance expenses.
- Area ordering and related shared configuration.

Never introduce a second source of truth for a Firebase-owned collection without documenting reconciliation, offline behavior, and reset semantics first.

### Important Firebase paths

```text
/orders
/orderTombstones
/tables
/payments
/customers
/customerCreditResetTombstones       # legacy/transition path; complete reset removes it
/resetMarkers
/users
/settings
/menu/pillars
/menu/categories
/menu/items
/areaOrder
/alcoholProducts
/beverageProducts
/cigaretteProducts
/invMovements
/invMappings
/kitchenPurchases
/meatEntries
/groceryPurchases
/maintenanceExpenses
/settlementClaims/{orderId}       # online final-settlement claim/lease
```

---

## 11. Firebase Synchronization Rules

This is the most sensitive part of the architecture. Any new feature that writes shared records must follow these rules.

### UUID-keyed collection storage

Orders and tables must be stored as objects keyed by their record UUID, never as arrays. Array writes create integer Firebase keys and can produce duplicate records.

- Outbound order/table collection pushes use UUID-keyed objects.
- Inbound subscriptions preserve the actual Firebase key.
- Integer or mismatched legacy keys are pruned in background batch updates.
- Callback data is deduplicated by canonical record ID.

### Atomic order/table mutations

Related order and table changes must be published in one multi-location Firebase update with shared `syncRevision` and `syncMutationId` metadata.

Do not split a table occupancy change and its order change into independent writes when they represent one user action.

### Tombstones

Order deletion requires a durable order tombstone. A missing remote order is not proof that a delayed offline write should be allowed to recreate it.

### Reset generations

Selective reset and eligible order/payment/table writes share opaque reset generations:

- Active-floor reset generation applies to active orders and occupied tables.
- Sales-history reset generation applies to completed/non-running orders and payments.
- Customer-credit reset has its own reset marker semantics.
- Writes created before reset-marker hydration must not be guessed as safe.
- Client timestamps are not a valid reset conflict mechanism because terminal clocks can differ.

### Remote/local convergence

- Remote snapshot handlers update local state only when data differs.
- Remote-update flags prevent local effects from immediately echoing a snapshot back to Firebase.
- Local-preservation “firewall” behavior is guarded and debounced; it must not resurrect authoritative remote clears.
- Cross-tab pending-write maps acknowledge the originating mutation when Firebase echoes it.
- Repairs must be self-terminating and must delete the original stale Firebase key, not only write a corrected UUID path.

### Firebase connection discipline

Use the configured singleton database instance from `src/firebase.js`. Do not initialize another Firebase database instance for telemetry, probes, or feature code.

### Settlement claim discipline

- Only final settlements claim `/settlementClaims/{orderId}`; partial split allocations must remain sequentially payable.
- Claims are Firebase transactions, not unconditional updates.
- The persisted per-order idempotency key must be reused for retries; competing keys are rejected while the claim lease is active.
- A claim is a short recovery lease, not a complete accounting transaction. Payment/order/customer/inventory/print reconciliation still needs explicit failure handling.

---

## 12. Offline and Multi-Terminal Behavior

The persistent offline outbox is stored under:

```text
pos_offline_mutation_queue
```

It is FIFO, survives page refreshes, and supports retry counts with an exhaustion limit. Successful replay dequeues the mutation; failed replay increments its retry count. Selective reset clears queued mutations for reset domains so stale work cannot be replayed after a wipe.

When designing offline features, explicitly define:

1. Whether the action can safely queue.
2. Its reset domain.
3. Its idempotency key.
4. Its conflict behavior if another terminal changes the same record.
5. Whether it needs a tombstone or generation check.
6. What the user sees when the operation is pending or rejected.

The app is expected to run on several open terminals simultaneously. A feature that works on one tab but produces duplicate writes, stale resurrection, or repeated full-collection broadcasts on four tabs is not complete.

Settlement-specific behavior:

- Online final settlements claim the order before local payment finalization.
- Offline settlements use the existing outbox/local synchronous path and cannot provide cross-device claim protection until reconnect.
- Review and Payment screens detect a remote paid order or freed table, close payment state, notify the operator, and return to `/`.
- A final settlement retry reuses its localStorage idempotency key; split allocations do not consume the final claim.

---

## 13. Selective Reset Semantics

Selective reset modules currently include:

- Sales history.
- Active floor.
- Customer credit/directory.
- Kitchen operations.
- Bar inventory.
- Maintenance expenses.

Reset behavior:

- **Sales history:** removes applicable payments/orders, resets billing counters as configured, and records a generation marker.
- **Active floor:** frees tables, removes active order occupancy, and records an active-floor generation.
- **Customer credit/directory:** completely deletes customer profiles, repayments, and customer reset ledger/tombstone data.
- **Kitchen operations:** clears kitchen purchase, meat, and grocery operational records.
- **Bar inventory:** clears movement history and resets tracked stock while preserving product definitions.
- **Maintenance expenses:** clears expense records.

Protected master configuration must remain intact during resets:

- Table definitions/layout.
- Menu pillars, categories, and items.
- Staff accounts.
- Inventory product definitions and mappings when only stock is reset.
- Company/settings data unless explicitly included by the reset contract.

All reset changes need both Firebase-side and local-state tests.

---

## 14. Code Organization

Important locations:

```text
src/App.tsx                         Application bootstrap, routes, subscriptions
src/types/pos.ts                    Domain models
src/types/staff.ts                  Staff and permissions
src/types/selectiveReset.ts         Reset selection model
src/store/usePOSStore.ts            Orders, tables, payments, settings
src/store/useCustomerStore.ts       Customers and repayments
src/store/useStaffStore.ts          Staff accounts and current user
src/store/useInventoryStore.ts      Inventory products and movements
src/store/useMaintenanceStore.ts   Maintenance expenses
src/hooks/useFirebaseSync.ts        Main Firebase subscription/effect bridge
src/utils/firebaseSync.ts           Firebase readers, writers, reset guards, repair
src/utils/selectiveReset.ts         Local reset behavior and reset orchestration
src/utils/offlineQueue.ts           Durable offline mutation outbox
src/utils/calcBill.ts               Billing calculation source of truth
src/utils/printEngine.ts            Structured KOT/pre-bill/tax invoice printing
src/utils/venueSeed.ts              Idempotent canonical venue seed
src/data/defaultSeeds.ts            Local/default seed data
src/screens/TableOverview.tsx       Blueprint and table selection
src/screens/OrderScreen.tsx         Menu and order entry
src/screens/ReviewScreen.tsx        Review, discount, Khatta, settlement
src/screens/KitchenPortal.tsx       Kitchen station workflow
src/screens/BarPortal.tsx           Bar station workflow
src/screens/CustomersPortal.tsx     Customer directory and ledger UI
src/screens/AdminPanel.tsx          Administration
```

Keep new functionality in focused modules. Avoid putting business rules directly into large screens when the rule affects synchronization, billing, inventory, or reset behavior.

---

## 15. Testing and Quality Expectations

The current Vitest suite covers 54 tests across 11 test files. Recent verification:

```text
Test Files  11 passed
Tests       54 passed
```

Important test areas include:

- Customer Khatta and repayments.
- Customer repayment modal behavior.
- Menu filtering.
- Print status synchronization.
- Review/check-out settlement.
- Selective reset local behavior.
- Selective reset Firebase behavior.
- Staff attribution.
- Table naming and display.
- WebUSB dual-slot printing.

For every new feature:

- Add or update focused tests.
- Run `npm test`.
- Run `npm run build`.
- Check the running Replit workflow and browser console.
- If Firebase behavior changes, test multi-tab/duplicate-key/reset cases, not only the happy path.

---

## 16. Architectural Constraints for Future Work

These constraints should be treated as non-negotiable unless a migration plan is explicitly approved:

1. Do not replace Firebase with another database.
2. Do not create a second Firebase app/database singleton.
3. Do not write Firebase-owned collections as arrays.
4. Do not use broad root transactions where targeted reads and multi-location updates are sufficient and Firebase rules do not permit root access.
5. Do not make localStorage the master for Firebase-owned inventory or synchronized customer/order data.
6. Do not bypass reset generations, tombstones, or pending mutation guards.
7. Do not add a parallel billing calculation path.
8. Do not add a second printing engine or receipt layout without consolidating the existing one.
9. Do not silently seed local defaults back into Firebase when Firebase is intentionally empty after a reset.
10. Do not remove staff attribution, audit metadata, or void history from new order/payment flows.
11. Preserve backward compatibility for legacy fields such as `sentToKitchen`, older table names, and existing Firebase records.
12. Prefer idempotent operations and explicit failure handling over silent fallbacks.

---

## 17. Current Risks and Good Areas for Future Planning

These are planning topics, not commitments:

- Improve observability for Firebase write failures, retry state, sync health, and stale-key cleanup.
- Add production monitoring and reconciliation for settlement claim leases and downstream payment/order writes.
- Reduce bandwidth from large collection snapshots and bulk `set()` operations where safe.
- Add stronger automated multi-tab simulations for reset and conflict scenarios.
- Formalize data migration/versioning for legacy Firebase paths and records.
- Improve offline UX: pending action visibility, retry controls, and conflict explanations.
- Clarify the long-term role of the legacy `/payment/:tableId` route.
- Expand printer diagnostics and station availability feedback.
- Add deeper inventory audit, stock valuation, and purchase-cost reporting.
- Improve staff activity/audit reporting and permission administration.
- Review PWA/service-worker behavior for long-lived restaurant terminals.
- Consider splitting large frontend bundles only if startup performance becomes a real operational issue.
- Add a production-mode two-terminal race test covering sequential split payments, competing final claims, and claim recovery after a crashed terminal.

External AI planning should treat these as hypotheses to investigate, not as approved scope. Any proposal should identify affected data paths, source-of-truth changes, offline behavior, reset implications, multi-terminal conflict behavior, migration needs, tests, and rollback strategy.

---

## 18. Recommended Format for Future Feature Proposals

When planning the next update, describe it using this structure:

1. **User problem:** Who needs what and during which restaurant workflow?
2. **Scope:** UI, domain model, Firebase paths, local stores, printing, reporting, or all of these.
3. **Data contract:** New/changed fields, IDs, ownership, and backward compatibility.
4. **State transitions:** Normal, offline, reconnect, duplicate action, reset, and conflict cases.
5. **Firebase protocol:** Reads, writes, atomic paths, generation/tombstone rules, and legacy cleanup.
6. **Permissions:** Which roles can view, create, edit, void, settle, reset, or administer it?
7. **Operational UX:** Loading, pending, success, failure, retry, and audit feedback.
8. **Tests:** Unit, component, integration, multi-tab, and migration coverage.
9. **Rollout:** Seed/migration steps, safe deployment order, and rollback plan.
10. **Out of scope:** Explicitly state what the proposal must not change.

---

## 19. Working Principles

- Preserve restaurant operations first: an active order, payment, stock deduction, or customer ledger must not be lost silently.
- Prefer one authoritative write path per domain.
- Make synchronization behavior explicit and observable.
- Treat resets and deletions as distributed-system events, not merely local UI actions.
- Keep financial calculations deterministic and shared.
- Keep print output operationally predictable on 80mm thermal hardware.
- Favor small, testable changes over broad rewrites.
- Confirm current code and live data shape before relying on historical documentation.

---

## 20. Firebase Schema Migration Safety

The canonical Firebase collections below are **ID-keyed objects**, never root
arrays:

```text
/payments/{paymentId}
/alcoholProducts/{productId}
/beverageProducts/{productId}
/cigaretteProducts/{productId}
/invMappings/{mappingId}
```

Readers remain compatible with legacy arrays and numeric-key maps, but report
missing or duplicate IDs rather than trying to overwrite records in a running
POS terminal. Browser writers fail closed on malformed/duplicate IDs and write
only the canonical object shape. Payment updates remain granular at
`/payments/{paymentId}` so concurrent settlements are not replaced wholesale.
Inventory product and mapping collections also carry a reserved, reader-ignored
`__barInventoryReset` generation sentinel. It lets scoped collection
transactions reject a stale terminal after a selective bar-inventory reset,
including when a collection has no product records.

### Controlled migration procedure

`scripts/fixDatabaseSchema.mjs` is the only operational cleanup command for
these paths and for the deprecated menu roots:

```text
/pillars
/categories
/menuItems
```

1. Store a short-lived Firebase database auth token in Replit Secrets as
   `FIREBASE_DATABASE_AUTH_TOKEN`; never place it in source, docs, or shell
   history.
2. Run `npm run migrate:firebase-schema` (the default is read-only dry-run).
   It authenticates, exports only the affected records into an ignored backup
   directory, and writes a detailed comparison report.
3. Resolve every malformed/duplicate ID and any menu mismatch from the report.
   The script will not write data when either condition exists.
4. Review the backup and report. Only then run
   `node scripts/fixDatabaseSchema.mjs --confirm`.
5. The confirmed run first creates a backup, atomically writes the normalized
   ID-keyed collections, removes legacy menu roots only when they match the
   complete canonical `/menu/*` data, and rereads the database to verify every
   affected path.

The retired `scripts/wipeMenu.mjs` deliberately performs no deletion. Do not
use it to reset menu or inventory data. The migration script never touches
orders, tables, customers, staff, settings, expenses, or inventory movements.