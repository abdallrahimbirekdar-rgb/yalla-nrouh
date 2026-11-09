begin;

create function ride_request_private.estimated_ride_previews()
returns table(ride_id uuid,region smallint,category text,created_at timestamptz,
 pickup_lat_approx numeric,pickup_lng_approx numeric,estimated_fare bigint,remaining_ms bigint,
 trip_direct_meters integer)
language sql security definer set search_path='' as $$
 select p.*, greatest(100, round(10*ride_request_private.dispatch_distance_km(
  r.pickup_lat,r.pickup_lng,r.destination_lat,r.destination_lng))::integer*100)
 from ride_request_private.timed_ride_previews() p
 join public.rides r on r.id=p.ride_id
 order by p.created_at;
$$;

create function public.open_ride_estimated_previews()
returns table(ride_id uuid,region smallint,category text,created_at timestamptz,
 pickup_lat_approx numeric,pickup_lng_approx numeric,estimated_fare bigint,remaining_ms bigint,
 trip_direct_meters integer)
language sql security invoker set search_path='' as $$
 select * from ride_request_private.estimated_ride_previews();
$$;

revoke all on function ride_request_private.estimated_ride_previews(),public.open_ride_estimated_previews()
 from public,anon,authenticated;
grant execute on function ride_request_private.estimated_ride_previews(),public.open_ride_estimated_previews()
 to authenticated;

select pg_catalog.pg_advisory_xact_lock(1744899272);
insert into public.admin_rule_revisions(sections,changed_section,summary)
 select jsonb_set(sections,'{03_offers,body}',to_jsonb((sections #>> '{03_offers,body}')||
  E'\nتظهر مسافة ومدة أوليتان في العرض بناءً على المسافة المباشرة. عند توفر طريق القيادة، تُعرض مسافته ومدته في تفاصيل العرض. تظل الأجرة المسجلة مستقلة عن التقدير الأولي.')),
  '03_offers','عرض مسافة ومدة تقديريتين فور وصول طلب الرحلة.'
 from public.admin_rule_revisions order by id desc limit 1;

commit;
