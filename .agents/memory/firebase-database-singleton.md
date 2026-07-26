---
name: Firebase database singleton
description: Constraint for adding Firebase Realtime Database listeners to this app
---

Always reuse the app's already-initialized Realtime Database instance for additional listeners, including `/.info/connected`. Do not call `getDatabase()` again with a different or implicit URL.

**Why:** Firebase can throw a fatal “Database initialized multiple times” error when the same app is initialized with database URL signatures that do not match exactly.

**How to apply:** Import the existing exported database instance and pass it to `ref()` for new listeners. Keep connection-status hooks independent from the existing data synchronization helpers.