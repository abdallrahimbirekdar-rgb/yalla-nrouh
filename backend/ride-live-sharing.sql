-- Ride-scoped credentials are used by Android without giving the service an account token.
create table ride_tracking_private.live_leases (
 ride_id uuid not null references public.rides(id) on delete cascade,
 role text not null check (role in ('driver','passenger')),
 owner_id uuid not null,
 secret uuid not null unique default gen_random_uuid(),
 expires_at timestamptz not null,
 primary key (ride_id, role)
);
alter table ride_tracking_private.live_leases enable row level security;

create table public.ride_passenger_positions (
 ride_id uuid primary key references public.rides(id) on delete cascade,
 latitude double precision not null check (latitude between -90 and 90),
 longitude double precision not null check (longitude between -180 and 180),
 measured_at timestamptz not null
);
create table public.ride_pickup_changes (
 ride_id uuid primary key references public.rides(id) on delete cascade,
 proposal_id uuid not null,
 latitude double precision not null check (latitude between -90 and 90),
 longitude double precision not null check (longitude between -180 and 180),
 approved boolean not null default false
);
alter table public.ride_passenger_positions enable row level security;
alter table public.ride_pickup_changes enable row level security;
revoke all on public.ride_passenger_positions,public.ride_pickup_changes from public,anon,authenticated;
grant select on public.ride_passenger_positions,public.ride_pickup_changes to authenticated;
create policy driver_reads_waiting_passenger on public.ride_passenger_positions for select to authenticated using (
 exists (select 1 from public.rides r where r.id=ride_id and r.driver_id=(select auth.uid())
  and r.status in ('accepted','arrived') and r.pickup_confirmed_at is null)
);
create policy parties_read_pickup_change on public.ride_pickup_changes for select to authenticated using (
 exists (select 1 from public.rides r where r.id=ride_id and r.status in ('accepted','arrived','riding')
  and (select auth.uid()) in (r.driver_id,r.passenger_id))
);
alter publication supabase_realtime add table public.ride_passenger_positions, public.ride_pickup_changes;

create function ride_tracking_private.live_allowed(r public.rides,p_role text,p_owner uuid)
returns boolean language sql stable set search_path='' as $$
 select coalesce(case p_role
  when 'driver' then r.driver_id=p_owner and r.status in ('accepted','arrived','riding')
  when 'passenger' then r.passenger_id=p_owner and r.status in ('requested','accepted','arrived') and r.pickup_confirmed_at is null
 end,false);
$$;
create function ride_tracking_private.start_live_share(p_ride uuid,p_role text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.rides; result uuid;
begin
 select * into r from public.rides where id=p_ride for update;
 if not found or not ride_tracking_private.live_allowed(r,p_role,auth.uid()) then return null; end if;
 insert into ride_tracking_private.live_leases(ride_id,role,owner_id,expires_at)
 values(p_ride,p_role,auth.uid(),now()+interval '3 minutes')
 on conflict(ride_id,role) do update set owner_id=excluded.owner_id,secret=gen_random_uuid(),expires_at=excluded.expires_at
 returning secret into result;
 return result;
end;
$$;
create function ride_tracking_private.live_update(p_secret uuid,p_lat double precision,p_lng double precision,p_time timestamptz,p_stop boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare l ride_tracking_private.live_leases; r public.rides;
begin
 select * into l from ride_tracking_private.live_leases where secret=p_secret;
 if not found then return false; end if;
 select * into r from public.rides where id=l.ride_id for share;
 if not found then return false; end if;
 select * into l from ride_tracking_private.live_leases where secret=p_secret for update;
 if not found then return false; end if;
 if p_stop or l.expires_at<now() or not ride_tracking_private.live_allowed(r,l.role,l.owner_id) then
  delete from ride_tracking_private.live_leases where secret=p_secret;
  if l.role='driver' then delete from public.ride_taxi_positions where ride_id=l.ride_id;
  else delete from public.ride_passenger_positions where ride_id=l.ride_id; end if;
  return false;
 end if;
 update ride_tracking_private.live_leases set expires_at=now()+interval '3 minutes' where secret=p_secret and expires_at<now()+interval '2 minutes';
 if p_time is null or p_time not between now()-interval '25 seconds' and now()+interval '5 seconds'
  or p_lat is null or p_lng is null or not (p_lat between -90 and 90 and p_lng between -180 and 180) then return true; end if;
 if l.role='driver' then
  insert into public.ride_taxi_positions as x values(l.ride_id,p_lat,p_lng,p_time)
  on conflict(ride_id) do update set latitude=p_lat,longitude=p_lng,measured_at=p_time
  where p_time>=x.measured_at+interval '3 seconds';
 else
  insert into public.ride_passenger_positions as x values(l.ride_id,p_lat,p_lng,p_time)
  on conflict(ride_id) do update set latitude=p_lat,longitude=p_lng,measured_at=p_time
  where p_time>=x.measured_at+interval '3 seconds';
 end if;
 return true;
end;
$$;

create or replace function ride_tracking_private.share_taxi_position(
 p_ride_id uuid, p_latitude double precision, p_longitude double precision, p_measured_at timestamptz
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if (select auth.uid()) is null or p_measured_at is null
    or p_measured_at < now() - interval '30 seconds'
    or p_measured_at > now() + interval '5 seconds' then
  return false;
 end if;

 -- Serialize sharing with arrival, release and cancellation.
 perform 1 from public.rides r
 where r.id = p_ride_id and r.status = 'accepted' and r.driver_id = (select auth.uid())
 for share;
 if not found then return false; end if;
 if exists (select 1 from ride_tracking_private.live_leases where ride_id=p_ride_id and role='driver' and expires_at>now()) then
  return false;
 end if;

 insert into public.ride_taxi_positions as position (ride_id, latitude, longitude, measured_at)
 values (p_ride_id, p_latitude, p_longitude, p_measured_at)
 on conflict (ride_id) do update
 set latitude = excluded.latitude, longitude = excluded.longitude, measured_at = excluded.measured_at
 where excluded.measured_at >= position.measured_at + interval '3 seconds';
 return true;
end;
$$;

create function ride_tracking_private.change_pickup(p_ride uuid,p_proposal uuid,p_lat double precision,p_lng double precision)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.rides;
begin
 select * into r from public.rides where id=p_ride for update;
 if not found or r.status<>'accepted' then return false; end if;
 if p_proposal is null and r.passenger_id=auth.uid() and p_lat between -90 and 90 and p_lng between -180 and 180 then
  insert into public.ride_pickup_changes values(p_ride,gen_random_uuid(),p_lat,p_lng,false)
  on conflict(ride_id) do update set proposal_id=excluded.proposal_id,latitude=excluded.latitude,longitude=excluded.longitude
  where not ride_pickup_changes.approved;
  return found;
 elsif p_proposal is not null and r.driver_id=auth.uid() then
  update public.ride_pickup_changes set approved=true where ride_id=p_ride and proposal_id=p_proposal and not approved;
  return found;
 end if;
 return false;
end;
$$;

create function ride_tracking_private.end_live_share() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('completed','cancelled') or (old.driver_id is not null and new.driver_id is distinct from old.driver_id) then
  delete from ride_tracking_private.live_leases where ride_id=new.id;
  delete from public.ride_taxi_positions where ride_id=new.id;
  delete from public.ride_passenger_positions where ride_id=new.id;
  delete from public.ride_pickup_changes where ride_id=new.id;
 elsif new.pickup_confirmed_at is not null or new.status='riding' then
  delete from ride_tracking_private.live_leases where ride_id=new.id and role='passenger';
  delete from public.ride_passenger_positions where ride_id=new.id;
 end if;
 return new;
end;
$$;
create trigger stop_live_sharing_after_ride_change after update of status,driver_id,pickup_confirmed_at on public.rides
 for each row execute function ride_tracking_private.end_live_share();

create function public.start_live_share(p_ride uuid,p_role text) returns uuid
language sql set search_path='' as $$ select ride_tracking_private.start_live_share(p_ride,p_role); $$;
create function public.live_update(p_secret uuid,p_lat double precision,p_lng double precision,p_time timestamptz,p_stop boolean) returns boolean
language sql security definer set search_path='' as $$ select ride_tracking_private.live_update(p_secret,p_lat,p_lng,p_time,p_stop); $$;
create function public.change_pickup(p_ride uuid,p_proposal uuid,p_lat double precision,p_lng double precision) returns boolean
language sql set search_path='' as $$ select ride_tracking_private.change_pickup(p_ride,p_proposal,p_lat,p_lng); $$;
revoke all on function ride_tracking_private.live_allowed(public.rides,text,uuid),ride_tracking_private.end_live_share(),
 ride_tracking_private.start_live_share(uuid,text),public.start_live_share(uuid,text),
 ride_tracking_private.live_update(uuid,double precision,double precision,timestamptz,boolean),public.live_update(uuid,double precision,double precision,timestamptz,boolean),
 ride_tracking_private.change_pickup(uuid,uuid,double precision,double precision),public.change_pickup(uuid,uuid,double precision,double precision)
 from public,anon,authenticated;
grant execute on function ride_tracking_private.start_live_share(uuid,text),public.start_live_share(uuid,text),
 ride_tracking_private.change_pickup(uuid,uuid,double precision,double precision),public.change_pickup(uuid,uuid,double precision,double precision) to authenticated;
grant execute on function public.live_update(uuid,double precision,double precision,timestamptz,boolean) to anon,authenticated;

-- Preserve the latest owner edits in the published guide.
select pg_advisory_xact_lock(1744899272);
insert into public.admin_rule_revisions(sections,changed_section,summary)
 select jsonb_set(sections,'{05_tracking,body}',to_jsonb((sections->'05_tracking'->>'body')||
 E'\nفي إصدار أندرويد الداعم يستطيع الطرفان تشغيل مشاركة الموقع بموافقة صريحة. يظهر إشعار إيقاف أثناء المشاركة. تستمر مشاركة السائق في الخلفية حتى انتهاء الرحلة، وتتوقف مشاركة الراكب عند تأكيد الركوب أو إلغاء الطلب. تعديل نقطة الالتقاء يتطلب اقتراح الراكب وموافقة السائق، وتظل النقطة الأصلية والأجرة المسجلة محفوظتين. التقسيم يعتمد على الجهاز.')),
 '05_tracking','إضافة مشاركة الموقع أثناء الرحلة واقتراح نقطة لقاء وتقسيم الشاشة' from public.admin_rule_revisions order by id desc limit 1;
