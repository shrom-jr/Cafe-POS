---
name: Firebase schema migration safety
description: Durable safety rules for Firebase ID-keyed migration, unsafe snapshots, and reset-safe inventory writes.
---

Firebase collections owned by payments and bar inventory use ID-keyed records.
Treat legacy arrays and numeric-key maps as readable compatibility input only;
do not automatically rewrite live data from a browser listener.

**Why:** A malformed or duplicate remote identifier cannot be normalized safely
by a running terminal. Replacing the collection would silently drop records.
Selective bar-inventory resets also need to prevent stale clients from
recreating old stock, including when a collection is otherwise empty.

**How to apply:** Use the guarded migration command in dry-run mode first, keep
its backup/report before confirmation, and block writers after an unsafe
snapshot until the migration is resolved. Preserve the reserved scoped reset
sentinel in inventory product/mapping collections; readers must ignore it and
writers must update it with the current reset generation rather than using a
root Firebase transaction.