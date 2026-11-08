-- Run as postgres with play-account-profiles.sql installed, inside a rollback-only transaction.
insert into auth.users(id,email) values
 ('aa100000-0000-4000-8000-000000000001','play-driver@example.invalid'),
 ('aa100000-0000-4000-8000-000000000002','play-passenger@example.invalid'),
 ('aa100000-0000-4000-8000-000000000003','play-outsider@example.invalid');
insert into auth.sessions(id,user_id,created_at) values
 ('aa200000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000001',now()),
 ('aa200000-0000-4000-8000-000000000002','aa100000-0000-4000-8000-000000000002',now()),
 ('aa200000-0000-4000-8000-000000000003','aa100000-0000-4000-8000-000000000003',now()-interval '1 hour');
insert into public.driver_accounts(user_id,region,category,approved)
 values('aa100000-0000-4000-8000-000000000001',0,'classic',true);
insert into public.rides(id,passenger_id,driver_id,pickup,destination,pickup_lat,pickup_lng,destination_lat,destination_lng,region,category,status)
 values('aa300000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000002','aa100000-0000-4000-8000-000000000001',
 'Test pickup','Test destination',33,36,33.1,36.1,0,'classic','accepted');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.account_profiles(full_name,phone) values('Driver','+963999999999');
do $$
begin
 if not public.save_vehicle_profile('Display','Blue','ABC','Model',true,'/9j//9k=') then raise exception 'Driver cannot save'; end if;
 if not exists(select 1 from public.vehicle_profile(null) where vehicle_model='Model' and photo='/9j//9k=') then raise exception 'Driver cannot read own photo'; end if;
 if not public.save_vehicle_profile('Display','Blue','ABC','Edited model',false,null) then raise exception 'Cannot edit model'; end if;
 if not exists(select 1 from public.vehicle_profile(null) where vehicle_model='Edited model' and photo='/9j//9k=') then
  raise exception 'Editing the model should preserve the photo';
 end if;
 if public.delete_my_account()<>'active_ride' then raise exception 'Active driver account can be deleted'; end if;
end
$$;

select set_config('request.jwt.claims','{"sub":"aa100000-0000-4000-8000-000000000003","session_id":"aa200000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
begin
 if exists(select 1 from public.account_profiles) then raise exception 'Outsider can read private profile'; end if;
 if exists(select 1 from public.vehicle_profile('aa300000-0000-4000-8000-000000000001')) then raise exception 'Outsider can read vehicle'; end if;
 if public.save_vehicle_profile('Outsider','','','',true,null) then raise exception 'Outsider can edit vehicle'; end if;
 if public.delete_my_account()<>'reauth' then raise exception 'Stale session can delete account'; end if;
 begin
  insert into public.account_profiles(user_id) values('aa100000-0000-4000-8000-000000000002');
  raise exception 'Outsider can create a profile for someone else';
 exception when insufficient_privilege then null;
 end;
end
$$;

select set_config('request.jwt.claims','{"sub":"aa100000-0000-4000-8000-000000000002","session_id":"aa200000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into public.account_profiles(full_name) values('Passenger');
do $$
begin
 if (select count(*) from public.account_profiles)<>1 then raise exception 'Profile ownership not enforced'; end if;
 if not exists(select 1 from public.vehicle_profile('aa300000-0000-4000-8000-000000000001') where photo='/9j//9k=') then raise exception 'Assigned passenger cannot read vehicle'; end if;
 if public.delete_my_account()<>'active_ride' then raise exception 'Active passenger account can be deleted'; end if;
end
$$;

reset role;
update public.rides set status='completed' where id='aa300000-0000-4000-8000-000000000001';
set local role authenticated;
do $$
begin
 if exists(select 1 from public.vehicle_profile('aa300000-0000-4000-8000-000000000001')) then raise exception 'Photo visible after completion'; end if;
end
$$;
select set_config('request.jwt.claims','{"sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
 if public.delete_my_account()<>'deleted' then raise exception 'Driver deletion failed'; end if;
 if public.delete_my_account()<>'deleted' then raise exception 'Deletion retry failed'; end if;
end
$$;
reset role;
do $$
begin
 if exists(select 1 from auth.users where id='aa100000-0000-4000-8000-000000000001')
 or exists(select 1 from public.account_profiles where user_id='aa100000-0000-4000-8000-000000000001')
 or exists(select 1 from ride_request_private.driver_vehicle_photos where driver_id='aa100000-0000-4000-8000-000000000001') then raise exception 'Driver data remains'; end if;
 if not exists(select 1 from public.rides where id='aa300000-0000-4000-8000-000000000001' and driver_id is null) then raise exception 'Passenger ride lost or driver still linked'; end if;
end
$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aa100000-0000-4000-8000-000000000002","session_id":"aa200000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
begin
 if public.delete_my_account()<>'deleted' then raise exception 'Passenger deletion failed'; end if;
end
$$;
reset role;
do $$
begin
 if exists(select 1 from public.rides where id='aa300000-0000-4000-8000-000000000001')
 or exists(select 1 from auth.sessions where id='aa200000-0000-4000-8000-000000000002')
 or exists(select 1 from public.account_profiles where user_id='aa100000-0000-4000-8000-000000000002') then raise exception 'Passenger data remains'; end if;
end
$$;
select 'Play profile, photo and account-deletion checks passed' as result;
