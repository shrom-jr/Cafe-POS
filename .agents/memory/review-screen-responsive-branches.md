---
name: Review screen responsive branches
description: The review/payment screen has separate desktop, tablet-landscape, and portrait render branches.
---

Keep responsive review-screen changes scoped to the correct render branch: desktop/tablet grid, short landscape layout, and portrait/mobile stack are separate JSX trees.

**Why:** A visual refactor that removes or reuses one wrapper can leave the other branch unbalanced or change payment-card overflow behavior; the build catches these issues before runtime.

**How to apply:** When changing review layout markup, identify the branch first, preserve each branch's wrapper hierarchy, and run the production build before restarting the workflow.