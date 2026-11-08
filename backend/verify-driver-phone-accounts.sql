-- Run in the isolated ride QA database within a rollback transaction.
insert into auth.users(id,phone,raw_app_meta_data) values
 ('dd100000-0000-4000-8000-000000000001','963944555666','{"yalla_driver_phone":{"name":"Test Driver","region":1,"category":"comfort"}}'),
 ('dd100000-0000-4000-8000-000000000002',null,'{}');
insert into private.admins(user_id) values('dd100000-0000-4000-8000-000000000002');

do $$
begin
 if not exists(select 1 from public.driver_accounts where user_id='dd100000-0000-4000-8000-000000000001'
  and region=1 and category='comfort' and not approved and not online) then raise exception 'Driver provisioning failed'; end if;
 if not exists(select 1 from public.account_profiles where user_id='dd100000-0000-4000-8000-000000000001'
  and phone='+963944555666') then raise exception 'Canonical phone missing'; end if;
 begin
  update public.account_profiles set phone='+491234567890' where user_id='dd100000-0000-4000-8000-000000000001';
  raise exception 'Foreign phone accepted';
 exception when check_violation then null;
 end;
 begin
  insert into auth.users(id,phone,raw_app_meta_data) values
   ('dd100000-0000-4000-8000-000000000003','49123456789','{"yalla_driver_phone":{"name":"Test Driver","region":1,"category":"comfort"}}');
  raise exception using errcode='23514',message='Invalid driver account was created';
 exception when raise_exception then
  if sqlerrm<>'invalid_phone_driver' then raise; end if;
 end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
 begin
  perform public.admin_phone_driver_id('+963944555666');
  raise exception 'Non-admin phone lookup was allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
select set_config('request.jwt.claims','{"sub":"dd100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
begin
 if public.admin_phone_driver_id('+963944555666') is distinct from 'dd100000-0000-4000-8000-000000000001'::uuid
  then raise exception 'Admin phone lookup failed'; end if;
end $$;
reset role;
select 'Syrian phone and admin driver provisioning checks passed' as result;
