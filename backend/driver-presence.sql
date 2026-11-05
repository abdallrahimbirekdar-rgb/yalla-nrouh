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
 order by r.created_at limit 20;
end
$function$;
revoke all on function public.open_ride_previews() from public,anon;
grant execute on function public.open_ride_previews() to authenticated;
