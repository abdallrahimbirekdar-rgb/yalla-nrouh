begin;

alter table public.rides add column pickup_note text
 check (char_length(pickup_note) between 1 and 120);

create function ride_request_private.submit_with_pickup_note(
 p_request_id uuid, p_quote_id uuid, p_pickup text, p_destination text,
 p_pickup_lat double precision, p_pickup_lng double precision,
 p_destination_lat double precision, p_destination_lng double precision,
 p_region smallint, p_category text, p_pickup_note text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 passenger uuid := (select auth.uid());
 ride uuid;
 note text;
begin
 if passenger is null then raise exception 'login_required'; end if;

 -- Share the booking lock so either endpoint can retry the same request.
 perform pg_catalog.pg_advisory_xact_lock(1744899271, pg_catalog.hashtext(passenger::text));
 select r.id into ride from public.rides r
 where r.passenger_id=passenger and r.client_request_id=p_request_id;
 if found then return ride; end if;

 note := nullif(btrim(regexp_replace(p_pickup_note, '[[:space:]]+', ' ', 'g')), '');
 if char_length(note)>120 then
  raise sqlstate '22023' using message='pickup_note_too_long';
 end if;

 ride := ride_request_private.submit_with_fare(p_request_id,p_quote_id,p_pickup,p_destination,
  p_pickup_lat,p_pickup_lng,p_destination_lat,p_destination_lng,p_region,p_category);
 update public.rides set pickup_note=note where id=ride and passenger_id=passenger;
 return ride;
end;
$$;

create function public.request_ride_with_pickup_note(
 p_request_id uuid, p_quote_id uuid, p_pickup text, p_destination text,
 p_pickup_lat double precision, p_pickup_lng double precision,
 p_destination_lat double precision, p_destination_lng double precision,
 p_region smallint, p_category text, p_pickup_note text
) returns uuid language sql security invoker set search_path='' as $$
 select ride_request_private.submit_with_pickup_note(p_request_id,p_quote_id,p_pickup,p_destination,
  p_pickup_lat,p_pickup_lng,p_destination_lat,p_destination_lng,p_region,p_category,p_pickup_note);
$$;

revoke all on function
 ride_request_private.submit_with_pickup_note(uuid,uuid,text,text,double precision,double precision,double precision,double precision,smallint,text,text),
 public.request_ride_with_pickup_note(uuid,uuid,text,text,double precision,double precision,double precision,double precision,smallint,text,text)
 from public,anon,authenticated;
grant execute on function
 ride_request_private.submit_with_pickup_note(uuid,uuid,text,text,double precision,double precision,double precision,double precision,smallint,text,text),
 public.request_ride_with_pickup_note(uuid,uuid,text,text,double precision,double precision,double precision,double precision,smallint,text,text)
 to authenticated;

select pg_catalog.pg_advisory_xact_lock(1744899272);
insert into public.admin_rule_revisions(sections,changed_section,summary)
 select jsonb_set(sections,'{01_booking,body}',to_jsonb((sections #>> '{01_booking,body}')||
  E'\nيمكن للراكب إضافة ملاحظة اختيارية قصيرة عن نقطة الالتقاء أثناء تأكيد الطلب. تظهر للسائق المعيّن بعد القبول، وتبقى الإحداثيات والأجرة كما هي.')),
  '01_booking','إضافة ملاحظة اختيارية للسائق عند نقطة الالتقاء.'
 from public.admin_rule_revisions order by id desc limit 1;

commit;
