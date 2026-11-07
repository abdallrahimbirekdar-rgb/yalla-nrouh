begin;

create table ride_request_private.ride_cancellations (
 ride_id uuid primary key references public.rides(id) on delete cascade,
 actor text not null check (actor in ('passenger','driver')),
 reason text not null,
 cancelled_at timestamptz not null default now()
);
alter table ride_request_private.ride_cancellations enable row level security;
revoke all on ride_request_private.ride_cancellations from public,anon,authenticated;

create function ride_request_private.cancel_ride_with_reason(p_ride_id uuid,p_actor text,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare
 who uuid := (select auth.uid());
 changed_ride uuid;
begin
 if who is null then raise sqlstate '42501' using message='login_required'; end if;
 if not coalesce(case p_actor
  when 'passenger' then p_reason in ('changed_plans','wait_too_long','wrong_pickup','driver_not_found','other_transport','other')
  when 'driver' then p_reason in ('passenger_not_found','pickup_unreachable','vehicle_problem','emergency','other')
  else false end,false) then
  raise sqlstate '22023' using message='invalid_cancellation_reason';
 end if;

 update public.rides r set status='cancelled',updated_at=now()
 where r.id=p_ride_id and (
  (p_actor='passenger' and r.passenger_id=who and r.status in ('requested','accepted','arrived'))
  or (p_actor='driver' and r.driver_id=who and r.status in ('accepted','arrived')
      and (p_reason<>'passenger_not_found' or r.status='arrived'))
 )
 returning r.id into changed_ride;

 if changed_ride is not null then
  insert into ride_request_private.ride_cancellations(ride_id,actor,reason)
  values(changed_ride,p_actor,p_reason);
  return true;
 end if;

 -- A retry after a lost response confirms the same recorded action.
 return exists (
  select 1 from ride_request_private.ride_cancellations c join public.rides r on r.id=c.ride_id
  where c.ride_id=p_ride_id and c.actor=p_actor and c.reason=p_reason and r.status='cancelled'
   and who=case p_actor when 'driver' then r.driver_id else r.passenger_id end
 );
end;
$$;

create function public.cancel_ride_with_reason(p_ride_id uuid,p_actor text,p_reason text)
returns boolean language sql security invoker set search_path='' as $$
 select ride_request_private.cancel_ride_with_reason(p_ride_id,p_actor,p_reason);
$$;
revoke all on function ride_request_private.cancel_ride_with_reason(uuid,text,text) from public,anon,authenticated;
revoke all on function public.cancel_ride_with_reason(uuid,text,text) from public,anon,authenticated;
grant execute on function ride_request_private.cancel_ride_with_reason(uuid,text,text) to authenticated;
grant execute on function public.cancel_ride_with_reason(uuid,text,text) to authenticated;

-- Preserve the latest guide and revise only the cancellation sentence.
do $$
declare
 current_doc public.admin_rule_revisions%rowtype;
 old_rule constant text := 'الراكب يستطيع إلغاء الطلب قبل بدء الرحلة. السائق يستطيع إعادته للبحث قبل بدء الرحلة.';
 new_rule constant text := 'قبل بدء الرحلة يستطيع الراكب أو السائق المعيّن اختيار سبب الإلغاء ثم تأكيده. يظهر للسائق سبب «لم أجد الزبون» بعد تسجيل الوصول فقط. الإلغاء ينهي الطلب، ويمكن للراكب حجز رحلة جديدة. إعادة الطلب للبحث عن سائق آخر إجراء منفصل متاح للسائق قبل بدء الرحلة.';
 current_body text;
begin
 perform pg_catalog.pg_advisory_xact_lock(1744899272);
 select * into strict current_doc from public.admin_rule_revisions order by id desc limit 1;
 current_body := current_doc.sections->'04_trip'->>'body';
 if current_body is null or strpos(current_body,old_rule)=0 then
  raise exception 'Review the latest trip rules before updating cancellation guidance';
 end if;
 insert into public.admin_rule_revisions(sections,changed_section,summary)
 values(jsonb_set(current_doc.sections,array['04_trip','body'],to_jsonb(replace(current_body,old_rule,new_rule))),
  '04_trip','إضافة أسباب الإلغاء للراكب والسائق وشرح الفرق بين إلغاء الرحلة وإعادتها للبحث.');
end;
$$;

commit;
