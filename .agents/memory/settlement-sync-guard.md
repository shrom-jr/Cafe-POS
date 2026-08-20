---
name: Settlement synchronization guard
description: Cross-terminal settlement claims and zero-value checkout safeguards
---

Settlement must be claimed per order in Firebase before a production online terminal creates its payment record; the claim transaction accepts the same idempotency key as a retry and rejects competing keys. Local/offline and test paths retain synchronous checkout behavior.

**Why:** Listener-based handoff alone is too late for two terminals confirming before realtime state propagation, while making every checkout path asynchronous regresses established POS behavior.

**How to apply:** Keep zero-item, empty-payment-line, unpaid-line, quantity, and positive-total validation before bill/payment mutation. Treat a paid-order call as an idempotent success recovery path.