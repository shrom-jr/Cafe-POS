---
name: Selective reset concurrency
description: Durable rules for preventing stale terminals from undoing an operational reset.
---

Selective reset and writes to resettable POS domains must participate in the same reset-generation protocol. Orders, payments, and occupied tables carry opaque reset-generation IDs; permanent order tombstones remain authoritative for an order UUID. Customer-directory resets also use a global generation: Firebase must remain authoritative when its collection is empty, never re-seed it from browser storage.

**Why:** A marker read followed by a separate write can cross a concurrent reset, while comparing client timestamps can either resurrect old work or delete valid work when terminal clocks differ. A stale customer cache can otherwise recreate a directory after it was intentionally deleted.

**How to apply:** Hydrate reset generations before allowing order, payment, or customer writes. Stamp the observed opaque generation at creation, validate it against the current marker, and reject unknown pre-hydration writes. Use subscriptions only for convergence and legacy cleanup, never as the primary write guard.