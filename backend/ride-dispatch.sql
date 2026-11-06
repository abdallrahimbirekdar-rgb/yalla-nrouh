begin;

create extension if not exists pg_net with schema extensions;

create table ride_request_private.driver_dispatch_positions (
 driver_id uuid primary key references public.driver_accounts(user_id) on delete cascade,
 lat double precision not null check (lat between -90 and 90),
 lng double precision not null check (lng between -180 and 180),
 measured_at timestamptz not null
);
create table ride_request_private.dispatch_jobs (
 ride_id uuid primary key references public.rides(id) on delete cascade,
 generation uuid not null unique default gen_random_uuid(),
 started_at timestamptz not null,
 matrix_state text not null default 'queued' check(matrix_state in ('queued','running','ranked','fallback','no_candidates')),
 candidates jsonb not null default '[]',
 first_offer_at timestamptz,
 accepted_at timestamptz
);
create table ride_request_private.driver_push_devices (
 token text primary key check(length(token) between 40 and 4096),
 driver_id uuid not null references public.driver_accounts(user_id) on delete cascade,
 refreshed_at timestamptz not null default now()
);
create index driver_push_devices_owner_idx on ride_request_private.driver_push_devices(driver_id);
create table ride_request_private.dispatch_push_attempts (
 generation uuid not null references ride_request_private.dispatch_jobs(generation) on delete cascade,
 token text not null references ride_request_private.driver_push_devices(token) on delete cascade,
 primary key(generation,token)
);
create table ride_request_private.route_problems (
 actor uuid not null references auth.users(id) on delete cascade,
 minute timestamptz not null,
 code text not null check(code in ('network','no_route','not_enabled','not_configured','busy','other')),
 primary key(actor,minute)
);
create index route_problems_minute_idx on ride_request_private.route_problems(minute);
alter table ride_request_private.driver_dispatch_positions enable row level security;
alter table ride_request_private.dispatch_jobs enable row level security;
alter table ride_request_private.driver_push_devices enable row level security;
alter table ride_request_private.dispatch_push_attempts enable row level security;
alter table ride_request_private.route_problems enable row level security;
revoke all on ride_request_private.driver_dispatch_positions,ride_request_private.dispatch_jobs,ride_request_private.driver_push_devices,ride_request_private.dispatch_push_attempts,ride_request_private.route_problems from public,anon,authenticated;

create function ride_request_private.dispatch_distance_km(a double precision,b double precision,c double precision,d double precision)
returns double precision language sql immutable strict set search_path='' as $$
 select 12742*asin(sqrt(least(1,power(sin(radians(c-a)/2),2)+cos(radians(a))*cos(radians(c))*power(sin(radians(d-b)/2),2))));
$$;

create function ride_request_private.driver_dispatch_ping(p_lat double precision,p_lng double precision,p_measured_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare who uuid := (select auth.uid());
begin
 if p_lat is null or p_lng is null or p_measured_at is null
    or not (p_lat between -90 and 90 and p_lng between -180 and 180)
    or p_measured_at not between now()-interval '60 seconds' and now()+interval '5 seconds'
    or not exists(select 1 from public.driver_accounts where user_id=who and approved and online) then return false; end if;
 insert into ride_request_private.driver_dispatch_positions as pos(driver_id,lat,lng,measured_at)
 values(who,p_lat,p_lng,p_measured_at)
 on conflict(driver_id) do update set lat=excluded.lat,lng=excluded.lng,measured_at=excluded.measured_at
 where pos.measured_at<excluded.measured_at-interval '10 seconds';
 return true;
end;
$$;
create function public.driver_dispatch_ping(p_lat double precision,p_lng double precision,p_measured_at timestamptz)
returns boolean language sql set search_path='' as $$
 select ride_request_private.driver_dispatch_ping(p_lat,p_lng,p_measured_at);
$$;

create function ride_request_private.register_driver_push(p_token text)
returns boolean language plpgsql security definer set search_path='' as $$
declare who uuid := (select auth.uid());
begin
 if p_token is null or length(p_token) not between 40 and 4096 or p_token !~ '^[[:alnum:]:_-]+$'
    or not exists(select 1 from public.driver_accounts where user_id=who and approved) then return false; end if;
 insert into ride_request_private.driver_push_devices(token,driver_id)
 values(p_token,who) on conflict(token) do update set driver_id=excluded.driver_id,refreshed_at=now();
 return true;
end;
$$;
create function public.register_driver_push(p_token text)
returns boolean language sql set search_path='' as $$
 select ride_request_private.register_driver_push(p_token);
$$;
create function ride_request_private.remove_driver_push(p_token text)
returns void language sql security definer set search_path='' as $$
 delete from ride_request_private.driver_push_devices where token=p_token and driver_id=(select auth.uid());
$$;
create function public.remove_driver_push(p_token text)
returns void language sql set search_path='' as $$
 select ride_request_private.remove_driver_push(p_token);
$$;

create function ride_request_private.start_dispatch()
returns trigger language plpgsql security definer set search_path='' as $$
declare job uuid;
begin
 if new.status='requested' then
  if tg_op='UPDATE' then
   if old.status='requested' then return new; end if;
  end if;
  delete from ride_request_private.dispatch_jobs where ride_id=new.id;
  insert into ride_request_private.dispatch_jobs(ride_id,started_at) values(new.id,new.updated_at)
  returning generation into job;
  -- The private, random per-search generation is the worker capability.
  -- Queue delivery after commit. GPS radius dispatch can proceed independently.
  begin
   perform net.http_post(
    url:='https://gokosprcqpdvqgahvquk.supabase.co/functions/v1/ride-dispatch',
    body:=jsonb_build_object('generation',job),timeout_milliseconds:=15000);
  exception when others then
   update ride_request_private.dispatch_jobs set matrix_state='fallback' where generation=job;
  end;
 elsif new.status='accepted' then
  update ride_request_private.dispatch_jobs set accepted_at=clock_timestamp()
  where ride_id=new.id and accepted_at is null;
 end if;
 return new;
end;
$$;
create trigger yalla_dispatch_started after insert or update of status on public.rides
 for each row when (new.status in ('requested','accepted'))
 execute function ride_request_private.start_dispatch();

create function ride_request_private.driver_can_receive(r public.rides,d public.driver_accounts)
returns boolean language sql stable set search_path='' as $$
 select d.approved and d.online and d.category=r.category and d.user_id<>r.passenger_id
 and d.last_seen_at>statement_timestamp()-interval '5 minutes'
 and r.status='requested' and r.driver_id is null
 and r.updated_at>statement_timestamp()-interval '3 minutes'
 and not exists(select 1 from public.rides active where active.driver_id=d.user_id and active.status in ('accepted','arrived','riding'))
 and not exists(select 1 from ride_request_private.declined_offers x where x.driver_id=d.user_id and x.ride_id=r.id)
 and coalesce((
  select case
   when p.measured_at is null then d.region=r.region and age.seconds>=15
   when age.seconds<8 then false
   when age.seconds<25 then case when j.matrix_state='ranked' then coalesce(rank.place<=3,false) else km.distance<=3 end
   when age.seconds<50 then case when j.matrix_state='ranked' then coalesce(rank.place<=8,false) else km.distance<=8 end
   else km.distance<=15
  end
  from ride_request_private.dispatch_jobs j
  left join ride_request_private.driver_dispatch_positions p on p.driver_id=d.user_id and p.measured_at>statement_timestamp()-interval '5 minutes'
  cross join lateral (select extract(epoch from statement_timestamp()-j.started_at) as seconds) age
  cross join lateral (select ride_request_private.dispatch_distance_km(p.lat,p.lng,r.pickup_lat,r.pickup_lng) as distance) km
  left join lateral (select ord as place from jsonb_array_elements_text(j.candidates) with ordinality x(id,ord) where x.id=d.user_id::text) rank on true
  where j.ride_id=r.id
 ),d.region=r.region);
$$;

create or replace function public.open_ride_previews()
returns table(ride_id uuid,region smallint,category text,created_at timestamptz,pickup_lat_approx numeric,pickup_lng_approx numeric)
language plpgsql security definer set search_path='' as $$
declare who uuid := (select auth.uid());
begin
 if who is null then raise exception 'login_required'; end if;
 update public.driver_accounts set last_seen_at=now() where user_id=who and approved and online;
 if not found then return; end if;
 return query
 with offers as materialized (
  select r.id,r.region,r.category,r.created_at,r.pickup_lat,r.pickup_lng
  from public.rides r join public.driver_accounts d on d.user_id=who
  where r.status='requested' and r.updated_at>statement_timestamp()-interval '3 minutes'
    and ride_request_private.driver_can_receive(r,d)
  order by r.created_at limit 20
 ), offered as (
  update ride_request_private.dispatch_jobs j set first_offer_at=clock_timestamp()
  from offers o where j.ride_id=o.id and j.first_offer_at is null returning j.ride_id
 )
 select o.id,o.region,o.category,o.created_at,round(o.pickup_lat::numeric,2),round(o.pickup_lng::numeric,2) from offers o;
end;
$$;

create or replace function public.driver_ride_preview(p_ride_id uuid)
returns table(ride_id uuid,pickup_lat double precision,pickup_lng double precision,destination_lat double precision,destination_lng double precision)
language plpgsql security definer set search_path='' as $$
declare who uuid := (select auth.uid());
begin
 if who is null then raise exception 'login_required'; end if;
 return query select r.id,r.pickup_lat,r.pickup_lng,r.destination_lat,r.destination_lng
 from public.rides r join public.driver_accounts d on d.user_id=who
 where r.id=p_ride_id and ride_request_private.driver_can_receive(r,d);
end;
$$;

create or replace function public.accept_ride(p_ride_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare who uuid := (select auth.uid());
begin
 if who is null then raise exception 'login_required'; end if;
 -- Serialize acceptance per driver; row locking and the expiry trigger protect each ride.
 perform 1 from public.driver_accounts where user_id=who for update;
 update public.rides r set driver_id=who,status='accepted',updated_at=now()
 where r.id=p_ride_id and r.status='requested' and r.driver_id is null
 and exists(select 1 from public.driver_accounts d where d.user_id=who and ride_request_private.driver_can_receive(r,d));
 return found;
end;
$$;

create function public.claim_ride_dispatch(p_generation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ride public.rides%rowtype; items jsonb;
begin
 update ride_request_private.dispatch_jobs j set matrix_state='running'
 from public.rides r where j.generation=p_generation and r.id=j.ride_id and r.status='requested'
 and j.matrix_state='queued' and j.started_at>now()-interval '3 minutes'
 returning r.* into ride;
 if not found then return null; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.user_id,'latitude',c.lat,'longitude',c.lng) order by c.km),'[]')
 into items from (
  select d.user_id,p.lat,p.lng,ride_request_private.dispatch_distance_km(p.lat,p.lng,ride.pickup_lat,ride.pickup_lng) km
  from public.driver_accounts d join ride_request_private.driver_dispatch_positions p on p.driver_id=d.user_id
  where d.approved and d.online and d.category=ride.category and d.user_id<>ride.passenger_id
   and p.measured_at>now()-interval '5 minutes' and d.last_seen_at>now()-interval '5 minutes'
   and not exists(select 1 from public.rides a where a.driver_id=d.user_id and a.status in ('accepted','arrived','riding'))
   and not exists(select 1 from ride_request_private.declined_offers x where x.driver_id=d.user_id and x.ride_id=ride.id)
   and ride_request_private.dispatch_distance_km(p.lat,p.lng,ride.pickup_lat,ride.pickup_lng)<=15
  order by km limit 8
 ) c;
 return jsonb_build_object('pickup',jsonb_build_object('latitude',ride.pickup_lat,'longitude',ride.pickup_lng),'candidates',items);
end;
$$;
create function public.finish_ride_dispatch(p_generation uuid,p_state text,p_candidates uuid[])
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_state not in ('ranked','fallback','no_candidates') or cardinality(p_candidates)>8 then return false; end if;
 update ride_request_private.dispatch_jobs set
  matrix_state=case when p_state='ranked' and started_at<clock_timestamp()-interval '8 seconds' then 'fallback' else p_state end,
  candidates=case when p_state='ranked' and started_at>=clock_timestamp()-interval '8 seconds' then to_jsonb(p_candidates) else '[]' end
 where generation=p_generation and matrix_state='running';
 return found;
end;
$$;
create function public.claim_ride_push(p_generation uuid)
returns table(ride_id uuid,token text,remaining_seconds integer)
language sql security definer set search_path='' as $$
 with eligible as materialized (
  select j.generation,r.id,p.token,greatest(0,ceil(extract(epoch from r.updated_at+interval '3 minutes'-statement_timestamp())))::integer ttl
  from ride_request_private.dispatch_jobs j join public.rides r on r.id=j.ride_id
  join public.driver_accounts d on d.category=r.category
  join ride_request_private.driver_push_devices p on p.driver_id=d.user_id and p.refreshed_at>now()-interval '30 days'
  where j.generation=p_generation and ride_request_private.driver_can_receive(r,d)
    and not exists(select 1 from ride_request_private.dispatch_push_attempts sent where sent.generation=j.generation and sent.token=p.token)
  order by p.refreshed_at desc limit 20
 ), inserted as (
  insert into ride_request_private.dispatch_push_attempts(generation,token)
  select e.generation,e.token from eligible e on conflict do nothing returning token
 )
 select e.id,e.token,e.ttl from eligible e join inserted i on i.token=e.token;
$$;

create function ride_request_private.report_route_problem(p_code text)
returns void language sql security definer set search_path='' as $$
 insert into ride_request_private.route_problems(actor,minute,code)
 select auth.uid(),date_trunc('minute',now()),p_code
 where auth.uid() is not null and p_code in ('network','no_route','not_enabled','not_configured','busy','other')
 on conflict do nothing;
$$;
create function public.report_route_problem(p_code text)
returns void language sql set search_path='' as $$ select ride_request_private.report_route_problem(p_code); $$;
create function ride_request_private.admin_dispatch_overview()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_staff_admin() then raise insufficient_privilege; end if;
 return jsonb_build_object(
  'route_errors_24h',(select count(*) from ride_request_private.route_problems where minute>=now()-interval '24 hours'),
  'rides',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (
   select x.id,x.status,x.category,x.created_at,x.search_expired_at,j.started_at,j.matrix_state,j.first_offer_at,j.accepted_at
   from public.rides x left join ride_request_private.dispatch_jobs j on j.ride_id=x.id order by x.created_at desc limit 40
  ) r),'[]'));
end;
$$;
create function public.admin_dispatch_overview()
returns jsonb language sql stable set search_path='' as $$ select ride_request_private.admin_dispatch_overview(); $$;

revoke all on function ride_request_private.start_dispatch(),ride_request_private.driver_can_receive(public.rides,public.driver_accounts),ride_request_private.dispatch_distance_km(double precision,double precision,double precision,double precision) from public,anon,authenticated;
revoke all on function public.claim_ride_dispatch(uuid),public.finish_ride_dispatch(uuid,text,uuid[]),public.claim_ride_push(uuid) from public,anon,authenticated;
grant execute on function public.claim_ride_dispatch(uuid),public.finish_ride_dispatch(uuid,text,uuid[]),public.claim_ride_push(uuid) to service_role;
revoke all on function ride_request_private.driver_dispatch_ping(double precision,double precision,timestamptz),public.driver_dispatch_ping(double precision,double precision,timestamptz),ride_request_private.register_driver_push(text),public.register_driver_push(text),ride_request_private.report_route_problem(text),public.report_route_problem(text),ride_request_private.admin_dispatch_overview(),public.admin_dispatch_overview() from public,anon,authenticated;
grant execute on function ride_request_private.driver_dispatch_ping(double precision,double precision,timestamptz),public.driver_dispatch_ping(double precision,double precision,timestamptz),ride_request_private.register_driver_push(text),public.register_driver_push(text),ride_request_private.report_route_problem(text),public.report_route_problem(text),ride_request_private.admin_dispatch_overview(),public.admin_dispatch_overview() to authenticated;
revoke all on function ride_request_private.remove_driver_push(text),public.remove_driver_push(text) from public,anon,authenticated;
grant execute on function ride_request_private.remove_driver_push(text),public.remove_driver_push(text) to authenticated;

do $guide$
declare current_doc jsonb;
begin
 if to_regclass('public.admin_rule_revisions') is null then return; end if;
 perform pg_catalog.pg_advisory_xact_lock(1744899272);
 select sections into current_doc from public.admin_rule_revisions order by id desc limit 1;
 if current_doc is null then return; end if;
 current_doc:=jsonb_set(current_doc,'{03_offers,body}',to_jsonb(replace(
  current_doc #>> '{03_offers,body}',
  'يرى الطلبَ السائقُ المعتمد الذي فعّل الاستقبال ويطابق منطقة الطلب وفئة السيارة. الطلبات بانتظار سائق تظهر بالأقدم أولًا، من دون ترتيب حسب الأقرب.',
  'يرى الطلب السائق المعتمد والمتاح من فئة السيارة المطلوبة. تُرتب حتى ثمانية مواقع حديثة قريبة بحسب زمن القيادة عندما تتوفر النتيجة بسرعة، ويبدأ العرض بأقرب ثلاثة. يتوسع العرض تدريجيًا حتى ١٥ كم ويمكنه عبور حدود المحافظة. عند تعذر حساب زمن الطريق يُستخدم القرب الجغرافي لتوسيع البحث. للسائق الذي لا يملك قراءة موقع حديثة، تبقى المطابقة بحسب منطقة العمل بعد مهلة قصيرة.'
 )));
 current_doc:=jsonb_set(current_doc,'{07_connection,body}',to_jsonb(
  (current_doc #>> '{07_connection,body}') || E'\nتظهر متابعة الطلب المعلق من الصفحة الرئيسية عند إعادة فتح التطبيق. تبقى آخر خريطة مسار محمّلة أثناء انقطاع الاتصال في شاشة الملاحة، ويظهر وقت آخر قراءة للموقع.'
 ));
 insert into public.admin_rule_revisions(sections,changed_section,summary)
 values(current_doc,'03_offers','توزيع متدرج للطلبات حسب زمن الوصول ومتابعة الرحلة بعد انقطاع الاتصال.');
end;
$guide$;

commit;
