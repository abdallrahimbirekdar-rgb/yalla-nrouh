begin;

-- Live dispatch keeps its existing eligibility and ranking. The final push
-- wave also wakes recently on-duty drivers whose WebView stopped reporting.
create or replace function public.claim_ride_push(p_generation uuid)
returns table(ride_id uuid,token text,remaining_seconds integer)
language sql security definer set search_path='' as $$
 with eligible as materialized (
  select j.generation,r.id,p.token,greatest(0,ceil(extract(epoch from r.updated_at+interval '3 minutes'-statement_timestamp())))::integer ttl
  from ride_request_private.dispatch_jobs j join public.rides r on r.id=j.ride_id
  join public.driver_accounts d on d.category=r.category
  join ride_request_private.driver_push_devices p on p.driver_id=d.user_id and p.refreshed_at>now()-interval '30 days'
  cross join lateral (select ride_request_private.driver_can_receive(r,d) as live_eligible) eligibility
  where j.generation=p_generation and (eligibility.live_eligible or (
   j.started_at<=statement_timestamp()-interval '50 seconds'
   and d.approved and d.online and d.region=r.region and d.user_id<>r.passenger_id
   and d.last_seen_at<=statement_timestamp()-interval '5 minutes'
   and d.last_seen_at>statement_timestamp()-interval '8 hours'
   and r.status='requested' and r.driver_id is null
   and r.updated_at>statement_timestamp()-interval '3 minutes'
   and not exists(select 1 from public.rides active where active.driver_id=d.user_id and active.status in ('accepted','arrived','riding'))
   and not exists(select 1 from ride_request_private.declined_offers x where x.driver_id=d.user_id and x.ride_id=r.id)
  ))
  and not exists(select 1 from ride_request_private.dispatch_push_attempts sent where sent.generation=j.generation and sent.token=p.token)
  order by eligibility.live_eligible desc,p.refreshed_at desc limit 20
 ), inserted as (
  insert into ride_request_private.dispatch_push_attempts(generation,token)
  select e.generation,e.token from eligible e on conflict do nothing returning token
 )
 select e.id,e.token,e.ttl from eligible e join inserted i on i.token=e.token;
$$;
revoke all on function public.claim_ride_push(uuid) from public,anon,authenticated;
grant execute on function public.claim_ride_push(uuid) to service_role;

do $$
declare
 current_doc public.admin_rule_revisions%rowtype;
 offer_body text;
begin
 perform pg_catalog.pg_advisory_xact_lock(1744899272);
 select * into strict current_doc from public.admin_rule_revisions order by id desc limit 1;
 offer_body := current_doc.sections->'03_offers'->>'body';
 if offer_body is null then raise exception 'Missing offer rules section'; end if;
 insert into public.admin_rule_revisions(sections,changed_section,summary)
 values(jsonb_set(current_doc.sections,array['03_offers','body'],to_jsonb(offer_body||E'\nعند تفعيل إشعارات Firebase وتسجيل الجهاز، يمكن للموجة الأخيرة بعد نحو ٥٠ ثانية تنبيه السائق المعتمد المتاح في منطقة الطلب ومن فئة السيارة نفسها، حتى لو توقف التطبيق عن إرسال موقع حديث. يشترط أن يكون السائق في الدوام وآخر نشاط له خلال ٨ ساعات. عند فتح التنبيه يعيد التطبيق فحص العرض ومهلته قبل القبول.')),
 '03_offers','إتاحة تنبيه الخلفية في الموجة الأخيرة للسائق المتاح ضمن منطقة الطلب.');
end;
$$;
commit;
