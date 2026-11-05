begin;

alter table public.rides add column estimated_fare bigint check (estimated_fare between 0 and 9007199254740991);

create table ride_request_private.fare_quotes (
 id uuid primary key default gen_random_uuid(),
 passenger_id uuid not null,
 pickup_lat double precision not null,
 pickup_lng double precision not null,
 destination_lat double precision not null,
 destination_lng double precision not null,
 fare bigint not null check (fare between 0 and 9007199254740991),
 expires_at timestamptz not null default (now()+interval '15 minutes')
);
create index fare_quotes_expiry on ride_request_private.fare_quotes(expires_at);
grant usage on schema ride_request_private to service_role;
grant select, insert, delete on ride_request_private.fare_quotes to service_role;

create function public.issue_ride_fare_quote(
 p_user uuid, p_pickup_lat double precision, p_pickup_lng double precision,
 p_destination_lat double precision, p_destination_lng double precision, p_fare bigint
) returns uuid language plpgsql security invoker set search_path='' as $$
declare quote_id uuid;
begin
 delete from ride_request_private.fare_quotes where expires_at<=now();
 insert into ride_request_private.fare_quotes(passenger_id,pickup_lat,pickup_lng,destination_lat,destination_lng,fare)
 values(p_user,p_pickup_lat,p_pickup_lng,p_destination_lat,p_destination_lng,p_fare)
 returning id into quote_id;
 return quote_id;
end $$;

create function ride_request_private.submit_with_fare(
 p_request_id uuid, p_quote_id uuid, p_pickup text, p_destination text,
 p_pickup_lat double precision, p_pickup_lng double precision,
 p_destination_lat double precision, p_destination_lng double precision,
 p_region smallint, p_category text
) returns uuid language plpgsql security definer set search_path='' as $$
declare passenger uuid := (select auth.uid()); ride uuid; quote ride_request_private.fare_quotes%rowtype; distance_squared double precision;
begin
 if passenger is null then raise exception 'login_required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(1744899271, pg_catalog.hashtext(passenger::text));
 select r.id into ride from public.rides r where r.passenger_id=passenger and r.client_request_id=p_request_id;
 if found then return ride; end if;

 select * into quote from ride_request_private.fare_quotes q
 where q.id=p_quote_id and q.passenger_id=passenger and q.expires_at>now() for update;
 if not found then raise sqlstate 'YQ001' using message='fare_quote_expired'; end if;

 distance_squared := sin(radians(p_pickup_lat-quote.pickup_lat)/2)^2
   + cos(radians(p_pickup_lat))*cos(radians(quote.pickup_lat))*sin(radians(p_pickup_lng-quote.pickup_lng)/2)^2;
 if p_destination_lat is distinct from quote.destination_lat or p_destination_lng is distinct from quote.destination_lng
   or distance_squared is null or distance_squared>sin(31.0/(2*6371000))^2 then
  raise sqlstate 'YQ001' using message='fare_quote_changed';
 end if;

 ride := ride_request_private.submit_once(p_request_id,p_pickup,p_destination,p_pickup_lat,p_pickup_lng,
   p_destination_lat,p_destination_lng,p_region,p_category);
 update public.rides set estimated_fare=quote.fare where id=ride and passenger_id=passenger;
 delete from ride_request_private.fare_quotes where id=quote.id;
 return ride;
end $$;

create function public.request_ride_with_fare(
 p_request_id uuid, p_quote_id uuid, p_pickup text, p_destination text,
 p_pickup_lat double precision, p_pickup_lng double precision,
 p_destination_lat double precision, p_destination_lng double precision,
 p_region smallint, p_category text
) returns uuid language sql security invoker set search_path='' as $$
 select ride_request_private.submit_with_fare(p_request_id,p_quote_id,p_pickup,p_destination,p_pickup_lat,p_pickup_lng,
   p_destination_lat,p_destination_lng,p_region,p_category);
$$;

create function ride_request_private.previews_with_fare()
returns table(ride_id uuid,region smallint,category text,created_at timestamptz,pickup_lat_approx numeric,pickup_lng_approx numeric,estimated_fare bigint)
language sql security definer set search_path='' as $$
 select p.*,r.estimated_fare from public.open_ride_previews() p join public.rides r on r.id=p.ride_id
 order by p.created_at;
$$;
create function public.open_ride_previews_with_fare()
returns table(ride_id uuid,region smallint,category text,created_at timestamptz,pickup_lat_approx numeric,pickup_lng_approx numeric,estimated_fare bigint)
language sql security invoker set search_path='' as $$
 select * from ride_request_private.previews_with_fare();
$$;

revoke all on function public.issue_ride_fare_quote(uuid,double precision,double precision,double precision,double precision,bigint) from public, anon, authenticated;
grant execute on function public.issue_ride_fare_quote(uuid,double precision,double precision,double precision,double precision,bigint) to service_role;
revoke all on function ride_request_private.submit_with_fare(uuid,uuid,text,text,double precision,double precision,double precision,double precision,smallint,text) from public, anon, authenticated;
revoke all on function public.request_ride_with_fare(uuid,uuid,text,text,double precision,double precision,double precision,double precision,smallint,text) from public, anon, authenticated;
grant execute on function ride_request_private.submit_with_fare(uuid,uuid,text,text,double precision,double precision,double precision,double precision,smallint,text) to authenticated;
grant execute on function public.request_ride_with_fare(uuid,uuid,text,text,double precision,double precision,double precision,double precision,smallint,text) to authenticated;
revoke all on function ride_request_private.previews_with_fare() from public, anon, authenticated;
revoke all on function public.open_ride_previews_with_fare() from public, anon, authenticated;
grant execute on function ride_request_private.previews_with_fare() to authenticated;
grant execute on function public.open_ride_previews_with_fare() to authenticated;

commit;
