begin;

alter table public.rides add column search_expired_at timestamptz;

create function ride_request_private.close_expired_searches(p_passenger uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare closed integer;
begin
 update public.rides r
 set status='cancelled',search_expired_at=r.updated_at+interval '3 minutes',updated_at=clock_timestamp()
 where r.passenger_id=p_passenger and r.status='requested' and r.driver_id is null
   and r.updated_at<=clock_timestamp()-interval '3 minutes';
 get diagnostics closed=row_count;
 return closed;
end;
$$;
revoke all on function ride_request_private.close_expired_searches(uuid) from public,anon,authenticated;

create function ride_request_private.close_my_expired_searches()
returns integer language sql security definer set search_path='' as $$
 select ride_request_private.close_expired_searches((select auth.uid()));
$$;
create function public.close_my_expired_searches()
returns integer language sql security invoker set search_path='' as $$
 select ride_request_private.close_my_expired_searches();
$$;
revoke all on function ride_request_private.close_my_expired_searches() from public,anon,authenticated;
revoke all on function public.close_my_expired_searches() from public,anon,authenticated;
grant execute on function ride_request_private.close_my_expired_searches() to authenticated;
grant execute on function public.close_my_expired_searches() to authenticated;

create function ride_request_private.close_expired_search_before_insert()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform ride_request_private.close_expired_searches(new.passenger_id);
 return new;
end;
$$;
revoke all on function ride_request_private.close_expired_search_before_insert() from public,anon,authenticated;
create trigger close_expired_search_before_insert before insert on public.rides
 for each row when (new.status='requested')
 execute function ride_request_private.close_expired_search_before_insert();

-- Check the wall clock after locking the ride, including for older app versions.
create function ride_request_private.reject_expired_acceptance()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.updated_at<=clock_timestamp()-interval '3 minutes' then return null; end if;
 return new;
end;
$$;
revoke all on function ride_request_private.reject_expired_acceptance() from public,anon,authenticated;
create trigger reject_expired_acceptance before update of status on public.rides
 for each row when (old.status='requested' and new.status='accepted')
 execute function ride_request_private.reject_expired_acceptance();

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
 and r.updated_at > statement_timestamp()-interval '3 minutes'
 and r.driver_id is null and r.passenger_id<>(select auth.uid())
 and not exists(select 1 from ride_request_private.declined_offers x where x.driver_id=d.user_id and x.ride_id=r.id)
 order by r.created_at limit 20;
end
$function$;
revoke all on function public.open_ride_previews() from public,anon;
grant execute on function public.open_ride_previews() to authenticated;


-- Only an approved, available driver whose feed matches this pending ride
-- can see its route endpoints. Passenger identity and full addresses are omitted.
create or replace function public.driver_ride_preview(p_ride_id uuid)
returns table(ride_id uuid,pickup_lat double precision,pickup_lng double precision,destination_lat double precision,destination_lng double precision)
language plpgsql security definer set search_path=''
as $function$
begin
 if (select auth.uid()) is null then raise exception 'login_required'; end if;
 update public.driver_accounts set last_seen_at=now()
 where user_id=(select auth.uid()) and approved=true and online=true;
 if not found then return; end if;
 return query select r.id,r.pickup_lat,r.pickup_lng,r.destination_lat,r.destination_lng
 from public.rides r join public.driver_accounts d on d.user_id=(select auth.uid())
 where r.id=p_ride_id and d.approved and d.online
 and r.region=d.region and r.category=d.category
 and r.updated_at > statement_timestamp()-interval '3 minutes'
 and r.status='requested' and r.driver_id is null and r.passenger_id<>(select auth.uid());
end
$function$;
revoke all on function public.driver_ride_preview(uuid) from public,anon;
grant execute on function public.driver_ride_preview(uuid) to authenticated;

create function ride_request_private.timed_ride_previews()
returns table(ride_id uuid,region smallint,category text,created_at timestamptz,pickup_lat_approx numeric,pickup_lng_approx numeric,estimated_fare bigint,remaining_ms bigint)
language sql security definer set search_path='' as $$
 select p.*, greatest(0,floor(extract(epoch from (r.updated_at+interval '3 minutes'-statement_timestamp()))*1000)::bigint)
 from public.open_ride_previews_with_fare() p join public.rides r on r.id=p.ride_id
 order by p.created_at;
$$;
create function public.open_ride_timed_previews()
returns table(ride_id uuid,region smallint,category text,created_at timestamptz,pickup_lat_approx numeric,pickup_lng_approx numeric,estimated_fare bigint,remaining_ms bigint)
language sql security invoker set search_path='' as $$
 select * from ride_request_private.timed_ride_previews();
$$;
revoke all on function ride_request_private.timed_ride_previews() from public,anon,authenticated;
revoke all on function public.open_ride_timed_previews() from public,anon,authenticated;
grant execute on function ride_request_private.timed_ride_previews() to authenticated;
grant execute on function public.open_ride_timed_previews() to authenticated;

-- Close overdue searches already present at rollout.
update public.rides r
set status='cancelled',search_expired_at=r.updated_at+interval '3 minutes',updated_at=clock_timestamp()
where r.status='requested' and r.driver_id is null and r.updated_at<=clock_timestamp()-interval '3 minutes';

commit;
