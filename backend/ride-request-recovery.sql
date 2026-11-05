begin;

alter table public.rides add column client_request_id uuid;
create unique index rides_client_request_per_passenger
 on public.rides(passenger_id, client_request_id) where client_request_id is not null;

create schema ride_request_private;
revoke all on schema ride_request_private from public, anon, authenticated;
grant usage on schema ride_request_private to authenticated;

create function ride_request_private.submit_once(
 p_request_id uuid, p_pickup text, p_destination text,
 p_pickup_lat double precision, p_pickup_lng double precision,
 p_destination_lat double precision, p_destination_lng double precision,
 p_region smallint, p_category text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
 passenger uuid := (select auth.uid());
 ride uuid;
begin
 if passenger is null then raise exception 'login_required'; end if;
 if p_request_id is null then raise exception 'invalid_ride'; end if;

 -- Serialize retries for a passenger, then reuse the original booking RPC.
 perform pg_catalog.pg_advisory_xact_lock(1744899271, pg_catalog.hashtext(passenger::text));
 select r.id into ride from public.rides r
 where r.passenger_id = passenger and r.client_request_id = p_request_id;
 if found then return ride; end if;

 select created.ride_id into strict ride
 from public.request_ride(p_pickup, p_destination, p_pickup_lat, p_pickup_lng,
   p_destination_lat, p_destination_lng, p_region, p_category) created;
 update public.rides set client_request_id = p_request_id
 where id = ride and passenger_id = passenger;
 return ride;
end;
$$;

create function public.request_ride_once(
 p_request_id uuid, p_pickup text, p_destination text,
 p_pickup_lat double precision, p_pickup_lng double precision,
 p_destination_lat double precision, p_destination_lng double precision,
 p_region smallint, p_category text
) returns uuid language sql security invoker set search_path = '' as $$
 select ride_request_private.submit_once(p_request_id, p_pickup, p_destination, p_pickup_lat, p_pickup_lng,
   p_destination_lat, p_destination_lng, p_region, p_category);
$$;
revoke all on function ride_request_private.submit_once(uuid,text,text,double precision,double precision,double precision,double precision,smallint,text) from public, anon, authenticated;
revoke all on function public.request_ride_once(uuid,text,text,double precision,double precision,double precision,double precision,smallint,text) from public, anon, authenticated;
grant execute on function ride_request_private.submit_once(uuid,text,text,double precision,double precision,double precision,double precision,smallint,text) to authenticated;
grant execute on function public.request_ride_once(uuid,text,text,double precision,double precision,double precision,double precision,smallint,text) to authenticated;

commit;
