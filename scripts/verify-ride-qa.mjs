import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {
 cloudAcceptRide,cloudAdvanceRide,cloudCancelRideWithReason,cloudRequestRide,cloudRideCancellationDetails,
 cloudRideOperation,matchesRideOperation,
} from '../src/cloud-api.ts';

const {PGlite}=createRequire(import.meta.url)('@electric-sql/pglite');
const db=new PGlite();
const originalFetch=globalThis.fetch;
const passenger='cc100000-0000-4000-8000-000000000001';
const driver='cc100000-0000-4000-8000-000000000002';
const outsider='cc100000-0000-4000-8000-000000000003';
const draft={pickup:'Test pickup',destination:'Test destination',category:'classic',
 pickupPoint:{latitude:33.458,longitude:36.236},destinationPoint:{latitude:33.53,longitude:36.29}};
const file=name=>readFileSync(new URL('../backend/'+name+'.sql',import.meta.url),'utf8');
function routine(fileName,name){
 const sql=file(fileName);
 const start=sql.indexOf('function '+name+'(');
 assert.ok(start>=0,name);
 return sql.slice(sql.lastIndexOf('create ',start),sql.indexOf('$$;',start)+3);
}
async function role(owner,run){
 await db.exec('begin; set local role authenticated;');
 try{
  await db.query("select set_config('request.jwt.claims', $1, true)",[JSON.stringify({sub:owner,role:'authenticated'})]);
  const result=await run();
  await db.exec('commit;');
  return result;
 }catch(error){
  await db.exec('rollback;');
  throw error;
 }
}
async function verify(fileName){
 await db.exec('begin;');
 const result=await db.exec(file(fileName));
 await db.exec('rollback;');
 console.log(result.at(-1).rows[0].result);
}

try{
 await db.exec(`
 create role authenticated; create role anon; create role service_role;
 create schema auth; create schema private;
 grant usage on schema auth to authenticated;
 create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
 create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
 create table auth.users(id uuid primary key,email text,phone text,raw_app_meta_data jsonb);
 create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users on delete cascade,created_at timestamptz);
 create table private.admins(user_id uuid primary key references auth.users on delete cascade);
 create table public.driver_accounts(user_id uuid primary key references auth.users on delete cascade,
 region smallint,category text,approved boolean default false,online boolean default false,last_seen_at timestamptz,created_at timestamptz default now());
 create table public.rides(id uuid primary key default gen_random_uuid(),passenger_id uuid references auth.users on delete cascade,
 driver_id uuid references auth.users,pickup text,destination text,pickup_lat double precision,pickup_lng double precision,
 destination_lat double precision,destination_lng double precision,region smallint,category text,status text default 'requested',
 created_at timestamptz default now(),updated_at timestamptz default now(),pickup_confirmed_at timestamptz);
 alter table public.rides enable row level security;
 grant select on public.rides to authenticated;
 create policy ride_participants on public.rides for select to authenticated using ((select auth.uid()) in (driver_id,passenger_id));
 create table public.google_route_usage(scope text);
 create table public.admin_rule_revisions(id integer generated always as identity,sections jsonb,changed_section text,summary text);
 insert into public.admin_rule_revisions(sections) values('{"04_trip":{"body":"الراكب يستطيع إلغاء الطلب قبل بدء الرحلة. السائق يستطيع إعادته للبحث قبل بدء الرحلة."},"05_tracking":{"body":"Test tracking"}}');
 create publication supabase_realtime;
 -- The legacy booking entry inserts the baseline row; request IDs and quotes are handled by the real migrations below.
 create function public.request_ride(pickup text,destination text,a double precision,b double precision,c double precision,d double precision,region smallint,category text)
 returns table(ride_id uuid) language sql security definer set search_path='' as $$
  insert into public.rides(passenger_id,pickup,destination,pickup_lat,pickup_lng,destination_lat,destination_lng,region,category)
  values(auth.uid(),pickup,destination,a,b,c,d,region,category) returning id
 $$;
 create function public.open_ride_previews() returns table(ride_id uuid,region smallint,category text,created_at timestamptz,pickup_lat_approx numeric,pickup_lng_approx numeric)
 language sql as $$ select null::uuid,null::smallint,null::text,null::timestamptz,null::numeric,null::numeric where false $$;
 `);
 await db.exec(file('ride-request-recovery'));
 await db.exec(file('ride-fare-quote'));
 await db.exec(`
 create table ride_request_private.declined_offers(ride_id uuid,driver_id uuid);
 create table ride_request_private.dispatch_jobs(ride_id uuid,started_at timestamptz,matrix_state text,candidates jsonb);
 create table ride_request_private.driver_dispatch_positions(driver_id uuid,measured_at timestamptz,lat double precision,lng double precision);
 `);
 for(const [source,name] of [
  ['ride-dispatch','ride_request_private.dispatch_distance_km'],
  ['ride-dispatch-first-wave','ride_request_private.driver_can_receive'],
  ['ride-dispatch','public.accept_ride'],
 ])await db.exec(routine(source,name));
 await db.exec(file('ride-taxi-position'));
 await db.exec(file('ride-live-sharing'));
 await db.exec(routine('osmand-tracking-driver-start','public.advance_ride'));
 await db.exec(file('ride-cancellation-reasons'));
 await db.exec(file('ride-cancellation-details'));
 await db.exec(file('passenger-taxi-card'));
 await db.exec(file('play-account-profiles'));
 await verify('verify-play-account-profiles');
 await db.exec(file('play-vehicle-review'));
 await verify('verify-play-vehicle-review');

 await db.exec(file('driver-phone-accounts'));
 await verify('verify-driver-phone-accounts');

 await db.query('insert into auth.users(id) values($1),($2),($3)',[passenger,driver,outsider]);
 await db.query("insert into public.driver_accounts values($1,0,'classic',true,true,now(),now())",[driver]);

 // All HTTP traffic is redirected to the isolated SQL fixture. No network calls leave this process.
 let drop=null,offline=false,requests=0;
 globalThis.fetch=async(input,options)=>{
  if(offline)throw Error('simulated network outage');
  const owner=options.headers.Authorization.slice('Bearer '.length);
  assert.ok([driver,passenger,outsider].includes(owner));
  const {pathname,searchParams}=new URL(input);
  const rpc=pathname.split('/').at(-1);
  const body=options.body?JSON.parse(options.body):null;
  let data;
  if(options.method==='GET'){
   const filter=searchParams.has('client_request_id')?'client_request_id':'id';
   const side=searchParams.has('driver_id')?'driver_id':'passenger_id';
   data=await role(owner,async()=>(await db.query(
    `select * from public.rides where ${filter}=$1 and ${side}=$2`,
    [searchParams.get(filter).slice(3),searchParams.get(side).slice(3)]
   )).rows);
  }else if(rpc==='ride_cancellation_details'){
   data=await role(owner,async()=>(await db.query('select * from public.ride_cancellation_details($1::uuid[])',[body.p_ride_ids])).rows);
  }else{
   const signatures={
    request_ride_with_fare:['p_request_id','p_quote_id','p_pickup','p_destination','p_pickup_lat','p_pickup_lng','p_destination_lat','p_destination_lng','p_region','p_category'],
    accept_ride:['p_ride_id'],advance_ride:['p_ride_id','p_next','p_pin'],cancel_ride_with_reason:['p_ride_id','p_actor','p_reason'],
   };
   assert.ok(Object.hasOwn(signatures,rpc),rpc);
   if(rpc==='request_ride_with_fare')requests++;
   const names=signatures[rpc];
   const placeholders=names.map((name,index)=>'$'+(index+1)+(name==='p_region'?'::smallint':'')).join(',');
   data=await role(owner,async()=>(await db.query(
    `select public.${rpc}(${placeholders}) as value`,names.map(name=>body[name])
   )).rows[0].value).catch(error=>{console.error(rpc,error.message);throw error});

  }
  if(drop===rpc){drop=null;offline=true;throw Error('response lost after commit')}
  return new Response(JSON.stringify(data));
 };

 async function quote(){
  const {rows}=await db.query('select public.issue_ride_fare_quote($1,33.458,36.236,33.53,36.29,500) as id',[passenger]);
  return rows[0].id;
 }
 const requestId='cc200000-0000-4000-8000-000000000001';
 const quoteId=await quote();
 drop='request_ride_with_fare';
 await assert.rejects(()=>cloudRequestRide(passenger,draft,requestId,quoteId));
 assert.equal(drop,null,'the request must commit before the simulated outage');
 offline=false;
 const request=await cloudRideOperation(passenger,'request',requestId,passenger);
 assert.equal(request.status,'requested');
 assert.equal(await cloudRequestRide(passenger,draft,requestId,quoteId),request.id);
 assert.equal(requests,2);
 assert.equal((await db.query('select count(*)::int as count from public.rides')).rows[0].count,1);
 // The test account's region matches the production pickup classifier.
 await db.query('update public.driver_accounts set region=$1 where user_id=$2',[request.region,driver]);
 assert.equal(await cloudAcceptRide(driver,request.id),true);
 async function taxi(owner){
  return role(owner,async()=>(await db.query('select * from public.ride_taxi_positions where ride_id=$1',[request.id])).rows);
 }
 assert.equal(await role(driver,async()=>(await db.query('select public.share_taxi_position($1,33.48,36.25,now()) as ok',[request.id])).rows[0].ok),true);
 assert.equal((await taxi(passenger))[0].latitude,33.48);
 assert.deepEqual(await taxi(outsider),[]);
 assert.equal(await cloudAdvanceRide(passenger,request.id,'arrived'),'not_allowed');
 assert.equal(await cloudAdvanceRide(driver,request.id,'arrived'),'arrived');
 assert.equal(await cloudAdvanceRide(driver,request.id,'riding'),'riding');
 assert.equal(await cloudAdvanceRide(driver,request.id,'completed'),'completed');
 assert.deepEqual(await taxi(passenger),[]);

 const next=await cloudRequestRide(passenger,draft,'cc200000-0000-4000-8000-000000000002',await quote());
 assert.equal(await cloudAcceptRide(driver,next),true);
 drop='cancel_ride_with_reason';
 await assert.rejects(()=>cloudCancelRideWithReason(driver,next,driver,'driver','vehicle_problem'));
 assert.equal(drop,null,'the cancellation must commit before the simulated outage');
 offline=false;
 assert.ok(matchesRideOperation('driver-cancel',driver,await cloudRideOperation(driver,'driver-cancel',next,driver)));
 const record={ride_id:next,actor:'driver',reason:'vehicle_problem'};
 assert.deepEqual(await cloudRideCancellationDetails(passenger,[next]),[record]);
 assert.deepEqual(await cloudRideCancellationDetails(driver,[next]),[record]);
 assert.deepEqual(await cloudRideCancellationDetails(outsider,[next]),[]);
 assert.equal(await cloudCancelRideWithReason(driver,next,driver,'driver','vehicle_problem'),true);
 const third=await cloudRequestRide(passenger,draft,'cc200000-0000-4000-8000-000000000003',await quote());
 assert.equal(await cloudAcceptRide(driver,third),true);
 assert.equal(await cloudCancelRideWithReason(passenger,third,passenger,'passenger','changed_plans'),true);
 assert.deepEqual(await cloudRideCancellationDetails(driver,[third]),[{ride_id:third,actor:'passenger',reason:'changed_plans'}]);
 console.log('Isolated ride QA passed: booking retry, driver acceptance, participant-only tracking, ride completion, cancellation recovery and reasons.');
}finally{
 globalThis.fetch=originalFetch;
 await db.close();
}
