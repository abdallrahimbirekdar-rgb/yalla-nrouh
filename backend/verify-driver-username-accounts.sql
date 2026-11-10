-- Run within a rollback transaction. Model the Auth Admin API's insert/update order.
do $$
declare driver uuid := gen_random_uuid(); rejected uuid := gen_random_uuid();
begin
 insert into auth.users(id,email,phone,raw_app_meta_data) values
  (driver,'driver-963900000001@drivers.yalla-nrouh.invalid','963900000001','{}');
 update auth.users set raw_app_meta_data='{"yalla_driver_phone":{"name":"Username QA","region":1,"category":"comfort"}}'
  where id=driver;
 set constraints auth.require_admin_driver_identity immediate;
 if not exists(select 1 from public.driver_accounts where user_id=driver and not approved and not online)
  or not exists(select 1 from public.account_profiles where user_id=driver and phone='+963900000001') then
  raise exception 'Username driver provisioning failed';
 end if;
 -- Refreshing app metadata must not insert duplicate driver/profile rows.
 update auth.users set raw_app_meta_data=raw_app_meta_data||'{"provider":"email"}' where id=driver;
 begin
  insert into auth.users(id,email,phone,raw_user_meta_data) values
   (rejected,'driver-963900000002@drivers.yalla-nrouh.invalid','963900000002',
    '{"yalla_driver_phone":{"name":"Untrusted metadata","region":1,"category":"comfort"}}');
  raise exception 'Public signup claimed a reserved driver username';
 exception when raise_exception then
  if sqlerrm<>'admin_created_driver_required' then raise; end if;
 end;
 if exists(select 1 from auth.users where id=rejected) then raise exception 'Failed signup left an account'; end if;
end $$;
select 'Admin-only username provisioning checks passed' as result;
