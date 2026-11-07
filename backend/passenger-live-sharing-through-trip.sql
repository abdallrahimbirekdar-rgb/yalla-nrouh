-- Keep the same per-ride consent and Android lease across pickup and the trip.
alter policy driver_reads_waiting_passenger on public.ride_passenger_positions
 using (
  measured_at >= now()-interval '3 minutes'
  and exists (
   select 1 from public.rides r
   where r.id=ride_passenger_positions.ride_id and r.driver_id=(select auth.uid())
    and r.status in ('accepted','arrived','riding')
  )
 );

create or replace function ride_tracking_private.live_allowed(r public.rides,p_role text,p_owner uuid)
returns boolean language sql stable set search_path='' as $$
 select coalesce(case p_role
  when 'driver' then r.driver_id=p_owner and r.status in ('accepted','arrived','riding')
  when 'passenger' then r.passenger_id=p_owner and (
   r.status in ('accepted','arrived','riding')
   or (r.status='requested' and r.updated_at>now()-interval '3 minutes')
  )
 end,false);
$$;

create or replace function ride_tracking_private.end_live_share() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('completed','cancelled') then
  delete from ride_tracking_private.live_leases where ride_id=new.id;
  delete from public.ride_taxi_positions where ride_id=new.id;
  delete from public.ride_passenger_positions where ride_id=new.id;
  delete from public.ride_pickup_changes where ride_id=new.id;
 elsif old.driver_id is not null and new.driver_id is distinct from old.driver_id then
  delete from ride_tracking_private.live_leases where ride_id=new.id and role='driver';
  delete from public.ride_taxi_positions where ride_id=new.id;
  delete from public.ride_passenger_positions where ride_id=new.id;
  delete from public.ride_pickup_changes where ride_id=new.id;
 end if;
 return new;
end;
$$;

select pg_advisory_xact_lock(1744899272);
with latest as (
 select sections,sections->'05_tracking'->>'body' as body
 from public.admin_rule_revisions order by id desc limit 1
), updated as (
 select sections,replace(
  regexp_replace(
   regexp_replace(body,E'(^|\n)يتوفر لحساب السائق التجريبي خيار MapLibre وValhalla[^\n]*','','g'),
   E'(^|\n)في أندرويد 1\\.1\\.5، خيارات الملاحة الخارجية للسائق هي خرائط Google وMAPS\\.ME[^\n]*','','g'),
  'وتتوقف مشاركة الراكب عند تأكيد الركوب أو إلغاء الطلب.',
  'وتستمر مشاركة الراكب حتى اكتمال الرحلة أو إلغائها، ويمكنه إيقافها في أي وقت.') as body
 from latest
)
insert into public.admin_rule_revisions(sections,changed_section,summary)
 select jsonb_set(sections,'{05_tracking,body}',to_jsonb(btrim(replace(body,
  '، وتُعرض معاينة الطريق التجريبي من آخر موقع متاح أو نقطة الانطلاق عند توقف التوجيه الحي.','.')
 )||E'\n\nفي إعدادات السائق، يختار السائق OsmAnd أو خرائط Google للملاحة الخارجية. يعمل OsmAnd في المناطق المنزّلة دون إنترنت. يتوفر تقسيم الشاشة بحسب الجهاز.\n\nفي أندرويد، يستطيع الزبون اختيار مشاركة موقعه عند طلب التاكسي أو من شاشة الرحلة. بعد تسجيل الطلب تبدأ المشاركة في الخلفية عند توفر إذني الموقع والإشعارات. تستمر أثناء الانتظار وبعد تأكيد الركوب وأثناء الرحلة. يرى الموقع السائق المعيّن فقط، وتتوقف المشاركة عند انتهاء البحث بلا قبول أو اكتمال الرحلة أو إلغائها. يمكن إيقافها من الرحلة أو إشعار أندرويد.')),
 '05_tracking','إعدادات الملاحة ومشاركة موقع الزبون من الطلب إلى نهاية الرحلة'
 from updated;
