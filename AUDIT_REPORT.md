# Bamboo POS — Evidence-Based 360° Read-Only Audit

**Audit date:** 2026-08-19  
**Audit mode:** Read-only source and local-runtime inspection  
**Scope:** React/Vite POS application, Zustand stores, Firebase Realtime Database integration, local persistence, Electron wrapper, printing, tests, configuration, and operational workflows  
**Changed during audit:** This report only. No source, dependency, workflow, deployment, secret, Firebase data, or database changes were made.

## 1. Executive summary

Bamboo POS is a broad restaurant POS covering tables, orders, KOT/BOT routing, kitchen/bar portals, inventory, Khatta customer credit, expenses, reports, staff PIN login, browser/WebUSB printing, and Electron silent printing.

The current implementation is suitable for a trusted-device, low-concurrency operating model, but it is not yet a strong security boundary or transactionally authoritative accounting system. The most important risks are:

1. Authentication and authorization are client-controlled. Firebase rules were not present in the repository and could not be verified.
2. Most Firebase writes still replace complete arrays or records, so concurrent terminals can lose unrelated changes.
3. The offline outbox is real but incomplete; some mutations still call Firebase directly and can be lost on failure.
4. Settlement, customer credit, table state, orders, inventory, and printing are not one server-atomic business transaction.
5. The Electron dependency tree has serious scanner findings and needs an urgent update review.
6. Firebase configuration is embedded in the client bundle and is flagged by SAST; this is configuration exposure unless database rules and API restrictions are strong.
7. The existing test suite has a failing selective-reset test, and lint has 37 errors plus 14 warnings.
8. The built-in export is not a complete business backup.

Positive controls include salted PIN hashing for migrated accounts, explicit permission route wrappers for major portals, inventory source-of-truth separation, transaction helpers for selected record operations, print ticket routing, customer repayment validation, and a durable localStorage outbox for several domains.

## 2. Audit evidence and commands

| Check | Result |
|---|---|
| `npm run build` | Passed; Vite reported an approximately 1.7 MB minified JavaScript bundle warning |
| `npm test` | 11 files; 53 passed and 1 failed |
| `npm test -- --runInBand` | Invalid Vitest option; not a test result |
| `npm run lint` | Failed: 37 errors and 14 warnings |
| `npm audit --omit=dev --audit-level=high` | No high/critical result from this local npm audit; two moderate React Router advisories were reported |
| Replit dependency scanner | Aggregate: 1 critical, 18 high, 0 moderate, 0 low, 0 informational |
| Replit SAST | 2 findings in `src/firebase.js`: medium Google API secret/config detector and high Firebase hard-coded-secret detector |
| Replit HoundDog | 1 low privacy finding: staff identity data logged in `src/screens/PaymentScreen.tsx` |
| Preview screenshot | Staff PIN login screen loaded successfully |
| Browser console | Expected Vite/Firebase sync messages observed; no manifest runtime crash observed |

The scanner results are not interchangeable: the local npm audit and Replit dependency scanner use different advisory sources and scopes. The stricter result must be treated as the release-blocking signal until reconciled.

## 3. Architecture and code topology

The application is a React + TypeScript + Vite client using Zustand for live state, localStorage for explicit persistence, Firebase RTDB for synchronization, WebUSB/ESC-POS for browser printing, and an Electron main/preload bridge for native printing.

Important boundaries:

- `src/App.tsx`: startup hydration, routes, Firebase sync mounting, staff/customer startup behavior.
- Zustand stores: POS, staff, inventory, customer, kitchen purchases, meat tracking, maintenance expenses.
- `src/utils/firebaseSync.ts`: Firebase readers, writers, normalization, selected transactions/reset metadata.
- `src/hooks/useFirebaseSync.ts`: listeners, hydration, local-to-remote effects, outbox replay.
- `src/storage/db.ts`: localStorage persistence, import/export, migration, reset.
- `electron/main.js` and `electron/preload.js`: published URL loading, native printing, printer discovery, auto-start, close handling.

The architecture is functional but mixes newer record/transaction patterns with older full-node synchronization patterns. This is the central source of concurrency and maintenance risk.

## 4. Firebase schema and synchronization

The code uses nodes including orders, tables, payments, settings, area order, menu items/categories, users, customers, pin resets, inventory products/movements/mappings, grocery and kitchen purchases, meat entries, and maintenance expenses.

Confirmed current behavior:

- There are transaction-based helpers for selected record writers and reset metadata.
- Many operational writers still serialize a complete array/object with `set()`, including important order/table/payment and several inventory/staff/menu/expense domains.
- Customer records are written at individual customer paths in several flows, but startup/full collection paths also exist.
- Settings hydration merges nested defaults rather than blindly replacing all local settings.
- Alcohol, beverage, cigarette products, and inventory movements intentionally start empty locally and are treated as Firebase source-of-truth data.
- Menu management writes call menu-specific Firebase writers directly rather than relying only on generic sync effects.

**Finding — High confidence, high impact:** Whole-node writes remain vulnerable to last-writer-wins data loss under concurrent terminals. A cashier or waiter can overwrite another terminal’s unrelated array changes.

**Finding — Medium confidence, high impact:** Firebase authorization rules cannot be assessed because no rules file was found in the repository. Client-side PINs and permissions do not protect RTDB data if rules are permissive.

**Finding — Medium confidence, medium impact:** Duplicate staff subscriptions exist: `App.tsx` subscribes directly while `useFirebaseSync.ts` also subscribes. This can duplicate hydration/migration activity and makes listener lifecycle harder to reason about.

## 5. Offline persistence and replay

The application has a durable localStorage FIFO outbox in `src/utils/offlineQueue.ts`. It supports operation metadata, retry limits, reset generations, and replay for several domains including orders, tables, payments, and customers.

This corrects the previous report’s claim that no queue exists. The queue is not universal:

- Some customer operations enqueue when offline.
- Some POS/order/table/payment paths use queue-aware writers.
- Several direct Firebase calls, including some void, move, status, and customer attachment paths, catch/log failures or depend on Firebase SDK behavior rather than consistently enqueuing the mutation.
- localStorage remains vulnerable to quota exhaustion, browser-profile loss, device loss, and corruption.
- Queue replay and full-node snapshot reconciliation still have conflict risks.

**Finding — High confidence, high impact:** Offline durability is partial rather than end-to-end. A user can receive a local success state while a direct remote write fails and no replay record exists.

**Finding — Medium confidence, high impact:** Replay of a stale full snapshot can overwrite newer remote changes unless every operation is record-level and generation-aware.

## 6. Multi-device concurrency and integrity

The local stores perform coherent local state transitions, but this is not equivalent to a distributed transaction.

Known race classes:

- Two terminals can reserve the same apparently free table.
- Order and table nodes are separate writes.
- Payment settlement and table cleanup are separate writes.
- Customer due changes and payment records are separate writes.
- Inventory deductions/restorations and ticket/order updates are separate writes.
- Full-array writes can revert another terminal’s newer print status or unrelated edit.
- Payment creation has no server-side idempotency key or uniqueness constraint.

**Finding — High confidence, high impact:** Duplicate settlement is possible across retries/devices because UI confirmation refs are local only.

**Finding — High confidence, high impact:** A partial failure can create paid-but-occupied, free-but-active, payment-without-due-update, due-without-payment, or inventory-without-ticket states.

**Finding — Medium confidence, medium impact:** Inventory quantities are clamped with `Math.max(0, ...)`, which prevents negative display values but can hide overselling instead of rejecting it atomically.

## 7. Authentication, sessions, and authorization

Migrated staff records use salted SHA-256 PIN hashes and salts; legacy plaintext fields remain supported for unmigrated records. Staff users, permissions, and current session data are persisted client-side.

Confirmed weaknesses:

- `/order/:tableId`, `/review/:tableId`, and `/payment/:tableId` are not visibly wrapped in `RequirePermission`, unlike major root/admin/kitchen/bar/customer routes.
- Store actions do not independently enforce permissions.
- `AdminPinGate` accepts any active admin PIN, retains a plaintext fallback, and has no independent attempt throttling/lockout.
- PIN reset generates OTPs with `Math.random()` in the browser, writes OTP/expiry to Firebase, and performs verification primarily client-side.
- EmailJS identifiers/public client values are embedded in client code.
- Staff names/roles are available to the client before login.
- No server session, inactivity timeout, central login audit, or server-side authorization boundary is visible in the repository.

**Finding — Critical design risk, high confidence:** Client-side identity and permission checks must be treated as convenience controls, not authorization. This is release-blocking for untrusted networks or multi-tenant deployment.

## 8. Firebase/configuration security

`src/firebase.js` embeds the Firebase API key, project identifiers, RTDB URL, and app ID. Firebase web API keys are commonly public identifiers, but the security boundary must be Firebase Auth plus restrictive RTDB rules and provider/API restrictions.

The SAST scanner flags this configuration as a hard-coded secret. The source-only audit cannot determine whether the key is restricted or whether RTDB rules prevent unauthorized reads/writes.

**Finding — Confirmed scanner result, high priority:** Review Firebase rules, API-key restrictions, anonymous access, write validation, and production data exposure. Do not assume moving the same public web config to an environment variable alone fixes the issue.

## 9. Orders, tables, tickets, and voids

The order lifecycle supports table assignment, item drafts, KOT/BOT splitting, sent items, kitchen/bar states, void history, print ticket snapshots, billing, split quantities, and table reset.

Positive safeguards:

- Print routing precedence is item route, then category route, then legacy fallback.
- Inventory deduction is tied to send-to-kitchen and void restoration is limited to sent items.
- Void tickets are represented separately as VOID_KOT/VOID_BOT.
- Local state updates keep related print-status fields together.

Risks:

- Reservation and settlement are not server-atomic.
- Void inventory restoration, order mutation, and void ticket creation can diverge on failure.
- Split item synthetic IDs may not behave like catalog IDs in every downstream mapping/report path.
- The same business event can be reached through Review and legacy Payment screens, increasing regression surface.

## 10. Payments, Khatta, and financial logic

`calcBill.ts` calculates subtotal, fixed/percentage discounts, VAT included/excluded modes, and a non-negative total. Review flows support split bills, prior due settlement, Pay Later, partial cash plus credit, and payment attribution.

Confirmed issues:

- Percentage discounts are not clearly rejected when negative or above 100.
- Negative fixed discounts are not clearly rejected before calculation.
- Prior due settlement is separate from order revenue and must be included explicitly in cash/collection reporting.
- Payment, table, order, and customer-ledger updates are separate operations.
- No distributed idempotency key prevents duplicate payment records.
- Purchase totals in specialized purchase models can be caller-provided rather than universally recomputed.
- No shift open/close, cash float, X/Z report, cash count, over/short reconciliation, or immutable day-end register snapshot was found.

**Finding — High confidence, high impact:** Reports are derived from mutable operational arrays and do not constitute an immutable accounting close.

## 11. Inventory and stock integrity

Inventory correctly distinguishes:

- Alcohol in milliliters for bottle/glass deductions.
- Beverage products in packaged units.
- Cigarettes in sticks/packets.
- Grocery purchases and mappings with local cache behavior.
- Firebase-only master data for alcohol, beverage, cigarette products, and inventory movements.

Sale deduction uses `invMappings`; sent-item voids restore stock and log correction movements.

Risks:

- Product/movement edits are still vulnerable to concurrent full-state replacement.
- `Math.max(0, ...)` hides insufficient-stock conditions.
- Sale deduction and order/ticket persistence are not one distributed transaction.
- Product and movement write coverage must be checked against Firebase rules and all UI mutation paths.

## 12. Printing and Electron behavior

The current architecture uses a unified `firePrintJob()` path for operational printing while retaining `ThermalReceiptLayout` for the admin receipt preview. Browser paths use WebUSB/ESC-POS or browser HTML printing; Electron uses renderer-provided HTML sent through preload IPC to a hidden BrowserWindow.

Positive controls:

- Context isolation is enabled and Node integration is disabled.
- Printer discovery uses Electron’s printer API.
- The print bridge is narrow and typed.
- Print jobs have timeout/error handling.
- KOT/BOT/VOID routing is explicit.

Risks:

- `pos_is_print_hub` is a local flag; Firebase does not centrally enforce one active hub.
- Multiple hubs can consume the same pending ticket and duplicate output.
- Per-device processed-ticket guards are local.
- Historical pending tickets are marked/ignored on refresh instead of reliably replayed.
- Electron uses `sandbox: false` for preload compatibility.
- Native printing accepts renderer-provided HTML and printer names; validation is limited.
- Multiple legacy print utilities and width assumptions remain.

**Finding — High confidence, operational impact:** Printer delivery and “printed” status are not a centrally coordinated durable protocol.

The current implementation does not show a complete payment-triggered cash-drawer workflow; ESC/POS pulse behavior is a buzzer/alert path, not a verified drawer audit subsystem.

## 13. UI, responsive behavior, and accessibility

The preview loaded the staff login screen successfully, and the code contains explicit desktop/tablet/portrait branches for the review payment experience.

Observed or source-visible concerns:

- The large POS surface and many modal flows require targeted keyboard/focus testing.
- PIN and admin dialogs should be tested for focus trapping, screen-reader labels, error announcements, and Escape behavior.
- Dense operational screens and color-coded statuses need contrast verification on actual themes and displays.
- Route-level guards and direct navigation should be tested at mobile widths, not only by clicking through the main navigation.
- The 1.7 MB minified bundle can delay first interaction on low-end terminals.

No complete automated accessibility audit was run in this read-only pass; these are verification items unless separately reproduced.

## 14. Performance and maintainability

`npm run build` passes but warns about a large JavaScript chunk of approximately 1.7 MB minified. `App.tsx` eagerly imports major screens, and `AdminPanel.tsx` remains a large multi-domain module.

Likely effects:

- Slower first load and refresh on older POS hardware.
- More code loaded before a waiter can enter an order.
- Larger regression surface for admin changes.
- More difficult ownership and testing of Firebase hydration/printing behavior.

Recommended improvements are route-level lazy loading, splitting admin domains, measuring real terminal startup time, and removing or isolating legacy print implementations.

## 15. Tests and static quality

The test suite has useful coverage for customers/Khatta, menu filtering, staff attribution, table naming, checkout settlement, print status, and WebUSB behavior.

Confirmed failure:

- `src/test/selective-reset-firebase.test.ts` expects customer data to survive the tested selective reset.
- Current `applySelectiveResetToFirebase()` deletes `/customers` for the customer-credit reset path.
- The test fails because `root.customers.customerKey` is undefined.

This is a behavior/specification conflict requiring a product decision: preserve customers while clearing credit ledger, or deliberately delete customers and update the test/UX contract.

Lint is not clean: 37 errors and 14 warnings, including a conditional-hook violation in `src/screens/OrderScreen.tsx`, `any` usage, import-style violations, `prefer-const`, empty interface/block findings, and related code-quality issues.

## 16. Dependency and scanner security findings

The required Replit scanners found:

### Dependency scanner — aggregate

- 1 critical
- 18 high
- 0 moderate
- 0 low
- 0 informational

Representative affected packages/advisories included:

- Electron 33.4.11, with multiple Electron use-after-free, command-line-switch injection, sandboxed iframe navigation, custom-protocol cross-origin read, and context-isolation bypass advisories.
- `app-builder-lib` 25.1.8: uncontrolled search path elements in AppImage builds.
- `builder-util-runtime` 9.2.10: cross-origin redirect credential leakage.
- `extract-zip` 2.0.1: unvalidated symlink path traversal.
- `tar` 6.2.1: path traversal advisories.

The aggregate includes transitive and Electron packaging dependencies. The Electron production distribution should not be shipped until the dependency tree is upgraded or each advisory is formally risk-accepted with a documented applicability analysis.

### SAST

- `src/firebase.js`: medium Google API hard-coded-secret detector.
- `src/firebase.js`: high Firebase hard-coded-secret detector.

### HoundDog

- `src/screens/PaymentScreen.tsx` logs `takenBy`, `processedBy`, and `liveUser` to standard output.
- Severity: low privacy finding.
- Remove staff identity logging from production output or replace it with redacted, access-controlled diagnostics.

## 17. Backup, import, reset, and recovery

The built-in export covers core local POS keys such as tables, menu, orders, payments, settings, ingredients, recipes, stock movements, pillars, and area order.

It does not automatically constitute a complete business backup of staff, customers/repayments, Firebase-only specialized inventory, mappings, kitchen purchases, meat entries, maintenance expenses, printer assignments, or Electron state unless callers explicitly augment the export.

`importAll()` parses JSON and writes recognized values without comprehensive runtime schema validation, versioning, checksum, merge preview, transactional restore, or rollback. Reset behavior varies by domain, and the selective customer-credit reset currently conflicts with the test contract.

No scheduled, encrypted, remotely archived, integrity-verified recovery package was found.

## 18. Documentation and deployment drift

`replit.md` describes an older browser-dialog-only printing model and says the app is frontend-only/no backend. Current code uses Firebase, WebUSB, Electron silent printing, offline queues, and multiple print paths.

Electron loads the published URL `https://pos.sbambocottage.com.np`. This audit did not inspect or mutate the deployed application, production Firebase data, production Firebase rules, Windows printer drivers, or published logs.

Documentation drift increases operational risk because setup and incident response instructions can direct maintainers toward behavior that no longer exists.

## 19. Prioritized remediation plan

### P0 — before trusting the system on an untrusted network or shipping Electron

1. Verify and lock Firebase RTDB rules, authentication, field validation, and API-key restrictions.
2. Upgrade Electron and Electron Builder dependency trees to scanner-supported versions; rebuild and retest the Windows installer.
3. Replace client-only authorization with server-verifiable identity/permissions, or explicitly restrict the deployment to a trusted network/device model.
4. Remove plaintext PIN fallback after a controlled migration and add rate limits/lockout to every privileged PIN gate.
5. Remove staff identity console logging from production.

### P1 — before multi-terminal or financially strict operation

1. Replace full-array business writes with record-level IDs, `update()`/transactions, conflict handling, and server timestamps.
2. Add idempotency keys and server-side uniqueness for payments, due settlements, ticket creation, and inventory movements.
3. Make the offline outbox cover every mutation and define replay/conflict outcomes.
4. Coordinate order, table, payment, customer ledger, inventory, and print-status state transitions.
5. Add shift open/close, cash reconciliation, immutable day-end snapshots, refunds, and audit events.

### P2 — quality and operational hardening

1. Resolve the selective-reset contract and failing test.
2. Fix lint errors, especially conditional hooks.
3. Unify print transports and centrally coordinate the print hub.
4. Complete versioned backup/restore for all business domains.
5. Add runtime schema validation for Firebase snapshots and imported backups.
6. Split the initial bundle and modularize the admin surface.
7. Update `replit.md` to match the current architecture.

## 20. Coverage limits and final assessment

This was a read-only audit. It did not:

- Read or change Firebase production data.
- Verify deployed Firebase security rules.
- Test actual Windows spoolers, printer drivers, paper widths, cash drawers, or power/network failure recovery.
- Inspect production deployment logs or published behavior.
- Perform a full accessibility test with assistive technology.
- Modify source code, dependencies, workflows, secrets, deployment settings, or database data.

**Final assessment:** Bamboo POS has substantial business functionality and several thoughtful local safeguards, but it currently assumes trusted clients and modest concurrency. The system should be treated as operationally useful but not security-authoritative or accounting-authoritative until Firebase authorization, Electron dependency remediation, complete offline replay, record-level synchronization, idempotent settlement, and immutable reconciliation are addressed.