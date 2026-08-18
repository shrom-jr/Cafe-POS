---
name: Firebase cross-tab conflict protocol
description: Durable rules for reconciling concurrent POS order and table mutations across browser tabs.
---

Related order and table changes must be published as one Firebase multi-location update with shared mutation metadata. Order deletes require durable tombstones; a missing remote record is not proof of a delayed write.

**Why:** Independent child writes and unconditional local-state preservation allowed one tab to resurrect orders or tables that another tab had legitimately cleared.

**How to apply:** Preserve local state only while that tab's mutation is pending and older than the remote acknowledgement. Let remote clears/deletes win otherwise, and keep reconciliation repairs local-only so they cannot create a feedback loop.