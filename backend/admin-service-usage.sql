begin;

create table ride_request_private.service_usage_snapshots (
 metric text primary key check (metric in (
  'sb-egress','sb-cache-egress','sb-storage','sb-auth','sb-edge','sb-realtime','sb-peak',
  'maps-dynamic','places-autocomplete','places-details','places-search','maps-geocode',
  'routes-compute','routes-matrix','pages-bandwidth'
 )),
 used numeric not null check (used between 0 and 1000000000000),
 resets_on date,
 recorded_at timestamptz not null default now()
);
alter table ride_request_private.service_usage_snapshots enable row level security;
revoke all on ride_request_private.service_usage_snapshots from public,anon,authenticated;

create function ride_request_private.admin_service_usage()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare utc_day date := (now() at time zone 'UTC')::date;
begin
 if not coalesce(public.is_staff_admin(),false) then raise insufficient_privilege; end if;
 return jsonb_build_object(
  'database_bytes',pg_database_size(current_database()),
  'proxy_calls_today',coalesce((select calls from public.google_route_usage where day=utc_day and scope='global'),0),
  'proxy_resets_at',((utc_day+1)::timestamp at time zone 'UTC'),
  'checked_at',now(),
  'snapshots',coalesce((
   select jsonb_object_agg(metric,jsonb_build_object('used',used,'resets_on',resets_on,'recorded_at',recorded_at))
   from ride_request_private.service_usage_snapshots
  ),'{}'::jsonb)
 );
end;
$$;

create function ride_request_private.admin_record_service_usage(p_metric text,p_used numeric,p_resets_on date)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.is_staff_admin(),false) then raise insufficient_privilege; end if;
 if p_resets_on is not null and not isfinite(p_resets_on) then raise exception 'invalid_reset_date'; end if;
 insert into ride_request_private.service_usage_snapshots(metric,used,resets_on,recorded_at)
 values(p_metric,p_used,p_resets_on,now())
 on conflict(metric) do update set used=excluded.used,resets_on=excluded.resets_on,recorded_at=excluded.recorded_at;
 return true;
end;
$$;

create function public.admin_service_usage()
returns jsonb language sql stable security invoker set search_path='' as $$
 select ride_request_private.admin_service_usage();
$$;
create function public.admin_record_service_usage(p_metric text,p_used numeric,p_resets_on date)
returns boolean language sql security invoker set search_path='' as $$
 select ride_request_private.admin_record_service_usage(p_metric,p_used,p_resets_on);
$$;

revoke all on function public.admin_service_usage(),ride_request_private.admin_service_usage(),
 public.admin_record_service_usage(text,numeric,date),ride_request_private.admin_record_service_usage(text,numeric,date)
 from public,anon,authenticated;
grant execute on function public.admin_service_usage(),ride_request_private.admin_service_usage(),
 public.admin_record_service_usage(text,numeric,date),ride_request_private.admin_record_service_usage(text,numeric,date)
 to authenticated;
notify pgrst,'reload schema';
commit;
