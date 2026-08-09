---
name: Khatta Customer Ledger
description: Durable rules for the customer credit (Khatta) system — how dues are charged, collected, and kept auditable
---

## Rule: a Khatta balance may only decrease through a recorded repayment

Every path that reduces a customer's `currentDue` — the standalone Receive Payment modal and the checkout "Include Previous Due" flow alike — must go through the store's repayment action, which writes a repayment ledger entry. A "just zero the balance" helper must not exist on the customer store.

**Why:**
An earlier settle-only helper cleared balances at checkout without a ledger entry, so collected-dues totals under-reported money actually taken and the settlement could not be audited.

**How to apply:**
If you add a new way to clear or adjust a due (bulk write-off, admin correction, sync from another device), route it through a ledger entry too — otherwise reports and the customer's history silently disagree with reality.

## Rule: collecting a due at checkout must also charge for it

When the cashier includes a previous due in an order payment, the due has to be part of the amount presented to the customer — QR payload, on-screen amount, and printed invoice — before the balance is reduced. Record the settlement before the order payment so the amount claimed can never exceed what the ledger accepted.

**Why:**
Showing a combined total while charging only the order total lets a checkbox erase a real balance and report money that was never collected.

**How to apply:**
Due settlement is offered only on a full payment (never a split, where the order may not close in one transaction) and only to staff with the settle-dues permission — re-check that permission against live state at confirmation time, not just by hiding the UI.

## Rule: never quote a due from the order's customer snapshot

The customer object copied onto an order is a point-in-time snapshot and goes stale the moment another device collects part of the balance. Every displayed amount, QR payload, and charged figure must read the live balance from the customer store. Remember the figure quoted to the customer; if the live balance moves before confirmation, block payment and make the cashier requote rather than silently charging or settling a different number.

**Why:**
A stale snapshot lets the customer scan a QR for more than they owe, and the difference lands nowhere in the ledger.

## Rule: Pay Later and previous-due settlement are mutually exclusive

Pay Later books a new due; it never collects one. It must be withdrawn while a previous due is selected for settlement, and rejected at confirmation as a backstop.

**Why:**
Running the pay-later path with a combined total on screen shows the customer money that was neither collected nor recorded against their balance.

## Rule: a settled due is not new revenue

The settlement is recorded on the payment as its own component alongside the amount actually tendered; the payment's `total` stays the order revenue. The due was already booked as revenue when the original Khatta charge was recorded, so folding it into `total` double counts sales.

## Storage

Customers and their repayment ledger are persisted locally for offline fallback and synchronized in real time to Firebase under `/customers/{customerId}`. Each Firebase customer record contains the customer fields plus its repayment ledger.

**Why:**
Khatta balances and repayments must stay consistent across POS devices; localStorage alone allowed devices to diverge and could lose customer history after a refresh or restart.

**How to apply:**
Use the existing Firebase database singleton. Treat Firebase snapshots as the shared source when available, seed an empty remote node from local history, and keep writes fire-and-forget so offline failures never block order completion.
