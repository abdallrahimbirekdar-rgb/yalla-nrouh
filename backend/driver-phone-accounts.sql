begin;

-- Retain old profile rows, but require a Syrian mobile number on new writes.
alter table public.account_profiles add constraint account_profiles_syrian_mobile
 check (phone='' or phone ~ '^\+9639[0-9]{8}$') not valid;

-- The Auth Admin API writes app_metadata. Public signup can only set user_metadata.
-- Register the driver in the same transaction as the new Auth account.
create function ride_request_private.register_admin_phone_driver()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 data jsonb := new.raw_app_meta_data->'yalla_driver_phone';
 phone_number text := '+'||ltrim(new.phone,'+');
 driver_name text := nullif(btrim(data->>'name'),'');
 area smallint := (data->>'region')::smallint;
 vehicle_class text := data->>'category';
begin
 if new.email is not null and new.email<>'' or phone_number is null or phone_number !~ '^\+9639[0-9]{8}$'
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
revoke all on function ride_request_private.register_admin_phone_driver() from public,anon,authenticated;
create trigger register_admin_phone_driver after insert on auth.users
 for each row when (jsonb_typeof(new.raw_app_meta_data->'yalla_driver_phone')='object')
 execute function ride_request_private.register_admin_phone_driver();

create function ride_request_private.admin_phone_driver_id(p_phone text)
returns uuid language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from private.admins where user_id=(select auth.uid())) then raise insufficient_privilege; end if;
 return (
  select u.id from auth.users u join public.driver_accounts d on d.user_id=u.id
  where u.phone in (p_phone,ltrim(p_phone,'+'))
   and jsonb_typeof(u.raw_app_meta_data->'yalla_driver_phone')='object'
   and not exists(select 1 from private.admins a where a.user_id=u.id)
 );
end;
$$;

create function public.admin_phone_driver_id(p_phone text)
returns uuid language sql stable security invoker set search_path='' as $$
 select ride_request_private.admin_phone_driver_id(p_phone);
$$;
revoke all on function public.admin_phone_driver_id(text),ride_request_private.admin_phone_driver_id(text)
 from public,anon,authenticated;
grant execute on function public.admin_phone_driver_id(text),ride_request_private.admin_phone_driver_id(text) to authenticated;
notify pgrst,'reload schema';
commit;
