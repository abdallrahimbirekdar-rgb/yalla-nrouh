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
 and r.status='requested' and r.driver_id is null and r.passenger_id<>(select auth.uid());
end
$function$;
revoke all on function public.driver_ride_preview(uuid) from public,anon;
grant execute on function public.driver_ride_preview(uuid) to authenticated;
