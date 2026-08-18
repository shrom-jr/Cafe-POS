# Bamboo POS — 360-Degree Read-Only Codebase & Architecture Audit

**Audit status:** Complete across all 15 requested sections.

**Audit date:** 2026-08-18

**Inspection mode:** Read-only. No files under src/, electron/, public/, or scripts/ were modified. No Firebase data, database writes, seeds, tests, packages, workflows, or environment settings were changed.

## Audit completion confirmation

The original 15-section inspection was completed. Some explorer output was condensed by the chat transport, but the missing continuations were retrieved and incorporated into this unabridged report. No requested section remains pending because of chat output limits.

The inspection covered the application source, Electron wrapper, storage and synchronization code, printer transports, tests, configuration, public assets, and repository topology. Firebase security rules, deployed production data, actual Windows printer behavior, and runtime network failure behavior cannot be proven from source-only inspection and are called out as limitations rather than guessed.

---

# Executive Summary

Bamboo POS is a React + TypeScript + Vite restaurant point-of-sale application using Zustand for local state, Firebase Realtime Database for live synchronization, localStorage for explicit persistence, browser WebUSB for direct ESC/POS printing, and Electron IPC for native silent Windows printing.

The application has broad operational coverage:

- Floor/table management
- Order entry and cart workflows
- KOT/BOT ticket generation
- Kitchen and bar portals
- Inventory deduction and restoration
- Customer credit/Khatta ledgers
- Pre-bills, split bills, QR payments, and tax invoices
- Maintenance expenses
- Staff roles and PIN login
- Dual-station printer routing
- Electron splash, auto-launch, and close protection

The strongest architectural elements are:

1. Structured order, ticket, payment, inventory, and customer types.
2. Separate KOT/BOT routing with item/category precedence.
3. Serial-aware dual WebUSB printer pairing.
4. Electron native printer discovery and silent printing.
5. Atomic local print-status updates through one order-state update.
6. Inventory mappings that support automatic sale deduction and void restoration.
7. Customer repayments represented as auditable ledger records.
8. Local normalization guards for several legacy Firebase payload shapes.

The highest-impact risks are:

1. **Authentication and authorization are client-side only.** Plaintext PINs and permissions are stored in localStorage, and domain actions do not enforce authorization independently of the UI.
2. **Firebase synchronization is predominantly whole-node replacement.** Full arrays and customer records are written with set(), so concurrent devices can erase each other's changes.
3. **There is no durable application-level offline mutation queue.** Reconnect receives fresh snapshots but does not replay a durable operation log.
4. **Orders, tables, payments, inventory, and customer ledgers are not transactionally coordinated.** A partial failure can leave those domains inconsistent.
5. **There is no shift open/close, cash reconciliation, X report, Z report, or immutable day-end snapshot.** Reports are derived from mutable live arrays.
6. **The built-in export is incomplete.** It excludes staff, customers, specialized inventory, kitchen purchases, meat tracking, expenses, and device settings.
7. **The cash-drawer requirement is incomplete.** ESC p exists as a KOT printer buzzer pulse, not as a payment-triggered drawer-opening workflow.
8. **Firebase empty-node behavior is inconsistent.** Some domains preserve local state, some reset local state, and some can resurrect stale local state.
9. **The codebase contains multiple print/layout implementations with different width and delivery semantics.**
10. **The initial bundle is eager and admin-heavy.** App.tsx imports all major screens and AdminPanel.tsx is a large monolithic module.

Before expanding to more concurrent terminals or relying on the POS for strict accounting guarantees, the safest priorities are server-backed authentication, record-level transactional synchronization, durable offline replay, immutable shift closing, complete backup/restore, and explicit cash-drawer integration.

---

# 1. File System & Code Topology

## 1.1 Application shell and pages

- src/App.tsx — application shell, startup hydration, Firebase synchronization, route selection, table/customer seed logic.
- src/pages/Index.tsx — main route shell.
- src/pages/NotFound.tsx — fallback route.

## 1.2 Authentication and staff files

- src/screens/PinLoginScreen.tsx — staff selection, PIN modal, login, forgot-PIN flow, OTP reset UI.
- src/store/useStaffStore.ts — users, current user, login/logout, local session persistence, staff mutations.
- src/types/staff.ts — Role, StaffPermissions, StaffUser, default role permissions.
- src/utils/permissions.ts — first permitted route calculation.
- src/utils/staffName.ts — staff attribution helpers.

## 1.3 Table and order screens

- src/screens/TableOverview.tsx — floor/table overview, table cards, table occupancy, customer attachment.
- src/screens/OrderScreen.tsx — menu browsing, cart, item selection, notes, item editing, send-to-kitchen.
- src/screens/ReviewScreen.tsx — review, pre-bill, split bill, due settlement, payment confirmation, tax invoice flow.
- src/screens/PaymentScreen.tsx — payment result/legacy payment flow and QR payment path.
- src/components/orders/OrderPanel.tsx — reusable cart/order panel.
- src/components/orders/MenuItemCard.tsx — menu item display and selection.
- src/components/orders/CustomerPicker.tsx — customer/Khatta attachment.
- src/components/orders/VoidItemModal.tsx — item void flow.
- src/components/tables/TableCard.tsx — individual table card.
- src/components/payment/QRDisplay.tsx — wallet QR display.

## 1.4 Kitchen and bar files

- src/screens/KitchenPortal.tsx — kitchen operational portal, purchases, and meat tracker.
- src/screens/BarPortal.tsx — bar operational portal and BOT workflows.
- src/screens/reports/KitchenReportTab.tsx — kitchen reports.
- src/store/useKitchenPurchasesStore.ts — kitchen purchases.
- src/store/useMeatTrackerStore.ts — meat tracker entries.
- src/store/useBarRestockStore.ts — bar restock/audit state.

## 1.5 Administration files

- src/screens/AdminPanel.tsx — admin shell, dashboard, reports, customers, inventory, expenses, settings, staff, imports/exports, reset.
- src/screens/admin/ExpensesSection.tsx — maintenance expenses.
- src/screens/admin/MenuManagement.tsx — menu categories and items.
- src/screens/admin/StaffManagement.tsx — staff records and permissions.
- src/screens/BillHistory.tsx — bill history, date filters, payment display, reprints.
- src/screens/CustomersPortal.tsx — customer portal.
- src/components/customers/CustomersView.tsx — customer ledger and repayment UI.
- src/components/settings/PrinterSettingsModal.tsx — printer discovery/pairing, hub, buzzer, auto-start.

## 1.6 Inventory files

- src/screens/InventorySection.tsx — inventory hub.
- src/screens/inventory/OverviewSection.tsx — stock overview.
- src/screens/inventory/PurchasesSection.tsx — purchase/movement views.
- src/screens/inventory/MovementsSection.tsx — stock movement history.
- src/screens/inventory/GrocerySection.tsx — grocery purchasing.
- src/screens/inventory/AlcoholSection.tsx — alcohol inventory.
- src/screens/inventory/BeverageSection.tsx — beverage inventory.
- src/screens/inventory/CigaretteSection.tsx — cigarette inventory.
- src/screens/inventory/PackagedStockTab.tsx — packaged stock.
- src/screens/inventory/BarRestockAudit.tsx — bar restock audit.
- src/screens/inventory/ActivityCard.tsx — activity display.
- src/screens/inventory/DrawerToolbar.tsx — inventory drawer controls.
- src/screens/inventory/components.tsx — shared inventory components.
- src/screens/inventory/styles.ts — inventory styles.

## 1.7 Shared UI primitives

- src/components/ui/AppLayout.tsx — top navigation, theme, user switching, sync button.
- src/components/ui/Navigation.tsx — theme/navigation helpers.
- src/components/ui/dialog.tsx — dialog primitive.
- src/components/ui/drawer.tsx — drawer primitive.
- src/components/ui/sheet.tsx — sheet primitive.
- src/components/ui/alert-dialog.tsx — alert dialog primitive.
- src/components/ui/popover.tsx — popover primitive.
- src/components/ui/dropdown-menu.tsx — dropdown primitive.
- src/components/ReceiptPreview.tsx — receipt preview.
- src/components/ThermalReceiptLayout.tsx — thermal receipt layout.

## 1.8 Stores and infrastructure

- src/store/usePOSStore.ts — tables, orders, payments, settings, menu and core POS state.
- src/store/useStaffStore.ts — staff and session state.
- src/store/useInventoryStore.ts — product, movement, mapping, deduction, restoration state.
- src/store/useCustomerStore.ts — customer and repayment ledger state.
- src/store/useKitchenPurchasesStore.ts — kitchen purchase state.
- src/store/useMeatTrackerStore.ts — meat entries.
- src/store/useMaintenanceStore.ts — maintenance expenses.
- src/storage/db.ts — localStorage database wrapper, migration, export/import, reset.
- src/firebase.js — Firebase application and RTDB initialization.
- src/hooks/useFirebaseSync.ts — live listeners and local-to-cloud effects.
- src/hooks/useOnlineStatus.ts — Firebase connection status.
- src/hooks/usePrintQueue.ts — auto-print hub listener and dispatch.

## 1.9 Utility and hardware files

- src/utils/firebaseSync.ts — RTDB readers/writers and normalization.
- src/utils/calcBill.ts — subtotal, discount, VAT, total calculation.
- src/utils/format.ts — formatting helpers.
- src/utils/units.ts — base-unit conversion.
- src/utils/kitchenTimings.ts — kitchen timing helpers.
- src/utils/menuFilter.ts — menu filtering.
- src/utils/repaymentMethod.ts — repayment labels.
- src/utils/tableName.ts — table naming.
- src/utils/venueColors.ts — venue colors.
- src/utils/venueSeed.ts — venue/table seed support.
- src/utils/ticketSplitter.ts — KOT/BOT/VOID route splitting.
- src/utils/silentPrint.ts — structured print job routing.
- src/utils/browserPrint.ts — HTML receipt builders and native/browser printing.
- src/utils/escpos.ts — raw ESC/POS builders and WebUSB dispatch.
- src/utils/webusbPrinter.ts — dual-slot WebUSB identity/reconnect/transfer logic.
- src/utils/printEngine.ts — legacy/alternate print engine.
- src/utils/printer.ts — legacy printer helpers.
- src/utils/print.ts — legacy receipt/print helpers.
- src/utils/buildReceiptText.ts — receipt text generation.
- src/utils/sounds.ts — synthesized Web Audio cues.
- src/types/pos.ts — POS domain types.
- src/types/electron.d.ts — Electron bridge types.

## 1.10 Electron files

- electron/main.js — main process, splash, window, native printing, printer discovery, autostart, close guard.
- electron/preload.js — contextBridge IPC surface.
- electron/splash.html — native startup splash.
- electron/package.json — Electron Builder and NSIS packaging.
- electron/assets/ — packaged icon assets expected by Electron Builder and splash.

## 1.11 Tests and configuration

Tests are under src/test/ and cover customers/Khatta, menu filters, staff attribution, table naming, checkout settlement, print status, and dual WebUSB behavior.

The repository also includes public assets, scripts, Vite configuration, package configuration, Electron packaging configuration, and attached reference/request files. No protected directory was modified during this audit.

---

# 2. Firebase Realtime Database Schema & Data Flow

## 2.1 Firebase initialization

Firebase is initialized in src/firebase.js with the configured RTDB URL. The source does not show Firebase Auth integration, explicit offline persistence, custom retry configuration, or a server-side authorization layer.

The active adapter in src/utils/firebaseSync.ts imports ref, onValue, and set. Repository inspection found no application calls to update(), remove(), push(), runTransaction(), onDisconnect(), or enablePersistence(). Functions named push...ToFirebase use full-node set operations.

## 2.2 RTDB node map

### /orders

- Writer: pushOrdersToFirebase in src/utils/firebaseSync.ts.
- Subscriber: subscribeToOrders.
- Payload: complete Order[].
- Normalization: arrays/keyed objects/null are converted with toArray; order items, tablePayments, and payment itemIds are guarded as arrays.
- Local effect: useFirebaseSync writes the complete current orders array after remote hydration.

### /tables

- Writer: pushTablesToFirebase.
- Subscriber: subscribeToTables.
- Payload: complete CafeTable[].
- Fields include id, number, section, status, optional orderId, orderStartTime, and pax.
- Local effect: complete current table array.

### /payments

- Writer: pushPaymentsToFirebase.
- Subscriber: subscribeToPayments.
- Payload: complete Payment[].
- Local effect: complete current payment array.

### /settings

- Writer: pushSettingsToFirebase.
- Subscriber: subscribeToSettings.
- Payload: complete Settings object.
- Null/falsy remote settings snapshots are ignored rather than clearing settings.
- Settings hydration merges nested wallet defaults, but there is no complete runtime schema validator.

### /settings/logo

- Writer: pushLogoToFirebase.
- Subscriber: subscribeToLogo.
- Payload: logo string or null.
- These functions are present in firebaseSync.ts but are not the main useFirebaseSync settings effect.

### /areaOrder

- Writer: pushAreaOrderToFirebase.
- Subscriber: subscribeToAreaOrder.
- Payload: string[].

### /menu/items

- Writer: pushMenuItemsToFirebase.
- Subscriber: subscribeToMenuItems.
- Payload: MenuItem[].
- Menu management writes are handled directly by menu-specific push functions rather than a general useFirebaseSync effect.

### /menu/categories

- Writer: pushCategoriesToFirebase.
- Subscriber: subscribeToCategories.
- Payload: Category[].

### /menu/pillars

- Subscriber: subscribeToPillars.
- Payload: string[].
- No active writer was found in firebaseSync.ts or useFirebaseSync.ts.

### /alcoholProducts

- Subscriber: product listener in firebaseSync.ts.
- Payload: AlcoholProduct[].
- Absent values normalize to an empty array.
- No active writer was found in firebaseSync.ts or useFirebaseSync.ts.

### /beverageProducts

- Subscriber: product listener.
- Payload: BeverageProduct[].
- Absent values normalize to an empty array.
- No active writer was found in the active sync layer.

### /cigaretteProducts

- Subscriber: product listener.
- Payload: CigaretteProduct[].
- Absent values normalize to an empty array.
- No active writer was found in the active sync layer.

### /groceryPurchases

- Writer: pushGroceryPurchasesToFirebase.
- Subscriber: subscribeToGroceryPurchases.
- Payload: GroceryPurchase[].
- Existence state is also passed to the store so missing and empty can be distinguished in some flows.

### /invMovements

- Writer: pushInventoryMovementsToFirebase.
- Subscriber: subscribeToInventoryMovements.
- Payload: InventoryMovement[].

### /invMappings

- Writer: pushInvMappingsToFirebase.
- Subscriber: subscribeToInvMappings.
- Payload: InvMenuMapping[].

### /users

- Writer: pushStaffToFirebase.
- Subscriber: subscribeToStaff.
- Payload: StaffUser[].
- Legacy keyed-object snapshots are converted with Object.values.
- Missing active fields default to active true.
- App.tsx also subscribes to staff, producing duplicate /users listeners.

### /pinResets/{userId}

- Writer: writePinReset.
- Payload: { otp, expiresAt }.
- Reset validation is primarily client-side rather than server-authoritative.

### /kitchenPurchases

- Writer: pushKitchenPurchasesToFirebase.
- Subscriber: subscribeToKitchenPurchases.
- Payload: PurchaseEntry[].
- Existence state is tracked.

### /meatEntries

- Writer: pushMeatEntriesToFirebase.
- Subscriber: subscribeToMeatEntries.
- Payload: MeatEntry[].
- Existence state is tracked.

### /maintenanceExpenses

- Writer: pushMaintenanceExpensesToFirebase.
- Subscriber: subscribeToMaintenanceExpenses.
- Payload: MaintenanceExpense[].
- Existence state is tracked.

### /customers/{id}

- Writer: writeCustomer.
- Delete: deleteCustomerFirebase writes null with set rather than using remove.
- Payload: complete Customer record plus embedded repayments array.

### /customers

- Writer: writeCustomersToFirebase, primarily for startup/seed behavior.
- Subscriber: subscribeToCustomers.
- Payload: object keyed by customer ID, although array-shaped legacy snapshots are also accepted.
- Missing repayment arrays are normalized to empty arrays.

## 2.3 Listener lifecycle

useFirebaseSync.ts subscribes to the active Firebase nodes in one hook and returns cleanup functions. It also installs local-to-Firebase effects after the first remote snapshot for each domain.

The effects use hasLoaded... refs and one-shot isRemote... refs to avoid immediate feedback loops. These refs are not versioned and do not represent a durable synchronization protocol.

---

# 3. Offline Engine, Local Storage & Reconnection Sync

## 3.1 Explicit persistence

The explicit persistence layer is localStorage, not IndexedDB.

src/storage/db.ts stores core POS values under keys including:

- pos_tables
- pos_categories
- pos_menuItems
- pos_orders
- pos_payments
- pos_settings
- pos_ingredients
- pos_recipes
- pos_stockMovements
- pos_pillars
- pos_areaOrder

Other stores use additional localStorage keys for:

- Staff users and current session
- Customers and repayments
- Grocery purchases
- Inventory mappings
- Meat tracker data
- Printer device assignments
- Print-hub state

Alcohol, beverage, cigarette product collections, and invMovements are intentionally not treated as localStorage master data; Firebase is their intended source of truth.

## 3.2 IndexedDB and memory

No IndexedDB implementation was found.

Zustand stores provide the in-memory live state:

- usePOSStore
- useStaffStore
- useInventoryStore
- useCustomerStore
- useKitchenPurchasesStore
- useMeatTrackerStore
- useMaintenanceStore

## 3.3 Connectivity detection

src/hooks/useOnlineStatus.ts uses Firebase .info/connected.

The initial state is optimistically true.

No explicit use of navigator.onLine, browser online/offline events, a custom ping endpoint, or a local network health probe was found.

## 3.4 Offline queue and replay

No application-level durable offline queue was found.

There is no operation journal containing:

- Operation ID
- Domain
- Payload
- Creation timestamp
- Retry count
- Dependency/order sequence
- Conflict state
- Replay acknowledgement

firebaseSync.ts catches and logs failed writes, but does not persist failed payloads for later replay.

Firebase's own in-memory SDK buffering may apply while a client remains alive, but source code does not configure persistence or guarantee replay after reload, process termination, or device loss.

## 3.5 Reconnection behavior

Reconnection is snapshot-driven:

1. Firebase connection state changes.
2. Existing onValue subscriptions receive snapshots.
3. Stores hydrate or replace state according to domain-specific behavior.
4. Local effects may write current state back to Firebase.

This is state reconciliation, not operation replay.

## 3.6 Offline risks

A local offline change can be lost if:

- The browser profile is cleared.
- The device is lost.
- localStorage quota is exceeded.
- The application restarts before Firebase accepts the write.
- A later remote snapshot replaces local state.
- Another device writes an older full array.

Customer startup includes a limited reconciliation path that can seed local customers when the remote collection is empty, but that does not provide durable mutation replay.

---

# 4. Realtime Listeners & Safety Overwrite Verification

## 4.1 Write operation audit

The application uses full-node set operations for nearly all Firebase writes.

No record-level update or transaction layer was found.

Full replacement domains include:

- Orders
- Tables
- Payments
- Settings
- Area order
- Grocery purchases
- Inventory movements
- Inventory mappings
- Staff
- Kitchen purchases
- Meat entries
- Maintenance expenses
- Customer records

Customer deletion writes null to the customer path.

## 4.2 Empty-state behavior

The code has domain-specific empty safeguards rather than one consistent policy.

### Orders, tables, payments, and staff

Some empty remote snapshots preserve non-empty local state by writing local data back to Firebase.

This protects against accidental empty initialization but can resurrect stale data after intentional deletion.

### Tables

When local and remote table state are both empty, default tables may be seeded.

Potential seed paths include:

- useFirebaseSync.ts
- App.tsx
- src/data/defaultSeeds.ts
- src/utils/venueSeed.ts

The seed is intended to be idempotent, but first-load clients can still race with each other because the resulting table array is written as a complete node.

### Menu

Menu hydration is less protected:

- The local menu cache is cleared before remote hydration.
- Menu/category/pillar subscriptions do not have equivalent empty-snapshot protection.
- A missing or unavailable menu can render an empty menu.
- A missing menu node can overwrite a previously useful local cache with emptiness.

### Specialized data

Missing Firebase nodes can reset local state for:

- Kitchen purchases
- Meat entries
- Maintenance expenses

This makes “missing” and “intentionally empty” operationally dangerous unless existence state is handled correctly at every caller.

## 4.3 Default and auto-heal logic

src/storage/db.ts has an explicit no-op seed method. The active table seed behavior is outside that wrapper.

Customer startup can write local customers to Firebase when the initial remote collection is empty.

The application therefore does have seed/write-back behavior in mount and synchronization flows even though the generic db.seed() method is intentionally empty.

## 4.4 Feedback-loop control

useFirebaseSync.ts uses one-shot remote-update suppression refs.

These refs are not timestamps, revisions, or operation IDs. Rapid remote/local interleaving can:

- Suppress a legitimate local change.
- Allow an older local snapshot to be written after a newer remote snapshot.
- Produce ordering bugs that are difficult to reproduce.

## 4.5 Safety conclusion

There is no universal guarantee that an empty or null remote snapshot renders an empty state without write-back.

The actual policy varies by domain:

- Some domains preserve local data.
- Some domains clear local data.
- Some domains seed defaults.
- Some domains have no active writer.
- Some domains can resurrect stale data.

---

# 5. Multi-Device Concurrency & Race Conditions

## 5.1 Table assignment

createOrder checks table availability against local Zustand state.

Two terminals can both see a table as free, create separate orders, and independently write complete table/order arrays.

Possible results include:

- Lost order
- Wrong orderId attached to table
- Occupied table with missing order
- Active order with a free table
- Last-writer-wins replacement of an unrelated table edit

## 5.2 Orders and tables are separate commits

Orders and tables are different RTDB nodes and are written through separate effects.

There is no atomic cross-node transaction binding:

- Table occupancy
- Order creation
- Order clearing
- Table reset
- Order movement

A crash or interleaving write can leave the two nodes inconsistent.

## 5.3 Inventory races

Inventory deductions and restorations calculate from local state and replace complete arrays.

Concurrent operations can lose:

- Product quantity changes
- Inventory movement records
- Restock entries
- Sale deductions
- Void restorations

Math.max(0, quantity) hides overselling instead of rejecting it atomically.

## 5.4 Customer ledger races

Customer due, repayment, consumption, and visit changes replace complete customer records containing embedded repayments.

Concurrent operations can lose:

- Repayment rows
- Due changes
- Spend totals
- Visit counts
- Consumption counters
- Top-order changes

## 5.5 Payments and duplicate settlement

Payments are appended to a local array and synchronized as a full array.

No idempotency key, server-side payment uniqueness check, or transaction prevents duplicate settlement records.

The UI has local confirmation guards, but they are not a distributed guarantee.

## 5.6 Print status races

Ticket status and order printStatus are inside the full order payload.

The local implementation deliberately marks ticket status and station status in a single setOrders call. That prevents a local narrow-patch race, but another device can still write an older complete order and revert a printed status to pending.

## 5.7 Stale cache resurrection

When a device has non-empty local data and Firebase appears empty, the empty firewall may rewrite the local data back to Firebase.

Without timestamps or revisions, the system cannot distinguish:

- First-time initialization
- Temporary network failure
- Intentional deletion
- Stale offline cache

---

# 6. Order Lifecycle & Table State Machine

## 6.1 Table assignment

TableOverview.tsx and usePOSStore manage:

- Free, occupied, and billing table states
- Table number and section
- Table orderId
- Order start time
- Pax count
- Customer attachment

A customer can be attached to a table before a full order exists, which can create an empty active order.

## 6.2 Order creation

createOrder:

1. Reads local table state.
2. Checks whether the table appears free.
3. Creates an active order.
4. Marks the table occupied.
5. Associates orderId and timing metadata.
6. Persists local state.

The process is not atomically reserved across devices.

## 6.3 Item selection

OrderScreen.tsx and OrderPanel.tsx manage:

- Menu item selection
- Quantity
- Notes
- Modifiers/variants
- Draft state
- Unpaid state
- Item editing

## 6.4 KOT/BOT submission

sendToKitchen in usePOSStore:

1. Selects unsent, unpaid, draft items.
2. Deducts mapped inventory.
3. Splits draft items by route.
4. Creates ticket snapshots.
5. Marks the selected items sent.
6. Merges unsent duplicate menu IDs where applicable.
7. Sets kitchen status.
8. Sets KOT/BOT print statuses pending.

Routing precedence is:

1. Item-level print route
2. Category-level print route
3. Legacy sendToKitchen behavior

## 6.5 Ticket model

Ticket types include:

- KOT
- BOT
- VOID_KOT
- VOID_BOT

Ticket statuses include pending and printed.

Order items separately track draft/sent state and can retain legacy sentToKitchen/sentAt fields.

## 6.6 Kitchen/bar progression

Kitchen and bar portals update operational item/ticket statuses such as pending, preparing, served, and related workflow state.

The order-level statuses are:

- active
- billed
- paid

The table-level statuses are:

- free
- occupied
- billing

There is no single server-enforced state machine coordinating all of these transitions.

## 6.7 Voids

voidOrderItem:

- Restores inventory for already-sent items.
- Removes or reduces the order item.
- Writes voidHistory.
- Creates a VOID_KOT or VOID_BOT ticket for sent items.

A partial failure can leave inventory, order, and void ticket state divergent.

## 6.8 Pre-bill and settlement

ReviewScreen.tsx:

- Calculates the bill.
- Separates unpaid items.
- Supports pre-bill printing.
- Supports split quantities.
- Supports previous customer due settlement.
- Supports partial cash with a new credit booking.
- Creates payment records.
- Marks table items paid.
- Updates order status.
- Creates tax invoice jobs.

PaymentScreen.tsx has a separate payment confirmation path.

## 6.9 Clearance and archival

When fully settled, the table is reset and the operational order may be cleared.

Payments remain the primary settlement history after an order is removed.

There is no immutable, transactional transition guaranteeing:

active -> billed -> paid -> table free

A partial failure can produce:

- Paid payment with occupied table
- Free table with active order
- Billed order without payment
- Payment without corresponding due update
- Due update without payment
- Inventory deduction without a durable ticket

---

# 7. Hardware Integration & Native Electron Printing Pipeline

## 7.1 Electron main process

Current Electron files:

- electron/main.js
- electron/preload.js
- electron/splash.html
- electron/package.json
- electron/assets/

Current production URL in electron/main.js:

https://pos.sbambocottage.com.np

Current main window branding:

- Title: Bamboo POS
- Background: #0b0f17
- Context isolation enabled
- Node integration disabled
- Preload bridge enabled
- Initial main window hidden until ready-to-show

The branded splash is frameless, centered, dark, always-on-top, and destroyed after the main window is ready plus a one-second delay.

## 7.2 Native close protection

main.js tracks app.isQuitting.

The main window close event opens a native dialog unless the quit was intentional.

The dialog text is:

- Title: Exit Bamboo POS
- Message: Are you sure you want to exit the POS terminal?
- Detail: Please ensure all active orders and table receipts are settled or saved.
- Buttons: Cancel, Exit POS

## 7.3 Preload bridge

electron/preload.js exposes:

- getPrinters()
- printSilent(html, deviceName)
- getAutoStart()
- setAutoStart(enable)
- isElectron

Types are declared in src/types/electron.d.ts.

## 7.4 Printer discovery

main.js handles get-printers with webContents.getPrintersAsync().

PrinterSettingsModal.tsx uses the result to populate OS printer dropdowns.

The selected device names are stored in localStorage:

- printer_kitchen_device_name
- printer_reception_device_name

The stored name must exactly match the Windows printer spooler name.

A renamed, removed, disconnected, or unavailable printer can cause a native print error. The code does not provide a full saved-name validation/repair workflow.

## 7.5 Native silent printing

The Electron route is:

1. Renderer builds complete HTML receipt.
2. Renderer calls window.electronAPI.printSilent.
3. Preload invokes silent-print.
4. Main process creates a hidden approximately 302 px wide BrowserWindow.
5. HTML loads from a data URL.
6. webContents.print is called with silent true, printBackground true, and no margins.
7. deviceName is included when configured.
8. Print callback returns success/error.
9. Temporary window is destroyed.
10. A timeout prevents a permanently unresolved print promise.

No print dialog or preview is intentionally shown in Electron mode.

## 7.6 Browser/WebUSB route

The browser route uses:

- src/utils/webusbPrinter.ts
- src/utils/escpos.ts
- src/utils/silentPrint.ts
- src/hooks/usePrintQueue.ts

WebUSB supports dual station slots:

- Kitchen
- Reception

Identity includes vendor ID, product ID, and serial number. A module-level reconnect chain serializes competing reconnect attempts. Re-pairing displaces conflicting in-memory and persisted assignments.

## 7.7 Auto-print hub

usePrintQueue.ts:

- Runs on the designated print hub.
- Watches orders and tickets.
- Ignores already printed tickets.
- Processes tickets newer than the current hub session start.
- Dispatches KOT/BOT/VOID tickets.
- Uses Electron native HTML printing when isElectron is true.
- Uses WebUSB ESC/POS otherwise.
- Marks success in one local setOrders update.

Historical pending tickets are cleaned up rather than automatically replayed into a new hub session.

Remote waiter orders print on the cashier desktop only if:

- That desktop is the current print hub.
- The ticket was created during the current session.
- Printer routing is configured.
- The device is online or the active transport succeeds.

## 7.8 Ticket routing

KOT and VOID_KOT target the kitchen station.

BOT, VOID_BOT, pre-bills, and tax invoices target the reception/bar station.

The Electron path calls browserPrintKOT, browserPrintBOT, browserPrintVoidTicket, browserPrintPreBill, and browserPrintTaxInvoice as appropriate.

## 7.9 ESC/POS widths and commands

src/utils/escpos.ts documents:

- 80 mm paper
- 48 characters per line
- ESC @ initialization
- GS V cut
- ESC E bold
- ESC a alignment
- GS ! size changes
- ESC p buzzer/open pulse

The browser HTML path uses an 80 mm receipt CSS width.

Legacy print utilities use approximately 68–72 mm content widths.

The hidden Electron print window is approximately 302 px wide and relies on receipt @page CSS rather than forcing a pageSize.

The multiple width systems create formatting regression risk.

## 7.10 Cash drawer and buzzer status

ESC p is present as CMD_BUZZER and is used with the kitchen buzzer option for supported printers.

No complete payment cash-drawer implementation was found:

- No payment-triggered drawer event
- No drawer-specific Electron IPC
- No configurable drawer pin
- No drawer opening audit
- No drawer closing/reconciliation state

The current ESC p implementation should be treated as a printer bell/KOT alert, not as a finished cash-drawer subsystem.

---

# 8. Financial Engine, Taxation & Mathematical Logic

## 8.1 Bill calculation helper

src/utils/calcBill.ts calculates:

subtotal = sum(item.price * item.quantity)

For percentage discounts:

discountAmount = round(subtotal * discountValue / 100)

For fixed discounts:

discountAmount = round(min(discountValue, subtotal))

afterDiscount = max(0, subtotal - discountAmount)

## 8.2 VAT

Default settings in src/storage/db.ts are:

- vatEnabled: true
- vatRate: 0.13
- vatMode: excluded

Excluded VAT:

vatAmount = round(afterDiscount * vatRate)
total = afterDiscount + vatAmount

Included VAT:

vatAmount = round(afterDiscount * vatRate / (1 + vatRate))
total = afterDiscount

There is no separately implemented service-charge engine.

## 8.3 Discount risks

Percentage discount values are not explicitly range-validated.

Potential issues:

- Negative percentage can increase the total.
- More-than-100 percent is indirectly clamped by afterDiscount but not rejected.
- Fixed discounts are bounded by subtotal, but negative fixed values are not clearly rejected before calculation.

## 8.4 Items, variants, and modifiers

The final OrderItem price is multiplied by quantity. Variants/modifiers are represented in the menu/order model and flow through the resulting item price/structure.

The central calcBill helper does not separately re-price modifiers; it trusts the item model.

## 8.5 Split bill math

ReviewScreen.tsx supports:

- Selecting individual items.
- Selecting partial quantities.
- Splitting an item into a synthetic order line.
- Generating a TablePayment for selected item IDs.
- Marking only the selected item IDs paid.
- Leaving remaining quantities unpaid.

splitOrderItem generates a synthetic menuItemId using a timestamp-based suffix.

Potential risk: synthetic split identifiers may not map cleanly to inventory/category consumption logic that assumes catalog menuItemId values.

## 8.6 Previous due settlement

Previous customer due is intentionally separate from new order revenue.

Payment.total remains the order revenue amount and excludes the amount of an already-booked due being collected.

The due collection is represented separately with fields such as:

- dueSettlement
- amountTendered

Reports must explicitly add dueSettlement.amount when measuring cash collected or total money received.

## 8.7 Payment duplication risk

No distributed idempotency key or server-side payment uniqueness guard was found.

UI refs prevent some double-clicks, but repeated or retried events across devices can create duplicate payment or due records.

## 8.8 Kitchen purchase math

Purchase entries contain quantity, unit, rate/cost, supplier, invoice, date, and notes.

The expected business calculation is:

quantity * rate = total cost

The store/type layer does not universally recompute total cost. Caller-provided totals can therefore become inconsistent with quantity and rate.

## 8.9 Unit normalization

src/utils/units.ts supports:

- L -> ml
- kg -> g
- Liquid, solid, and count groups
- Base quantity normalization
- Cost-per-base-unit normalization
- Display conversion back to L/kg when values are large

Examples:

- 2 L -> 2000 ml
- 1 kg -> 1000 g

Alcohol/liquid inventory remains milliliter-tracked to support bottle/glass deductions. Beer and soft drinks use packaged units; cigarettes use sticks.

## 8.10 Meat tracker reconciliation

Meat entries contain date, time, meat item, action, quantity, and optional logger.

Known actions include:

- Marinated
- Minced (Keema)
- Sent to Grill

No immutable, automatically enforced stock reconciliation formula was found that guarantees:

Opening Stock + Purchases - Consumption = Closing Stock

The current model is entry-based and sensitive to missing, duplicated, or misclassified logs.

---

# 9. Portals & Specialized Module Audit

## 9.1 Kitchen Portal

Primary files:

- src/screens/KitchenPortal.tsx
- src/store/useKitchenPurchasesStore.ts
- src/store/useMeatTrackerStore.ts
- src/screens/reports/KitchenReportTab.tsx

Kitchen functionality includes:

- KOT ticket operations
- Purchase logs
- Meat tracker
- Kitchen timing/report views
- Meat-related hardcoded action vocabulary

Purchase records include quantity, unit, cost/rate, supplier, invoice, date, note, and staff attribution where available.

Missing /kitchenPurchases or /meatEntries nodes can reset local operational state depending on hydration path.

## 9.2 Bar Portal

Primary file:

- src/screens/BarPortal.tsx

Bar functionality includes:

- BOT workflows
- Beverage inventory
- Alcohol inventory
- Cigarette inventory
- Packaged stock
- Bar restock audit

BOT and VOID_BOT tickets route to the reception/bar station.

## 9.3 Inventory architecture

Primary store:

- src/store/useInventoryStore.ts

Inventory domains:

- Alcohol products
- Beverage products
- Cigarette products
- Grocery purchases
- Inventory movements
- Inventory/menu mappings

Inventory deduction occurs during sendToKitchen through mappings. Voids restore sent-item deductions.

Important limitation: the active Firebase sync layer has subscribers for alcohol, beverage, and cigarette products but no corresponding active product writers. Those collections therefore need explicit source-of-truth verification.

Concurrent deductions and restocks are not transaction-safe.

## 9.4 Expenses

Primary files:

- src/screens/admin/ExpensesSection.tsx
- src/store/useMaintenanceStore.ts

Firebase node:

- /maintenanceExpenses

Expense records contain category, amount, payment method, date, loggedBy, and createdAt.

Maintenance expenses are intended to feed net-profit/reporting logic, but missing Firebase node behavior can clear local expenses.

## 9.5 Specialized module risks

- Kitchen purchase totals are not always recomputed.
- Meat closing stock is not an immutable reconciliation result.
- Product writes are not symmetric with product listeners.
- Inventory deduction and KOT creation are not one distributed transaction.
- Void restoration and ticket creation can diverge on partial failure.
- Specialized store exports are incomplete.

---

# 10. Customer Credit / Khatta / Udharo System

## 10.1 Data model

Customer types are defined in src/types/pos.ts.

useCustomerStore.ts maintains:

- Customer identity
- Current due
- Total spend
- Visit count
- Last visit
- Food/beverage consumption
- Top orders
- Repayment history

Local keys:

- pos_customers
- pos_customer_repayments

Firebase records embed repayments inside the customer record.

## 10.2 Due creation

addToCustomerDue increases:

- currentDue
- totalSpend
- visits

The operation does not implement a customer credit limit.

## 10.3 Repayments

receiveRepayment:

- Rejects non-positive amounts.
- Validates the customer.
- Prevents repayment above current due.
- Rounds to two decimal places.
- Adds repayment audit data.
- Reduces currentDue.
- Stores method, notes, timestamp, and receiver attribution.

## 10.4 Review/payment integration

ReviewScreen.tsx supports:

- Attaching a customer to an order.
- Pay Later/Khatta.
- Previous due settlement.
- Partial cash with a credit booking.
- Due staleness detection in the local flow.
- Customer ledger attribution.

Khatta bookings write the payment and customer due changes through separate operations.

## 10.5 Firebase synchronization

writeCustomer writes the complete customer record at /customers/{id}.

writeCustomersToFirebase can write the entire /customers object.

subscribeToCustomers accepts keyed and array-shaped payloads and normalizes repayments.

## 10.6 Risks

- No credit limit or approval threshold.
- Customer ledger writes are last-write-wins.
- Concurrent repayments can erase ledger entries.
- Due creation and payment are not atomically linked.
- Duplicate settlement has no distributed idempotency key.
- A remote snapshot can replace an offline customer mutation.
- Full collection seeding can overwrite unrelated remote customers.

---

# 11. Day-End Closing & Shift Reconciliation

## 11.1 Existing reporting

- src/screens/AdminPanel.tsx — dashboard, sales reports, CSV export.
- src/screens/BillHistory.tsx — today/yesterday/custom filters and bill history.
- src/screens/reports/KitchenReportTab.tsx — kitchen reporting.
- Payment and staff attribution are displayed in BillHistory.tsx.

## 11.2 Missing register controls

No implementation was found for:

- Shift open
- Opening cash float
- Cashier shift assignment
- Cash count
- Cash over/short
- Cash/QR/card reconciliation
- X report
- Z report
- Immutable day close
- Approval/reopen workflow
- Formal shift ledger
- Shift-level drawer balance
- Formal refund model
- Reconciliation status

## 11.3 Historical report risk

Reports derive from mutable orders and payments arrays.

Because orders can be edited, cleared, imported, or replaced by Firebase synchronization, historical reports can change after the business event.

There is no immutable snapshot of a closed register.

Previous due collections must be explicitly included using dueSettlement.amount or they can be understated or ambiguously classified.

Date boundaries and KOT counter reset behavior should be standardized to the configured venue timezone.

---

# 12. Audio Feedback Engine

## 12.1 Location

The audio engine is in src/utils/sounds.ts.

It uses synthesized Web Audio API oscillators and gains. It has no external audio assets.

## 12.2 Available sounds

- playClick() — short high-to-low sine click.
- playSuccess() — three-note ascending success tone.
- playOrderSent() — ascending 800 Hz to 1200 Hz dual-tone chime.
- playBillSettled() — double triangle cash-register-style chime.
- playWarningAlert() — low 300 Hz double pulse.
- playError() — lower sawtooth warning tone.

AudioContext creation is guarded and failures are caught.

## 12.3 Confirmed triggers

OrderScreen.tsx calls playOrderSent() after the local sendToKitchen action.

PaymentScreen.tsx and ReviewScreen.tsx call playBillSettled() during payment settlement.

These sounds occur before Firebase persistence and before physical print delivery is confirmed.

## 12.4 Missing triggers/settings

No confirmed call sites were found for playSuccess(), playWarningAlert(), or playError().

No sound-volume setting, mute setting, or persisted audio preference was found.

No remote-order sound trigger exists in useFirebaseSync.ts or usePrintQueue.ts.

A remote waiter order may print at the hub and activate the printer buzzer, but it does not produce a renderer Web Audio notification.

---

# 13. User Roles, Permissions & Settings

## 13.1 Role matrix

| Role | POS/Tables | Kitchen | Bar | Admin | Attach Customer | Settle Dues | View Customers |
|---|---:|---:|---:|---:|---:|---:|---:|
| Waiter | Yes | No | No | No | Yes | No | No |
| Cashier | Yes | No | No | No | Yes | Yes | Yes |
| Kitchen | No | Yes | No | No | No | No | No |
| Admin | Yes | Yes | Yes | Yes | Yes | Yes | Yes |

Permissions are defined in src/types/staff.ts.

## 13.2 Route enforcement

App.tsx uses RequirePermission for the major POS, customer, admin, kitchen, and bar routes.

Potentially unguarded or separately reachable routes include:

- /order/:tableId
- /review/:tableId
- /payment/:tableId

The exact route guard behavior should be treated as a security-sensitive area.

## 13.3 Domain enforcement gap

Store/domain actions do not independently enforce permissions.

Sensitive actions include:

- createOrder
- sendToKitchen
- voidOrderItem
- addPayment
- updateSettings
- importData
- factoryReset

UI route protection is therefore not a sufficient authorization boundary.

## 13.4 Authentication weaknesses

- Staff PINs are stored plaintext in localStorage.
- Current sessions survive refresh without expiry.
- No server session/token is visible in source.
- No password hashing is visible.
- No attempt throttling or lockout is visible.
- No inactivity timeout is visible.
- No login audit trail is visible.
- Staff names and roles are enumerable before authentication.
- Forgot-PIN OTP generation and checking are client-side.
- EmailJS identifiers are present in client code.
- Legacy adminPin defaults to 1234.
- Admin unlock accepts a matching ADMIN PIN rather than proving current-session identity.

## 13.5 Settings storage

General settings are stored under:

- pos_settings

Settings include:

- Venue identity
- Wallet configuration
- VAT settings
- Bill and KOT counters
- Receipt appearance
- Logo configuration
- Legacy admin PIN

Device-specific printer settings use:

- printer_kitchen_device_name
- printer_reception_device_name
- pos_is_print_hub

Kitchen buzzer state is stored in settings.kitchenPrinterBuzzer.

Electron auto-start is stored through the Windows login-item API rather than localStorage.

---

# 14. Data Backup & Emergency Recovery

## 14.1 Existing export

src/storage/db.ts exportAll() serializes the core KEYS object:

- Tables
- Categories
- Menu items
- Orders
- Payments
- Settings
- Ingredients
- Recipes
- Stock movements
- Pillars
- Area order

## 14.2 Export omissions

The export excludes:

- Staff users
- PINs
- Current session
- Customers
- Repayments
- Alcohol products
- Beverage products
- Cigarette products
- Grocery purchases
- Inventory mappings
- Kitchen purchases
- Meat tracker entries
- Maintenance expenses
- Printer device assignments
- Print-hub state
- Electron auto-start state

It is therefore not a complete business backup.

## 14.3 Import weaknesses

importAll():

- Parses JSON directly.
- Does not validate complete schema.
- Does not version the backup format.
- Does not use a checksum.
- Does not provide merge preview.
- Does not offer transactional restore.
- Does not offer rollback.
- Writes recognized values without comprehensive type validation.

After import, usePOSStore refreshes only core POS state. Other stores can remain stale until reload.

## 14.4 Reset weaknesses

factoryReset and db.clearAll do not clear all application domains.

Specialized customer, staff, inventory, expense, printer, and operational data can remain after a nominal POS reset.

## 14.5 Recovery gaps

No implementation was found for:

- Scheduled backup
- Encrypted backup
- Remote backup archive
- Backup integrity verification
- Restore wizard
- Versioned snapshots
- Transactional rollback
- Device migration package
- Offline recovery bundle
- Recovery audit log

localStorage is vulnerable to profile deletion, browser cleanup, quota failure, corruption, and device loss.

---

# 15. Technical Debt, Hardcoded Limitations & Regression Risks

## 15.1 Critical risks

### Client-side authentication

PINs and permissions are client-controlled local data. This is not a security boundary.

### Whole-node Firebase replacement

Concurrent terminals can erase each other's data through last-write-wins full-array writes.

### No durable offline mutation queue

Offline changes are not guaranteed to survive restart or reconnect reconciliation.

### No immutable financial close

Historical reports are based on mutable live data.

### Incomplete backup

Critical business domains cannot be restored from the built-in export.

## 15.2 Hardcoded limitations

- Default venue name in src/storage/db.ts.
- Legacy admin PIN 1234.
- Four-digit PIN UX.
- Fixed venue/table seed assumptions.
- Hardcoded meat tracker actions.
- Exact Windows printer-name matching.
- ESC/POS assumption of 80 mm and 48 characters.
- Legacy print utilities with different widths.
- Fixed production Electron URL.
- Public client-side EmailJS identifiers.

## 15.3 Validation and hydration risks

- Remote Firebase payloads are not fully runtime schema-validated.
- Imported JSON is trusted with minimal validation.
- Array/null guards differ by domain.
- Missing specialized nodes can clear local stores.
- Menu hydration can clear cache before remote success.
- Empty firewalls can resurrect stale local data.
- Settings can be legacy/incomplete and require nested default merging.

## 15.4 Print-system duplication

The repository contains multiple print systems:

- src/utils/silentPrint.ts
- src/utils/browserPrint.ts
- src/utils/escpos.ts
- src/utils/printEngine.ts
- src/utils/print.ts
- src/utils/printer.ts
- src/utils/buildReceiptText.ts

They differ in:

- Receipt layout
- Paper width
- Browser versus Electron behavior
- Success semantics
- Failure handling
- Printer routing

This raises regression risk for receipt formatting and delivery status.

## 15.5 Bundle and maintainability risk

- App.tsx eagerly imports all major screens.
- No route-level lazy loading was found.
- AdminPanel.tsx is approximately 2,196 lines and contains many unrelated administrative domains.
- Reports, inventory, expenses, staff, and settings dependencies enter the initial bundle.
- Large chunks are already reported by the production build.

## 15.6 Financial risks

- Percentage discounts are not explicitly range-validated.
- Service charge calculation is absent.
- Purchase totals can be caller-provided.
- Customer due and payment writes are separate.
- Payment idempotency is absent.
- Previous due collection must be explicitly included in reports.
- Meat stock reconciliation is not a strongly enforced immutable calculation.

## 15.7 Safe rules for future additive changes

1. Do not add a Firebase domain using complete-array set without documenting concurrency behavior.
2. Do not seed on mount unless missing, empty, and intentionally deleted are distinguishable.
3. Never clear local data solely because a remote node is missing.
4. Add record-level IDs and operation IDs before expanding terminal concurrency.
5. Treat sendToKitchen, payment settlement, void restoration, and customer due changes as domain transactions.
6. Preserve route precedence: item route, category route, then legacy fallback.
7. Keep ticket status and station print status in one atomic local update.
8. Add new payment methods without changing historical payment semantics.
9. Never treat local PINs and UI permissions as security.
10. Version import/export before adding more data domains.
11. Use the configured venue timezone consistently for reports and counters.
12. Keep cash-drawer commands separate from printer buzzer behavior.
13. Avoid modifying menu, inventory hydration, Firebase synchronization, and printing in one unverified change.
14. Add explicit tests for empty snapshots, multi-device writes, duplicate settlement, and printer failure.
15. Preserve the Firebase inventory source-of-truth rule for alcohol, beverage, and cigarette products.

---

# Final Assessment

The audit inspection is fully complete across all requested sections.

Bamboo POS is operationally broad and suitable as a trusted-device restaurant POS foundation, but the source currently assumes relatively low concurrency and a trusted client environment. It should not be treated as a strong security boundary or a transactionally authoritative accounting system until the following are addressed:

1. Server-backed authentication and authorization.
2. Domain-level permission enforcement.
3. Record-level or transactional Firebase synchronization.
4. Durable offline mutation queue and replay.
5. Immutable shift/day-end reconciliation.
6. Complete versioned backup and restore.
7. Explicit cash-drawer integration.
8. Unified receipt/print transport semantics.
9. Consistent empty-node and missing-node safety policy.

## Source-only limitations

This report cannot determine:

- Firebase production security rules.
- Current production database contents.
- Actual deployed Firebase offline SDK behavior.
- Physical Windows spooler delivery.
- Printer driver-specific paper handling.
- Whether a device remains powered and connected during failure cases.
- Operational staff procedures outside the source code.

Those items require a separate controlled deployment or hardware validation exercise and were intentionally not executed under the read-only safety mandate.
