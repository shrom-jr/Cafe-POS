---
name: Selective reset concurrency
description: Durable rules for preventing stale terminals from undoing an operational reset.
---

Selective reset and writes to resettable POS domains must participate in the same atomic Firebase transaction boundary. Orders, payments, and occupied tables carry opaque reset-generation IDs; permanent order tombstones remain authoritative for an order UUID.

**Why:** A marker read followed by a separate write can cross a concurrent reset, while comparing client timestamps can either resurrect old work or delete valid work when terminal clocks differ.

**How to apply:** Hydrate reset generations before allowing order creation or payment. Stamp the observed opaque generation at creation, validate it inside the transaction, and reject unknown pre-hydration writes. Use subscriptions only for convergence and legacy cleanup, never as the primary write guard.