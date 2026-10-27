-- Confirmed application values only. Does not modify shared identities, JEF masters,
-- entries, eligibility, charges, payments, or another season's records.
create schema if not exists fhs_winter_private;
revoke all on schema fhs_winter_private from public, anon, authenticated;
grant usage on schema fhs_winter_private to authenticated;

create table public.fhs_winter_application_credentials (
 request_id text primary key check (request_id ~ '^[0-9a-f]{64}$'),
 revision bigint generated always as identity,
 event_id uuid not null check (event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'),
 entity_id uuid not null,
 club_id uuid not null,
 target_id uuid not null,
 kind text not null check (kind in ('rider','horse')),
 value text not null check ((kind='rider' and value in ('A','B','C','未登録')) or (kind='horse' and value in ('S','中A','中B','中C','中D','未登録'))),
 source_reference text not null check (length(source_reference) between 1 and 100),
 payload jsonb not null,
 confirmed_by uuid not null,
 confirmed_at timestamptz not null default clock_timestamp(),
 foreign key(entity_id,club_id) references public.fhs_winter_reception_roster(entity_id,club_id)
);
create index fhs_winter_credentials_current_idx on public.fhs_winter_application_credentials(event_id,entity_id,club_id,revision desc);
create index fhs_winter_credentials_identity_idx on public.fhs_winter_application_credentials(entity_id,club_id);
alter table public.fhs_winter_application_credentials enable row level security;
revoke all on public.fhs_winter_application_credentials from public,anon,authenticated;
grant select on public.fhs_winter_application_credentials to authenticated;
create policy winter_credentials_admin_read on public.fhs_winter_application_credentials
 for select to authenticated using ((select auth.uid()) is not null and coalesce((select auth.jwt())->'app_metadata'->>'role','')='admin');

create view public.fhs_winter_current_credentials with (security_invoker=true) as
 select distinct on (event_id,entity_id,club_id) event_id,entity_id,club_id,target_id,kind,value,request_id,source_reference,confirmed_at
 from public.fhs_winter_application_credentials order by event_id,entity_id,club_id,revision desc;
revoke all on public.fhs_winter_current_credentials from public,anon,authenticated;
grant select on public.fhs_winter_current_credentials to authenticated;

-- Private definer is needed to enforce append-only writes: clients have SELECT only.
-- The public API wrapper is invoker. Both functions explicitly require admin claims.
create function fhs_winter_private.save_application_credential(p_input jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 entity uuid; club uuid; target uuid; req text; current_id text; prior public.fhs_winter_application_credentials%rowtype;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です'; end if;
 if jsonb_typeof(p_input) is distinct from 'object' or p_input->>'eventId' is distinct from ev::text then raise exception 'Winterの資格・グレードだけを保存できます'; end if;
 if (select count(*) from jsonb_object_keys(p_input))<>13 or not p_input ?& array['eventId','entityId','clubId','targetId','kind','name','jef','value','requestId','expected','digest','reference','location'] then raise exception '保存内容の形式を確認してください'; end if;
 if exists(select 1 from jsonb_each(p_input) x where x.key<>'expected' and jsonb_typeof(x.value)<>'string') or jsonb_typeof(p_input->'expected') not in ('string','null') then raise exception '保存内容の形式を確認してください'; end if;
 entity:=(p_input->>'entityId')::uuid; club:=(p_input->>'clubId')::uuid; target:=(p_input->>'targetId')::uuid; req:=p_input->>'requestId';
 if entity is null or club is null or target is null or req !~ '^[0-9a-f]{64}$' or p_input->>'digest' !~ '^[0-9a-f]{64}$'
  or (p_input->>'expected' is not null and p_input->>'expected' !~ '^[0-9a-f]{64}$')
  or length(btrim(p_input->>'reference')) not between 1 and 100 or length(p_input->>'location') not between 1 and 220
  or length(p_input->>'name') not between 1 and 100 or length(p_input->>'jef')>100
  or not ((p_input->>'kind'='rider' and p_input->>'value' in ('A','B','C','未登録')) or (p_input->>'kind'='horse' and p_input->>'value' in ('S','中A','中B','中C','中D','未登録')))
 then raise exception '資格級・グレード宣言を原本で確認してください'; end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-credential:'||entity::text||':'||club::text,0));
 select * into prior from public.fhs_winter_application_credentials where request_id=req;
 if found then
  if prior.payload is distinct from p_input then raise exception '同じ保存番号の内容が異なります'; end if;
  return req; -- A retry never changes the latest revision, even after a newer import.
 end if;
 perform e.id from public.fhs_roster_entities e
 join public.fhs_winter_participants p on p.entity_id=e.id and p.club_id=club and p.event_id=ev
 join public.fhs_winter_reception_roster b on b.entity_id=e.id and b.club_id=club
 where e.id=entity and e.archived_at is null and e.kind=p_input->>'kind'
 and p.name_snapshot=p_input->>'name' and coalesce(p.jef_number_snapshot,'')=p_input->>'jef'
 and e.name=p.name_snapshot and coalesce(e.jef_number,'')=coalesce(p.jef_number_snapshot,'')
 and target=case when e.kind='rider' then b.rider_id else b.horse_id end
 for share of e,p,b;
 if not found then raise exception 'Winter参加名簿の人馬・所属・番号が一致しません'; end if;
 if p_input->>'kind'='rider' then
  perform id from public.riders where id=target and event_id=ev and is_participant=true and name=p_input->>'name' and coalesce(jef_member_no,'')=p_input->>'jef' for share;
 else
  perform id from public.horses where id=target and event_id=ev and is_participant=true and name=p_input->>'name' and coalesce(jef_registration_no,'')=p_input->>'jef' for share;
 end if;
 if not found then raise exception 'Winter人馬の保存先を確認できません'; end if;
 select request_id into current_id from public.fhs_winter_application_credentials where event_id=ev and entity_id=entity and club_id=club order by revision desc limit 1;
 if current_id is distinct from p_input->>'expected' then raise exception '資格・グレードが別の操作で更新されています。再照合してください'; end if;
 insert into public.fhs_winter_application_credentials(request_id,event_id,entity_id,club_id,target_id,kind,value,source_reference,payload,confirmed_by)
 values(req,ev,entity,club,target,p_input->>'kind',p_input->>'value',p_input->>'reference',p_input,auth.uid());
 return req;
end;$$;
revoke all on function fhs_winter_private.save_application_credential(jsonb) from public,anon,authenticated;
grant execute on function fhs_winter_private.save_application_credential(jsonb) to authenticated;

create function public.save_winter_application_credential(p_input jsonb)
returns text language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です'; end if;
 return fhs_winter_private.save_application_credential(p_input);
end;$$;
revoke all on function public.save_winter_application_credential(jsonb) from public,anon,authenticated;
grant execute on function public.save_winter_application_credential(jsonb) to authenticated;
