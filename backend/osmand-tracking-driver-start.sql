-- The assigned driver reports arrival, then starts the ride once the passenger is in the car.
-- Retain the published RPC signature for older clients.
create or replace function public.advance_ride(p_ride_id uuid,p_next text,p_pin text default null)
returns text language plpgsql security definer set search_path='' as $$
declare v_ride public.rides%rowtype;
begin
 if (select auth.uid()) is null then raise exception 'login_required'; end if;
 select * into v_ride from public.rides where id=p_ride_id for update;
 if v_ride.id is null or v_ride.driver_id is distinct from (select auth.uid()) then
  return 'not_allowed';
 end if;
 if p_next is null or not (
  (v_ride.status='accepted' and p_next='arrived') or
  (v_ride.status='arrived' and p_next='riding') or
  (v_ride.status='riding' and p_next='completed')
 ) then
  return 'invalid_transition';
 end if;
 update public.rides set status=p_next,updated_at=now() where id=p_ride_id;
 return p_next;
end;
$$;

alter policy passenger_reads_approaching_taxi on public.ride_taxi_positions
 using (
  measured_at >= now()-interval '3 minutes'
  and exists (
   select 1 from public.rides r
   where r.id=ride_taxi_positions.ride_id and r.passenger_id=(select auth.uid())
    and r.driver_id is not null and r.status in ('accepted','arrived','riding')
  )
 );

-- Keep the last fix through arrival. The existing end_live_share trigger also
-- removes positions and leases at completion, cancellation or reassignment.
create or replace function ride_tracking_private.clear_taxi_position()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.driver_id is distinct from old.driver_id or new.status not in ('accepted','arrived','riding') then
  delete from public.ride_taxi_positions where ride_id=old.id;
 end if;
 return new;
end;
$$;

-- Foreground fallback for the driver's website when the Android service is unavailable.
create or replace function ride_tracking_private.share_taxi_position(
 p_ride_id uuid,p_latitude double precision,p_longitude double precision,p_measured_at timestamptz
) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or p_measured_at is null
    or p_measured_at < now()-interval '30 seconds'
    or p_measured_at > now()+interval '5 seconds' then
  return false;
 end if;
 perform 1 from public.rides r
 where r.id=p_ride_id and r.status in ('accepted','arrived','riding') and r.driver_id=(select auth.uid())
 for share;
 if not found then return false; end if;
 if exists (select 1 from ride_tracking_private.live_leases where ride_id=p_ride_id and role='driver' and expires_at>now()) then
  return false;
 end if;
 insert into public.ride_taxi_positions as position (ride_id,latitude,longitude,measured_at)
 values (p_ride_id,p_latitude,p_longitude,p_measured_at)
 on conflict(ride_id) do update
 set latitude=excluded.latitude,longitude=excluded.longitude,measured_at=excluded.measured_at
 where excluded.measured_at>=position.measured_at+interval '3 seconds';
 return true;
end;
$$;

select pg_advisory_xact_lock(1744899272);
with latest as (
 select sections from public.admin_rule_revisions order by id desc limit 1
), edits as (
 select sections, section, replacement
 from latest cross join lateral (values
  ('04_trip', replace(sections->'04_trip'->>'body',
   'السائق المعيّن يضغط «وصلت إلى الزبون». بعدها يؤكد الراكب ركوب السيارة من حسابه، ثم يستطيع السائق بدء الرحلة. لا يلزم رمز للركوب.',
   'السائق المعيّن يضغط «وصلت إلى الزبون»، ثم يضغط «بدء الرحلة» بعد ركوب الزبون. لا يحتاج الزبون إلى تأكيد أو إدخال رمز.')),
  ('05_tracking', replace(replace(replace(sections->'05_tracking'->>'body',
   E'خريطة الراكب تعرض موقع التاكسي بعد القبول وطوال توجه السائق إلى نقطة الالتقاء، عند توفر موقع حديث والتطبيق مفتوح لدى السائق.\nتظهر مدة مرور الوقت منذ آخر تحديث. بعد ٣٠ ثانية دون موقع جديد، يظهر تنبيه ويظل آخر موقع معروف ظاهرًا. تتوقف مشاركة الموقع عند الوصول أو الإلغاء أو إعادة الطلب للبحث.\nعند بدء الرحلة، يمكن تحميل المسار إلى الوجهة من نقطة الالتقاء المسجلة أثناء انتظار GPS. يحاول تطبيق السائق تحسين دقة الموقع تلقائيًا. تظهر تعليمات الانعطاف الحية عند توفر قراءة حديثة بدقة ٥٠ مترًا أو أفضل.\nتبقى آخر قراءة ظاهرة ويُعلّق توجيه الانعطافات إذا أصبحت القراءة قديمة. في أندرويد 1.0.4 تبقى الشاشة مضاءة أثناء المتابعة.\nإذا لم تصل قراءة حديثة ودقيقة خلال نحو ١٠ ثوانٍ، يطلب التطبيق قراءة احتياطية من الهاتف مع إبقاء المتابعة الأساسية قيد التشغيل. تبقى الخريطة قابلة لعرض القراءات التقريبية الحديثة.',
   E'تعرض خريطة الزبون موقع السيارة من تعيين السائق وحتى نهاية الرحلة عند مشاركة السائق موقعه. وتعرض الخريطة الصغيرة عند السائق موقع الزبون عند مشاركته.\nبعد ٣٠ ثانية دون قراءة جديدة، يُعرض آخر موقع معروف مع تنبيه.'),
   'في إعدادات السائق، يختار السائق OsmAnd أو خرائط Google للملاحة الخارجية.',
   'تُفتح ملاحة السائق في OsmAnd، وتوجد إرشادات إعداده في إعدادات السائق.'),
   'تستمر أثناء الانتظار وبعد تأكيد الركوب وأثناء الرحلة.',
   'تستمر أثناء انتظار السيارة وبعد بدء الرحلة.')),
  ('06_driver', replace(sections->'06_driver'->>'body',
   'بعد القبول تظهر الرحلة الحالية وتعليمة الملاحة والزر المناسب للمرحلة.',
   'بعد القبول تظهر الرحلة الحالية وخريطة صغيرة لموقع الزبون عند مشاركته، وزر فتح OsmAnd والزر المناسب لمرحلة الرحلة.')),
  ('07_connection', replace(sections->'07_connection'->>'body',
   'تبقى آخر خريطة مسار محمّلة أثناء انقطاع الاتصال في شاشة الملاحة، ويظهر وقت آخر قراءة للموقع.',
   'يظهر وقت آخر قراءة على خريطة تتبع الرحلة.'))
 ) as changes(section,replacement)
)
insert into public.admin_rule_revisions(sections,changed_section,summary)
 select sections||jsonb_object_agg(section,jsonb_set(sections->section,'{body}',to_jsonb(replacement))),
  '04_trip','بدء الرحلة من السائق وتتبع الموقع مع الملاحة عبر OsmAnd'
 from edits group by sections;
