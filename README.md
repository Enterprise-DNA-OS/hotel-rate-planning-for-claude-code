# Hotel Rate Planning for Claude Code

Own the weekly rate decision: room-night prices, booking pickup, event adjustments and the evidence behind each approval. An open-source database and CLI for the internal hotel rate-planning work you use PriceLabs for.

## Three ways to own it

- **Do it yourself.** Free under MIT. Use Claude Code, Codex, OpenCode or Cursor. Hosting and coding-agent subscriptions are separate.
- **We customise it.** Enterprise DNA maps your rates, booking reports, pricing rules and the connections you need. One setup fee, then a retainer for ongoing work.
- **We run it for you.** Omni by Enterprise DNA installs, connects and operates your version. One setup fee, then a retainer. [Book a 30-minute call](https://enterprisedna.co/omni/book?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=pricelabs).

## Try the fictional hotel

Node 20 or later. No vendor account or hosted database required.

```bash
npm install
npm run demo
npm run rates -- properties
npm run rates -- pickup --property=harbour-house
npm run rates -- propose --property=harbour-house
npm run rates -- attention --property=harbour-house
npm run rates -- weekly-review --property=harbour-house
npm run view
npm run docs
npm test
```

Harbour House and Estuary Inn are fictional. The demo has two currencies, king and twin room types, a food weekend, stale occupancy and overdue work. Seed is repeatable and does not overwrite changed records. Never seed an operational database.

[PriceLabs hotel pricing](https://hotels.pricelabs.co/plans/), checked 6 November 2026 in the live calculator with New Zealand, Single Room Type and 150 rooms selected, shows US$1,048.50 per month, or US$12,582 a year before taxes. This includes the calculator's volume discount. It is a pricing scenario, not a verified customer invoice. Your room-type setup and plan change the bill. Get the actual invoice before making a replacement decision. The [captured calculator](docs/evidence/pricelabs-nz150.png) records the selection checked this run.

## What it does

The database stores properties, room types, imported rate days, dated occupancy, events, approvals, tasks and audit notes. Occupancy is sold rooms divided by capacity less blocked rooms. Pickup compares the two latest observations for a room-night; it is net movement, not a count of new bookings. ADR and RevPAR use the room revenue you record, so keep its tax and fee basis consistent.

Proposals begin at your base rate. High occupancy adds 20%. Low occupancy within seven days subtracts 10%. The largest overlapping event uplift is added, the result is clamped to floor and ceiling, then the fixed compulsory nightly fee is added. These simple business policies are visible and customisable. They do not reproduce PriceLabs forecasts, market data or revenue optimisation.

Approvals require fresh occupancy, sellable rooms and a confirmed tax and fee basis. They store the exact proposal fingerprint. Changed evidence makes an approval stale. There is no price sender, booking engine, payment function or live channel connection. [Why there is no front end](docs/why-no-front-end.md) explains the boundary.

## Bring your PriceLabs rates

[The switching guide](docs/replace-pricelabs.md) covers the account/group CSV layout, one-time room setup, date formats and reconciliation.

```bash
npm run rates -- import pricelabs imports/prices.csv --property=my-hotel --expected-count=250 --date-format=dmy --dry-run --by="Operator"
```

Replace the example count with the actual row count. Remove --dry-run after checking the mapping. Imports are transactional and repeatable. Unknown listings, duplicate dates and invalid prices stop the whole file. Your rate export does not contain trustworthy room counts: log occupancy from the hotel's own booking records separately.

## The weekly rituals

Use /pickup, /propose, /events, /attention and /approved-plan. /weekly-review combines pickup, proposals and attention into a local draft. /draft-rate-note prepares the decision brief. /compliance checks the pricing records against cited NZ and Australian guidance with explicit limits. Every recurring command is listed in [CLAUDE.md](CLAUDE.md); `npm run rates -- help` lists accepted flags. /customise and /new-view extend the same database and reports.

## Ten questions across your own records

These are implemented questions, not claims that another product can never answer them. Run `npm run rates -- insights <key> --property=harbour-house`.

1. Which open nights in the next week have less than half their rooms sold? `low-occupancy`
2. Which room types have stale occupancy observations? `stale-room-types`
3. Which event nights also have high occupancy? `event-pressure`
4. Which proposed nights hit our rate floor? `floor-nights`
5. Which proposed nights hit our rate ceiling? `ceiling-nights`
6. Which nights differ most from the current recorded price? `rate-gap`
7. Which nights lost bookings since the previous observation? `negative-pickup`
8. Which nightly totals include compulsory fees? `fee-review`
9. Which low-occupancy nights require more than one night? `minimum-stay`
10. Who owns the overdue revenue actions? `owner-backlog`

## Your first hour: ten things to ask for

1. Show the room types and their rate bounds.
2. Show the dates where occupancy is stale.
3. Explain the food weekend price.
4. Compare the latest pickup with the previous observation.
5. List low-occupancy nights with a minimum stay.
6. Draft the weekly revenue review.
7. Prepare the rate approval working paper.
8. Check whether an approval still matches the evidence.
9. Add a group-allocation field through /customise.
10. Add a monthly rate-floor report through /new-view.

## Reports, paperwork and access

Set your business name, logo and colours in brand.json. `npm run view` renders the rate week, attention and pickup. `npm run docs` renders a rate approval working paper and revenue meeting pack for each property. These are internal working papers, not statutory notices. HTML escapes record text. Generated files remain local and private.

DATABASE_URL selects operator-managed Postgres; otherwise PGlite persists in .data/db. Eight domain tables use UUIDs, timestamps and update triggers. Public privileges are revoked; RLS has no public access policies. This is a trusted-operator CLI, not a multi-tenant access service. A property filter is not authentication. Read [the compliance scope](docs/compliance.md) before operational use.

Export to a new directory with `npm run rates -- export exports/review-01`. Keep snapshots and source files private. The full snapshot is not an automated restore. Back up stopped PGlite or use Postgres backups and test recovery before cutover. No guest identities are needed or intended here.

## Validation

`npm test` exercises pricing calculations, capacity bounds, stale approvals, property isolation, import rollback, repeated import, CSV roundtrip, generated documents, HTML escaping and real CLI exit codes in temporary data. GitHub Actions runs Linux and Windows embedded tests plus a disposable Postgres database. A local pass alone is not proof of a hosted workflow result.

## Licence and independence

MIT. Copyright 2026 Enterprise DNA. Independent of PriceLabs. Your database is the product; the coding agent is the door. [View the comparison](https://enterprisedna.co/omni/instead-of/pricelabs?utm_source=github&utm_medium=readme&utm_campaign=pricelabs).
