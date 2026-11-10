begin;

-- Auth Admin first inserts the user, then sets app_metadata in the same transaction.
create or replace function ride_request_private.register_admin_phone_driver()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 data jsonb := new.raw_app_meta_data->'yalla_driver_phone';
 phone_number text := '+'||ltrim(new.phone,'+');
 driver_name text := nullif(btrim(data->>'name'),'');
 area smallint := (data->>'region')::smallint;
 vehicle_class text := data->>'category';
begin
 if tg_op='UPDATE' and jsonb_typeof(old.raw_app_meta_data->'yalla_driver_phone')='object' then return new; end if;
 if (coalesce(new.email,'')<>'' and new.email<>
     'driver-'||ltrim(new.phone,'+')||'@drivers.yalla-nrouh.invalid') or phone_number is null or phone_number !~ '^[+]9639[0-9]{8}$'
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

drop trigger register_admin_phone_driver on auth.users;
create trigger register_admin_phone_driver after insert or update of raw_app_meta_data on auth.users
 for each row when (jsonb_typeof(new.raw_app_meta_data->'yalla_driver_phone')='object')
 execute function ride_request_private.register_admin_phone_driver();

-- Reserve internal login identifiers for accounts provisioned by the admin API.
-- Inspect final state because app_metadata is set after the initial insert.
create function ride_request_private.require_admin_driver_identity()
returns trigger language plpgsql security definer set search_path='' as $$
declare account auth.users%rowtype;
begin
 select * into account from auth.users where id=new.id;
 if found and lower(coalesce(account.email,'')) like '%@drivers.yalla-nrouh.invalid' and (
  jsonb_typeof(account.raw_app_meta_data->'yalla_driver_phone') is distinct from 'object'
  or account.phone is null or account.phone !~ '^[+]?9639[0-9]{8}$'
  or account.email is distinct from 'driver-'||ltrim(account.phone,'+')||'@drivers.yalla-nrouh.invalid'
 ) then raise exception 'admin_created_driver_required'; end if;
 return null;
end;
$$;
revoke all on function ride_request_private.require_admin_driver_identity() from public,anon,authenticated;
create constraint trigger require_admin_driver_identity
 after insert or update on auth.users deferrable initially deferred for each row
 when (lower(coalesce(new.email,'')) like '%@drivers.yalla-nrouh.invalid')
 execute function ride_request_private.require_admin_driver_identity();

commit;
