begin;

create function ride_request_private.cancellation_details(p_ride_ids uuid[])
returns table(ride_id uuid,actor text,reason text)
language sql stable security definer set search_path='' as $$
 select c.ride_id,c.actor,c.reason
 from ride_request_private.ride_cancellations c
 join public.rides r on r.id=c.ride_id
 where cardinality(p_ride_ids)<=30 and c.ride_id=any(p_ride_ids)
  and r.status='cancelled' and (select auth.uid()) in (r.passenger_id,r.driver_id);
$$;

create function public.ride_cancellation_details(p_ride_ids uuid[])
returns table(ride_id uuid,actor text,reason text)
language sql stable security invoker set search_path='' as $$
 select * from ride_request_private.cancellation_details(p_ride_ids);
$$;

revoke all on function public.ride_cancellation_details(uuid[]),ride_request_private.cancellation_details(uuid[])
 from public,anon,authenticated;
grant execute on function public.ride_cancellation_details(uuid[]),ride_request_private.cancellation_details(uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
