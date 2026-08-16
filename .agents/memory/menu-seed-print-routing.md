---
name: Menu Seed & Print Routing
description: Canonical Firebase menu paths, 17-category Bamboo Cottage Phase 1 dataset, category IDs, and explicit KOT/BOT printRoute convention
---

# Menu Seed & Print Routing

The canonical Firebase menu lives at **`menu/pillars`**, **`menu/categories`**, and **`menu/items`** (not the older top-level `categories` / `menuItems` / `pillars` nodes). The seed script writes only those three paths and must never touch `orders`, `tables`, `customers`, `inventory`, `expenses`, `users`, or `settings`.

**Phase 1 Dataset:** 4 pillars, 17 categories, 328 items. Category IDs use `c_` prefix (e.g. `c_soups`, `c_pizza_rolls`).

**Pillars:** `['Food', 'Beverages', 'Alcohol', 'Others']`

**17 Categories (order / id / name / route):**
1. `c_hot_bev` Hot Beverages — KOT (Beverages)
2. `c_cold_crafted` Crafted Cold Beverages — KOT (Beverages)
3. `c_soups` Soups — KOT (Food)
4. `c_burgers` Burgers & Sandwiches — KOT (Food)
5. `c_sizzlers` Sizzlers & Chhoila — KOT (Food)
6. `c_chefs` Chef's Special & Fish — KOT (Food)
7. `c_veg_snacks` Vegetarian Snacks & Salads — KOT (Food)
8. `c_nonveg_snacks` Non-Vegetarian Snacks — KOT (Food)
9. `c_momo_noodles` Platters, Momo & Noodles — KOT (Food)
10. `c_rice_curries` Rice, Curries & Sets — KOT (Food) — contains biryani, rice, curries, Khana Sets only
11. `c_pizza_rolls` Pizza, Rolls & Khaja Sets — KOT (Food) — NEW; contains pizza, rolls, chopsuey, Khaja Sets (Veg/Buff/Pork/Chicken/Pangra/Bhutan)
12. `c_sekuwa` Special Sekuwa & Sets — KOT (Food)
13. `c_soft_drinks` Soft Drinks & Energy — BOT (Beverages)
14. `c_beers_wines` Beers & Wines — BOT (Alcohol)
15. `c_domestic_spirits` Domestic Spirits — BOT (Alcohol)
16. `c_imported_spirits` Imported Spirits — BOT (Alcohol)
17. `c_hookah_cigs` Hookah & Cigarettes — BOT (Others)

**Routing rule:** Every category and item carries `printRoute: 'KOT' | 'BOT'`. KOT = kitchen printer (food + hot/crafted beverages). BOT = bar printer (bottled drinks, spirits, hookah/cigarettes).

**Why:** Owner's brief mandates per-item printer routing. `c_pizza_rolls` was split from the old Rice & Curries category so pizza/rolls/chopsuey/Khaja Sets go to KOT separately. Khaja Sets are now per-protein (Buff, Pork, Chicken, Pangra, Bhutan as individual entries). Soft drinks are individual SKUs (Coke, Fanta, Sprite…) not combined strings.

**How to apply:** `src/data/defaultSeeds.ts` mirrors `scripts/seedMenu.mjs` exactly — if one changes, update the other. `DEFAULT_MENU_ITEMS` is a live array (not commented out). `DEFAULT_PILLARS` and `DEFAULT_CATEGORIES` are also live. Never re-use old `cat-` prefixed IDs.
