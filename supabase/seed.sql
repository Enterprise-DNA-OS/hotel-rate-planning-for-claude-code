do $$ declare p uuid; q uuid; a uuid; b uuid; c uuid; i integer; begin
 if exists(select 1 from properties where code='harbour-house') then return; end if;
 insert into properties(code,name,owner,currency,jurisdiction,tax_inclusive,fee_reviewed_on) values('harbour-house','Harbour House (fictional)','Mara','NZD','NZ',true,current_date) returning id into p;
 insert into properties(code,name,owner,currency,jurisdiction,tax_inclusive) values('estuary-inn','Estuary Inn (fictional)','Ravi','AUD','AU',false) returning id into q;
 insert into listings(property_id,source_id,name,rooms,floor_cents,base_cents,ceiling_cents,nightly_fee_cents) values(p,'HH-KING','Harbour King',20,16000,22000,36000,1000) returning id into a;
 insert into listings(property_id,source_id,name,rooms,floor_cents,base_cents,ceiling_cents) values(p,'HH-TWIN','Harbour Twin',10,14000,19000,30000) returning id into b;
 insert into listings(property_id,source_id,name,rooms,floor_cents,base_cents,ceiling_cents) values(q,'EI-KING','Estuary King',12,15000,21000,34000) returning id into c;
 for i in 1..14 loop
 insert into rate_days(listing_id,stay_date,vendor_cents,current_cents,min_stay,available) values(a,current_date+i,23000,22000,case when i in(5,6) then 2 else 1 end,true),(b,current_date+i,19500,19000,1,true),(c,current_date+i,21500,21000,1,true);
 insert into occupancy(listing_id,stay_date,observed_on,sold,blocked,room_revenue_cents) values(a,current_date+i,current_date-3,4,0,88000),(a,current_date+i,current_date,case when i in(5,6) then 17 else 7 end,0,case when i in(5,6) then 374000 else 154000 end),(b,current_date+i,current_date-4,4,1,76000),(c,current_date+i,current_date,6,0,126000);
 end loop;
 insert into events(property_id,name,starts_on,ends_on,uplift_bps,evidence) values(p,'Harbour food weekend',current_date+5,current_date+6,1500,'Fictional organiser calendar for the demo');
 insert into tasks(property_id,title,owner,due_on) values(p,'Confirm twin room blocks','Mara',current_date-2),(p,'Review weekend minimum stay','Ravi',current_date+3),(q,'Confirm tax and compulsory fees','Ravi',current_date-1);
 insert into audit_log(property_id,action,actor,detail) values(p,'demo-seed','Demo', '{"fictional":true}');
end $$;
