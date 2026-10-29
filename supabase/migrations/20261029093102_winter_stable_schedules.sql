-- Winter-only planned arrival/departure. Append-only history; no roster, entries,
-- charges or payments are written by this API. Dates/times are Japan local wall time.
create table public.fhs_winter_stable_schedules (
 request_id text primary key check (request_id ~ '^[0-9a-f]{64}$'),
 revision bigint generated always as identity,
 event_id uuid not null check (event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'),
 organization_id uuid not null references public.organizations(id),
 value jsonb not null check (jsonb_typeof(value)='object'),
 source_reference text not null check (length(source_reference) between 1 and 100),
 payload jsonb not null,
 confirmed_by uuid not null,
 confirmed_at timestamptz not null default clock_timestamp()
);
create index winter_stable_current_idx on public.fhs_winter_stable_schedules(event_id,organization_id,revision desc);
create index winter_stable_organization_idx on public.fhs_winter_stable_schedules(organization_id);
alter table public.fhs_winter_stable_schedules enable row level security;
revoke all on public.fhs_winter_stable_schedules from public,anon,authenticated;
grant select on public.fhs_winter_stable_schedules to authenticated;
create policy winter_stable_admin_read on public.fhs_winter_stable_schedules for select to authenticated
 using ((select auth.uid()) is not null and coalesce((select auth.jwt())->'app_metadata'->>'role','')='admin');
create view public.fhs_winter_current_stable_schedules with (security_invoker=true) as
 select distinct on (event_id,organization_id) event_id,organization_id,request_id,value,source_reference,confirmed_at
 from public.fhs_winter_stable_schedules order by event_id,organization_id,revision desc;
revoke all on public.fhs_winter_current_stable_schedules from public,anon,authenticated;
grant select on public.fhs_winter_current_stable_schedules to authenticated;

-- Private definer enforces append-only and compare-and-set; clients have SELECT only.
create function fhs_winter_private.save_stable_schedule(p_input jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare
 ev constant uuid := 'b571f05e-ed23-4e07-929e-be2b73e601a5';
 org uuid; req text; current_id text; prior public.fhs_winter_stable_schedules%rowtype;
 v jsonb; k text; d text; t text; arrival date; departure date;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です'; end if;
 if jsonb_typeof(p_input) is distinct from 'object' or p_input->>'eventId' is distinct from ev::text then raise exception 'Winterの入退厩予定だけを保存できます'; end if;
 if (select count(*) from jsonb_object_keys(p_input))<>8 or not p_input ?& array['eventId','organizationId','organizationName','requestId','expected','value','reference','digest'] then raise exception '保存内容の形式を確認してください'; end if;
 if exists(select 1 from jsonb_each(p_input) x where x.key not in ('value','expected') and jsonb_typeof(x.value)<>'string')
  or jsonb_typeof(p_input->'expected') not in ('string','null') or jsonb_typeof(p_input->'value') is distinct from 'object' then raise exception '保存内容の形式を確認してください'; end if;
 org:=(p_input->>'organizationId')::uuid; req:=p_input->>'requestId'; v:=p_input->'value';
 if org is null or req !~ '^[0-9a-f]{64}$' or p_input->>'digest' !~ '^[0-9a-f]{64}$'
  or (p_input->>'expected' is not null and p_input->>'expected' !~ '^[0-9a-f]{64}$')
  or length(btrim(p_input->>'reference')) not between 1 and 100 or length(btrim(p_input->>'organizationName')) not between 1 and 100
  or (select count(*) from jsonb_object_keys(v))<>5 or not v ?& array['arrivalDate','arrivalTime','departureDate','departureTime','notes']
  or exists(select 1 from jsonb_each(v) x where jsonb_typeof(x.value)<>'string') or length(v->>'notes')>1000
 then raise exception '入退厩予定の内容を確認してください'; end if;
 foreach k in array array['arrival','departure'] loop
  d:=v->>(k||'Date'); t:=v->>(k||'Time');
  if d<>'' then
   if d !~ '^2026-[0-9]{2}-[0-9]{2}$' or to_char(d::date,'YYYY-MM-DD')<>d then raise exception '入退厩日は2026年の正しい日付を入力してください'; end if;
  end if;
  if t<>'' and (d='' or t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception '入退厩時刻と対応する日付を確認してください'; end if;
 end loop;
 arrival:=nullif(v->>'arrivalDate','')::date; departure:=nullif(v->>'departureDate','')::date;
 if departure<arrival or (departure=arrival and v->>'arrivalTime'<>'' and v->>'departureTime'<>'' and v->>'departureTime'<v->>'arrivalTime') then raise exception '退厩日時が入厩日時より前です'; end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-stable:'||org::text,0));
 select * into prior from public.fhs_winter_stable_schedules where request_id=req;
 if found then
  if prior.payload is distinct from p_input then raise exception '同じ保存番号の内容が異なります'; end if;
  return req; -- Lost-response retries do not restore an older revision.
 end if;
 perform id from public.organizations where id=org and event_id=ev and name=p_input->>'organizationName' for share;
 if not found then raise exception 'Winterの登録団体を確認できません'; end if;
 select request_id into current_id from public.fhs_winter_stable_schedules where event_id=ev and organization_id=org order by revision desc limit 1;
 if current_id is distinct from p_input->>'expected' then raise exception '入退厩予定が別の操作で更新されています。最新の内容を読み直してください'; end if;
 insert into public.fhs_winter_stable_schedules(request_id,event_id,organization_id,value,source_reference,payload,confirmed_by)
 values(req,ev,org,v,p_input->>'reference',p_input,auth.uid());
 return req;
end;$$;
revoke all on function fhs_winter_private.save_stable_schedule(jsonb) from public,anon,authenticated;
grant execute on function fhs_winter_private.save_stable_schedule(jsonb) to authenticated;
create function public.save_winter_stable_schedule(p_input jsonb)
returns text language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です'; end if;
 return fhs_winter_private.save_stable_schedule(p_input);
end;$$;
revoke all on function public.save_winter_stable_schedule(jsonb) from public,anon,authenticated;
grant execute on function public.save_winter_stable_schedule(jsonb) to authenticated;
