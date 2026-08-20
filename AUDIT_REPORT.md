# Bamboo POS — Complete 360-Degree Application Audit

**Audit date:** 2026-08-19  
**Audit revision:** Full reassessment from the current repository state  
**Inspection mode:** Read-only  
**Application:** S Bamboo Cottage & Sekuwa Corner / Bamboo POS  
**Audit scope:** Application behavior, architecture, workflows, Firebase/RTDB, offline behavior, security, calculations, inventory, payments, printing, Electron, UI/UX, accessibility, performance, testing, deployment, backup, and recovery.

## Audit safety and evidence

Only this report was intentionally updated. No application source, package manifest, dependency, workflow, deployment setting, secret, Firebase data, or production database was changed.

Evidence used:

- Direct inspection of current source and configuration.
- Three independent read-only audit explorations covering security/data, POS/finance, and UI/printing/operations.
- Current local preview screenshot at 1280×720.
- Current workflow and browser-console logs.
- Build, unit tests, lint, and dependency checks.
- Replit dependency, SAST, and HoundDog security scanners.

Severity meanings:

- **Critical:** security or integrity failure that can expose the whole system or invalidate trust.
- **High:** material financial, operational, security, or data-loss risk.
- **Medium:** meaningful defect, usability risk, or maintainability risk.
- **Low:** limited impact, documentation, polish, or test-gap issue.

Confidence is stated for findings where runtime or deployment conditions could change the result.

---

# 1. Executive summary

Bamboo POS is a feature-rich restaurant POS implemented as a React/TypeScript/Vite client with Zustand state, Firebase Realtime Database synchronization, localStorage persistence, WebUSB ESC/POS printing, and an Electron desktop wrapper.

The system supports:

- Staff profile/PIN login.
- Tables, sections, floor layout, active orders, billing, and table reset.
- Menu categories, pillars, variants, modifiers, KOT/BOT print routing.
- Kitchen and bar operational portals.
- Inventory for alcohol, beverages, cigarettes, groceries, and mappings.
- Automatic inventory deduction when items are sent and restoration for voided sent items.
- Customer Khatta/credit, repayments, due settlement, and customer consumption history.
- VAT, discounts, split payments, QR/wallet payments, pre-bills, tax invoices, and reports.
- Maintenance expenses, purchases, meat tracking, and day-end/closed-shift data structures.
- Browser/WebUSB and Electron silent printing.
- Local offline mutation outbox for selected business domains.

The application is operationally broad, but the current trust model is unsafe for an untrusted network or strict accounting environment.

## Highest-priority findings

1. **Critical:** No Firebase Authentication or server-side authorization is visible. The entire Firebase security boundary depends on RTDB rules that are not in the repository and were not verifiable.
2. **Critical:** Staff identity, permissions, and session data are client-controlled localStorage state. A user who can modify the browser can impersonate staff or grant permissions locally.
3. **Critical:** PIN-reset OTP creation and validation are client-side, use `Math.random()`, and write plaintext OTP data to Firebase.
4. **High:** Operational data subscriptions begin before login. Staff and broad POS datasets can be delivered to the client before authentication.
5. **High:** The preview repeatedly logs `Firebase Order/Table Mutation FAILED`; the writer catches and suppresses failures, so local UI success can coexist with remote persistence failure.
6. **High:** Payments, customer due changes, order/table settlement, inventory, and printing are not one atomic, idempotent business transaction.
7. **High:** Inventory sales clamp stock to zero instead of rejecting insufficient stock, allowing overselling while recording a sale.
8. **High:** `voidOrderItem` does not visibly enforce that requested void quantity is within the item quantity, creating an over-void/restoration risk.
9. **High:** Electron and packaging dependencies have one critical and eighteen high findings from the Replit dependency scanner.
10. **High:** The current test suite fails one test and lint fails with 37 errors and 14 warnings.

The system should be treated as a trusted-device prototype/operational POS until authentication, Firebase rules, transactional integrity, offline coverage, settlement idempotency, dependency remediation, and financial reconciliation are strengthened.

---

# 2. Verification results

| Check | Current result | Interpretation |
|---|---|---|
| `npm run build` | Passed | Production bundle builds successfully |
| Production bundle | 1,698.40 kB JS minified; 438.80 kB gzip | Large initial payload; Vite emitted chunk warning |
| PWA precache | 11 entries, approximately 1,795.56 KiB | Static assets are cached; cloud data is not made offline-authoritative |
| `npm test` | Failed: 1 of 54 tests | 53 passed, 1 failed |
| Failed test | `src/test/selective-reset-firebase.test.ts` | Customer record expected to survive reset, but implementation deletes `/customers` |
| `npm run lint` | Failed | 37 errors and 14 warnings |
| `npm audit --omit=dev --audit-level=high` | 2 moderate React Router advisories | No high/critical from this local npm source |
| Replit dependency scanner | 1 critical, 18 high | Release-blocking until reviewed/remediated |
| Replit SAST | 2 findings in `src/firebase.js` | Medium Google API detector and high Firebase hard-coded-secret detector |
| Replit HoundDog | 1 low privacy finding | Staff identity logged from `PaymentScreen.tsx` |
| Local preview | Loaded staff login screen successfully | No blank-screen crash at capture time |
| Browser console | Repeated `Firebase Order/Table Mutation FAILED` messages during runtime | Confirmed operational failure path requiring investigation |

The local npm audit and Replit dependency scanner use different advisory sources. The Replit scanner result is the stricter release signal and must not be dismissed because local npm audit did not reproduce it.

---

# 3. How the application works

## Startup

`src/App.tsx` initializes major application concerns before a user logs in:

1. Mounts `useFirebaseSync()`.
2. Mounts the background print queue.
3. Subscribes to staff accounts.
4. Subscribes to customers and may seed local customers to Firebase.
5. Subscribes to tables and may seed the venue layout.
6. Renders `PinLoginScreen` if no local current user exists.

The consequence is important: login is a UI gate, not the point at which data access begins.

## Logged-in navigation

After login, React Router exposes:

- `/` for tables/POS.
- `/order/:tableId` for order entry.
- `/review/:tableId` for review and settlement.
- `/payment/:tableId` for a retained/unused payment route.
- `/history`, `/customers`, `/admin`, `/kitchen`, and `/bar`.

Root, history, customer, admin, kitchen, and bar routes use `RequirePermission`. Order, review, and payment routes do not visibly use the same wrapper.

## Core order path

1. User selects a table.
2. Local state checks whether an active order exists.
3. An order and occupied table are created locally.
4. Items are added to a draft.
5. `sendToKitchen` identifies unsent items, deducts mapped inventory, splits KOT/BOT tickets, and updates order state.
6. Kitchen/bar portals process ticket/item statuses.
7. Review calculates the bill and supports partial/split settlement.
8. Payment and customer-credit state are updated.
9. Table/order state is cleared or marked paid.
10. Print jobs are dispatched through Electron, WebUSB, or browser printing.

Most steps are locally coherent but distributed across separate state writes and Firebase operations.

---

# 4. Architecture and data ownership

## Main layers

- React screens/components: interaction and presentation.
- Zustand stores: in-memory business state and local actions.
- `src/storage/db.ts`: localStorage persistence, migrations, import/export, resets.
- `src/utils/firebaseSync.ts`: Firebase listeners, record writers, bulk writers, reset generations, tombstones, and synchronization repair.
- `src/hooks/useFirebaseSync.ts`: listener lifecycle, remote hydration, local push effects, merge logic, and outbox replay.
- `src/utils/offlineQueue.ts`: localStorage-backed mutation outbox.
- `src/utils/browserPrint.ts`, `escpos.ts`, `webusbPrinter.ts`, `printEngine.ts`: printing layers.
- `electron/main.js` and `preload.js`: native desktop container and print bridge.

## Architectural strengths

- Domain types exist for orders, tickets, payments, inventory, customers, staff, and settings.
- Order/table synchronization now has transaction-based helpers, sync revisions, tombstones, and reset generations.
- Settings hydration merges nested defaults.
- Inventory source-of-truth policy intentionally keeps alcohol, beverage, cigarette products, and inventory movements in Firebase rather than localStorage.
- Customer repayment records are retained as audit rows.
- Print routing distinguishes kitchen/bar and normal/void tickets.

## Architectural weaknesses

- New granular transaction code coexists with legacy whole-node `set()` writers.
- Authentication, database authorization, and business authorization are not unified.
- Financial events cross multiple stores and Firebase nodes without a shared transaction boundary.
- Printing, settlement, and persistence have different success semantics.
- Global startup listeners run before identity is established.
- A large portion of the application is eagerly loaded into the initial bundle.

---

# 5. Firebase database, schema, and synchronization

## Observed Firebase domains

The source references nodes for:

- `orders`
- `tables`
- `payments`
- `settings`
- `settings/logo`
- `areaOrder`
- `menu/items`
- `menu/categories`
- `menu/pillars`
- `users`
- `customers`
- `pinResets`
- `alcoholProducts`
- `beverageProducts`
- `cigaretteProducts`
- `invMovements`
- `invMappings`
- `groceryPurchases`
- `kitchenPurchases`
- `meatEntries`
- `maintenanceExpenses`
- `resetMarkers`
- `orderTombstones`

## Confirmed synchronization design

The code now includes:

- Root transactions for selected order/table/reset operations.
- Record identity and sync revision metadata for some domains.
- Tombstones for deleted orders.
- Reset-generation checks intended to prevent stale writes after selective reset.
- Separate remote snapshot normalization.
- Empty-node firewalls for several domains.

## Confirmed synchronization risks

### High — bulk replacement remains

`pushOrdersToFirebase`, `pushTablesToFirebase`, `pushPaymentsToFirebase`, settings, staff, menu/category, inventory mapping, purchase, meat, and expense paths still contain full-node `set()` patterns. A stale client can replace unrelated records.

### High — runtime writer failure is suppressed

`writeOrderTableMutation` catches errors and logs:

`❌ [Firebase Order/Table Mutation FAILED]`

It does not rethrow or return a structured failure result. The runtime preview produced this error repeatedly. The application can therefore continue showing a local mutation while the cloud write failed.

### High — missing root security boundary

No Firebase Auth integration, ID-token flow, custom claims, or rules file was found in the repository. The actual production rules remain unknown.

### Medium — duplicate staff subscriptions

`App.tsx` subscribes to staff independently while `useFirebaseSync` also subscribes to staff. This can duplicate snapshots, migration work, and local state writes.

### Medium — local repair can become a write amplifier

Startup/customer attachment logic and empty-node preservation can write local state back to Firebase. Without a server revision/ownership policy, repeated clients may produce unnecessary writes or resurrect state.

---

# 6. Authentication, authorization, and session security

## Critical: no Firebase Authentication visible

`src/firebase.js` initializes only the Firebase application and Realtime Database. No `firebase/auth`, sign-in provider, ID token, `onAuthStateChanged`, custom claims, or server session was found.

All Firebase access is therefore effectively unauthenticated from the application source’s perspective. If deployed RTDB rules allow broad reads/writes, an arbitrary client could read or modify staff, orders, payments, customers, settings, inventory, and reset data.

**Confidence:** High.  
**Cannot verify:** Actual production RTDB rules.

## Critical: client-only permissions

Permissions come from `StaffUser` objects held in Zustand/localStorage. Route checks and button visibility are not security boundaries. A user with browser/devtools access can modify:

- `pos_staff_users`
- `pos_current_user_id`
- `pos_current_user`
- Permission fields
- Active status

Store actions such as order creation, payment, voiding, import, reset, and settings changes do not independently validate authorization against a server identity.

## High: pre-login data exposure

`useFirebaseSync()` and direct staff/customer/table subscriptions are mounted before login. This means the browser can receive operational datasets and staff records before a profile is selected.

## High: localStorage credential/session exposure

Current user data and staff data are persisted in localStorage. Migrated users use `pinHash` and `salt`, which is better than storing raw PINs, but the browser still receives and persists the complete credential verifier and permissions. Any XSS, browser extension, local profile access, or compromised terminal can read them.

## High: legacy PIN and admin fallback

- Default settings contain `adminPin: '1234'`.
- Legacy plaintext PIN fields remain supported for migration.
- `AdminPinGate` accepts an active admin PIN and retains a plaintext fallback.
- Privileged gate attempts do not share the main login lockout/rate-limit mechanism.

## Critical: PIN reset design

`PinLoginScreen.tsx`:

- Generates OTP with `Math.random()`.
- Writes OTP and expiry to `pinResets/{userId}`.
- Keeps verification state primarily in the client.
- Has no visible server-authoritative verification, throttling, attempt limit, or one-time invalidation.

An attacker able to inspect or manipulate the client or Firebase data can bypass the intended reset flow.

---

# 7. Offline mode, persistence, and recovery from failure

## What exists

`src/utils/offlineQueue.ts` implements a localStorage FIFO outbox with:

- UUID operation IDs.
- Domain/action.
- Payload.
- Timestamp.
- Reset generation.
- Retry count.
- Maximum retry count of five.
- Queue cleanup during reset.
- Replay on browser/Firebase reconnect.

This is a genuine improvement over a design with no outbox.

## Covered domains

The declared outbox domains are:

- Orders
- Tables
- Payments
- Customers

Actions include create/update/delete order, update table, add payment, due update, repayment, and customer write.

## High: incomplete mutation coverage

Some operations still call Firebase writers directly or only log failures, including observed paths for:

- Voids.
- Customer deletion.
- Customer consumption updates.
- Some status/move/attachment mutations.
- Some inventory and specialized domain operations.

An online write can fail after the UI state has changed without producing a replay record.

## High: localStorage is not durable business storage

The outbox and much operational state can be lost through:

- Browser profile deletion.
- Device loss.
- Storage quota exhaustion.
- Private browsing restrictions.
- Corruption or malformed JSON.
- Manual localStorage tampering.

`writeQueue` catches quota failures and continues, which can make the UI appear successful while the mutation is not durable.

## Medium: retry exhaustion discards mutations

Mutations are dropped after five failed attempts. There is no visible dead-letter queue, operator recovery workflow, export of failed mutations, or escalation alert.

---

# 8. Order, table, kitchen, bar, and ticket workflows

## Correct/positive behavior observed

- Table/order models support active, billed, paid, free, occupied, and billing concepts.
- KOT/BOT splitting uses item route, category route, and legacy fallback.
- Void tickets are represented separately.
- Sent-item voids can restore mapped inventory.
- Order/table merge logic uses revision metadata and tombstones in some paths.

## High: table reservation race

`createOrder` first checks local state. Two terminals can both observe a free table and create different orders. The later Firebase result can win, leaving an orphaned order or incorrect table association.

The transaction writer reduces some lost-update behavior but does not implement a server-side “reserve only if free” invariant spanning the user intent.

## High: lifecycle is not one transaction

Order creation, table occupancy, ticket creation, inventory deduction, payments, customer due, and table cleanup occur through different operations. A crash or permission failure can produce:

- Paid payment with occupied table.
- Free table with active order.
- Order without ticket.
- Ticket without inventory deduction.
- Inventory deduction without order persistence.
- Customer due change without payment.

## High: over-void quantity risk

The `voidOrderItem` path accepts a quantity and the inspected code does not show a strict `0 < qty <= target.quantity` invariant before restoration/removal. Over-voiding could:

- Restore more inventory than was sold.
- Create an oversized void ticket/history entry.
- Remove the original line entirely while recording an invalid quantity.

This needs a focused regression test and runtime guard.

## Medium: multiple payment paths

Both Review and a retained Payment screen contain payment behavior. The unused route increases the chance that future fixes are applied to one path but not the other.

---

# 9. Inventory, stock, purchases, and reconciliation

## Data model

The inventory model distinguishes:

- Alcohol: milliliters, bottle size, bottle/glass deduction.
- Beverages: packaged pieces/cartons.
- Cigarettes: sticks/packets.
- Grocery purchases.
- Inventory movements.
- Menu-to-inventory mappings.

The source-of-truth policy for alcohol, beverage, cigarette products, and inventory movements is Firebase.

## High: silent overselling

Sale deduction uses `Math.max(0, currentStock - deduction)`. If stock is 2 and a sale requires 5, the product becomes 0 but a sale movement for 5 is still logged. The business is not told that the sale exceeded available stock.

The same clamping pattern appears in manual/bar adjustments.

Recommended behavior:

- Reject or explicitly allow negative stock.
- Display an insufficient-stock warning.
- Record an oversell/override reason and authorizer.
- Make stock movement and order commitment atomic.

## High: inventory/order divergence

`sendToKitchen` changes inventory before the order/ticket write is durably confirmed. Remote failure can leave stock deducted without a valid order or ticket. Voids have the inverse risk.

## Medium: movement edit/delete integrity

Movement update/delete logic recalculates stock locally and clamps to zero. Editing historical movements can change current stock without a formal adjustment/audit workflow or concurrency guard.

## Medium: purchase totals

Some purchase flows accept caller-provided total cost rather than universally recalculating `quantity × rate`. This can create reporting and cost inconsistencies.

## Medium: reconciliation model

Meat and bar logs are entry-based. A strict immutable formula such as:

`opening stock + purchases - consumption = closing stock`

is not universally enforced across all operational inventory.

---

# 10. Customer Khatta, due, and repayment logic

## Positive safeguards

`receiveRepayment`:

- Requires a real customer.
- Rejects non-positive and non-finite amounts.
- Prevents repayment above current due.
- Rounds to two decimal places.
- Records repayment metadata and receiver attribution.
- Persists a repayment ledger.

## High: due creation validation gap

`addToCustomerDue` directly adds the supplied amount to `currentDue`, `totalSpend`, and visits. The inspected path does not apply the same finite/non-negative validation used for repayments. Invalid, negative, or non-finite input can corrupt balances and metrics.

## High: non-atomic customer settlement

Customer due, repayment, order payment, and order/table state are separate writes. Retries and concurrent terminals can create:

- Duplicate due.
- Payment without due.
- Due without payment.
- Lost repayment row.
- Incorrect total spend or visit count.

## High: reset behavior conflicts with expected contract

`customersAfterCreditReset()` preserves customer profiles and clears due, but `applySelectiveResetLocally()` currently removes the entire customer directory and repayment data. The failing test expects the customer record to remain.

This is not only a test problem; it is a product/data-retention decision that must be made explicitly.

## Medium: unlimited credit

No credit limit, approval threshold, overdue alert policy, or admin approval requirement was found for adding new debt.

---

# 11. Mathematical calculations and financial logic

## Current calculation

`calcBill.ts` uses:

```text
subtotal = Σ(item.price × item.quantity)
```

Percentage discount:

```text
discount = round(subtotal × discountPercent / 100)
```

Fixed discount:

```text
discount = round(min(fixedDiscount, subtotal))
```

Then:

```text
afterDiscount = max(0, subtotal - discount)
```

Excluded VAT:

```text
VAT = round(afterDiscount × vatRate)
total = afterDiscount + VAT
```

Included VAT:

```text
VAT component = round(afterDiscount × vatRate / (1 + vatRate))
total = afterDiscount
```

## High: discount input validation

The calculator does not clearly reject:

- Negative percentage discounts, which can increase the total.
- Percentages above 100, which are clamped indirectly rather than rejected.
- Negative fixed discounts, which can increase the total.
- Non-finite values if they reach the function.

Validation must happen at both UI and domain boundaries.

## Medium: rounding policy

Rounding happens at discount/VAT stages rather than through a documented line-level or final-total policy. This can create differences between displayed line totals, receipt totals, split bills, and external accounting.

## Medium: split payment arithmetic

Split items use synthetic item IDs and separate `TablePayment` records. The model needs explicit tests for:

- Partial quantity splits.
- Rounding remainders.
- VAT on split quantities.
- Recombining paid/unpaid quantities.
- Duplicate split submission.

## High: payment idempotency

Payments receive fresh random UUIDs and are written as records. A retried click, reconnect, or second terminal can create a second payment for the same business event. No distributed idempotency key or server uniqueness constraint was found.

## Medium: prior-due reporting

Prior due collection is separate from current order revenue. Reports and cash reconciliation must add it explicitly or understate collected cash.

## Missing/limited financial controls

The source has closed-shift data structures, but the audit did not find a complete server-authoritative register process covering:

- Opening float.
- Cashier shift ownership.
- Cash count.
- Cash over/short.
- X report.
- Z report.
- Approval/reopen.
- Refund workflow.
- Immutable server-side close.

Local append-only snapshots are not sufficient against a client that can edit localStorage.

---

# 12. Printing, WebUSB, and print-status integrity

## Current paths

- Electron: renderer HTML → preload IPC → hidden BrowserWindow → native silent print.
- Browser: hidden iframe → `window.print()`.
- Direct browser printer: WebUSB ESC/POS.
- Auto-print: `usePrintQueue` on a device marked `pos_is_print_hub`.

## Positive controls

- Electron uses context isolation and Node integration disabled.
- Receipt text is escaped in `browserPrint.ts`.
- WebUSB reconnect attempts have serialization.
- Disconnect listeners clear stale slots.
- KOT/BOT/VOID routing is explicit.
- Electron print callback returns success/error before local print status is changed.

## High: print hub is not centrally exclusive

The one-hub rule is a localStorage flag. Two devices can both be marked as hubs and consume the same Firebase ticket. Per-device processed-ticket sets do not prevent cross-device duplicate printing.

## High: historical tickets are discarded

On refresh, tickets older than the current session are converted from pending to printed/ignored rather than placed in a durable replay workflow. A real unprinted ticket can therefore disappear without physical output.

## High: browser print success is not delivery success

The browser path resolves true immediately after invoking `window.print()`. This confirms that a print request was called, not that the user accepted the dialog or a printer produced paper.

## Medium: WebUSB compatibility and device selection

- Support detection checks `navigator.usb` but not secure context, browser family, permission state, or protocol compatibility.
- `requestDevice({ filters: [] })` shows every USB device to the user.
- If a device has no serial number, reconnect can match only vendor/product and substitute an identical printer.

## Medium: inconsistent print systems

Legacy print engine, browser CSS, ESC/POS widths, and newer receipt HTML use different assumptions. This creates paper-width, margin, and formatting regression risk.

## Medium: concurrent Electron print jobs

Each IPC call creates a new hidden BrowserWindow. There is no application-level print serialization/queue, so rapid concurrent tickets may contend for drivers/spoolers.

---

# 13. Electron desktop security and operations

## Positive controls

- Main window has `contextIsolation: true`.
- Main window has `nodeIntegration: false`.
- External links are sent to the OS browser.
- Close protection warns about active orders.
- Native print has a timeout.

## High: dependency exposure

The Replit dependency scanner found serious advisories in Electron 33.4.11 and related packaging/runtime packages. See Section 17.

## High: remote cloud application trust

Electron loads `https://pos.sbambocottage.com.np` rather than a bundled immutable application. A compromised deployment, DNS/TLS issue, or unexpected remote content change would execute inside the desktop container with access to the exposed print bridge.

## Medium: preload sandbox disabled

`sandbox: false` is documented as required for the current preload implementation. This increases the impact of a renderer compromise and should be revisited by moving the bridge to a sandbox-compatible design.

## Medium: renderer-controlled HTML and printer name

The IPC handler accepts arbitrary HTML and a renderer-provided printer name. It validates that HTML is a non-empty string but does not impose a size limit, schema, allowed markup policy, or printer allowlist.

## Medium: fixed desktop minimum size

The Electron window has minimum dimensions 900×600. This may prevent usable operation on smaller screens and differs from web/mobile responsive assumptions.

---

# 14. UI/UX findings and explanation

## What works well

The current login screen is visually clear at desktop width:

- Strong restaurant identity.
- Clear “Staff Access · POS Terminal” label.
- Role labels are visible.
- High contrast dark theme.
- Large profile targets appropriate for a touch terminal.
- Theme control is visible.

## Medium: identity is exposed before login

The login screen displays staff names and roles before authentication. This is operationally convenient but leaks the staff directory and makes account enumeration easy.

## Medium: navigation and route semantics

Navigation is built around buttons that call `navigate()` rather than normal links. This loses open-in-new-tab, copy-link, and standard browser navigation behavior. Active matching is exact-path based and can fail to show a parent section active on nested routes.

## Medium: mobile drawer accessibility

The custom mobile drawer does not visibly implement a complete accessible dialog pattern:

- No focus trap.
- No focus return.
- No inert background.
- No reliable Escape behavior.
- Hidden drawer content remains mounted and may remain keyboard reachable.

## Medium: status announcements

Offline/sync state and print-blocked status are largely visual. The print-blocked notice does not visibly use `role=status` or `aria-live`, and sync transitions are not consistently announced to assistive technology.

## Medium: global interaction restrictions

Global CSS includes `user-select: none`, touch behavior changes, and overscroll suppression. These improve kiosk feel but can prevent:

- Copying customer names or bill numbers.
- Selecting diagnostic/error text.
- Normal mobile scrolling/zoom affordances.
- Accessibility workflows.

## Medium: short-height layout behavior

Height-based classes are applied globally at max-height 600px. Short landscape tablets, laptop windows, or browser toolbars can trigger hidden cart/sidebar content and unexpected stacking.

## Medium: Electron responsiveness

The desktop container minimum width/height can make the application unusable on smaller displays despite responsive web layouts.

## Verification gaps

No complete screen-reader audit, keyboard-only workflow, touch-target measurement, color-contrast tool run, or real-device mobile matrix was performed. These should be part of the next UX validation pass.

---

# 15. Accessibility, reliability, and error handling

## Accessibility risks

- Custom overlays and drawers lack complete dialog semantics.
- Error and sync notices are not reliably announced.
- Icon-only/theme controls need label verification across every state.
- Global text selection suppression harms users who need to copy or inspect content.
- Dense POS tables and inventory views require keyboard/focus testing.

## Reliability risks

- Many Firebase writer functions catch errors and only log them.
- Runtime errors are not always surfaced to the operator.
- Offline queue quota failures are silent.
- Print failures can be logged without an actionable retry screen.
- Five failed retries can silently remove a queued mutation.

## Operational consequence

The most dangerous UX failure is “local success, remote failure”: an operator believes an order/payment/void was saved because the local screen advanced, while Firebase persistence or printing failed in the background.

---

# 16. Performance, deployment, and maintainability

## Performance

- Initial JavaScript is approximately 1.7 MB minified.
- Major screens are eagerly imported.
- AdminPanel is a large multi-domain module.
- Repeated full-array `JSON.stringify` comparisons can become expensive as orders and histories grow.
- Customer attachment effects scan all orders and may issue redundant writes.
- Firebase listeners subscribe to broad datasets at startup.

## PWA behavior

`vite-plugin-pwa` uses `registerType: "autoUpdate"`. An update can replace the running application while a POS session is open unless update coordination drains pending operations and warns the operator.

The PWA precaches static assets but does not make Firebase data authoritative offline.

The manifest references `/favicon.ico`; the repository listing did not show a corresponding public favicon, so the browser may request a missing icon.

## Dev-server exposure

`allowedHosts: true` is permissive. Combined with network binding, this increases accidental preview exposure risk on shared networks. It is acceptable as a Replit convenience only when the development environment is trusted and not treated as production security.

## Build reproducibility

Electron scripts invoke `npm install` during build/start flows. This makes builds network-dependent and less reproducible. A committed lockfile and separate dependency-install step are preferable.

## Documentation drift

`replit.md` and older attached instructions describe a frontend-only/browser-dialog architecture that no longer matches Firebase, offline queues, Electron silent printing, and current print routing. Drift can cause incorrect operational setup and support decisions.

---

# 17. Security scanner findings

## Replit dependency scanner

Aggregate:

- **1 critical**
- **18 high**
- 0 moderate
- 0 low
- 0 informational

Representative findings:

- `electron@33.4.11`: multiple use-after-free, renderer command-line switch injection, sandboxed iframe navigation, custom-protocol cross-origin read, and context-isolation bypass advisories.
- `app-builder-lib@25.1.8`: uncontrolled search path elements in AppImage builds.
- `builder-util-runtime@9.2.10`: cross-origin redirect credential leakage.
- `extract-zip@2.0.1`: unvalidated symlink path traversal.
- `tar@6.2.1`: path traversal advisories.

The scanner reports available fixes, including major Electron upgrades. Do not ship the Electron installer until the direct and transitive tree is upgraded or every finding has a documented applicability decision.

## SAST

Findings in `src/firebase.js`:

- Medium: Google API hard-coded-secret detector.
- High: Firebase hard-coded-secret detector.

Firebase web configuration often contains public identifiers, but the result still requires verification of Firebase rules and API restrictions. Moving a public identifier into an environment variable alone does not create authorization.

## HoundDog

Low privacy finding:

```text
console.log('PRINT STAFF DATA:', { takenBy, processedBy, liveUser })
```

This logs staff identity data to standard output and was flagged against GDPR/CCPA/NIST privacy controls. Remove or redact it in production.

---

# 18. Tests, bugs, and static-quality findings

## Confirmed failing test

`src/test/selective-reset-firebase.test.ts` fails:

```text
TypeError: Cannot read properties of undefined (reading 'customerKey')
```

The test expects the customer to remain after selective reset, while `applySelectiveResetLocally()` removes `pos_customers` and `pos_customer_repayments`.

Required product decision:

- Preserve customer profiles and clear only balances/repayments; or
- Deliberately delete all customer records and update the test and user-facing contract.

## Lint failures

There are 37 errors and 14 warnings, including:

- Conditional hook violation in `src/screens/OrderScreen.tsx`.
- `any` usage in application, Firebase, inventory, and tests.
- Empty interface/block findings.
- `prefer-const`.
- Import-style issue in `tailwind.config.ts`.
- Hook dependency and ref-cleanup warnings.
- Existing fast-refresh export warnings.

## Test coverage gaps

No evident end-to-end coverage was found for:

- Login authorization tampering.
- Direct route access.
- Firebase rule behavior.
- Multi-terminal races.
- Offline restart and queue overflow.
- Duplicate payment/retry.
- Inventory oversell.
- Over-void quantity.
- Real WebUSB printers.
- Electron IPC/native printing.
- PWA update during active order.
- Responsive and accessibility workflows.

Vitest/jsdom tests cannot prove native printer, USB, Windows spooler, or deployed Firebase behavior.

---

# 19. Backup, import, reset, and recovery

## Backup strengths

`exportFullBackup` has a version field and includes more domains than the older export:

- Core POS.
- Customers and repayments.
- Staff.
- Kitchen purchases and meat entries.
- Grocery and mappings.
- Closed shifts.
- Optional Firebase-only product/movement/expense injection.

## High: caller-dependent completeness

Firebase-only domains are included only when callers inject them. A user-triggered export that omits those arguments can produce an apparently valid but incomplete business backup.

## Medium: import validation

`importAll` and `importFullBackup` parse JSON and write recognized values, but there is no comprehensive schema validation, checksum, preview, transactional restore, rollback, or conflict review.

## High: reset data semantics

Reset paths differ by domain. Customer credit reset currently deletes customer profiles locally, conflicting with the helper’s profile-preserving semantics and the failing test.

## Missing recovery controls

- Scheduled remote backup.
- Encryption-at-rest for exported files.
- Backup integrity signature/checksum.
- Restore dry-run and merge preview.
- Version migration tests.
- Failed-outbox recovery export.
- Production rollback procedure.
- Immutable server-side audit log.

---

# 20. Prioritized recommendations and final assessment

## P0 — security and release blockers

1. Verify production Firebase RTDB rules immediately. Test unauthenticated read/write, staff reads, PIN reset reads/writes, customer reads, payment writes, and destructive operations.
2. Add Firebase Authentication or another server-verifiable identity system.
3. Move authorization decisions to Firebase rules/server functions or another trusted backend. Treat local roles as UI hints only.
4. Replace client-generated OTP/reset validation with server-authoritative, cryptographically random, rate-limited, one-time reset tokens.
5. Remove default `1234`, plaintext PIN fallback, and unrestricted admin gate attempts after a controlled migration.
6. Upgrade Electron and packaging dependencies against the scanner findings before releasing installers.
7. Stop logging staff identity data to production stdout.
8. Make failed Firebase writes visible and durable instead of logging and continuing.

## P1 — data integrity and financial correctness

1. Make payment settlement idempotent using a business-event ID and server uniqueness.
2. Coordinate order, table, payment, customer due, inventory, and ticket state through a transaction/outbox protocol.
3. Add a server-side conditional table reservation.
4. Expand offline queue coverage to every mutation, including voids, deletion, consumption, inventory, settings, menus, expenses, and print events.
5. Add a dead-letter/recovery screen for exhausted queue mutations.
6. Reject insufficient inventory or require an explicit authorized oversell override.
7. Enforce `0 < voidQuantity <= itemQuantity`.
8. Validate all due, discount, VAT, quantity, price, and cost inputs at domain boundaries.
9. Add payment, split, VAT, rounding, Khatta, oversell, and void regression tests.

## P2 — operations and UX

1. Enforce one print hub centrally with leases/heartbeats and durable ticket claims.
2. Replay historical pending tickets safely instead of marking them printed on refresh.
3. Unify print layout/width and serialize native print jobs.
4. Add printer failure/retry UI and distinguish “request sent” from “paper confirmed.”
5. Add keyboard/focus trapping, focus return, dialog semantics, live status announcements, and screen-reader labels.
6. Reconsider global `user-select:none`, short-height CSS, and fixed Electron minimum size.
7. Coordinate PWA updates with active sessions and pending writes.
8. Split routes/admin modules and reduce initial bundle size.
9. Update project documentation to match the current Firebase/Electron/offline architecture.

## P3 — accounting and recovery maturity

1. Implement server-authoritative shift open/close and immutable Z-report workflow.
2. Add opening float, cash count, over/short, refunds, approvals, and payment-method reconciliation.
3. Make exports complete by default and visibly label omitted/injected domains.
4. Add schema validation, checksums, restore preview, and rollback.
5. Add production backup, recovery drills, and an immutable audit event stream.

## Final assessment

Bamboo POS has strong feature breadth and thoughtful local improvements such as sync generations, tombstones, typed domains, repayment validation, inventory source-of-truth separation, and multiple printer safeguards. However, the application currently relies on a trusted client and cannot be considered a secure multi-user system or authoritative financial ledger until the Firebase security boundary, server authorization, settlement idempotency, distributed integrity, offline coverage, Electron dependencies, and financial close controls are addressed.

## Audit limitations

This audit could not verify:

- Production Firebase security rules.
- Production database contents.
- Published deployment behavior.
- Actual Windows printer/spooler delivery.
- Hardware failure and power-loss recovery.
- Real assistive-technology behavior.
- Actual user procedures and staff training.

Those require a controlled security review, production configuration review, multi-device test plan, and hardware acceptance test.

---

# Post-audit implementation update

**Update period:** 2026-08-19 through 2026-08-20  
**Purpose:** Record changes made after the original read-only audit. The original findings above remain a historical snapshot; this addendum identifies which findings were addressed and what still requires follow-up.

## A. Firebase sync and legacy-key convergence

### A.1 Table integer-key repair loop resolved

The reported overnight table-write loop was traced to duplicate Firebase records created by writing `/tables` as an array. Firebase stored the array under integer keys such as `tables/20`, while granular table writes used the table UUID path such as `tables/<table-id>`.

This created two records for the same table:

- An integer-keyed legacy record containing stale occupancy/reset data.
- A UUID-keyed current record containing the corrected table state.

The table subscription repeatedly saw the stale integer-keyed record, repaired the UUID-keyed record, and left the original integer key in place.

Implemented changes:

- `pushTablesToFirebase` now serializes tables as an object keyed by `table.id`.
- `subscribeToTables` preserves each Firebase storage key through `toFirebaseEntries`.
- Mismatched/integer-keyed table paths are queued for deletion through a batched multi-location update.
- Duplicate table IDs are deduplicated before local callbacks.
- Existing pending-write guards remain in place to avoid duplicate repair writes.

This addresses the specific “free table receives a new `syncMutationId` every few seconds” loop. It does not by itself resolve the broader security, authorization, or financial-transaction findings in the original audit.

### A.2 Order storage standardized and legacy keys pruned

Orders received the same collection-storage protection:

- `pushOrdersToFirebase` now creates a UUID-keyed order dictionary.
- The outbound collection write uses a targeted root `update` rather than writing a plain array with `set`.
- `subscribeToOrders` tracks the actual Firebase storage key.
- Integer or mismatched order keys are deleted in a background batch update.
- The in-memory callback list is deduplicated by canonical `order.id`.
- When both a legacy and UUID-keyed record exist, the canonical UUID-keyed record is preferred.

This prevents future array-key creation and allows existing legacy integer-keyed order records to converge away.

### A.3 Earlier sync-writer hardening now reflected in the implementation

The Firebase sync layer also includes the following changes made during the sync investigation:

- Order/table related writes use targeted reads and multi-location updates instead of the denied root-read transaction pattern.
- Payment writes use the sales-history reset marker and targeted update behavior.
- Firebase errors are normalized into structured log output instead of opaque `{}` console errors.
- Table and order repair paths skip duplicate work when the local tab already has a pending mutation.
- Empty-remote preservation writes are debounced to limit multi-terminal firewall bursts.
- Reset generations, pending mutation metadata, and tombstones continue to protect against stale writes and post-reset resurrection.

These changes improve convergence and observability, but production Firebase rules and authentication still require independent verification.

## B. Void quantity boundary guard resolved

The original audit listed over-void quantity as a high-risk issue. `voidOrderItem` now validates the requested quantity immediately after resolving the target order item and before any side effects:

```text
Number.isInteger(voidQuantity)
voidQuantity > 0
voidQuantity <= targetItem.quantity
```

Invalid input returns `false` immediately. No inventory restoration, order mutation, LocalStorage save, void-ticket creation, or Firebase write occurs on the rejected path.

The existing UI already limits the normal quantity selector to `1..item.quantity`, so the new store-level guard protects non-UI callers, future UI changes, stale clients, and malformed inputs. The current UI does not yet display a dedicated error message for a rejected programmatic call; callers currently ignore the boolean return.

This closes the specific boundary-integrity finding. Inventory/order atomicity and the broader lifecycle transaction finding remain open.

## C. Selective customer reset contract aligned

Customer-directory and credit-ledger reset behavior is now documented and tested as a complete wipe:

- Firebase `/customers` is deleted.
- Customer repayment/reset ledger data is deleted.
- Local customer profiles and repayments are cleared.
- Stale customer mutations for the reset domain are removed from the offline queue.
- Tables, menu configuration, and staff accounts remain preserved.

The selective-reset Firebase test was updated from the obsolete “retain profile with zero due” contract to the complete-wipe contract. Related assertions were also aligned with the current targeted-update writers rather than expecting old root transaction snapshots.

## D. Verification after the updates

The post-update test/build state is:

| Check | Result | Notes |
|---|---|---|
| `npm test` | Passed: 54 of 54 tests | 11 test files passed |
| `npm run build` | Passed | Vite production build completed |
| Firebase table/order key handling | Implemented | UUID-keyed writes plus legacy-key pruning |
| Void quantity guard | Implemented | Rejects non-integer, non-positive, and over-available quantities before side effects |
| Customer selective reset contract | Implemented/tested | Complete Firebase and local directory/ledger wipe |

The build still emits the existing large JavaScript bundle warning. This is a performance concern, not a build failure.

## E. Updated status of original findings

The following original findings are now **addressed or materially mitigated**:

1. Over-void quantity validation boundary — addressed by the store-level guard.
2. Table integer-key duplication and the confirmed repeating table repair loop — addressed by UUID-keyed writes, inbound key tracking, deduplication, and stale-key deletion.
3. Order integer-key duplication risk — addressed by UUID-keyed order writes and legacy-key pruning.
4. Selective customer reset test-contract mismatch — addressed; tests now reflect complete directory/ledger deletion.
5. Opaque Firebase mutation error reporting — improved with structured error extraction.
6. Some cross-tab repair duplication and empty-remote firewall bursts — mitigated with pending-write checks and debounce protection.
7. Documentation drift — `replit.md` was rewritten as a current product and technical specification for future planning.

The following original findings remain open and must not be considered solved by these updates:

- Firebase Authentication and server-verifiable authorization.
- Verification and tightening of production RTDB rules.
- Client-controlled staff identity/permissions.
- Client-side PIN-reset OTP security.
- Pre-login data subscription exposure.
- End-to-end atomicity across order, table, payment, inventory, customer due, and printing.
- Inventory overselling and stock/order reconciliation.
- Complete offline mutation coverage and dead-letter recovery.
- Full server-side settlement finalization and reconciliation beyond the client/Firebase claim lease.
- Electron/dependency security findings.
- Printer delivery confirmation and centralized print-hub leases.
- Accessibility, bundle-size, backup/recovery, and immutable audit-event improvements.

## F. Recommended interpretation for future reviews

When using this report for future planning, treat the original sections as the baseline audit and this addendum as the current implementation delta. Before closing any remaining high/critical finding, verify:

1. The behavior in the actual running app.
2. Firebase rules and production data paths.
3. Multi-terminal behavior with at least two concurrent clients.
4. Offline/reconnect and reset interactions.
5. Automated regression coverage.
6. Recovery behavior after partial failure or power loss.

---

# Post-audit implementation update 2

**Update date:** 2026-08-21
**Purpose:** Record the inventory, customer-ledger, settlement, and multi-terminal safeguards implemented after the previous addendum. The original audit findings remain historical; this section records current implementation status and remaining boundaries.

## G. Inventory enforcement and deficit visibility

The POS now supports an explicit stock-enforcement policy in Admin settings:

- **Flexible mode** remains the default and allows a sale to create negative stock.
- **Strict mode** blocks sending mapped items to the kitchen when the projected stock is insufficient.
- Strict-mode overrides require an Admin or Manager PIN authorization.
- Deficits are calculated across alcohol millilitres, packaged beverage units, and cigarette sticks using the configured menu-to-inventory mappings.
- Inventory dashboard and packaged-stock views display negative balances and deficit/low-stock states.
- Stock arithmetic is rounded at the inventory boundary rather than relying on floating-point accumulation.

This materially mitigates the original silent-overselling finding. Flexible mode is an intentional business choice, not an unreported clamp-to-zero behavior. Inventory/order durability and server-side atomicity remain open.

## H. Customer-ledger validation and financial rounding

Customer credit creation now rejects non-finite and non-positive amounts and rounds accepted values to two decimal places before updating balances and spend metrics. Existing repayment safeguards remain in place, including positive finite amounts, no repayment above current due, ledger rows, and receiver attribution.

The customer ledger remains a client/Firebase distributed workflow and still requires production-rule and multi-terminal verification for authoritative accounting.

## I. Settlement lifecycle and duplicate-payment protection

Settlement behavior was strengthened across `ReviewScreen`, `PaymentScreen`, and `usePOSStore`:

- An in-flight `settlingOrderIds` mutex prevents duplicate confirmations within one running terminal.
- Each checkout confirmation carries an idempotency key persisted per order in localStorage so retries/reloads can reuse the same business-event key.
- Bill numbers are allocated inside successful `addPayment` finalization; previewing the next bill number no longer increments the counter.
- `addPayment` validates that the order exists, contains payable items, the submitted payment lines are current unpaid lines with valid quantities, and the payment total is finite and positive.
- Empty orders, empty payment-line payloads, already-paid active lines, zero-value settlements, and invalid line quantities are rejected before payment rows, bill-counter changes, or printing.
- Successful final settlement owns order-paid state, table release, payment persistence, local settings updates, and Firebase/offline synchronization.
- Split payments continue to use `finalizeOrder: false`; paid item/table-payment state is re-synchronized after partial allocation.
- A paid-order retry returns the existing success path so a stale checkout does not consume another bill number or print a duplicate invoice.

For online final settlement, the store claims `settlementClaims/{orderId}` with a Firebase transaction before creating the payment. The claim accepts the same idempotency key on retry, rejects a competing active claim, and has a short lease to recover from a browser/process failure. Partial split allocations do not take the final-settlement claim, so sequential split payments remain supported.

This materially mitigates the original payment-idempotency finding for online final settlement. It is not a substitute for server-authoritative payment processing: Firebase rules, claim permissions, lease observability, and atomic reconciliation of payment/order/customer/inventory/printing still require production validation.

## J. Live multi-terminal checkout handoff

While the review or payment screen is open, both payment UIs watch the current order/table state. If another terminal changes the order to paid or frees the table:

- Open QR, credit, and payment modal state is closed.
- Confirmation state is cancelled.
- The operator sees: `Table [Table ID] was settled on another terminal.`
- The screen navigates back to `/`.
- Empty, zero-value, already-paid, and freed-table payment/proceed actions are disabled.

This prevents a stale terminal from continuing to collect or print after a remote settlement is observed. The prevention window begins when Firebase state reaches the client; it does not replace the Firebase settlement claim.

## K. Current verification after these changes

| Check | Result | Notes |
|---|---|---|
| `npm test` | Passed: 54 of 54 tests | 11 test files passed |
| `npm run build` | Passed | Vite production build completed |
| `git diff --check` | Passed | No whitespace errors |
| Online final settlement claim | Implemented | Firebase order-scoped transaction with recoverable lease |
| Split settlement compatibility | Preserved | Partial payments bypass final claim and re-sync paid item state |
| Stale checkout handoff | Implemented | Review and Payment screens close and navigate after remote settlement |
| Workflow | Running | `Start application` / `npm run dev` |

## L. Findings that remain open after update 2

- Firebase Authentication, server-verifiable staff authorization, and production RTDB rule verification.
- Complete server-side atomicity across payment, order/table, customer due, inventory, and printing.
- Production observability and reconciliation for settlement claims, including lease expiry and failed downstream writes.
- Full offline mutation coverage and dead-letter recovery.
- Table reservation races and other multi-terminal operations outside final settlement.
- Electron/package dependency advisories and remote-content trust.
- Central print-hub exclusivity, delivery confirmation, accessibility, bundle size, backup integrity, and immutable audit-event controls.
- Production-mode integration coverage for two-terminal settlement races and claim recovery after process failure.

The implemented changes should therefore be treated as material risk reduction and improved operational integrity, not as evidence that the POS is a server-authoritative accounting system.