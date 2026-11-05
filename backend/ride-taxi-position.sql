begin;

create schema ride_tracking_private;
revoke all on schema ride_tracking_private from public, anon, authenticated;
grant usage on schema ride_tracking_private to authenticated;

create table public.ride_taxi_positions (
 ride_id uuid primary key references public.rides(id) on delete cascade,
 latitude double precision not null check (latitude between -90 and 90),
 longitude double precision not null check (longitude between -180 and 180),
 measured_at timestamptz not null
);
alter table public.ride_taxi_positions enable row level security;
revoke all on public.ride_taxi_positions from public, anon, authenticated;
grant select on public.ride_taxi_positions to authenticated;

create policy passenger_reads_approaching_taxi on public.ride_taxi_positions
 for select to authenticated using (
  exists (
   select 1 from public.rides r
   where r.id = ride_taxi_positions.ride_id and r.status = 'accepted' and r.passenger_id = (select auth.uid())
  )
 );

create function ride_tracking_private.share_taxi_position(
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

 insert into public.ride_taxi_positions as position (ride_id, latitude, longitude, measured_at)
 values (p_ride_id, p_latitude, p_longitude, p_measured_at)
 on conflict (ride_id) do update
 set latitude = excluded.latitude, longitude = excluded.longitude, measured_at = excluded.measured_at
 where excluded.measured_at >= position.measured_at + interval '3 seconds';
 return true;
end;
$$;

create function public.share_taxi_position(
 p_ride_id uuid, p_latitude double precision, p_longitude double precision, p_measured_at timestamptz
) returns boolean language sql security invoker set search_path = '' as $$
 select ride_tracking_private.share_taxi_position(p_ride_id, p_latitude, p_longitude, p_measured_at);
$$;
revoke all on function ride_tracking_private.share_taxi_position(uuid, double precision, double precision, timestamptz) from public, anon, authenticated;
revoke all on function public.share_taxi_position(uuid, double precision, double precision, timestamptz) from public, anon, authenticated;
grant execute on function ride_tracking_private.share_taxi_position(uuid, double precision, double precision, timestamptz) to authenticated;
grant execute on function public.share_taxi_position(uuid, double precision, double precision, timestamptz) to authenticated;

create function ride_tracking_private.clear_taxi_position()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 delete from public.ride_taxi_positions where ride_id = old.id;
 return new;
end;
$$;
revoke all on function ride_tracking_private.clear_taxi_position() from public, anon, authenticated;

create trigger clear_taxi_position_after_pickup_or_release
 after update of status, driver_id on public.rides
 for each row when (
  old.status = 'accepted' and (new.status <> 'accepted' or old.driver_id is distinct from new.driver_id)
 )
 execute function ride_tracking_private.clear_taxi_position();

alter publication supabase_realtime add table public.ride_taxi_positions;

commit;
