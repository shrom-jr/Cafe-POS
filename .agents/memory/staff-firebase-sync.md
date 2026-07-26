---
name: Staff Firebase sync
description: How Firebase staff users are synced to useStaffStore and what breaks silently
---

## The rule
`subscribeToStaff` in `firebaseSync.ts` is the only source that populates `useStaffStore.users` from Firebase.
`setUsers` in `useStaffStore` must persist non-empty lists to `localStorage` so the login screen renders immediately on the next page load (before the async `onValue` callback fires).

**Why:** Firebase `onValue` is async. Without localStorage caching, every page load flashes "No active staff accounts found." until Firebase responds.

**How to apply:** Any time `setUsers` is changed, verify it still calls `saveUsers(users)` when `users.length > 0`. Never persist an empty array — that would wipe a valid local cache if Firebase is momentarily unreachable.

## Normalization
Firebase-stored user records may be missing the `active` field (legacy records or records added outside the app). `subscribeToStaff` spreads `{ active: true, ...u }` so the login screen filter `users.filter(u => u.active)` never silently hides valid users.

## What NOT to do
- Do not write default/seed users back to Firebase when `users` is empty — the `subscribeToStaff` listener must silently set state to `[]` and return.
- Do not call `pushStaffToFirebase` inside `subscribeToStaff` for any reason (causes a seeding loop).
