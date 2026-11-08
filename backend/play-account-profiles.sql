begin;

create table public.account_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
 full_name text not null default '' check (char_length(full_name)<=80),
 phone text not null default '' check (phone='' or phone ~ '^\+?[0-9]{7,15}$')
);
alter table public.account_profiles enable row level security;
revoke all on public.account_profiles from public,anon,authenticated;
grant select,insert,update on public.account_profiles to authenticated;
create policy account_profile_read on public.account_profiles for select to authenticated using (user_id=(select auth.uid()));
create policy account_profile_create on public.account_profiles for insert to authenticated with check (user_id=(select auth.uid()));
create policy account_profile_update on public.account_profiles for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

alter table public.driver_accounts add column vehicle_model text check (char_length(vehicle_model)<=80);
create table ride_request_private.driver_vehicle_photos (
 driver_id uuid primary key references public.driver_accounts(user_id) on delete cascade,
 jpeg bytea not null check (octet_length(jpeg) between 4 and 180000
  and substring(jpeg from 1 for 3)=decode('ffd8ff','hex')
  and substring(jpeg from octet_length(jpeg)-1)=decode('ffd9','hex'))
);
alter table ride_request_private.driver_vehicle_photos enable row level security;
revoke all on ride_request_private.driver_vehicle_photos from public,anon,authenticated;

create function ride_request_private.save_vehicle_profile(p_name text,p_color text,p_plate text,p_model text,p_change_photo boolean,p_photo text)
returns boolean language plpgsql security definer set search_path='' as $$
declare who uuid := (select auth.uid());
begin
 if who is null or length(p_photo)>240000 or length(p_name)>80 or length(p_color)>40
  or length(p_plate)>24 or length(p_model)>80 then return false; end if;
 update public.driver_accounts
 set display_name=nullif(btrim(p_name),''),vehicle_color=nullif(btrim(p_color),''),
  vehicle_plate=nullif(btrim(p_plate),''),vehicle_model=nullif(btrim(p_model),'')
 where user_id=who;
 if not found then return false; end if;
 if p_change_photo then
  if p_photo is null then
   delete from ride_request_private.driver_vehicle_photos where driver_id=who;
  else
   insert into ride_request_private.driver_vehicle_photos values(who,decode(p_photo,'base64'))
   on conflict(driver_id) do update set jpeg=excluded.jpeg;
  end if;
 end if;
 return true;
end;
$$;

create function ride_request_private.vehicle_profile(p_ride uuid)
returns table(display_name text,vehicle_color text,vehicle_plate text,vehicle_model text,category text,photo text)
language sql stable security definer set search_path='' as $$
 select d.display_name,d.vehicle_color,d.vehicle_plate,d.vehicle_model,coalesce(r.category,d.category),
  replace(encode(p.jpeg,'base64'),chr(10),'')
 from public.driver_accounts d
 left join public.rides r on r.driver_id=d.user_id and r.id=p_ride
 left join ride_request_private.driver_vehicle_photos p on p.driver_id=d.user_id
 where (p_ride is null and d.user_id=(select auth.uid()))
    or (r.passenger_id=(select auth.uid()) and r.status in ('accepted','arrived','riding'));
$$;

create function public.save_vehicle_profile(p_name text,p_color text,p_plate text,p_model text,p_change_photo boolean,p_photo text)
returns boolean language sql security invoker set search_path='' as $$
 select ride_request_private.save_vehicle_profile(p_name,p_color,p_plate,p_model,p_change_photo,p_photo);
$$;
create function public.vehicle_profile(p_ride uuid)
returns table(display_name text,vehicle_color text,vehicle_plate text,vehicle_model text,category text,photo text)
language sql stable security invoker set search_path='' as $$
 select * from ride_request_private.vehicle_profile(p_ride);
$$;

create function ride_request_private.delete_my_account()
returns text language plpgsql security definer set search_path='' as $$
declare who uuid := (select auth.uid());
begin
 if who is null then return 'reauth'; end if;

 -- Lock the driver before the Auth row, matching ride acceptance's lock order.
 perform 1 from public.driver_accounts where user_id=who for update;
 perform 1 from auth.users where id=who for update;
 if not found then return 'deleted'; end if;
 if not exists(
  select 1 from auth.sessions
  where id=nullif(auth.jwt()->>'session_id','')::uuid and user_id=who
   and created_at>=now()-interval '5 minutes'
 ) then return 'reauth'; end if;
 if exists(select 1 from private.admins where user_id=who) then return 'staff'; end if;

 -- Row locks serialize final status checks with concurrent trip transitions.
 perform 1 from public.rides where passenger_id=who or driver_id=who order by id for update;
 if exists(select 1 from public.rides
  where (passenger_id=who or driver_id=who) and status not in ('completed','cancelled')) then
  return 'active_ride';
 end if;

 -- Preserve the other passenger's completed record while removing the former driver.
 delete from public.ride_taxi_positions p using public.rides r where p.ride_id=r.id and r.driver_id=who;
 delete from ride_tracking_private.live_leases where owner_id=who;
 update public.rides set driver_id=null where driver_id=who;
 delete from public.google_route_usage where scope=who::text;
 delete from ride_request_private.fare_quotes where passenger_id=who;
 update ride_request_private.dispatch_jobs set candidates=candidates-who::text where candidates ? who::text;
 delete from auth.users where id=who;
 return 'deleted';
end;
$$;

create function public.delete_my_account()
returns text language sql security invoker set search_path='' as $$
 select ride_request_private.delete_my_account();
$$;

revoke all on function
 public.save_vehicle_profile(text,text,text,text,boolean,text),
 ride_request_private.save_vehicle_profile(text,text,text,text,boolean,text),
 public.vehicle_profile(uuid),ride_request_private.vehicle_profile(uuid),
 public.delete_my_account(),ride_request_private.delete_my_account() from public,anon,authenticated;
grant execute on function
 public.save_vehicle_profile(text,text,text,text,boolean,text),
 ride_request_private.save_vehicle_profile(text,text,text,text,boolean,text),
 public.vehicle_profile(uuid),ride_request_private.vehicle_profile(uuid),
 public.delete_my_account(),ride_request_private.delete_my_account() to authenticated;

select pg_advisory_xact_lock(1744899272);
insert into public.admin_rule_revisions(sections,changed_section,summary)
 select jsonb_set(sections,'{05_tracking,body}',to_jsonb(
  (sections->'05_tracking'->>'body')||E'\n\nيمكن لطالب التسجيل إضافة طراز السيارة وصورتها أثناء انتظار الاعتماد، ويمكن للسائق المعتمد تعديلها في الإعدادات. تظهر الصورة والبيانات للزبون المعيّن من قبول الرحلة إلى انتهائها. اسم الحساب الشخصي ورقم هاتفه خاصان به.'
  )), '05_tracking','إضافة طراز السيارة وصورتها وضبط عرض بيانات الحساب'
 from public.admin_rule_revisions
 where sections->'05_tracking'->>'body' is not null order by id desc limit 1;

notify pgrst,'reload schema';
commit;
