alter table public.driver_accounts
 add column display_name text,
 add column vehicle_color text,
 add column vehicle_plate text;

create function public.save_driver_vehicle_details(p_name text,p_color text,p_plate text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null
  or length(coalesce(p_name,''))>80 or length(coalesce(p_color,''))>40 or length(coalesce(p_plate,''))>24 then
  return false;
 end if;
 update public.driver_accounts
 set display_name=nullif(btrim(p_name),''),
     vehicle_color=nullif(btrim(p_color),''),
     vehicle_plate=nullif(btrim(p_plate),'')
 where user_id=(select auth.uid()) and approved;
 return found;
end;
$$;

create function public.ride_driver_vehicle_details(p_ride uuid)
returns table(display_name text,vehicle_color text,vehicle_plate text,category text)
language sql stable security definer set search_path='' as $$
 select d.display_name,d.vehicle_color,d.vehicle_plate,r.category
 from public.rides r join public.driver_accounts d on d.user_id=r.driver_id
 where r.id=p_ride and r.passenger_id=(select auth.uid())
  and r.status in ('accepted','arrived','riding');
$$;

revoke all on function public.save_driver_vehicle_details(text,text,text),public.ride_driver_vehicle_details(uuid)
 from public,anon,authenticated;
grant execute on function public.save_driver_vehicle_details(text,text,text),public.ride_driver_vehicle_details(uuid)
 to authenticated;

select pg_advisory_xact_lock(1744899272);
insert into public.admin_rule_revisions(sections,changed_section,summary)
 select jsonb_set(sections,'{05_tracking,body}',to_jsonb(
  (sections->'05_tracking'->>'body')||E'\n\nتعرض بطاقة التاكسي وقت الوصول التقريبي حسب طريق القيادة عند توفر موقع حديث للسائق. يختفي التقدير إذا أصبح الموقع قديمًا. يستطيع السائق حفظ اسم العرض ولون السيارة ورقم اللوحة في إعداداته، وتظهر البيانات المحفوظة للزبون المعيّن خلال الرحلة النشطة.'
  )), '05_tracking','بطاقة وصول التاكسي وبيانات السيارة للزبون المعيّن'
 from public.admin_rule_revisions order by id desc limit 1;
