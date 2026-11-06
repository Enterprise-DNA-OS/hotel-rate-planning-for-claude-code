# Bring PriceLabs rate history across

The importer supports the account/group **Download CSV Prices** export documented in [PriceLabs help](https://help.pricelabs.co/portal/en/kb/articles/how-to-export-rates-as-csv), checked 6 November 2026. In Dynamic Pricing, open Customizations, choose Accounts or Groups, then the three-dot menu and Download CSV Prices. Do not use the separate Neighborhood Data or dashboard metrics CSV.

The vendor help screenshot shows PMS Name, Listing ID, Listing Name, Tags, Date, Available, Recommended Price, Uncustomized Recommended Price, Your Price, Min Stay, Unbookable, Check In, Check Out, Status, Status Last Year, ADR, ADR Last Year, Booked Date and Booked Date Last Year. Its example uses day/month/year. Headers are matched case-insensitively. Known extra columns remain in the raw source record; unrecognised headers stop the import so a changed export can be reviewed.

## Set up once

Create a property with its real currency and jurisdiction, then a listing for each source Listing ID. Supply the actual room capacity, floor, base, ceiling and fixed compulsory nightly fee. PriceLabs listing availability does not tell us how many rooms are sold. Currency is not in this export: check the account currency against the chosen property before importing. The CLI does not convert currencies.

```bash
npm run rates -- add-property --code=my-hotel --name="My Hotel" --owner="Operator" --currency=NZD --jurisdiction=NZ --by="Operator"
npm run rates -- add-listing --property=my-hotel --source-id=YOUR-ID --name="King rooms" --rooms=20 --floor-cents=16000 --base-cents=22000 --ceiling-cents=36000 --fee-cents=0 --by="Operator"
```

The values above are examples, not advice for your property. Replace every value with your records. Confirm your tax-inclusive basis and compulsory fees separately through set-pricing-basis after a real review.

## One import command

```bash
npm run rates -- import pricelabs imports/prices.csv --property=my-hotel --expected-count=250 --date-format=dmy --dry-run --by="Operator"
```

Use the actual row count, excluding the header. Date formats are explicitly dmy, mdy or iso; ambiguous dates are never guessed. Compare property, currency, distinct listings, date coverage, prices, minimum stays and availability with the source. Remove --dry-run to apply that same command. A bad row rolls back the whole import. Duplicate listing/date keys within one file are rejected. Repeating a successful import replaces mapped fields for those dates, retains one row per listing/date, logs the source hash and makes affected approvals stale. Unmentioned dates remain intact.

The included examples/pricelabs.csv is fictional but follows the documented layout. It is not a customer export. Local tests cover that fixture shape, invalid inputs, rollback, repeated import and export reimport. No authenticated PriceLabs account was used in this build.

## What maps

- Listing ID identifies a listing inside the selected property; Listing Name is retained in raw source. The local reviewed name stays unchanged.
- Date is the room-night. Recommended Price and Your Price are decimal amounts stored as integer cents. Blank prices remain unknown.
- Min Stay becomes minimum stay; Available becomes the listing-day availability flag.
- Remaining recognised columns remain in the source record for reconciliation. Vendor uncustomised prices, ADR and status are not treated as our occupancy history or revenue facts.

Bookings, guest details, competitor data, model parameters, account customisations, event calendars, channel credentials and automatic synchronisation do not carry over. Record your own occupancy snapshots using log-occupancy, and your own events and rate rules. The free version computes transparent rule-based proposals from those records. It does not reproduce PriceLabs market data or forecasting.

## Check before switching

Run both reviews alongside each other. Reconcile source rates, tax and fee basis, date coverage and stay restrictions. Run compliance, attention and approved-plan. Verify a small set of approved prices against the actual booking system manually, including the whole-stay total. Do not cancel the current service until the chosen replacement workflow and any separately built channel connection have been tested.

## Keep a copy

`npm run rates -- export exports/review-01` writes snapshot.json with all eight record types and a vendor-shaped rate CSV per property. The CSV can be reimported with date-format=iso after configuring the destination property and listings. The full snapshot is an audit-readable export, not an automatic restore script. For recovery use a stopped PGlite directory copy or a tested Postgres backup. Test recovery on a separate database before relying on it.
