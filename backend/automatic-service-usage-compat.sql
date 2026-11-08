begin;

create or replace function ride_request_private.admin_service_usage()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare utc_day date := (now() at time zone 'UTC')::date;
begin
 if not coalesce(public.is_staff_admin(),false) then raise insufficient_privilege; end if;
 return jsonb_build_object(
  'database_bytes',pg_database_size(current_database()),
  'storage_bytes',(
   select coalesce(sum(case when metadata->>'size' ~ '^[0-9]{1,16}$' then (metadata->>'size')::bigint end),0)
   from storage.objects
  ),
  'recent_sign_ins',(select count(*) from auth.users where last_sign_in_at>=now()-interval '30 days'),
  'proxy_calls_today',coalesce((select calls from public.google_route_usage where day=utc_day and scope='global'),0),
  'proxy_calls_30_days',(
   select coalesce(sum(calls),0) from public.google_route_usage
   where scope='global' and day between utc_day-29 and utc_day
  ),
  'proxy_resets_at',((utc_day+1)::timestamp at time zone 'UTC'),
  'checked_at',now(),
  'snapshots','{}'::jsonb
 );
end;
$$;

notify pgrst,'reload schema';
commit;
