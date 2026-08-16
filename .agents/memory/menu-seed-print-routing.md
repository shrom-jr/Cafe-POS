---
name: Menu Seed & Print Routing
description: Canonical Firebase menu paths, 16-category Bamboo Cottage dataset, and explicit KOT/BOT printRoute convention
---

# Menu Seed & Print Routing

The canonical Firebase menu now lives at **`menu/categories`** and **`menu/items`** (not the older top-level `categories` / `menuItems` / `pillars` nodes). The seed script writes only those two paths and must never touch `orders`, `tables`, `customers`, `inventory`, `expenses`, `users`, or `settings`.

**Dataset:** 16 categories (11 KOT, 5 BOT), 316 items. Every category and item carries an explicit `printRoute: 'KOT' | 'BOT'` field:
- KOT (kitchen printer): all food, hot beverages, crafted cold beverages (lassi/juice/milkshakes)
- BOT (bar/bottle printer): soft drinks & energy, beers & wines, domestic/imported spirits, hookah & cigarettes

**Why:** the owner's menu brief mandates printer routing per item, and splitting "Crafted Cold Beverages" (KOT — made in kitchen) from "Soft Drinks & Energy" (BOT — bottled, handed from bar) is intentional; do not re-merge them.

**How to apply:** `PrintRoute` type and optional `printRoute` fields exist on `MenuItem` and `Category` in the POS types; `printRoute` takes precedence over the legacy `sendToKitchen` boolean when present. `src/data/defaultSeeds.ts` mirrors the seed script exactly and must stay in lockstep with it — if one changes, change the other.

**Caveat:** parts of the app may still read the legacy top-level menu nodes or localStorage caches; verify consumers point at `menu/*` before assuming the seeded data is what users see.
