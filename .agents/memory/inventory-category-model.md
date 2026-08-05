---
name: Inventory Category Model
description: Durable inventory distinctions for restaurant stock, pours, and packaged units.
---

# Inventory Category Model

Wine is stored with ml-tracked alcohol products rather than unit-count beverages, because a full bottle and a glass pour must consume the same underlying stock balance.

Beer and soft drinks are stored as individual unit-count products with a packaging type (`btl`, `can`, or `pcs`) and optional size label. Restocking is entered directly in those units; carton and case multipliers are not part of the operational model.

**Why:** Restaurant stock operations need one consistent balance for wine pours while packaged drinks are physically counted by bottle, can, or piece. Legacy carton fields may be read for compatibility, but new data and UI should not depend on them.

**How to apply:** Keep category-aware Admin Inventory tabs aligned with the Firebase product schema and preserve POS mappings through the existing `alcohol`, `beverage`, and `cigarette` product-type boundaries.