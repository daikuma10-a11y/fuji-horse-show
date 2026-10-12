-- Winter-only reversible request operations. Saved charges and payment history are immutable.
create table public.fhs_winter_request_effects(
 request_id uuid primary key references public.reception_requests(id) on delete cascade,
 event_id uuid not null check(event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'),
 before_entry jsonb,after_entry jsonb,created_at timestamptz not null default now(),created_by uuid not null
);
create table public.fhs_winter_request_placements(
 request_id uuid primary key references public.reception_requests(id) on delete cascade,
 event_id uuid not null check(event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'),requested_order integer,entry_id uuid not null,created_at timestamptz not null default now()
);
create table public.fhs_winter_request_cancellations(
 request_id uuid primary key references public.reception_requests(id) on delete cascade,
 event_id uuid not null check(event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'),previous_status text not null,entry_id uuid,reason text not null check(length(btrim(reason)) between 1 and 300),before_entry jsonb,after_entry jsonb,created_at timestamptz not null default now(),created_by uuid not null
);
DO $$declare t text;begin foreach t in array array['fhs_winter_request_effects','fhs_winter_request_placements','fhs_winter_request_cancellations'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy winter_action_admin_read on public.%I for select to authenticated using ((select auth.uid()) is not null and (select auth.jwt()->''app_metadata''->>''role'')=''admin'')',t);
end loop;end$$;
create or replace function fhs_winter_internal.capture_request_effect(p_id uuid,p_after boolean)
returns void language plpgsql security definer set search_path='' as $$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';q public.reception_requests%rowtype;snapshot jsonb;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部管理者権限が必要です';end if;
 select * into q from public.reception_requests where id=p_id and event_id=ev;
 if not found then raise exception 'Winterの申請を確認してください';end if;
 if p_after then
  if q.status<>'reflected' or q.entry_id is null then raise exception '反映後の出番を確認できません';end if;
  select to_jsonb(e) into snapshot from public.entries e where e.id=q.entry_id and e.event_id=ev;
  if snapshot is null then raise exception '反映後の出番を確認できません';end if;
  update public.fhs_winter_request_effects set after_entry=snapshot where request_id=q.id and event_id=ev;
  if not found then raise exception '反映前の記録を確認できません';end if;
 else
  if q.status<>'pending' then raise exception '未反映の申請を確認してください';end if;
  if q.request_type<>'add' then select to_jsonb(e) into snapshot from public.entries e where e.id=q.original_entry_id and e.event_id=ev;end if;
  insert into public.fhs_winter_request_effects(request_id,event_id,before_entry,created_by)values(q.id,ev,snapshot,auth.uid()) on conflict(request_id) do nothing;
 end if;
end;$$;
revoke all on function fhs_winter_internal.capture_request_effect(uuid,boolean) from public,anon,authenticated;

create or replace function fhs_winter_internal.reflect_request_at_position(p_request_id uuid,p_position integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';q public.reception_requests%rowtype;a public.fhs_winter_request_placements%rowtype;target uuid;eid uuid;ids uuid[];maxpos integer;supports_position boolean;lock_comp uuid;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部管理者権限が必要です';end if;
 select * into q from public.reception_requests where id=p_request_id and event_id=ev for update;
 if not found then raise exception 'Winterの申請を確認してください';end if;
 select * into a from public.fhs_winter_request_placements where request_id=q.id;
 if found then
  if a.requested_order is distinct from p_position then raise exception '反映位置が前回と異なります。出番表で確認してください';end if;
  return a.entry_id;
 end if;
 if q.status='reflected' then
  if p_position is not null then raise exception '反映済みです。出番表の編集で位置を確認してください';end if;
  return q.entry_id;
 end if;
 if q.status<>'pending' then raise exception '未反映の申請を選択してください';end if;
 supports_position:=q.request_type='add' or (q.request_type='change' and coalesce((q.payload->>'treatedAsWithdrawAdd')::boolean,false));
 if p_position is not null and not supports_position then raise exception '通常変更・棄権の反映位置は指定できません';end if;
 target:=coalesce(q.to_competition_id,q.from_competition_id);
 if supports_position then
  for lock_comp in select distinct value from unnest(array[q.from_competition_id,q.to_competition_id])t(value) where value is not null order by value loop perform pg_advisory_xact_lock(hashtextextended('winter-order:'||lock_comp::text,0));end loop;
  select count(*)+1 into maxpos from public.entries where event_id=ev and competition_id=target and lower(status) not in('wd','withdrawn') and (q.request_type<>'change' or id<>q.original_entry_id);
  if p_position is not null and (p_position<1 or p_position>maxpos) then raise exception '出番表が更新されています。反映位置を確認し直してください';end if;
 end if;
 eid:=case when q.request_type='change' then public.reflect_winter_change_request(q.id) else public.reflect_winter_reception_request(q.id) end;
 if p_position is not null then
  select coalesce(array_agg(id order by start_order,created_at,id),'{}') into ids from public.entries where event_id=ev and competition_id=target and lower(status) not in('wd','withdrawn') and id<>eid;
  ids:=coalesce(ids[1:p_position-1],'{}')||array[eid]||coalesce(ids[p_position:cardinality(ids)],'{}');
  update public.entries e set start_order=x.n,updated_at=now() from (select value as id,ord::integer as n from unnest(ids) with ordinality as a(value,ord))x where e.id=x.id and e.event_id=ev;
 end if;
 insert into public.fhs_winter_request_placements(request_id,event_id,requested_order,entry_id)values(q.id,ev,p_position,eid);
 return eid;
end;$$;
revoke all on function fhs_winter_internal.reflect_request_at_position(uuid,integer) from public,anon,authenticated;
grant execute on function fhs_winter_internal.reflect_request_at_position(uuid,integer) to authenticated;
create or replace function public.reflect_winter_request_at_position(p_request_id uuid,p_position integer default null)returns uuid language sql security invoker set search_path='' as $$select fhs_winter_internal.reflect_request_at_position(p_request_id,p_position);$$;
revoke all on function public.reflect_winter_request_at_position(uuid,integer) from public,anon,authenticated;
grant execute on function public.reflect_winter_request_at_position(uuid,integer) to authenticated;

create or replace function fhs_winter_internal.cancel_request(p_request_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';q public.reception_requests%rowtype;log public.fhs_winter_request_cancellations%rowtype;effect public.fhs_winter_request_effects%rowtype;e public.entries%rowtype;original public.entries%rowtype;before_e jsonb;after_e jsonb;source_id uuid;comp uuid;pos integer;fingerprint text[]:=array['id','event_id','competition_id','rider_id','horse_id','organization_id','is_op','status','request_note'];key text;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部管理者権限が必要です';end if;
 if p_request_id is null or length(btrim(coalesce(p_reason,''))) not between 1 and 300 then raise exception '申請と取消理由を確認してください';end if;
 select * into q from public.reception_requests where id=p_request_id and event_id=ev for update;
 if not found then raise exception 'Winterの申請を確認してください';end if;
 if q.request_type='withdraw' then return fhs_winter_internal.restore_withdraw(q.id,p_reason);end if;
 select * into log from public.fhs_winter_request_cancellations where request_id=q.id;
 if found then
  if log.reason<>btrim(p_reason) then raise exception '前回の取消理由と一致しません';end if;
  return jsonb_build_object('requestId',log.request_id,'entryId',log.entry_id,'cancelledAt',log.created_at);
 end if;
 if q.request_type not in('add','change') or q.status not in('pending','reflected') then raise exception '追加・変更の未取消申請を選択してください';end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-finance:'||q.organization_id::text,0));
 select * into effect from public.fhs_winter_request_effects where request_id=q.id and event_id=ev;
 source_id:=coalesce((effect.before_entry->>'id')::uuid,q.original_entry_id);
 if q.status='reflected' then
  for comp in select distinct value from unnest(array[q.from_competition_id,q.to_competition_id])t(value) where value is not null order by value loop perform pg_advisory_xact_lock(hashtextextended('winter-order:'||comp::text,0));end loop;
  select * into e from public.entries where id=q.entry_id and event_id=ev for update;
  if not found or lower(e.status) in('wd','withdrawn') then raise exception '反映後の出番が変更されています。最新の申請を先に確認してください';end if;
  if exists(select 1 from public.reception_requests x where x.event_id=ev and x.id<>q.id and (x.original_entry_id=any(array[q.entry_id,source_id]) or x.entry_id=any(array[q.entry_id,source_id])) and (x.status='pending' or (x.status='reflected' and x.reflected_at>q.reflected_at))) then raise exception '反映後の別申請があります。最新の申請を先に確認してください';end if;
  if effect.after_entry is not null then
   foreach key in array fingerprint loop if to_jsonb(e)->key is distinct from effect.after_entry->key then raise exception '反映後の人馬・所属・参加区分が変更されています';end if;end loop;
  else
   -- Legacy reflected additions can be safely cancelled using their immutable request fields.
   if q.request_type<>'add' then raise exception '変更前の保存記録がありません。本部で原本を確認してください';end if;
   if e.competition_id<>q.to_competition_id or e.rider_id<>q.rider_id or e.horse_id<>q.horse_id or e.organization_id<>q.organization_id or coalesce(e.is_op,false)<>coalesce((q.payload#>>'{add,isOp}')::boolean,false) then raise exception '反映後の人馬が変更されています';end if;
  end if;
  before_e:=to_jsonb(e);
  if q.request_type='add' then
   update public.entries set status='withdrawn',start_order=null,updated_at=now() where id=e.id and event_id=ev;
  else
   if effect.before_entry is null then raise exception '変更前の出番記録を確認できません';end if;
   original:=jsonb_populate_record(null::public.entries,effect.before_entry);
   if original.event_id<>ev or original.id is distinct from (q.payload#>>'{inputs,entryId}')::uuid then raise exception '変更前の大会・出番が一致しません';end if;
   if q.entry_id<>original.id then
    if not exists(select 1 from public.entries x where x.id=original.id and x.event_id=ev and lower(x.status) in('wd','withdrawn') and x.competition_id=original.competition_id and x.rider_id=original.rider_id and x.horse_id=original.horse_id and x.organization_id=original.organization_id and coalesce(x.is_op,false)=coalesce(original.is_op,false)) then raise exception '変更前の人馬が更新されています';end if;
    update public.entries set status='withdrawn',start_order=null,updated_at=now() where id=e.id and event_id=ev;
   end if;
   select coalesce(max(start_order),0)+1 into pos from public.entries where event_id=ev and competition_id=original.competition_id and lower(status) not in('wd','withdrawn') and id<>original.id;
   update public.entries set competition_id=original.competition_id,rider_id=original.rider_id,horse_id=original.horse_id,organization_id=original.organization_id,is_op=original.is_op,status=original.status,request_note=original.request_note,start_order=pos,updated_at=now() where id=original.id and event_id=ev;
   select to_jsonb(x) into after_e from public.entries x where id=original.id and event_id=ev;
  end if;
  for comp in select distinct value from unnest(array[q.from_competition_id,q.to_competition_id])t(value) where value is not null loop
   with numbered as(select id,row_number() over(order by start_order nulls last,created_at,id)::integer n from public.entries where event_id=ev and competition_id=comp and lower(status) not in('wd','withdrawn'))update public.entries x set start_order=n.n,updated_at=now() from numbered n where x.id=n.id and x.event_id=ev;
  end loop;
 end if;
 insert into public.fhs_winter_request_cancellations(request_id,event_id,previous_status,entry_id,reason,before_entry,after_entry,created_by)values(q.id,ev,q.status,q.entry_id,btrim(p_reason),before_e,after_e,auth.uid())returning * into log;
 update public.reception_requests set status='cancelled' where id=q.id and event_id=ev;
 return jsonb_build_object('requestId',q.id,'entryId',q.entry_id,'cancelledAt',log.created_at);
end;$$;
revoke all on function fhs_winter_internal.cancel_request(uuid,text) from public,anon,authenticated;
grant execute on function fhs_winter_internal.cancel_request(uuid,text) to authenticated;
create or replace function public.cancel_winter_request(p_request_id uuid,p_reason text)returns jsonb language sql security invoker set search_path='' as $$select fhs_winter_internal.cancel_request(p_request_id,p_reason);$$;
revoke all on function public.cancel_winter_request(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_winter_request(uuid,text) to authenticated;

CREATE OR REPLACE FUNCTION public.reflect_winter_reception_request(p_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_event constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
  q public.reception_requests%rowtype; c public.competitions%rowtype; e public.entries%rowtype;
  v_comp uuid; v_entry uuid; v_position integer;
begin
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です'; end if;
  select * into q from public.reception_requests where id=p_request_id and event_id=v_event for update;
  if not found then raise exception 'Winterの申請が見つかりません'; end if;
  if q.status='reflected' then return q.entry_id; end if;
  if q.status<>'pending' or q.request_type not in ('add','withdraw') then raise exception 'この申請は反映できません'; end if;
  v_comp:=case when q.request_type='add' then q.to_competition_id else q.from_competition_id end;
  perform pg_advisory_xact_lock(hashtextextended('winter-order:'||v_comp::text,0));
  select * into c from public.competitions where id=v_comp and event_id=v_event for share;
  if not found then raise exception '競技の大会を確認してください'; end if;
  if q.request_type='add' then
    if q.payload->>'masterFormVersion'='1' then perform fhs_winter_internal.check_master_target(q.id);else
    if not exists(select 1 from public.riders where id=q.rider_id and event_id=v_event and organization_id=q.organization_id and (not c.official or nullif(btrim(jef_member_no),'') is not null))
      or not exists(select 1 from public.horses where id=q.horse_id and event_id=v_event and organization_id=q.organization_id and (not c.official or nullif(btrim(jef_registration_no),'') is not null))
      then raise exception '所属と公認登録を再確認してください'; end if;
    end if;
    if coalesce((q.payload#>>'{add,isOp}')::boolean,false) and (c.official or c.op_fee is null) then raise exception 'OP参加を確認してください'; end if;
    perform fhs_winter_internal.capture_request_effect(q.id,false);
    v_entry:=q.id;
    if exists(select 1 from public.entries where id=v_entry) then raise exception '出番IDが既に使われています'; end if;
    select case when c.official then 0 else coalesce(max(start_order),0)+1 end into v_position from public.entries where event_id=v_event and competition_id=v_comp and lower(status) not in ('wd','withdrawn');
    insert into public.entries(id,event_id,competition_id,rider_id,horse_id,organization_id,start_order,status,source,is_op)
      values(v_entry,v_event,v_comp,q.rider_id,q.horse_id,q.organization_id,v_position,'active','winter-reception',coalesce((q.payload#>>'{add,isOp}')::boolean,false));
    if q.payload->>'masterFormVersion'='1' then update public.entries set request_note=q.payload#>>'{add,note}' where id=v_entry and event_id=v_event;end if;
  else
    select * into e from public.entries where id=q.original_entry_id and event_id=v_event and competition_id=v_comp for update;
    if not found or lower(e.status) in ('wd','withdrawn') then raise exception '棄権対象が変更されています。本部で確認してください'; end if;
    perform fhs_winter_internal.capture_request_effect(q.id,false);
    v_entry:=e.id;
    update public.entries set status='withdrawn',start_order=null,updated_at=now() where id=e.id and event_id=v_event;
  end if;
  with numbered as (select id,row_number() over(order by start_order nulls last,created_at,id)::integer as n from public.entries where event_id=v_event and competition_id=v_comp and lower(status) not in ('wd','withdrawn'))
    update public.entries target set start_order=n.n,updated_at=now() from numbered n where target.id=n.id and target.event_id=v_event;
  update public.reception_requests set status='reflected',entry_id=v_entry,reflected_at=now() where id=q.id and event_id=v_event;
 perform fhs_winter_internal.capture_request_effect(q.id,true);
  return v_entry;
end; $function$;

CREATE OR REPLACE FUNCTION public.reflect_winter_change_request(p_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_event constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 q public.reception_requests%rowtype; e public.entries%rowtype; c public.competitions%rowtype;
 comp uuid; entry uuid; position integer; op boolean; snapshot jsonb; replace_entry boolean;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です'; end if;
 select * into q from public.reception_requests where id=p_request_id and event_id=v_event for update;
 if not found or q.request_type<>'change' then raise exception 'Winterの変更申請を確認してください'; end if;
 if q.status='reflected' then return q.entry_id; end if;
 if q.status<>'pending' then raise exception '未反映の変更申請を選択してください'; end if;
 -- Stable lock order for moves between two competitions.
 for comp in select distinct value from unnest(array[q.from_competition_id,q.to_competition_id]) as t(value) order by value loop
  perform pg_advisory_xact_lock(hashtextextended('winter-order:'||comp::text,0));
 end loop;
 select * into e from public.entries where id=q.original_entry_id and event_id=v_event for update;
 if not found or lower(e.status) in ('wd','withdrawn') then raise exception '変更対象が更新されています'; end if;
 snapshot:=jsonb_build_object('competitionId',e.competition_id,'riderId',e.rider_id,'horseId',e.horse_id,'isOp',coalesce(e.is_op,false));
 if (q.payload->>'masterFormVersion'='1' and e.organization_id is distinct from (q.payload#>>'{inputs,beforeOrganizationId}')::uuid) or snapshot is distinct from q.payload->'before' then raise exception '変更対象が更新されています。申請を本部で確認してください'; end if;
 select * into c from public.competitions where id=q.to_competition_id and event_id=v_event for share;
 if not found then raise exception 'Winterの競技を確認してください'; end if;
 if q.payload->>'masterFormVersion'='1' then perform fhs_winter_internal.check_master_target(q.id);else
 if not exists(select 1 from public.riders where id=q.rider_id and event_id=v_event and organization_id=q.organization_id and (not c.official or nullif(btrim(jef_member_no),'') is not null)) or not exists(select 1 from public.horses where id=q.horse_id and event_id=v_event and organization_id=q.organization_id and (not c.official or nullif(btrim(jef_registration_no),'') is not null)) then raise exception '変更後の所属・公認登録を再確認してください'; end if;
 end if;
 op:=(q.payload#>>'{change,toIsOp}')::boolean;
 if op is null or (op and (c.official or c.op_fee is null)) then raise exception '参加区分を確認してください'; end if;
 perform fhs_winter_internal.capture_request_effect(q.id,false);
 replace_entry:=coalesce((q.payload->>'treatedAsWithdrawAdd')::boolean,false);
 position:=e.start_order;
 if replace_entry or e.competition_id<>c.id then
  select case when c.official then 0 else coalesce(max(start_order),0)+1 end into position from public.entries where event_id=v_event and competition_id=c.id and lower(status) not in ('wd','withdrawn');
 end if;
 if replace_entry then
  entry:=q.id;
  update public.entries set status='withdrawn',start_order=null,updated_at=now() where id=e.id and event_id=v_event;
  insert into public.entries(id,event_id,competition_id,rider_id,horse_id,organization_id,start_order,status,source,is_op) values(entry,v_event,c.id,q.rider_id,q.horse_id,q.organization_id,position,'active','winter-reception',op);
 else
  entry:=e.id;
  update public.entries set competition_id=c.id,rider_id=q.rider_id,horse_id=q.horse_id,organization_id=q.organization_id,start_order=position,is_op=op,updated_at=now() where id=e.id and event_id=v_event;
 end if;
 for comp in select distinct value from unnest(array[q.from_competition_id,q.to_competition_id]) as t(value) loop
  with numbered as (select id,row_number() over(order by start_order nulls last,created_at,id)::integer as n from public.entries where event_id=v_event and competition_id=comp and lower(status) not in ('wd','withdrawn')) update public.entries target set start_order=n.n,updated_at=now() from numbered n where target.id=n.id and target.event_id=v_event;
 end loop;
 update public.reception_requests set status='reflected',entry_id=entry,reflected_at=now() where id=q.id and event_id=v_event;
 perform fhs_winter_internal.capture_request_effect(q.id,true);
 return entry;
end; $function$;
