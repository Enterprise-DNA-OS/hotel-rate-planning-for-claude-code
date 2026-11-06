#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {getDb,REPO_ROOT} from './lib/db.mjs';
import {parseCsv,pick} from './lib/csv.mjs';
import {table} from './lib/format.mjs';
export const tables=['properties','listings','rate_days','occupancy','events','decisions','tasks','audit_log'];
const today=()=>new Date().toISOString().slice(0,10);
function required(v,k){if(typeof v!=='string'||!v.trim())throw Error(`Required: --${k}=value`);return v.trim();}
function integer(v,k,min=0,max=1000000000){if(!/^\d+$/.test(String(v))||!Number.isSafeInteger(Number(v))||Number(v)<min||Number(v)>max)throw Error(`${k} must be an integer from ${min} to ${max}`);return Number(v);}
function signed(v,k,min,max){if(!/^-?\d+$/.test(String(v))||Number(v)<min||Number(v)>max)throw Error(`Invalid ${k}`);return Number(v);}
function date(v,k='date'){if(!/^\d{4}-\d{2}-\d{2}$/.test(v||'')||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw Error(`Invalid ${k}: use YYYY-MM-DD`);return v;}
function bool(v,k){if(!['true','false'].includes(String(v).toLowerCase()))throw Error(`${k} must be true or false`);return String(v).toLowerCase()==='true';}
function cents(v,k){if(!/^\d+(\.\d{1,2})?$/.test(String(v)))throw Error(`Invalid ${k}: decimal price without currency symbol`);const [a,b='']=String(v).split('.');return integer(Number(a)*100+Number(b.padEnd(2,'0')),k,1,100000000);}
function args(argv){const pos=[],f={};for(const a of argv){if(a.startsWith('--')){const i=a.indexOf('=');const k=a.slice(2,i<0?undefined:i);if(k in f)throw Error(`Duplicate flag --${k}`);f[k]=i<0?true:a.slice(i+1);}else pos.push(a);}return {pos,f};}
const signature=r=>createHash('sha256').update(JSON.stringify([r.id,r.stay_date,r.observed_on,r.sold,r.blocked,r.rooms,r.proposed_cents,r.total_cents,r.min_stay,r.readiness,r.current_cents,r.vendor_cents,r.tax_inclusive,r.fee_reviewed_on,r.property_updated,r.listing_updated,r.rate_updated,r.occupancy_updated,r.event_bps])).digest('hex');
async function audit(db,p,action,by,detail){await db.query('insert into audit_log(property_id,action,actor,detail) values($1,$2,$3,$4)',[p,action,by,JSON.stringify(detail)]);}
async function transaction(db,fn,dry=false){await db.exec('BEGIN');try{const r=await fn();await db.exec(dry?'ROLLBACK':'COMMIT');return r;}catch(e){await db.exec('ROLLBACK');throw e;}}
async function match(db,t,ref,p){required(ref,t);const rows=await db.query(t==='properties'?'select * from properties':`select * from ${t} where property_id=$1`,t==='properties'?[]:[p]);const norm=ref.toLowerCase();const exact=rows.filter(r=>[r.id,r.code,r.source_id].some(v=>v?.toLowerCase()===norm));const hits=exact.length?exact:rows.filter(r=>r.id.startsWith(norm)||String(r.name||r.title).toLowerCase().includes(norm));if(hits.length!==1)throw Error(`${hits.length?'Ambiguous':'Not found'} ${t}: ${ref}\n${(hits.length?hits:rows).map(r=>`${r.id} ${r.code||r.source_id||''} ${r.name||r.title}`).join('\n')}`);return hits[0];}
function writePrivate(file,text){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,text,{flag:'wx',mode:0o600});}
function csv(rows,keys){const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';return [keys.map(quote).join(','),...rows.map(r=>keys.map(k=>quote(r[k])).join(','))].join('\r\n')+'\r\n';}
const readCommands={
 properties:'select code,name,owner,currency,jurisdiction from properties order by code',
 listings:'select source_id,name,rooms,floor_cents,base_cents,ceiling_cents,nightly_fee_cents from listings where property_id=$1 order by source_id',
 'rate-calendar':'select source_id,name,stay_date,current_cents,vendor_cents,min_stay,available,currency from rate_plan where property_id=$1 order by stay_date,source_id',
 occupancy:'select name,stay_date,observed_on,sold,blocked,rooms,occupancy_pct from rate_plan where property_id=$1 order by stay_date,source_id',
 pickup:'select name,stay_date,observed_on,sold,pickup_rooms,adr_cents,revpar_cents,currency from pickup where property_id=$1 order by stay_date,name',
 events:'select id,name,starts_on,ends_on,uplift_bps,evidence from events where property_id=$1 order by starts_on,name',
 attention:'select name,due_on,issue from attention where property_id=$1 order by due_on,name',
 tasks:'select id,title,owner,due_on,status,resolution from tasks where property_id=$1 order by due_on',
 history:'select action,actor,detail,created_at from audit_log where property_id=$1 order by created_at,id'
};
export const insightQuestions={
 'low-occupancy':'Which open nights in the next week have less than half their rooms sold?',
 'stale-room-types':'Which room types have stale occupancy observations?',
 'event-pressure':'Which event nights also have high occupancy?',
 'floor-nights':'Which proposed nights hit our rate floor?',
 'ceiling-nights':'Which proposed nights hit our rate ceiling?',
 'rate-gap':'Which nights differ most from the current recorded price?',
 'negative-pickup':'Which nights lost bookings since the previous observation?',
 'fee-review':'Which nightly totals include compulsory fees?',
 'minimum-stay':'Which low-occupancy nights require more than one night?',
 'owner-backlog':'Who owns the overdue revenue actions?'
};
export const help=`Hotel rate planning. Flags use --name=value. Read commands support --json.
properties
listings | rate-calendar | occupancy | pickup | events | attention | tasks | history --property=CODE
propose | approved-plan | compliance | weekly-review | draft-rate-note --property=CODE
insights KEY --property=CODE
add-property --code=CODE --name=NAME --owner=NAME --currency=NZD --jurisdiction=NZ --by=NAME
set-pricing-basis --property=CODE --tax-inclusive=true --reviewed-on=YYYY-MM-DD --by=NAME
add-listing --property=CODE --source-id=ID --name=NAME --rooms=N --floor-cents=N --base-cents=N --ceiling-cents=N [--fee-cents=0] --by=NAME
set-rate-rule LISTING --property=CODE --floor-cents=N --base-cents=N --ceiling-cents=N --fee-cents=N --by=NAME
log-occupancy LISTING --property=CODE --date=YYYY-MM-DD --observed-on=YYYY-MM-DD --sold=N --blocked=N --revenue-cents=N --by=NAME
add-event --property=CODE --name=NAME --start=YYYY-MM-DD --end=YYYY-MM-DD --uplift-bps=N --evidence=TEXT --by=NAME
approve LISTING --property=CODE --date=YYYY-MM-DD --fingerprint=HASH --reason=TEXT --by=NAME
add-task --property=CODE --title=TEXT --owner=NAME --due-on=YYYY-MM-DD --by=NAME
close-task REF --property=CODE --resolution=TEXT --by=NAME
log --property=CODE --note=TEXT --by=NAME
import pricelabs FILE --property=CODE --expected-count=N --date-format=iso|dmy|mdy [--dry-run] --by=NAME
export NEW_DIRECTORY
No command sends prices, changes booking channels, or emails.`;
export async function run(db,argv){
 const {pos,f}=args(argv);const [cmd,...rest]=pos;const by=()=>required(f.by,'by');
 const allowed={
 'help':[],properties:[],listings:[], 'rate-calendar':[],occupancy:[],pickup:[],events:[],attention:[],tasks:[],history:[],propose:[],'approved-plan':[],compliance:[],'weekly-review':[],'draft-rate-note':[],insights:[],
 'add-property':['code','name','owner','currency','jurisdiction'],'set-pricing-basis':['tax-inclusive','reviewed-on'],
 'add-listing':['source-id','name','rooms','floor-cents','base-cents','ceiling-cents','fee-cents'],'set-rate-rule':['floor-cents','base-cents','ceiling-cents','fee-cents'],
 'log-occupancy':['date','observed-on','sold','blocked','revenue-cents'],'add-event':['name','start','end','uplift-bps','evidence'],
 approve:['date','fingerprint','reason'],'add-task':['title','owner','due-on'],'close-task':['resolution'],log:['note'],import:['expected-count','date-format','dry-run'],export:[]
 };
 if(!cmd||cmd==='help')return [{help}];if(!(cmd in allowed))throw Error(`Unknown command ${cmd}\n${help}`);
 for(const k of Object.keys(f))if(!['property','json','by',...allowed[cmd]].includes(k))throw Error(`Unknown flag --${k}`);
 if('dry-run' in f && f['dry-run']!==true)throw Error('Use --dry-run without a value');
 const expectedPos={insights:1,'set-rate-rule':1,'log-occupancy':1,approve:1,'close-task':1,import:2,export:1};
 if(rest.length!==(expectedPos[cmd]||0))throw Error(`Wrong arguments for ${cmd}; see help`);
 const p=['properties','add-property','export'].includes(cmd)?null:await match(db,'properties',f.property);
 const mutate=(fn,dry=false)=>transaction(db,async()=>{if(p)await db.query('select id from properties where id=$1 for update',[p.id]);return fn();},dry);
 if(cmd in readCommands)return db.query(readCommands[cmd],p?[p.id]:[]);
 const plans=()=>db.query('select * from rate_plan where property_id=$1 and stay_date>=current_date order by stay_date,source_id',[p.id]);
 if(cmd==='propose')return (await plans()).map(r=>({listing:r.source_id,date:r.stay_date,occupancy_pct:r.occupancy_pct,proposed_cents:r.proposed_cents,total_cents:r.total_cents,currency:r.currency,min_stay:r.min_stay,readiness:r.readiness,fingerprint:signature(r)}));
 if(cmd==='approved-plan'){
  const rows=await plans();const ds=await db.query('select a.* from decisions a join rate_days d on d.id=a.rate_day_id join listings l on l.id=d.listing_id where l.property_id=$1 order by a.created_at desc,a.id',[p.id]);
  return rows.flatMap(r=>{const a=ds.find(d=>d.rate_day_id===r.id);return a?[{listing:r.source_id,date:r.stay_date,rate_cents:a.rate_cents,total_cents:a.total_cents,currency:r.currency,min_stay:a.min_stay,actor:a.actor,reason:a.reason,state:r.readiness==='ready for review'&&a.fingerprint===signature(r)?'current approval':'stale approval'}]:[];});
 }
 if(cmd==='compliance')return [
 {rule:'NZ-accurate-price',result:p.jurisdiction==='NZ'?(p.tax_inclusive&&p.fee_reviewed_on?'REVIEW RECORDED':'CHECK'):'N/A',source:'https://www.comcom.govt.nz/consumers/dealing-with-typical-situations/leisure-and-travel/',note:'Confirm displayed price and availability match the booking terms; this tool does not inspect public channels.'},
 {rule:'AU-total-price',result:p.jurisdiction==='AU'?(p.tax_inclusive&&p.fee_reviewed_on?'REVIEW RECORDED':'CHECK'):'N/A',source:'https://www.accc.gov.au/business/pricing/price-displays',note:'Total must include taxes and unavoidable fees. Per-stay, per-person and conditional fees require a custom calculation.'},
 {rule:'pricing-evidence',result:(await plans()).some(r=>!['ready for review','unavailable','sold out'].includes(r.readiness))?'CHECK':'REVIEW RECORDED',source:'docs/compliance.md',note:'Two-day occupancy and 90-day fee review are internal policies, not legal deadlines.'}
 ];
 if(cmd==='insights'){
  const key=rest[0];if(!(key in insightQuestions))throw Error('Choose: '+Object.keys(insightQuestions).join(', '));
  const where={
   'low-occupancy':"stay_date<=current_date+7 and occupancy_pct<50 and available",
   'stale-room-types':"observed_on<current_date-2",
   'event-pressure':"event_bps>0 and occupancy_pct>=80",
   'floor-nights':"proposed_cents=floor_cents",
   'ceiling-nights':"proposed_cents=ceiling_cents",
   'rate-gap':"proposed_cents is not null and current_cents is not null and proposed_cents<>current_cents",
   'fee-review':"nightly_fee_cents>0",
   'minimum-stay':"occupancy_pct<50 and min_stay>1"
  };
  if(key==='owner-backlog')return db.query("select owner,count(*)::int as overdue from tasks where property_id=$1 and status='open' and due_on<current_date group by owner order by overdue desc,owner",[p.id]);
  if(key==='negative-pickup')return db.query('select name,stay_date,pickup_rooms from pickup where property_id=$1 and pickup_rooms<0 order by stay_date,name',[p.id]);
  const columns=key==='event-pressure'?'name,stay_date,occupancy_pct,event_bps,proposed_cents,total_cents,currency':key==='stale-room-types'?'name,stay_date,observed_on':key==='minimum-stay'?'name,stay_date,occupancy_pct,min_stay':key==='fee-review'?'name,stay_date,nightly_fee_cents,total_cents,currency':key==='rate-gap'?'name,stay_date,current_cents,proposed_cents,currency':'name,stay_date,occupancy_pct,proposed_cents,total_cents,currency';
  return db.query(`select ${columns} from rate_plan where property_id=$1 and stay_date>=current_date and ${where[key]} order by ${key==='rate-gap'?'abs(proposed_cents-current_cents) desc,':''}stay_date,source_id`,[p.id]);
 }
 if(['weekly-review','draft-rate-note'].includes(cmd)){
  const sections=[];for(const name of ['pickup','propose','attention']){const rows=await run(db,[name,`--property=${p.code}`]);sections.push(`## ${name}\n\n${JSON.stringify(rows.map(({fingerprint,...r})=>r),null,2)}`);}
  const file=path.resolve(process.env.OUTPUT_DIR||REPO_ROOT,'drafts',`${p.code}-${cmd}-${randomUUID()}.md`);writePrivate(file,`# ${p.name}: ${cmd}\n\nInternal draft. No rates sent. Check evidence and approvals before copying any price.\n\n${sections.join('\n\n')}\n`);return [{draft:file}];
 }
 if(cmd==='export'){
  const dir=path.resolve(rest[0]);if(fs.existsSync(dir))throw Error('Export directory already exists');
  const snapshot={format:'hotel-rate-planning-v1',exported_at:new Date().toISOString(),tables:{}};
  await db.exec('BEGIN READ ONLY');try{for(const t of tables)snapshot.tables[t]=await db.query(`select * from ${t} order by id`);}finally{await db.exec('ROLLBACK');}
  fs.mkdirSync(dir,{recursive:true,mode:0o700});writePrivate(path.join(dir,'snapshot.json'),JSON.stringify(snapshot,null,2)+'\n');
  for(const prop of snapshot.tables.properties){const ls=snapshot.tables.listings.filter(l=>l.property_id===prop.id);const rows=snapshot.tables.rate_days.filter(d=>ls.some(l=>l.id===d.listing_id)).map(d=>{const l=ls.find(l=>l.id===d.listing_id);return {'PMS Name':'owned','Listing ID':l.source_id,'Listing Name':l.name,Date:d.stay_date,Available:d.available?'TRUE':'FALSE','Recommended Price':d.vendor_cents===null?'':(d.vendor_cents/100).toFixed(2),'Your Price':d.current_cents===null?'':(d.current_cents/100).toFixed(2),'Min Stay':d.min_stay};});writePrivate(path.join(dir,`${prop.code}-rates.csv`),csv(rows,['PMS Name','Listing ID','Listing Name','Date','Available','Recommended Price','Your Price','Min Stay']));}
  return [{directory:dir,record_types:tables.length}];
 }
 if(cmd==='add-property'){
  const code=required(f.code,'code');if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(code))throw Error('Code must be lowercase words and hyphens');
  return mutate(async()=>{const r=await db.query('insert into properties(code,name,owner,currency,jurisdiction) values($1,$2,$3,$4,$5) returning *',[code,required(f.name,'name'),required(f.owner,'owner'),required(f.currency,'currency'),required(f.jurisdiction,'jurisdiction')]);await audit(db,r[0].id,cmd,by(),{code});return r;});
 }
 if(cmd==='set-pricing-basis'){
  const reviewed=date(f['reviewed-on']);if(reviewed>today())throw Error('Review date cannot be in the future');
  return mutate(async()=>{const rows=await db.query('update properties set tax_inclusive=$1,fee_reviewed_on=$2 where id=$3 returning code,tax_inclusive,fee_reviewed_on',[bool(f['tax-inclusive'],'tax-inclusive'),reviewed,p.id]);await audit(db,p.id,cmd,by(),f);return rows;});
 }
 if(cmd==='add-listing'||cmd==='set-rate-rule'){
  const values=[integer(f['floor-cents'],'floor-cents',1),integer(f['base-cents'],'base-cents',1),integer(f['ceiling-cents'],'ceiling-cents',1),integer(f['fee-cents']??(cmd==='add-listing'?0:undefined),'fee-cents')];
  if(values[0]>values[1]||values[1]>values[2])throw Error('Require floor <= base <= ceiling');
  const listing=cmd==='set-rate-rule'?await match(db,'listings',rest[0],p.id):null;
  return mutate(async()=>{const rows=listing?await db.query('update listings set floor_cents=$1,base_cents=$2,ceiling_cents=$3,nightly_fee_cents=$4 where id=$5 returning *',[...values,listing.id]):await db.query('insert into listings(floor_cents,base_cents,ceiling_cents,nightly_fee_cents,property_id,source_id,name,rooms) values($1,$2,$3,$4,$5,$6,$7,$8) returning *',[...values,p.id,required(f['source-id'],'source-id'),required(f.name,'name'),integer(f.rooms,'rooms',1,10000)]);await audit(db,p.id,cmd,by(),{listing:rows[0].id,values});return rows;});
 }
 if(cmd==='log-occupancy'){
  const l=await match(db,'listings',rest[0],p.id);const sold=integer(f.sold,'sold'),blocked=integer(f.blocked,'blocked');if(sold+blocked>l.rooms)throw Error('Sold plus blocked exceeds room capacity');const revenue=integer(f['revenue-cents'],'revenue-cents');if(sold===0&&revenue!==0)throw Error('Room revenue must be zero when no rooms are sold');const observed=date(f['observed-on']);if(observed>today())throw Error('Observation cannot be in the future');
  return mutate(async()=>{const rows=await db.query('insert into occupancy(listing_id,stay_date,observed_on,sold,blocked,room_revenue_cents) values($1,$2,$3,$4,$5,$6) on conflict(listing_id,stay_date,observed_on) do update set sold=excluded.sold,blocked=excluded.blocked,room_revenue_cents=excluded.room_revenue_cents returning id',[l.id,date(f.date),observed,sold,blocked,revenue]);await audit(db,p.id,cmd,by(),{listing:l.id,...f});return rows;});
 }
 if(cmd==='add-event')return mutate(async()=>{const rows=await db.query('insert into events(property_id,name,starts_on,ends_on,uplift_bps,evidence) values($1,$2,$3,$4,$5,$6) returning id,name',[p.id,required(f.name,'name'),date(f.start),date(f.end),signed(f['uplift-bps'],'uplift-bps',-5000,10000),required(f.evidence,'evidence')]);await audit(db,p.id,cmd,by(),f);return rows;});
 if(cmd==='approve'){
  const l=await match(db,'listings',rest[0],p.id);return mutate(async()=>{
   // Lock the property first; all property mutations use the same transaction lock below.
   await db.query('select id from properties where id=$1 for update',[p.id]);
   const r=(await db.query('select * from rate_plan where listing_id=$1 and stay_date=$2',[l.id,date(f.date)]))[0];if(!r)throw Error('No rate day; import rates first');if(r.readiness!=='ready for review')throw Error(`Cannot approve: ${r.readiness}`);if(signature(r)!==required(f.fingerprint,'fingerprint'))throw Error('Proposal changed: run propose and review again');
   const rows=await db.query('insert into decisions(rate_day_id,fingerprint,rate_cents,total_cents,min_stay,actor,reason) values($1,$2,$3,$4,$5,$6,$7) returning id,rate_cents,total_cents',[r.id,signature(r),r.proposed_cents,r.total_cents,r.min_stay,by(),required(f.reason,'reason')]);await audit(db,p.id,cmd,by(),{decision:rows[0].id,...f});return rows;
  });
 }
 if(cmd==='add-task')return mutate(async()=>{const rows=await db.query('insert into tasks(property_id,title,owner,due_on) values($1,$2,$3,$4) returning id,title',[p.id,required(f.title,'title'),required(f.owner,'owner'),date(f['due-on'])]);await audit(db,p.id,cmd,by(),f);return rows;});
 if(cmd==='close-task'){const t=await match(db,'tasks',rest[0],p.id);return mutate(async()=>{const rows=await db.query("update tasks set status='closed',resolution=$1 where id=$2 returning id,status",[required(f.resolution,'resolution'),t.id]);await audit(db,p.id,cmd,by(),{task:t.id,...f});return rows;});}
 if(cmd==='log')return mutate(async()=>{await audit(db,p.id,'note',by(),{note:required(f.note,'note')});return [{recorded:true}];});
 if(cmd==='import'){
  if(rest[0]!=='pricelabs')throw Error('Supported import: pricelabs');by();const format=f['date-format'];if(!['iso','dmy','mdy'].includes(format))throw Error('Specify --date-format=iso|dmy|mdy');
  const source=fs.readFileSync(rest[1],'utf8');const rows=parseCsv(source);const expected=integer(f['expected-count'],'expected-count',1,1000000);if(rows.length!==expected)throw Error(`Expected ${expected} rows; found ${rows.length}`);
  const ls=await db.query('select * from listings where property_id=$1',[p.id]);const seen=new Set();
  const mapped=rows.map((row,i)=>{
   const get=k=>pick(row,k);const l=ls.find(l=>l.source_id===get('Listing ID'));if(!l)throw Error(`Row ${i+2}: unknown Listing ID ${get('Listing ID')}; add the room type and capacity first`);
   let day=get('Date');if(format!=='iso'){const parts=day.split('/');if(parts.length!==3||!/^\d{4}$/.test(parts[2]))throw Error('Date must use slash separators and four-digit year');day=`${parts[2]}-${parts[format==='dmy'?1:0].padStart(2,'0')}-${parts[format==='dmy'?0:1].padStart(2,'0')}`;}day=date(day);
   const key=l.id+day;if(seen.has(key))throw Error(`Duplicate listing/date at row ${i+2}`);seen.add(key);
   const allowedHeaders=['PMS Name','Listing ID','Listing Name','Tags','Date','Available','Recommended Price','Uncustomized Recommended Price','Your Price','Min Stay','Unbookable','Check In','Check Out','Status','Status Last Year','ADR','ADR Last Year','Booked Date','Booked Date Last Year'];
   const unknown=Object.keys(row).filter(k=>!allowedHeaders.some(h=>h.toLowerCase()===k.toLowerCase()));if(unknown.length)throw Error('Unrecognised export columns: '+unknown.join(', '));
   return [l.id,day,get('Recommended Price')?cents(get('Recommended Price'),'Recommended Price'):null,get('Your Price')?cents(get('Your Price'),'Your Price'):null,integer(get('Min Stay'),'Min Stay',1,365),bool(get('Available'),'Available'),JSON.stringify(row)];
  });
  return mutate(async()=>{for(const v of mapped)await db.query('insert into rate_days(listing_id,stay_date,vendor_cents,current_cents,min_stay,available,source) values($1,$2,$3,$4,$5,$6,$7) on conflict(listing_id,stay_date) do update set vendor_cents=excluded.vendor_cents,current_cents=excluded.current_cents,min_stay=excluded.min_stay,available=excluded.available,source=excluded.source,imported_at=now()',v);await audit(db,p.id,cmd,by(),{rows:rows.length,sha256:createHash('sha256').update(source).digest('hex')});return [{rows:rows.length,dry_run:Boolean(f['dry-run']),property:p.code}];},Boolean(f['dry-run']));
 }
 throw Error(`Not implemented: ${cmd}`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){let db;try{db=await getDb();const rows=await run(db,process.argv.slice(2));if(process.argv.includes('--json'))console.log(JSON.stringify(rows,null,2));else if(rows[0]?.help)console.log(rows[0].help);else console.log(table(rows,Object.keys(rows[0]||{}).map(key=>({key,label:key.replace(/_cents$/, '').replace(/_bps$/, ' percent').replaceAll('_',' '),format:(v,row)=>v==null?'':key.endsWith('_cents')?`${row.currency||''} ${(Number(v)/100).toFixed(2)}`.trim():key.endsWith('_bps')?(Number(v)/100).toFixed(2):typeof v==='object'?JSON.stringify(v):String(v)}))));}catch(e){console.error(e.message);process.exitCode=1;}finally{if(db)await db.close();}}
