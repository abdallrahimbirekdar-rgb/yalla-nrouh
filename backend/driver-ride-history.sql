begin;

create table public.driver_ride_releases (
 id bigint generated always as identity primary key,
 ride_id uuid not null references public.rides(id) on delete cascade,
 driver_id uuid not null references auth.users(id) on delete cascade,
 region smallint not null,
 category text not null,
 released_at timestamptz not null
);
create index driver_ride_releases_recent on public.driver_ride_releases(driver_id, released_at desc, id desc);
alter table public.driver_ride_releases enable row level security;
revoke all on public.driver_ride_releases from public, anon, authenticated;
grant select on public.driver_ride_releases to authenticated;
create policy driver_reads_own_releases on public.driver_ride_releases
 for select to authenticated using (driver_id=(select auth.uid()));

create function ride_request_private.record_driver_release()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.driver_ride_releases(ride_id,driver_id,region,category,released_at)
 values(old.id,old.driver_id,old.region,old.category,now());
 return new;
end;
$$;
revoke all on function ride_request_private.record_driver_release() from public, anon, authenticated;
create trigger record_driver_release
 after update of status,driver_id on public.rides for each row
 when (old.driver_id is not null and old.status in ('accepted','arrived')
   and old.driver_id is distinct from new.driver_id)
 execute function ride_request_private.record_driver_release();

create table ride_request_private.declined_offers (
 driver_id uuid not null references auth.users(id) on delete cascade,
 ride_id uuid not null references public.rides(id) on delete cascade,
 primary key(driver_id,ride_id)
);
create index declined_offers_ride on ride_request_private.declined_offers(ride_id);
revoke all on ride_request_private.declined_offers from public, anon, authenticated;

create function ride_request_private.decline_offer(p_ride_id uuid)
returns void language sql security definer set search_path='' as $$
 insert into ride_request_private.declined_offers(driver_id,ride_id)
 select d.user_id,r.id from public.driver_accounts d join public.rides r
 on r.region=d.region and r.category=d.category
 where d.user_id=(select auth.uid()) and d.approved and d.online
   and r.id=p_ride_id and r.status='requested' and r.driver_id is null and r.passenger_id<>d.user_id
 on conflict do nothing;
$$;
create function public.decline_driver_offer(p_ride_id uuid)
returns void language sql security invoker set search_path='' as $$
 select ride_request_private.decline_offer(p_ride_id);
$$;
revoke all on function ride_request_private.decline_offer(uuid) from public, anon, authenticated;
revoke all on function public.decline_driver_offer(uuid) from public, anon, authenticated;
grant execute on function ride_request_private.decline_offer(uuid) to authenticated;
grant execute on function public.decline_driver_offer(uuid) to authenticated;

-- Refreshing the inbox is an explicit foreground signal from an approved,
-- online driver. Renew the lease before reading matching requests.
create or replace function public.open_ride_previews()
returns table(ride_id uuid,region smallint,category text,created_at timestamptz,pickup_lat_approx numeric,pickup_lng_approx numeric)
language plpgsql security definer set search_path=''
as $function$
begin
 if (select auth.uid()) is null then raise exception 'login_required'; end if;
 update public.driver_accounts set last_seen_at=now()
 where user_id=(select auth.uid()) and approved=true and online=true;
 if not found then return; end if;
 return query
 select r.id,r.region,r.category,r.created_at,round(r.pickup_lat::numeric,2),round(r.pickup_lng::numeric,2)
 from public.rides r join public.driver_accounts d on d.user_id=(select auth.uid())
 where d.approved and d.online and d.last_seen_at>now()-interval '2 minutes'
 and r.region=d.region and r.category=d.category and r.status='requested'
 and r.driver_id is null and r.passenger_id<>(select auth.uid())
 and not exists(select 1 from ride_request_private.declined_offers x where x.driver_id=d.user_id and x.ride_id=r.id)
 order by r.created_at limit 20;
end
$function$;
revoke all on function public.open_ride_previews() from public,anon;
grant execute on function public.open_ride_previews() to authenticated;

commit;
