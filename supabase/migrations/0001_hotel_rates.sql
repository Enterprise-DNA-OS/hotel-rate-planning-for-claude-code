create function touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create table properties (
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, owner text not null,
 currency text not null check(currency in ('NZD','AUD','USD','GBP','EUR')), jurisdiction text not null check(jurisdiction in ('NZ','AU','OTHER')),
 tax_inclusive boolean not null default false, fee_reviewed_on date, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table listings (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references properties, source_id text not null,
 name text not null, rooms integer not null check(rooms between 1 and 10000), floor_cents integer not null check(floor_cents>0),
 base_cents integer not null, ceiling_cents integer not null, nightly_fee_cents integer not null default 0 check(nightly_fee_cents>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(property_id,source_id),
 check(base_cents>=floor_cents and ceiling_cents>=base_cents)
);
create table rate_days (
 id uuid primary key default gen_random_uuid(), listing_id uuid not null references listings, stay_date date not null,
 vendor_cents integer check(vendor_cents>0), current_cents integer check(current_cents>0), min_stay integer not null check(min_stay between 1 and 365),
 available boolean not null, source jsonb not null default '{}', imported_at timestamptz not null default now(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(listing_id,stay_date)
);
create table occupancy (
 id uuid primary key default gen_random_uuid(), listing_id uuid not null references listings, stay_date date not null, observed_on date not null,
 sold integer not null check(sold>=0), blocked integer not null check(blocked>=0), room_revenue_cents bigint not null check(room_revenue_cents>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(listing_id,stay_date,observed_on)
);
create table events (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references properties, name text not null,
 starts_on date not null, ends_on date not null, uplift_bps integer not null check(uplift_bps between -5000 and 10000),
 evidence text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(ends_on>=starts_on)
);
create table decisions (
 id uuid primary key default gen_random_uuid(), rate_day_id uuid not null references rate_days, fingerprint text not null,
 rate_cents integer not null check(rate_cents>0), total_cents integer not null check(total_cents>=rate_cents),
 min_stay integer not null, actor text not null, reason text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table tasks (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references properties, title text not null, owner text not null,
 due_on date not null, status text not null default 'open' check(status in ('open','closed')), resolution text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(status='open' or length(resolution)>0)
);
create table audit_log (
 id uuid primary key default gen_random_uuid(), property_id uuid references properties, action text not null, actor text not null, detail jsonb not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create view occupancy_latest as
 select distinct on (listing_id,stay_date) * from occupancy where observed_on<=current_date order by listing_id,stay_date,observed_on desc;
create view rate_plan as
 with basis as (
 select d.id,d.listing_id,p.id as property_id,p.code,p.currency,p.tax_inclusive,p.fee_reviewed_on,
 l.source_id,l.name,l.rooms,l.floor_cents,l.base_cents,l.ceiling_cents,l.nightly_fee_cents,
 d.stay_date,d.vendor_cents,d.current_cents,d.min_stay,d.available,o.sold,o.blocked,o.observed_on,o.room_revenue_cents,
 case when l.rooms>coalesce(o.blocked,0) then round(100.0*o.sold/(l.rooms-o.blocked),1) end as occupancy_pct,
 coalesce((select max(e.uplift_bps) from events e where e.property_id=p.id and d.stay_date between e.starts_on and e.ends_on),0) as event_bps,
 p.updated_at as property_updated,l.updated_at as listing_updated,d.updated_at as rate_updated,o.updated_at as occupancy_updated
 from rate_days d join listings l on l.id=d.listing_id join properties p on p.id=l.property_id
 left join occupancy_latest o on o.listing_id=l.id and o.stay_date=d.stay_date
 ), rules as (
 select *,case when occupancy_pct>=80 then 2000 when occupancy_pct<50 and stay_date<=current_date+7 then -1000 else 0 end as occupancy_bps from basis
 ), priced as (
 select *,case when observed_on is null or rooms<=blocked or sold+blocked>rooms then null else
 greatest(floor_cents,least(ceiling_cents,round(base_cents*(1+(occupancy_bps+event_bps)/10000.0))))::int end as proposed_cents from rules
 )
 select *,proposed_cents+nightly_fee_cents as total_cents,
 case when stay_date<current_date then 'past date' when not available then 'unavailable' when observed_on is null then 'missing occupancy'
 when sold+blocked>rooms then 'capacity mismatch' when rooms<=blocked then 'no sellable rooms'
 when sold>=rooms-blocked then 'sold out' when observed_on<current_date-2 then 'stale occupancy'
 when not tax_inclusive then 'tax basis unconfirmed' when fee_reviewed_on is null or fee_reviewed_on<current_date-90 then 'fees need review' else 'ready for review' end as readiness
 from priced;
create view attention as
 select property_id,code,name,stay_date as due_on,readiness as issue from rate_plan where stay_date>=current_date and readiness not in ('ready for review','unavailable','sold out')
 union all select t.property_id,p.code,t.title,t.due_on,'overdue task' from tasks t join properties p on p.id=t.property_id where t.status='open' and t.due_on<current_date;
create view pickup as
 select p.id as property_id,p.code,l.name,o.stay_date,o.observed_on,o.sold,o.blocked,
 o.sold-(select prev.sold from occupancy prev where prev.listing_id=o.listing_id and prev.stay_date=o.stay_date and prev.observed_on<o.observed_on order by prev.observed_on desc limit 1) as pickup_rooms,
 round(o.room_revenue_cents::numeric/nullif(o.sold,0)) as adr_cents,
 round(o.room_revenue_cents::numeric/nullif(l.rooms-o.blocked,0)) as revpar_cents,p.currency
 from occupancy_latest o join listings l on l.id=o.listing_id join properties p on p.id=l.property_id;
do $$ declare t text; begin
 foreach t in array array['properties','listings','rate_days','occupancy','events','decisions','tasks','audit_log'] loop
 execute format('create trigger touch before update on %I for each row execute function touch_updated_at()',t);
 execute format('alter table %I enable row level security',t);
 execute format('revoke all on %I from public',t);
 end loop;
end $$;
revoke all on occupancy_latest,rate_plan,attention,pickup from public;
