begin;
create table public.fhs_winter_updates(event_id uuid primary key check(event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'),revision bigint not null default 0,monitor_revision bigint not null default 0,transaction_id bigint not null default 0,updated_at timestamptz not null default now());
insert into public.fhs_winter_updates(event_id) values('b571f05e-ed23-4e07-929e-be2b73e601a5');
create table public.fhs_winter_monitor(event_id uuid primary key check(event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'),state jsonb not null,revision bigint not null default 1,updated_at timestamptz not null default now(),updated_by uuid not null references auth.users(id));
alter table public.fhs_winter_updates enable row level security;
alter table public.fhs_winter_monitor enable row level security;
create policy winter_updates_read on public.fhs_winter_updates for select to anon,authenticated using(event_id='b571f05e-ed23-4e07-929e-be2b73e601a5');
create policy winter_monitor_read on public.fhs_winter_monitor for select to anon,authenticated using(event_id='b571f05e-ed23-4e07-929e-be2b73e601a5');
revoke all on public.fhs_winter_updates,public.fhs_winter_monitor from public,anon,authenticated;
grant select(event_id,revision,monitor_revision,updated_at) on public.fhs_winter_updates to anon,authenticated;
-- Realtime needs whole-row SELECT, so the signal row contains only non-sensitive counters.
grant select on public.fhs_winter_updates to anon,authenticated;
grant select(event_id,state,revision,updated_at) on public.fhs_winter_monitor to anon,authenticated;
-- Keep updater UID private: Realtime subscribers receive a public projection through RPC reload.
create or replace function fhs_winter_internal.signal_update() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (case when tg_op='DELETE' then old.event_id else new.event_id end)='b571f05e-ed23-4e07-929e-be2b73e601a5' then
  update public.fhs_winter_updates set revision=revision+1,transaction_id=txid_current(),updated_at=now() where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and transaction_id<>txid_current();
 end if;
 return null;
end;$$;
revoke all on function fhs_winter_internal.signal_update() from public,anon,authenticated;
do $$ declare t text;begin
 foreach t in array array['entries','reception_requests','competitions','riders','horses','organizations'] loop
  execute format('create trigger fhs_winter_signal after insert or update or delete on public.%I for each row execute function fhs_winter_internal.signal_update()',t);
 end loop;
end;$$;
create or replace function fhs_winter_internal.publish_monitor(p_state jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare rev bigint;ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception 'モニター操作には本部管理者権限が必要です';end if;
 if p_state is null or jsonb_typeof(p_state)<>'object' or octet_length(p_state::text)>500000 or (p_state->>'eventId') is distinct from ev::text or (p_state->>'version') is distinct from '1' or jsonb_typeof(p_state->'rows') is distinct from 'array' or jsonb_array_length(p_state->'rows')>5000 or coalesce(p_state->>'page','')!~'^[0-9]+$' then raise exception 'Winterのモニター情報を確認してください';end if;
 if not exists(select 1 from public.competitions where event_id=ev and id::text=p_state->>'competitionId') then raise exception 'Winterの競技を確認してください';end if;
 insert into public.fhs_winter_monitor(event_id,state,updated_by) values(ev,p_state,auth.uid()) on conflict(event_id) do update set state=excluded.state,revision=fhs_winter_monitor.revision+1,updated_at=now(),updated_by=auth.uid() returning revision into rev;
 -- Same tiny signal wakes monitors; no names, fees or request payload in the notification.
 update public.fhs_winter_updates set monitor_revision=monitor_revision+1,updated_at=now() where event_id=ev;
 return rev;
end;$$;
revoke all on function fhs_winter_internal.publish_monitor(jsonb) from public,anon;
grant execute on function fhs_winter_internal.publish_monitor(jsonb) to authenticated;
create or replace function public.publish_winter_monitor(p_state jsonb) returns bigint language sql security invoker set search_path='' as $$select fhs_winter_internal.publish_monitor(p_state);$$;
revoke all on function public.publish_winter_monitor(jsonb) from public,anon;
grant execute on function public.publish_winter_monitor(jsonb) to authenticated;
alter publication supabase_realtime add table public.fhs_winter_updates;
commit;
