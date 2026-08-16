---
name: Firebase Settings Hydration
description: Constraint for safely applying remote POS settings snapshots that may omit newer nested fields.
---

Remote Firebase settings records can predate newer nested settings such as digital wallet configuration. Applying a snapshot as a wholesale replacement can leave `settings.wallets` undefined and crash payment settings or checkout screens.

**Why:** Older or partial Firebase settings data caused the Payments admin screen to fail while reading wallet configuration.

**How to apply:** Merge remote settings into the current normalized settings object, merging nested wallet maps and retaining local defaults for omitted fields.