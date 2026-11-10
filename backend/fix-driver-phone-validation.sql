begin;

-- Character classes avoid SQL/JSON backslash escaping changing phone validation.
-- Keep NOT VALID for legacy profile rows, while enforcing checks on new writes.
alter table public.account_profiles
 drop constraint account_profiles_phone_check,
 drop constraint account_profiles_syrian_mobile;
alter table public.account_profiles
 add constraint account_profiles_phone_check
  check (phone='' or phone ~ '^[+]?[0-9]{7,15}$') not valid,
 add constraint account_profiles_syrian_mobile
  check (phone='' or phone ~ '^[+]9639[0-9]{8}$') not valid;

create or replace function ride_request_private.register_admin_phone_driver()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 data jsonb := new.raw_app_meta_data->'yalla_driver_phone';
 phone_number text := '+'||ltrim(new.phone,'+');
 driver_name text := nullif(btrim(data->>'name'),'');
 area smallint := (data->>'region')::smallint;
 vehicle_class text := data->>'category';
begin
 if new.email is not null and new.email<>'' or phone_number is null or phone_number !~ '^[+]9639[0-9]{8}$'
  or driver_name is null or length(driver_name)>80 or area is null or area not between 0 and 13
  or vehicle_class is null or vehicle_class not in ('classic','comfort','yellow','vip','ladies-classic','ladies-comfort') then
  raise exception 'invalid_phone_driver';
 end if;
 insert into public.driver_accounts(user_id,region,category,display_name,approved,online)
 values(new.id,area,vehicle_class,driver_name,false,false);
 insert into public.account_profiles(user_id,full_name,phone) values(new.id,driver_name,phone_number);
 return new;
end;
$$;

commit;
