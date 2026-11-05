-- Keep this in sync with fare-setup.sql. Service role only.
create or replace function public.consume_google_route_quota(p_user uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare d date := (now() at time zone 'UTC')::date; total integer; personal integer; personal_limit integer; last_call timestamptz;
begin
 if p_user is null then return false; end if;
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
