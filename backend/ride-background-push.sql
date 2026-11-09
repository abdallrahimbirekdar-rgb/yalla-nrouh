begin;

-- The existing registry is shared by driver offers and passenger events.
-- Dispatch still rechecks driver eligibility before claiming any device.
alter table ride_request_private.driver_push_devices
 drop constraint driver_push_devices_driver_id_fkey,
 add constraint ride_push_devices_account_fkey foreign key(driver_id) references auth.users(id) on delete cascade;

create function ride_request_private.register_ride_push(p_token text,p_previous text)
returns boolean language plpgsql security definer set search_path='' as $$
declare who uuid := (select auth.uid());
begin
 if who is null or p_token is null or length(p_token) not between 40 and 4096
    or p_token !~ '^[[:alnum:]:_-]+$' then return false; end if;
 if p_previous is distinct from p_token then
  delete from ride_request_private.driver_push_devices where token=p_previous and driver_id=who;
 end if;
 insert into ride_request_private.driver_push_devices(token,driver_id)
 values(p_token,who) on conflict(token) do update set driver_id=excluded.driver_id,refreshed_at=now();
 return true;
end;
$$;
create function public.register_ride_push(p_token text,p_previous text)
returns boolean language sql security invoker set search_path='' as $$
 select ride_request_private.register_ride_push(p_token,p_previous)
$$;
revoke all on function ride_request_private.register_ride_push(text,text),public.register_ride_push(text,text) from public,anon,authenticated;
grant execute on function ride_request_private.register_ride_push(text,text),public.register_ride_push(text,text) to authenticated;

create table ride_request_private.passenger_push_events(
 id uuid primary key default gen_random_uuid(),
 ride_id uuid not null references public.rides(id) on delete cascade,
 stage text not null check(stage in ('accepted','arrived')),
 created_at timestamptz not null default now()
);
create index passenger_push_events_created_idx on ride_request_private.passenger_push_events(created_at);
create index passenger_push_events_ride_idx on ride_request_private.passenger_push_events(ride_id);
alter table ride_request_private.passenger_push_events enable row level security;
revoke all on ride_request_private.passenger_push_events from public,anon,authenticated;

create function ride_request_private.queue_passenger_push()
returns trigger language plpgsql security definer set search_path='' as $$
declare event_id uuid;
begin
 if new.status not in ('accepted','arrived') or new.status=old.status or not exists(
  select 1 from ride_request_private.driver_push_devices d where d.driver_id=new.passenger_id and d.refreshed_at>now()-interval '30 days'
 ) then return new; end if;
 begin
  delete from ride_request_private.passenger_push_events where created_at<now()-interval '5 minutes';
  insert into ride_request_private.passenger_push_events(ride_id,stage) values(new.id,new.status) returning id into event_id;
  perform net.http_post(url:='https://gokosprcqpdvqgahvquk.supabase.co/functions/v1/ride-dispatch',
   body:=jsonb_build_object('event',event_id),timeout_milliseconds:=15000);
 exception when others then
  -- A push outage must never roll back a trip transition.
  null;
 end;
 return new;
end;
$$;
revoke all on function ride_request_private.queue_passenger_push() from public,anon,authenticated;
create trigger yalla_passenger_push after update of status on public.rides
for each row execute function ride_request_private.queue_passenger_push();

create function public.claim_passenger_ride_push(p_event uuid)
returns table(ride_id uuid,stage text,token text)
language sql security definer set search_path='' as $$
 with claimed as (
  delete from ride_request_private.passenger_push_events e where e.id=p_event
  returning e.ride_id,e.stage,e.created_at
 )
 select r.id,c.stage,d.token
 from claimed c join public.rides r on r.id=c.ride_id and r.status=c.stage
 join ride_request_private.driver_push_devices d on d.driver_id=r.passenger_id
 where c.created_at>now()-interval '2 minutes' and d.refreshed_at>now()-interval '30 days'
 order by d.refreshed_at desc limit 20
$$;
revoke all on function public.claim_passenger_ride_push(uuid) from public,anon,authenticated;
grant execute on function public.claim_passenger_ride_push(uuid) to service_role;
commit;
