---
description: Import for hotel rate planning
---

# /import

Read docs/replace-pricelabs.md. Match property currency and Listing IDs, record the expected row count and explicit date format, then run import pricelabs with --dry-run. Reconcile, then apply the same command without --dry-run. Unknown columns or bad rows must be investigated, not silently dropped.

Read CLAUDE.md first. Every write uses the actual operator in --by. Keep work within the chosen property. All messages and documents remain local drafts.
