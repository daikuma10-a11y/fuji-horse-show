-- PREPARED ONLY. Requires organizer approval before applying to the shared DB.
-- Common storage, Winter-only write adapter. No roster, entry or payment writes.
create table public.fhs_stall_request_versions (
 request_id text primary key check(request_id ~ '^[0-9a-f]{64}$'),
 revision bigint generated always as identity,
 event_id uuid not null references public.events(id),
 organization_id uuid not null references public.organizations(id),
 value jsonb not null check(jsonb_typeof(value)='object'),
 payload jsonb not null, confirmed_by uuid not null,
 confirmed_at timestamptz not null default clock_timestamp()
);
create index fhs_stall_request_current on public.fhs_stall_request_versions(event_id,organization_id,revision desc);
create index fhs_stall_request_org on public.fhs_stall_request_versions(organization_id);
alter table public.fhs_stall_request_versions enable row level security;
revoke all on public.fhs_stall_request_versions from public,anon,authenticated;
grant select on public.fhs_stall_request_versions to authenticated;
create policy fhs_stall_request_admin_read on public.fhs_stall_request_versions for select to authenticated
 using ((select auth.uid()) is not null and coalesce((select auth.jwt())->'app_metadata'->>'role','')='admin');
create view public.fhs_current_stall_requests with(security_invoker=true) as
 select distinct on(event_id,organization_id) event_id,organization_id,request_id,value,confirmed_at
 from public.fhs_stall_request_versions order by event_id,organization_id,revision desc;
revoke all on public.fhs_current_stall_requests from public,anon,authenticated;
grant select on public.fhs_current_stall_requests to authenticated;

create function fhs_winter_private.save_stall_request(p_input jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 org uuid; req text; v jsonb; item jsonb; current_id text; prior public.fhs_stall_request_versions%rowtype;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or p_input->>'eventId' is distinct from ev::text or octet_length(p_input::text)>1000000 then raise exception 'Winterの厩舎割要望だけを保存できます';end if;
 if (select count(*) from jsonb_object_keys(p_input))<>6 or not p_input ?& array['eventId','organizationId','organizationName','requestId','expected','value']
  or exists(select 1 from jsonb_each(p_input) x where x.key not in ('value','expected') and jsonb_typeof(x.value)<>'string')
  or jsonb_typeof(p_input->'expected') not in ('string','null') or jsonb_typeof(p_input->'value') is distinct from 'object' then raise exception '保存形式を確認してください';end if;
 org:=(p_input->>'organizationId')::uuid;req:=p_input->>'requestId';v:=p_input->'value';
 if org is null or req !~ '^[0-9a-f]{64}$' or p_input->>'expected' is not null and p_input->>'expected' !~ '^[0-9a-f]{64}$'
  or length(btrim(p_input->>'organizationName')) not between 1 and 200
  or (select count(*) from jsonb_object_keys(v))<>8 or not v ?& array['imports','manual','barn','neighborId','relation','reason','corridor','confirmed']
  or exists(select 1 from jsonb_each(v) x where x.key in ('manual','barn','neighborId','relation','reason') and jsonb_typeof(x.value)<>'string')
  or jsonb_typeof(v->'imports') is distinct from 'array' or jsonb_array_length(v->'imports')>50
  or jsonb_typeof(v->'corridor') is distinct from 'boolean' or jsonb_typeof(v->'confirmed') is distinct from 'boolean'
  or length(v->>'manual')>4000 or length(v->>'reason')>1000 or v->>'barn' !~ '^(|S|[1-9]|10)$'
  or v->>'relation' not in ('','near','adjacent','same','avoid') then raise exception '厩舎割要望の内容を確認してください';end if;
 for item in select value from jsonb_array_elements(v->'imports') loop
  if jsonb_typeof(item) is distinct from 'object' or (select count(*) from jsonb_object_keys(item))<>3 or not item ?& array['digest','text','source']
   or exists(select 1 from jsonb_each(item) x where jsonb_typeof(x.value)<>'string') or item->>'digest' !~ '^[0-9a-f]{64}$'
   or length(btrim(item->>'text')) not between 1 and 4000 or length(item->>'source')>1000 then raise exception 'Excel原文の形式を確認してください';end if;
 end loop;
 if jsonb_array_length(v->'imports')<>(select count(distinct value->>'digest') from jsonb_array_elements(v->'imports')) then raise exception 'Excel原文が重複しています';end if;
 -- Serialize request edits and allocation saves under the same event lock.
 perform pg_advisory_xact_lock(hashtextextended('fhs-stall-allocation:'||ev::text,0));
 select * into prior from public.fhs_stall_request_versions where request_id=req;
 if found then
  if prior.payload is distinct from p_input then raise exception '同じ保存番号の内容が異なります';end if;
  return req;
 end if;
 perform id from public.organizations where id=org and event_id=ev and name=p_input->>'organizationName' for share;
 if not found then raise exception 'Winterの登録団体を確認できません';end if;
 if v->>'neighborId'<>'' then
  perform id from public.organizations where id=(v->>'neighborId')::uuid and id<>org and event_id=ev for share;
  if not found then raise exception '相手の団体を確認できません';end if;
 end if;
 select * into prior from public.fhs_stall_request_versions where event_id=ev and organization_id=org order by revision desc limit 1;
 current_id:=prior.request_id;
 if current_id is distinct from p_input->>'expected' then raise exception '厩舎割要望が別の操作で更新されています。最新の内容を読み直してください';end if;
 -- Originals are immutable, even when editing a request manually.
 if prior.request_id is not null and exists(select 1 from jsonb_array_elements(prior.value->'imports') old where not (v->'imports') @> jsonb_build_array(old.value)) then raise exception '保存済みのExcel原文を削除・変更できません';end if;
 insert into public.fhs_stall_request_versions(request_id,event_id,organization_id,value,payload,confirmed_by) values(req,ev,org,v,p_input,auth.uid());
 return req;
end;$$;
revoke all on function fhs_winter_private.save_stall_request(jsonb) from public,anon,authenticated;
grant execute on function fhs_winter_private.save_stall_request(jsonb) to authenticated;
create function public.save_winter_stall_request(p_input jsonb)
returns text language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です';end if;
 return fhs_winter_private.save_stall_request(p_input);
end;$$;
revoke all on function public.save_winter_stall_request(jsonb) from public,anon,authenticated;
grant execute on function public.save_winter_stall_request(jsonb) to authenticated;

-- Extend only the private validator; preserve the existing Winter public API.
create or replace function fhs_winter_private.save_stall_allocation(p_input jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 req text; current_id text; prior public.fhs_stable_allocation_versions%rowtype;
 v jsonb; opts jsonb; layout jsonb; request_row record; g jsonb; h jsonb; c jsonb; item record; gid uuid; hid uuid;
 gids uuid[]:='{}'; hids uuid[]:='{}'; assigned uuid[]:='{}'; horse_groups jsonb:='{}';
 total integer:=0; current_total integer; bid text; num text; wire boolean;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です'; end if;
 if jsonb_typeof(p_input) is distinct from 'object' or p_input->>'eventId' is distinct from ev::text then raise exception 'Winterの厩舎割だけを保存できます';end if;
 if (select count(*) from jsonb_object_keys(p_input))<>4 or not p_input ?& array['eventId','requestId','expected','value']
  or jsonb_typeof(p_input->'requestId') is distinct from 'string' or jsonb_typeof(p_input->'expected') not in ('null','string')
  or p_input->>'requestId' !~ '^[0-9a-f]{64}$' or (p_input->>'expected' is not null and p_input->>'expected' !~ '^[0-9a-f]{64}$')
  or octet_length(p_input::text)>1000000 then raise exception '厩舎割の保存形式を確認してください';end if;
 req:=p_input->>'requestId';v:=p_input->'value';opts:=v->'options';
 perform pg_advisory_xact_lock(hashtextextended('fhs-stall-allocation:'||ev::text,0));
 select * into prior from public.fhs_stable_allocation_versions where request_id=req;
 if found then
  if prior.payload is distinct from p_input then raise exception '同じ保存番号の内容が異なります';end if;
  return req;
 end if;
 select request_id into current_id from public.fhs_stable_allocation_versions where event_id=ev order by revision desc limit 1;
 if current_id is distinct from p_input->>'expected' then raise exception '別の端末で厩舎割が更新されています。保存済みの内容を読み直してください';end if;
 if jsonb_typeof(v) is distinct from 'object' or (select count(*) from jsonb_object_keys(v))<>10 or not v ?& array['version','template','groups','options','cells','tents','corridors','wireHorseSlots','registrationComplete','createdAt']
  or v->'version' is distinct from '1'::jsonb or v->>'template' is distinct from 'gotemba-2025-v1' or v->'registrationComplete' is distinct from 'true'::jsonb
  or jsonb_typeof(v->'createdAt') is distinct from 'string' or length(v->>'createdAt') not between 20 and 40
  or jsonb_typeof(v->'groups') is distinct from 'array' or jsonb_array_length(v->'groups') not between 1 and 300
  or jsonb_typeof(opts) is distinct from 'object' or jsonb_typeof(v->'cells') is distinct from 'object' or jsonb_typeof(v->'tents') is distinct from 'object'
  or jsonb_typeof(v->'corridors') is distinct from 'array' or jsonb_typeof(v->'wireHorseSlots') is distinct from 'array'
 then raise exception '厩舎割の内容を確認してください';end if;
 perform (v->>'createdAt')::timestamptz;
 for g in select value from jsonb_array_elements(v->'groups') loop
  if jsonb_typeof(g) is distinct from 'object' or (select count(*) from jsonb_object_keys(g))<>3 or not g ?& array['id','name','horses']
   or jsonb_typeof(g->'id') is distinct from 'string' or jsonb_typeof(g->'name') is distinct from 'string' or length(g->>'name') not between 1 and 200
   or jsonb_typeof(g->'horses') is distinct from 'array' or jsonb_array_length(g->'horses') not between 1 and 500 then raise exception '団体の形式を確認してください';end if;
  gid:=(g->>'id')::uuid;
  if gid=any(gids) then raise exception '団体が重複しています';end if;gids:=array_append(gids,gid);
  perform id from public.organizations where id=gid and event_id=ev and name=g->>'name' for share;
  if not found then raise exception '団体情報が変わっています。最新の団体・頭数を反映してください';end if;
  for h in select value from jsonb_array_elements(g->'horses') loop
   if jsonb_typeof(h) is distinct from 'object' or (select count(*) from jsonb_object_keys(h))<>2 or not h ?& array['id','name']
    or jsonb_typeof(h->'id') is distinct from 'string' or jsonb_typeof(h->'name') is distinct from 'string' or length(h->>'name') not between 1 and 200 then raise exception '馬の形式を確認してください';end if;
   hid:=(h->>'id')::uuid;
   if hid=any(hids) then raise exception '参加馬が重複しています';end if;hids:=array_append(hids,hid);total:=total+1;
   horse_groups:=horse_groups||jsonb_build_object(hid::text,gid::text);
   perform id from public.horses where id=hid and organization_id=gid and event_id=ev and name=h->>'name' and (roster_source is distinct from 'shared_roster' or is_participant=true) for share;
   if not found then raise exception '参加馬情報が変わっています。最新の団体・頭数を反映してください';end if;
  end loop;
 end loop;
 select count(*) into current_total from public.horses where event_id=ev and (roster_source is distinct from 'shared_roster' or is_participant=true);
 if total<>current_total then raise exception '参加馬の頭数が変わっています。最新の団体・頭数を反映してください';end if;
 if (select count(*) from jsonb_object_keys(opts))<>(case when opts ? 'layout' then 5 else 4 end) or not opts ?& array['priorityId','smallMax','useSCorridor','trOverrides']
  or jsonb_typeof(opts->'priorityId') is distinct from 'string' or ((opts->>'priorityId')<>'' and not (opts->>'priorityId')::uuid=any(gids))
  or jsonb_typeof(opts->'smallMax') is distinct from 'number' or opts->>'smallMax' !~ '^(0|[1-9][0-9]*)$' or (opts->>'smallMax')::integer not between 0 and 24
  or jsonb_typeof(opts->'useSCorridor') is distinct from 'boolean' or jsonb_typeof(opts->'trOverrides') is distinct from 'object' then raise exception '作成設定を確認してください';end if;
 -- Optional extended layout: old saved plans remain readable, new requests cannot be ignored.
 layout:=opts->'layout';
 if layout is not null then
  if jsonb_typeof(layout) is distinct from 'object' or (select count(*) from jsonb_object_keys(layout))<>5 or not layout ?& array['enabledBarns','normalHorseLimit','extraTR','requests','requestVersions']
   or jsonb_typeof(layout->'enabledBarns') is distinct from 'array' or jsonb_array_length(layout->'enabledBarns') not between 1 and 11
   or exists(select 1 from jsonb_array_elements(layout->'enabledBarns') b where jsonb_typeof(b)<>'string' or b#>>'{}' !~ '^(S|[1-9]|10)$')
   or jsonb_array_length(layout->'enabledBarns')<>(select count(distinct b) from jsonb_array_elements(layout->'enabledBarns') b)
   or jsonb_typeof(layout->'normalHorseLimit') is distinct from 'number' or layout->>'normalHorseLimit' !~ '^[1-9][0-9]*$' or (layout->>'normalHorseLimit')::integer not between 1 and 18
   or jsonb_typeof(layout->'extraTR') is distinct from 'boolean' or jsonb_typeof(layout->'requests') is distinct from 'object' or jsonb_typeof(layout->'requestVersions') is distinct from 'object'
   then raise exception '配置ルールの形式を確認してください';end if;
  for item in select key,value from jsonb_each(layout->'requestVersions') loop
   if not item.key::uuid=any(gids) or jsonb_typeof(item.value)<>'string' or item.value#>>'{}' !~ '^[0-9a-f]{64}$' then raise exception '要望の照合記録を確認してください';end if;
  end loop;
  if (select count(*) from jsonb_object_keys(layout->'requests'))<>(select count(*) from jsonb_object_keys(layout->'requestVersions')) or exists(select 1 from jsonb_object_keys(layout->'requests') k where not (layout->'requestVersions') ? k) then raise exception '要望と照合記録が一致しません';end if;
 end if;
 for request_row in select * from public.fhs_current_stall_requests where event_id=ev and organization_id=any(gids) loop
  if layout is null or layout->'requestVersions'->>request_row.organization_id::text is distinct from request_row.request_id or layout->'requests'->request_row.organization_id::text is distinct from request_row.value then raise exception '厩舎割要望が更新されています。最新の要望を配置条件に反映してください';end if;
 end loop;
 if layout is not null and exists(select 1 from jsonb_each_text(layout->'requestVersions') x where not exists(select 1 from public.fhs_current_stall_requests r where r.event_id=ev and r.organization_id=x.key::uuid and r.request_id=x.value)) then raise exception '保存済みの厩舎割要望を確認してください';end if;
 for item in select key,value from jsonb_each(opts->'trOverrides') loop
  if not item.key::uuid=any(gids) or jsonb_typeof(item.value) is distinct from 'object' or (select count(*) from jsonb_object_keys(item.value))<>2 or not item.value ?& array['count','reason']
   or jsonb_typeof(item.value->'count') is distinct from 'number' or item.value->>'count' !~ '^[1-9][0-9]*$' or (item.value->>'count')::integer not between 1 and 50
   or jsonb_typeof(item.value->'reason') is distinct from 'string' or length(btrim(item.value->>'reason')) not between 1 and 500 then raise exception '個別TR数と理由を確認してください';end if;
 end loop;
 for item in select key,value from jsonb_each(v->'cells') loop
  bid:=split_part(item.key,':',1);num:=split_part(item.key,':',2);c:=item.value;wire:=num in ('TR1','TR2');
  if item.key !~ '^(S|[1-9]|10):([1-9]|1[0-9]|2[0-4]|TR[12])$'
   or (bid='S' and wire) or (bid<>'S' and not wire and num::integer>18)
   or jsonb_typeof(c) is distinct from 'object' or (select count(*) from jsonb_object_keys(c))<>4 or not c ?& array['kind','groupId','horseId','note']
   or exists(select 1 from jsonb_each(c) x where jsonb_typeof(x.value)<>'string') or c->>'kind' not in ('horse','tr','blocked') or length(c->>'note')>500 then raise exception '馬房の使い方を確認してください';end if;
  if c->>'kind'='blocked' then
   if c->>'groupId'<>'' or c->>'horseId'<>'' then raise exception '使用不可区画には人馬を割り当てられません';end if;
   continue;
  end if;
  if not (c->>'groupId')::uuid=any(gids) then raise exception '区画の団体が見つかりません';end if;
  if c->>'kind'='tr' then
   if c->>'horseId'<>'' then raise exception 'TRには馬を割り当てられません';end if;
  else
   hid:=(c->>'horseId')::uuid;
   if horse_groups->>hid::text is distinct from c->>'groupId' or hid=any(assigned) then raise exception '馬の所属・重複配置を確認してください';end if;
   if wire and not (v->'wireHorseSlots') ? item.key then raise exception 'ワイヤー区画への馬の配置は個別確認が必要です';end if;
   assigned:=array_append(assigned,hid);
  end if;
 end loop;
 for item in select value from jsonb_array_elements(v->'wireHorseSlots') loop
  if jsonb_typeof(item.value)<>'string' or (item.value#>>'{}') !~ '^([1-9]|10):TR[12]$' or v->'cells'->(item.value#>>'{}')->>'kind' is distinct from 'horse' then raise exception 'ワイヤー区画の確認記録が異なります';end if;
 end loop;
 for item in select value from jsonb_array_elements(v->'corridors') loop
  if jsonb_typeof(item.value)<>'string' or not (item.value#>>'{}')::uuid=any(gids) then raise exception 'S通路の団体を確認してください';end if;
 end loop;
 if (select count(*) from jsonb_array_elements(v->'corridors'))<>(select count(distinct value) from jsonb_array_elements(v->'corridors')) or (select count(*) from jsonb_array_elements(v->'wireHorseSlots'))<>(select count(distinct value) from jsonb_array_elements(v->'wireHorseSlots')) then raise exception '確認記録が重複しています';end if;
 for item in select key,value from jsonb_each(v->'tents') loop
  if total<=150 or item.key !~ '^([1-9]|10):tent[12]$' or jsonb_typeof(item.value)<>'string' or not (item.value#>>'{}')::uuid=any(gids) then raise exception 'テントの配分を確認してください';end if;
 end loop;
 insert into public.fhs_stable_allocation_versions(request_id,event_id,value,payload,confirmed_by)values(req,ev,v,p_input,auth.uid());
 return req;
end;$$;
