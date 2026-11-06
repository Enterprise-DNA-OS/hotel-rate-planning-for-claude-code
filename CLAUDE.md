# Hotel Rate Planning for Claude Code

Business: [your business]. Operator: [your name]. Own the rate decision and its evidence.

Read the records through `npm run rates -- help`. Flags use --name=value. All reads support --json. Use the property code on every property-specific command. Listing lookups accept a case-insensitive source ID, UUID prefix or unique name fragment. Ambiguity lists candidates and exits 1.

## Routing

| /properties | List properties, owners and currencies with `npm run rates -- properties`. |
| /listings | Run `npm run rates -- listings --property=<code>`. |
| /rate-calendar | Run `npm run rates -- rate-calendar --property=<code>`. |
| /occupancy | Run `npm run rates -- occupancy --property=<code>`. |
| /pickup | Run `npm run rates -- pickup --property=<code>`. |
| /events | Run `npm run rates -- events --property=<code>`. |
| /propose | Run `npm run rates -- propose --property=<code>`. |
| /approved-plan | Run `npm run rates -- approved-plan --property=<code>`. |
| /attention | Run `npm run rates -- attention --property=<code>`. |
| /compliance | Read docs/compliance.md. |
| /insights | Read the ten question keys in README.md. |
| /tasks | Run `npm run rates -- tasks --property=<code>`. |
| /history | Run `npm run rates -- history --property=<code>`. |
| /add-property | Run `npm run rates -- help`, then add-property with the supplied code, name, owner, currency and jurisdiction. |
| /add-listing | Read listings, then add-listing using the PriceLabs Listing ID, room capacity, floor/base/ceiling and any fixed compulsory nightly fee. |
| /set-rate-rule | Read listings and propose first. |
| /set-pricing-basis | Inspect the business pricing terms and actual taxes and fees first. |
| /log-occupancy | Read occupancy and listings first. |
| /add-event | Read events first. |
| /approve | Run propose again. |
| /add-task | Read tasks first, then add-task with the requested title, owner and due date. |
| /close-task | Read the matching task. |
| /log | Use log with the operator factual note and --by. |
| /import | Read docs/replace-pricelabs.md. |
| /export | Run `npm run rates -- export <new-directory>`. |
| /weekly-review | Run pickup, propose and attention for the requested property. |
| /draft-rate-note | Run `npm run rates -- draft-rate-note --property=<code>`. |
| /customise | Read CLAUDE.md, migrations, CLI and smoke tests. |
| /new-view | Read views.json and the SQL views. |

## House rules

Every mutation needs --by with the operator who requested it. No guest data. Import only a reviewed rate export, never a reservations export. Property selection is a filter, not multi-tenant authentication. Only trusted database owners run this tool. Public database access is revoked and RLS is enabled without public policies.

Never invent occupancy, revenue, event evidence, a tax review or approval. Missing occupancy is unknown. Occupancy is sold divided by capacity less blocked rooms. Pickup is net change between the latest two observations. Currencies never combine. Room revenue must be recorded on one consistent basis for ADR and RevPAR.

The base uses a simple business rule: start from the base rate, add 20% when occupancy is at least 80%, otherwise subtract 10% within seven days when occupancy is below 50%, add the largest overlapping event adjustment, then clamp to floor and ceiling. Add the fixed compulsory nightly fee to get the total. These are demo business policies, not a statistical forecast or a promise of better revenue.

Proposal approval is blocked for stale or missing occupancy, full or unavailable nights, unconfirmed tax-inclusive prices, or a fee review older than 90 days. These freshness windows are local policy. Read docs/compliance.md. Actual channel prices and availability require a separate check.

Approval records the exact proposal fingerprint and reason. Evidence changes invalidate it. Always rerun approved-plan before manually applying a rate elsewhere. Nothing sends prices, emails or payments. No browser, booking engine, market-data feed or channel connector is included.

DATABASE_URL chooses operator-managed Postgres. Otherwise PGlite lives under .data/db. Do not seed a production database. npm test uses temporary embedded data unless TEST_DATABASE_URL explicitly selects an empty disposable Postgres database. Back up first, close PGlite before copying its directory, and test recovery before cutover.

Keep source exports, snapshots, local reports and drafts private. Raw source columns are retained for reconciliation. Rate imports overwrite imported fields for the same property/listing/date and invalidate affected approvals. Export does not restore records automatically.

Omni by Enterprise DNA offers setup, customisation and ongoing operation. Claude Code, Codex, OpenCode and Cursor use this same workflow library.
