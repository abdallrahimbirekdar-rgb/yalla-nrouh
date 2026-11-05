create table public.fare_settings (
 id boolean primary key default true check(id),
 base numeric not null check(base between 0 and 1000000000000),
 per_km numeric not null check(per_km between 0 and 1000000000000),
 per_minute numeric not null check(per_minute between 0 and 1000000000000),
 peak_multiplier numeric not null check(peak_multiplier between 1 and 10),
 updated_at timestamptz not null default now()
);
alter table public.fare_settings enable row level security;
revoke all on public.fare_settings from anon,authenticated;
grant select on public.fare_settings to authenticated;
grant update(base,per_km,per_minute,peak_multiplier,updated_at) on public.fare_settings to authenticated;
create policy fare_read on public.fare_settings for select to authenticated using(true);
create policy fare_admin_update on public.fare_settings for update to authenticated using((select public.is_staff_admin())) with check((select public.is_staff_admin()));
insert into public.fare_settings(id,base,per_km,per_minute,peak_multiplier) values(true,50,60,10,1);
create table public.google_route_usage (
 day date not null,
 scope text not null,
 calls integer not null default 0 check(calls>=0),
 last_at timestamptz not null default now(),
 primary key(day,scope)
);
alter table public.google_route_usage enable row level security;
revoke all on public.google_route_usage from anon,authenticated;
grant all on public.google_route_usage to service_role;
grant select on public.fare_settings to service_role;
-- The routing proxy checks the caller's verified user ID against the admin roster.
grant usage on schema private to service_role;
grant select(user_id) on private.admins to service_role;
create function public.consume_google_route_quota(p_user uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare d date := (now() at time zone 'UTC')::date; total integer; personal integer; personal_limit integer; last_call timestamptz;
begin
 if p_user is null then return false; end if;
 -- Admin testing is separate from the shared passenger/driver budget.
 if exists(select 1 from private.admins where user_id=p_user) then return true; end if;
 perform pg_catalog.pg_advisory_xact_lock(73481620);
 select calls into total from public.google_route_usage where day=d and scope='global';
 select calls,last_at into personal,last_call from public.google_route_usage where day=d and scope=p_user::text;
 -- Approved drivers need summaries and navigation throughout their shift.
 -- Keep the existing global cost ceiling and per-user request spacing.
 select case when exists(select 1 from public.driver_accounts where user_id=p_user and approved) then 100 else 10 end into personal_limit;
 if coalesce(total,0)>=100 or coalesce(personal,0)>=personal_limit or last_call>now()-interval '3 seconds' then return false; end if;
 insert into public.google_route_usage(day,scope,calls,last_at) values(d,'global',1,now()),(d,p_user::text,1,now())
 on conflict(day,scope) do update set calls=public.google_route_usage.calls+1,last_at=excluded.last_at;
 return true;
end $$;
revoke all on function public.consume_google_route_quota(uuid) from public,anon,authenticated;
grant execute on function public.consume_google_route_quota(uuid) to service_role;
