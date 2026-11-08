begin;

-- driver_accounts and driver_vehicle_photos hold the passenger-visible snapshot.
create table ride_request_private.vehicle_submissions (
 driver_id uuid primary key references public.driver_accounts(user_id) on delete cascade,
 revision uuid not null default gen_random_uuid(),
 status text not null default 'pending' check (status in ('pending','changes_requested','rejected')),
 reason text,
 display_name text,
 vehicle_model text,
 vehicle_color text,
 vehicle_plate text,
 jpeg bytea check (octet_length(jpeg) between 4 and 180000
  and substring(jpeg from 1 for 3)=decode('ffd8ff','hex')
  and substring(jpeg from octet_length(jpeg)-1)=decode('ffd9','hex'))
);
alter table ride_request_private.vehicle_submissions enable row level security;
revoke all on ride_request_private.vehicle_submissions from public,anon,authenticated;

create or replace function ride_request_private.save_vehicle_profile(p_name text,p_color text,p_plate text,p_model text,p_change_photo boolean,p_photo text)
returns boolean language plpgsql security definer set search_path='' as $$
declare
 who uuid := (select auth.uid());
 photo_bytes bytea;
begin
 if who is null or length(p_photo)>240000 or length(p_name)>80 or length(p_color)>40
  or length(p_plate)>24 or length(p_model)>80 then return false; end if;
 perform 1 from public.driver_accounts where user_id=who for update;
 if not found then return false; end if;
 if p_change_photo then
  photo_bytes:=decode(p_photo,'base64');
 else
  select jpeg into photo_bytes from ride_request_private.vehicle_submissions where driver_id=who;
  if not found then
   select jpeg into photo_bytes from ride_request_private.driver_vehicle_photos where driver_id=who;
  end if;
 end if;
 insert into ride_request_private.vehicle_submissions as s
  (driver_id,display_name,vehicle_model,vehicle_color,vehicle_plate,jpeg)
 values(who,nullif(btrim(p_name),''),nullif(btrim(p_model),''),nullif(btrim(p_color),''),nullif(btrim(p_plate),''),photo_bytes)
 on conflict(driver_id) do update set
  revision=gen_random_uuid(),status='pending',reason=null,display_name=excluded.display_name,
  vehicle_model=excluded.vehicle_model,vehicle_color=excluded.vehicle_color,
  vehicle_plate=excluded.vehicle_plate,jpeg=excluded.jpeg;
 return true;
end;
$$;

create function ride_request_private.vehicle_review_details(p_driver_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare who uuid := (select auth.uid());
begin
 if who is null or (p_driver_id is not null and not exists(select 1 from private.admins where user_id=who)) then
  raise insufficient_privilege;
 end if;
 return (
  select jsonb_build_object(
   'display_name',case when s.driver_id is null then d.display_name else s.display_name end,
   'vehicle_model',case when s.driver_id is null then d.vehicle_model else s.vehicle_model end,
   'vehicle_color',case when s.driver_id is null then d.vehicle_color else s.vehicle_color end,
   'vehicle_plate',case when s.driver_id is null then d.vehicle_plate else s.vehicle_plate end,
   'photo',replace(encode(case when s.driver_id is null then p.jpeg else s.jpeg end,'base64'),chr(10),''),
   'revision',s.revision,'status',coalesce(s.status,case when d.approved then 'approved' else 'unsubmitted' end),
   'reason',s.reason,'approved',d.approved
  )
  from public.driver_accounts d
  left join ride_request_private.vehicle_submissions s on s.driver_id=d.user_id
  left join ride_request_private.driver_vehicle_photos p on p.driver_id=d.user_id
  where d.user_id=coalesce(p_driver_id,who)
 );
end;
$$;

-- Older clients cannot publish unreviewed fields via the former write endpoint.
create or replace function public.save_driver_vehicle_details(p_name text,p_color text,p_plate text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare profile jsonb;
begin
 profile:=ride_request_private.vehicle_review_details(null);
 return ride_request_private.save_vehicle_profile(p_name,p_color,p_plate,profile->>'vehicle_model',false,null);
end;
$$;

create function ride_request_private.review_vehicle_submission(p_driver_id uuid,p_revision uuid,p_decision text,p_reason text)
returns text language plpgsql security definer set search_path='' as $$
declare submission ride_request_private.vehicle_submissions%rowtype;
begin
 if not exists(select 1 from private.admins where user_id=(select auth.uid())) then raise insufficient_privilege; end if;
 if p_decision is null or p_decision not in ('approve','changes_requested','rejected')
  or length(p_reason)>300 or (p_decision<>'approve' and nullif(btrim(p_reason),'') is null) then
  return 'invalid';
 end if;
 perform 1 from public.driver_accounts where user_id=p_driver_id for update;
 select * into submission from ride_request_private.vehicle_submissions where driver_id=p_driver_id;
 if not found or submission.revision is distinct from p_revision or submission.status<>'pending' then return 'stale'; end if;
 if p_decision<>'approve' then
  update ride_request_private.vehicle_submissions set status=p_decision,reason=btrim(p_reason) where driver_id=p_driver_id;
  return 'saved';
 end if;
 if submission.display_name is null or submission.vehicle_model is null
  or submission.vehicle_color is null or submission.vehicle_plate is null then return 'incomplete'; end if;
 if exists(select 1 from public.rides where driver_id=p_driver_id and status in ('accepted','arrived','riding')) then
  return 'active_ride';
 end if;
 update public.driver_accounts set approved=true,display_name=submission.display_name,vehicle_model=submission.vehicle_model,
  vehicle_color=submission.vehicle_color,vehicle_plate=submission.vehicle_plate
 where user_id=p_driver_id;
 if submission.jpeg is null then
  delete from ride_request_private.driver_vehicle_photos where driver_id=p_driver_id;
 else
  insert into ride_request_private.driver_vehicle_photos values(p_driver_id,submission.jpeg)
  on conflict(driver_id) do update set jpeg=excluded.jpeg;
 end if;
 delete from ride_request_private.vehicle_submissions where driver_id=p_driver_id;
 return 'saved';
end;
$$;

create function public.vehicle_review_details(p_driver_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select ride_request_private.vehicle_review_details(p_driver_id);
$$;

create function public.review_vehicle_submission(p_driver_id uuid,p_revision uuid,p_decision text,p_reason text)
returns text language sql security invoker set search_path='' as $$
 select ride_request_private.review_vehicle_submission(p_driver_id,p_revision,p_decision,p_reason);
$$;

-- Keep the existing suspension action and require the reviewed revision for approval.
create or replace function public.admin_review_driver(p_driver_id uuid,p_approved boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.admins where user_id=(select auth.uid())) then raise insufficient_privilege; end if;
 if p_approved is distinct from false then return false; end if;
 update public.driver_accounts set approved=false,online=false,last_seen_at=null where user_id=p_driver_id;
 return found;
end;
$$;

create or replace function public.admin_pending_drivers()
returns table(user_id uuid,region smallint,category text,approved boolean,online boolean,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.admins where user_id=(select auth.uid())) then raise insufficient_privilege; end if;
 return query
 select d.user_id,d.region,d.category,d.approved,d.online,d.created_at
 from public.driver_accounts d left join ride_request_private.vehicle_submissions s on s.driver_id=d.user_id
 order by (s.status='pending') desc nulls last,d.approved asc,d.created_at asc limit 100;
end;
$$;

revoke all on function
 public.vehicle_review_details(uuid),ride_request_private.vehicle_review_details(uuid),
 public.review_vehicle_submission(uuid,uuid,text,text),ride_request_private.review_vehicle_submission(uuid,uuid,text,text)
 from public,anon,authenticated;
grant execute on function
 public.vehicle_review_details(uuid),ride_request_private.vehicle_review_details(uuid),
 public.review_vehicle_submission(uuid,uuid,text,text),ride_request_private.review_vehicle_submission(uuid,uuid,text,text)
 to authenticated;

notify pgrst,'reload schema';
commit;
