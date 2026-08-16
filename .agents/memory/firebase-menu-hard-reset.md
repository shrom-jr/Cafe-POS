---
name: Firebase menu hard reset
description: Hard-reset behavior when stale clients continue recreating deprecated menu nodes.
---

The canonical menu purge must be isolated from running or stale clients. A client running an older Firebase sync can recreate deprecated top-level menu or product nodes immediately after DELETE when its listener sees an empty snapshot, even when the current workspace has no matching write code.

**Why:** Realtime Database DELETEs are not durable against another connected client that still owns legacy write logic and cached menu state.

**How to apply:** Reload or disconnect all clients using the database before the final purge; verify each target path after deletion and distinguish stale-client repopulation from current-source writes.