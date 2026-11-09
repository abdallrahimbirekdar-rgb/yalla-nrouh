begin;

alter table ride_request_private.ride_cancellations add column detail text check (detail is null or (reason='other' and char_length(detail) between 1 and 240));

create function ride_request_private.cancel_ride_with_reason(p_ride_id uuid,p_actor text,p_reason text,p_detail text)
returns boolean language plpgsql security definer set search_path='' as $$
declare
 who uuid := (select auth.uid());
 changed_ride uuid;
 note_text text := nullif(pg_catalog.btrim(p_detail),'');
begin
 if who is null then raise sqlstate '42501' using message='login_required'; end if;
 if not coalesce(case p_actor
  when 'passenger' then p_reason in ('changed_plans','wait_too_long','wrong_pickup','driver_not_found','other_transport','other')
  when 'driver' then p_reason in ('passenger_not_found','pickup_unreachable','vehicle_problem','emergency','other')
  else false end,false) then
  raise sqlstate '22023' using message='invalid_cancellation_reason';
 end if;

 if (p_reason='other' and note_text is null) or (p_reason<>'other' and note_text is not null) or char_length(note_text)>240 then
  raise sqlstate '22023' using message='invalid_cancellation_detail';
 end if;

 update public.rides r set status='cancelled',updated_at=now()
 where r.id=p_ride_id and (
  (p_actor='passenger' and r.passenger_id=who and r.status in ('requested','accepted','arrived'))
  or (p_actor='driver' and r.driver_id=who and r.status in ('accepted','arrived')
      and (p_reason<>'passenger_not_found' or r.status='arrived'))
 )
 returning r.id into changed_ride;

 if changed_ride is not null then
  insert into ride_request_private.ride_cancellations(ride_id,actor,reason,detail)
  values(changed_ride,p_actor,p_reason,note_text);
  return true;
 end if;

 -- A retry after a lost response confirms the same recorded action.
 return exists (
  select 1 from ride_request_private.ride_cancellations c join public.rides r on r.id=c.ride_id
  where c.ride_id=p_ride_id and c.actor=p_actor and c.reason=p_reason and c.detail is not distinct from note_text and r.status='cancelled'
   and who=case p_actor when 'driver' then r.driver_id else r.passenger_id end
 );
end;
$$;

create function public.cancel_ride_with_reason(p_ride_id uuid,p_actor text,p_reason text,p_detail text)
returns boolean language sql security invoker set search_path='' as $$
 select ride_request_private.cancel_ride_with_reason(p_ride_id,p_actor,p_reason,p_detail);
$$;
revoke all on function ride_request_private.cancel_ride_with_reason(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.cancel_ride_with_reason(uuid,text,text,text) from public,anon,authenticated;
grant execute on function ride_request_private.cancel_ride_with_reason(uuid,text,text,text) to authenticated;
grant execute on function public.cancel_ride_with_reason(uuid,text,text,text) to authenticated;

create function ride_request_private.ride_cancellation_receipt(p_ride_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('actor',c.actor,'reason',c.reason,'detail',
  case when (select auth.uid())=case c.actor when 'driver' then r.driver_id else r.passenger_id end then c.detail end)
 from ride_request_private.ride_cancellations c join public.rides r on r.id=c.ride_id
 where r.id=p_ride_id and r.status='cancelled' and (select auth.uid()) in (r.passenger_id,r.driver_id)
$$;
create function public.ride_cancellation_receipt(p_ride_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select ride_request_private.ride_cancellation_receipt(p_ride_id)
$$;
revoke all on function ride_request_private.ride_cancellation_receipt(uuid),public.ride_cancellation_receipt(uuid) from public,anon,authenticated;
grant execute on function ride_request_private.ride_cancellation_receipt(uuid),public.ride_cancellation_receipt(uuid) to authenticated;

do $$
declare
 current_doc public.admin_rule_revisions%rowtype;
 trip_body text;
begin
 perform pg_catalog.pg_advisory_xact_lock(1744899272);
 select * into strict current_doc from public.admin_rule_revisions order by id desc limit 1;
 trip_body := current_doc.sections->'04_trip'->>'body';
 if trip_body is null then raise exception 'Missing trip rules section'; end if;
 insert into public.admin_rule_revisions(sections,changed_section,summary)
 values(jsonb_set(current_doc.sections,array['04_trip','body'],to_jsonb(trip_body||E'\nعند اختيار «سبب آخر» يكتب صاحب الإلغاء توضيحًا موجزًا، ويُحفظ مع الإلغاء. يستطيع صاحب الإلغاء مراجعة نصّه في سجل الرحلة، ويظهر للطرف الآخر تصنيف السبب فقط.')),
 '04_trip','حفظ نص سبب الإلغاء المخصص وعرضه لصاحبه في السجل.');
end;
$$;

commit;
