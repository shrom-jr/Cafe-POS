---
name: Inventory recovery
description: Recovery of bar product records from surviving inventory mappings after a destructive reset.
---

The app’s Firebase database requires an authenticated client session for inventory reads and writes; anonymous authentication must happen before using the Realtime Database SDK. The legacy inventory seed utility targets a different Firebase project and is not safe for recovery. Recovery should derive IDs from `invMappings`, write only missing product records to the three product collections, preserve reset metadata, and never replace mappings or clear movement history.

**Why:** A bar-inventory reset can remove product records while leaving mappings intact; using the old seed script can target the wrong database and also mutate unrelated inventory data.

**How to apply:** For a one-time restoration, use the recovery script and verify mapped ID counts plus idempotence before declaring the inventory available.