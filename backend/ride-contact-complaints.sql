begin;

create table public.ride_complaints (
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references auth.users(id) on delete cascade,
 ride_id uuid references public.rides(id) on delete set null,
 request_id uuid not null,
 category text not null check (category in ('behavior','fare','vehicle','app','other')),
 detail text not null check (char_length(btrim(detail)) between 10 and 1000),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 unique(reporter_id,request_id)
);
create index ride_complaints_reporter_recent on public.ride_complaints(reporter_id,created_at desc,id);
create index ride_complaints_review_queue on public.ride_complaints(reviewed_at asc nulls first,created_at desc,id);
create index ride_complaints_ride on public.ride_complaints(ride_id) where ride_id is not null;

alter table public.ride_complaints enable row level security;
revoke all on public.ride_complaints from public,anon,authenticated;
grant select on public.ride_complaints to authenticated;
create policy complaint_reads_own on public.ride_complaints for select to authenticated
 using (reporter_id=(select auth.uid()));
create policy complaint_reads_staff on public.ride_complaints for select to authenticated
 using ((select public.is_staff_admin()));

create function ride_request_private.ride_contact_phone(p_ride_id uuid)
returns text language sql stable security definer set search_path='' as $$
 select case
  when profile.phone ~ '^\+9639[0-9]{8}$' then profile.phone
  when account.phone ~ '^\+?9639[0-9]{8}$' then '+'||ltrim(account.phone,'+')
 end
 from public.rides r
 cross join (select auth.uid() as who) viewer
 join auth.users account on account.id=case when r.passenger_id=viewer.who then r.driver_id else r.passenger_id end
 left join public.account_profiles profile on profile.user_id=account.id
 where r.id=p_ride_id and r.driver_id is not null and r.status in ('accepted','arrived','riding')
 and (r.passenger_id=viewer.who or r.driver_id=viewer.who);
$$;

create function public.ride_contact_phone(p_ride_id uuid)
returns text language sql stable security invoker set search_path='' as $$
 select ride_request_private.ride_contact_phone(p_ride_id);
$$;

create function ride_request_private.submit_ride_complaint(p_request_id uuid,p_ride_id uuid,p_category text,p_detail text)
returns uuid language plpgsql security definer set search_path='' as $$
declare who uuid := (select auth.uid()); complaint uuid;
begin
 if who is null then raise exception 'login_required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(1744899273,pg_catalog.hashtext(who::text));
 select id into complaint from public.ride_complaints where reporter_id=who and request_id=p_request_id;
 if found then return complaint; end if;
 if p_ride_id is not null and not (
  exists(select from public.rides r where r.id=p_ride_id and (r.passenger_id=who or r.driver_id=who))
  or exists(select from public.driver_ride_releases l where l.ride_id=p_ride_id and l.driver_id=who)
 ) then raise sqlstate '42501' using message='complaint_ride_not_allowed'; end if;
 if (select count(*) from public.ride_complaints where reporter_id=who and created_at>now()-interval '1 hour')>=5
  then raise sqlstate 'P0001' using message='complaint_rate_limited'; end if;
 insert into public.ride_complaints(reporter_id,ride_id,request_id,category,detail)
 values(who,p_ride_id,p_request_id,p_category,btrim(p_detail)) returning id into complaint;
 return complaint;
end;
$$;

create function public.submit_ride_complaint(p_request_id uuid,p_ride_id uuid,p_category text,p_detail text)
returns uuid language sql security invoker set search_path='' as $$
 select ride_request_private.submit_ride_complaint(p_request_id,p_ride_id,p_category,p_detail);
$$;

create function ride_request_private.review_ride_complaint(p_complaint_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not coalesce((select public.is_staff_admin()),false) then raise sqlstate '42501' using message='not_admin'; end if;
 update public.ride_complaints set reviewed_at=coalesce(reviewed_at,clock_timestamp()) where id=p_complaint_id;
 return found;
end;
$$;

create function public.review_ride_complaint(p_complaint_id uuid)
returns boolean language sql security invoker set search_path='' as $$
 select ride_request_private.review_ride_complaint(p_complaint_id);
$$;

revoke all on function public.ride_contact_phone(uuid),ride_request_private.ride_contact_phone(uuid),
 public.submit_ride_complaint(uuid,uuid,text,text),ride_request_private.submit_ride_complaint(uuid,uuid,text,text),
 public.review_ride_complaint(uuid),ride_request_private.review_ride_complaint(uuid)
 from public,anon,authenticated;
grant execute on function public.ride_contact_phone(uuid),ride_request_private.ride_contact_phone(uuid),
 public.submit_ride_complaint(uuid,uuid,text,text),ride_request_private.submit_ride_complaint(uuid,uuid,text,text),
 public.review_ride_complaint(uuid),ride_request_private.review_ride_complaint(uuid)
 to authenticated;

select pg_catalog.pg_advisory_xact_lock(1744899272);
insert into public.admin_rule_revisions(sections,changed_section,summary)
 select jsonb_set(sections,'{04_trip,body}',to_jsonb((sections #>> '{04_trip,body}')||
  E'\nبعد القبول، يمكن للراكب والسائق المعيّن فتح تطبيق الهاتف للاتصال بالطرف الآخر إن توفر رقم. يتوقف الوصول للرقم عند الإنهاء أو الإلغاء أو إعادة الطلب للبحث. يستطيع الطرفان تقديم شكوى مرتبطة بالرحلة، وتراجع الإدارة البلاغات في قسم الشكاوى.')),
  '04_trip','الاتصال بين طرفي الرحلة النشطة وإضافة قسم الشكاوى.'
 from public.admin_rule_revisions order by id desc limit 1;

commit;
