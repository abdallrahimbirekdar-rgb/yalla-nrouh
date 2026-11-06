begin;

create or replace function ride_request_private.driver_can_receive(r public.rides,d public.driver_accounts)
returns boolean language sql stable set search_path='' as $$
 select d.approved and d.online and d.category=r.category and d.user_id<>r.passenger_id
 and d.last_seen_at>statement_timestamp()-interval '5 minutes'
 and r.status='requested' and r.driver_id is null
 and r.updated_at>statement_timestamp()-interval '3 minutes'
 and not exists(select 1 from public.rides active where active.driver_id=d.user_id and active.status in ('accepted','arrived','riding'))
 and not exists(select 1 from ride_request_private.declined_offers x where x.driver_id=d.user_id and x.ride_id=r.id)
 and coalesce((
  select case
   when p.measured_at is null then d.region=r.region and age.seconds>=8
   when age.seconds<8 and j.matrix_state in ('queued','running') then false
   when age.seconds<25 then case when j.matrix_state='ranked' then coalesce(rank.place<=3,false) else km.distance<=3 end
   when age.seconds<50 then case when j.matrix_state='ranked' then coalesce(rank.place<=8,false) else km.distance<=8 end
   else km.distance<=15
  end
  from ride_request_private.dispatch_jobs j
  left join ride_request_private.driver_dispatch_positions p on p.driver_id=d.user_id and p.measured_at>statement_timestamp()-interval '5 minutes'
  cross join lateral (select extract(epoch from statement_timestamp()-j.started_at) as seconds) age
  cross join lateral (select ride_request_private.dispatch_distance_km(p.lat,p.lng,r.pickup_lat,r.pickup_lng) as distance) km
  left join lateral (select ord as place from jsonb_array_elements_text(j.candidates) with ordinality x(id,ord) where x.id=d.user_id::text) rank on true
  where j.ride_id=r.id
 ),d.region=r.region);
$$;

do $guide$
declare current_doc jsonb;
declare note text := 'يبدأ العرض للسائق القريب فور جاهزية ترتيب الطريق أو تعذّره. بعد ٨ ثوانٍ، يُستخدم القرب الجغرافي إذا بقي الترتيب قيد الحساب، وتُستخدم منطقة العمل للسائق من دون موقع حديث. تُفحص العروض كل ٣ ثوانٍ أثناء الاستقبال، أو ٤ ثوانٍ مع توفير البيانات.';
begin
 perform pg_catalog.pg_advisory_xact_lock(1744899272);
 select sections into strict current_doc from public.admin_rule_revisions order by id desc limit 1;
 if position(note in current_doc #>> '{03_offers,body}')>0 then return; end if;
 insert into public.admin_rule_revisions(sections,changed_section,summary)
 values(jsonb_set(current_doc,'{03_offers,body}',to_jsonb((current_doc #>> '{03_offers,body}')||E'\n'||note)),
  '03_offers','تسريع ظهور طلب الرحلة الأول للسائق المتاح.');
end;
$guide$;

commit;
