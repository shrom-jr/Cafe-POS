---
name: Firebase anonymous authentication
description: Firebase Authentication setup and the required ordering for authenticated Realtime Database access.
---

Firebase Anonymous Authentication is enabled for this project, and Realtime Database root access requires `auth != null`.

**Why:** The POS keeps staff PIN/RBAC as its application-level authorization model, while anonymous Firebase credentials give each terminal the authenticated identity needed by Realtime Database rules. Starting listeners or mutation replay before that identity exists causes permission-denied errors and can lose queued operations.

**How to apply:** Reuse the shared anonymous-auth bootstrap during app initialization. Do not attach Firebase listeners, seed data, perform writes, or drain the offline mutation queue until the session is ready. If Firebase Auth is disabled or unavailable, fail closed rather than falling back to public rules.