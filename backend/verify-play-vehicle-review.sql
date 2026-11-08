-- Use a disposable database and run inside a transaction that is rolled back.
insert into auth.users(id,email) values
 ('bb100000-0000-4000-8000-000000000001','vehicle-driver@example.invalid'),
 ('bb100000-0000-4000-8000-000000000002','vehicle-passenger@example.invalid'),
 ('bb100000-0000-4000-8000-000000000003','vehicle-admin@example.invalid');
insert into private.admins(user_id) values('bb100000-0000-4000-8000-000000000003');
insert into public.driver_accounts(user_id,region,category) values('bb100000-0000-4000-8000-000000000001',0,'classic');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"bb100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
 if not public.save_vehicle_profile('Driver','Blue','ABC','First model',true,'/9j//9k=') then raise exception 'Submit failed'; end if;
 if (public.vehicle_review_details(null)->>'status') <> 'pending' then raise exception 'Driver status missing'; end if;
 begin
  perform public.vehicle_review_details('bb100000-0000-4000-8000-000000000001');
  raise exception 'Non-admin read an admin review';
 exception when insufficient_privilege then null;
 end;
 begin
  perform public.review_vehicle_submission('bb100000-0000-4000-8000-000000000001',null,'approve',null);
  raise exception 'Non-admin could review';
 exception when insufficient_privilege then null;
 end;
end $$;

select set_config('request.jwt.claims','{"sub":"bb100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare driver constant uuid := 'bb100000-0000-4000-8000-000000000001';
declare revision uuid := (public.vehicle_review_details(driver)->>'revision')::uuid;
begin
 if (public.vehicle_review_details(driver)->>'photo') is distinct from '/9j//9k=' then raise exception 'Admin cannot see photo'; end if;
 if public.admin_review_driver(driver,true) then raise exception 'Legacy approval bypass'; end if;
 if public.review_vehicle_submission(driver,gen_random_uuid(),'approve',null) <> 'stale' then raise exception 'Stale approval succeeded'; end if;
 if public.review_vehicle_submission(driver,revision,'changes_requested','') <> 'invalid' then raise exception 'Missing reason accepted'; end if;
 if public.review_vehicle_submission(driver,revision,'changes_requested','Check plate') <> 'saved' then raise exception 'Request changes failed'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"bb100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
 if (public.vehicle_review_details(null)->>'reason') is distinct from 'Check plate' then raise exception 'Driver cannot see reason'; end if;
 if not public.save_vehicle_profile('Driver','Blue','DEF','First model',false,null) then raise exception 'Resubmit failed'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"bb100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare driver constant uuid := 'bb100000-0000-4000-8000-000000000001';
begin
 if public.review_vehicle_submission(driver,(public.vehicle_review_details(driver)->>'revision')::uuid,'approve',null) <> 'saved' then raise exception 'Initial approval failed'; end if;
end $$;

reset role;
insert into public.rides(id,passenger_id,driver_id,pickup,destination,pickup_lat,pickup_lng,destination_lat,destination_lng,region,category,status)
values('bb200000-0000-4000-8000-000000000001','bb100000-0000-4000-8000-000000000002','bb100000-0000-4000-8000-000000000001','Test pickup','Test destination',33,36,33.1,36.1,0,'classic','accepted');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"bb100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
 if not public.save_vehicle_profile('Driver','Red','NEW','Second model',true,null) then raise exception 'Update submission failed'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"bb100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
begin
 if not exists(select 1 from public.vehicle_profile('bb200000-0000-4000-8000-000000000001')
 where vehicle_plate='DEF' and vehicle_model='First model' and photo='/9j//9k=') then raise exception 'Passenger saw unpublished update'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"bb100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare driver constant uuid := 'bb100000-0000-4000-8000-000000000001';
declare revision uuid := (public.vehicle_review_details(driver)->>'revision')::uuid;
begin
 if public.review_vehicle_submission(driver,revision,'approve',null) <> 'active_ride' then raise exception 'Updated during active trip'; end if;
 if public.review_vehicle_submission(driver,revision,'rejected','Wrong plate') <> 'saved' then raise exception 'Reject failed'; end if;
end $$;
reset role;
do $$
begin
 if not exists(select 1 from public.driver_accounts where user_id='bb100000-0000-4000-8000-000000000001' and approved and vehicle_plate='DEF')
 then raise exception 'Rejection changed approved snapshot'; end if;
end $$;
select 'Vehicle review checks passed' as result;
