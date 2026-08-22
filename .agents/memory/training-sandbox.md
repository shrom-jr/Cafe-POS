---
name: Training sandbox isolation
description: Rules for the isolated Staff Practice session so exercises never affect a live café.
---

Staff Practice must remain a runtime-only, deep-cloned session: it may update Zustand stores for the exercise but must not persist browser state, enqueue/replay offline mutations, write Firebase, or send/reconnect a printer.

**Why:** Training shares a browser and Firebase project with the live café. A practice action must be safe even when it reaches less common Admin, printer, reset, or settlement flows.

**How to apply:** Any new storage writer, Firebase write/replay helper, physical print transport, printer pairing/reconnect action, or destructive reset must check the sandbox boundary before doing external work. Firebase listeners intentionally remain mounted and retain their latest snapshot during practice; exit replays those snapshots before writes are unblocked, avoiding both reconnect/refetch churn and stale snapshot echoes.