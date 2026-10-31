-- Approved 2026-10-31: completed receipts auto-deliver; only admins resolve/reflect.
-- Reuse the existing offline validation/transaction in a private function.
create or replace function fhs_winter_internal.submit_offline_item(p_receipt_id uuid,p_item jsonb,p_context jsonb,p_expected_total integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 a jsonb:=p_item->'args'; ident uuid:=(a->>'p_id')::uuid; stamp jsonb; result jsonb;
 q public.reception_requests%rowtype; e public.entries%rowtype;
 org uuid; rider uuid; horse uuid; target uuid; comp_ids uuid[]; actual jsonb; part jsonb; comps jsonb:='[]';
begin
 if not fhs_winter_internal.can_submit_reception() then raise exception '受付の権限を確認してください';end if;
 if p_receipt_id is null or ident is null or p_item->>'type' not in ('add','change','withdraw') or p_context is null or p_expected_total is null or p_expected_total<0 then raise exception '受付番号・申請内容を確認してください';end if;
 stamp:=jsonb_build_object('version',1,'receiptId',p_receipt_id,'item',p_item,'context',p_context,'expectedTotal',p_expected_total);
 perform pg_advisory_xact_lock(hashtextextended(ident::text,0));
 select * into q from public.reception_requests where id=ident;
 if found then
  if q.event_id<>ev or q.payload->'offlineReception' is distinct from stamp or q.fee_amount is distinct from p_expected_total then raise exception '同じ申請IDの本部記録と内容が異なります。新しいIDで送り直さず本部で確認してください';end if;
  return jsonb_build_object('ids',jsonb_build_array(ident),'total',p_expected_total,'receiptId',p_receipt_id);
 end if;
 if p_item->>'type' in ('change','withdraw') then
  select * into e from public.entries where id=(a->>'p_entry_id')::uuid and event_id=ev for update;
  if not found then raise exception '変更・棄権対象の出番がありません';end if;
  actual:=jsonb_build_object('entry_id',e.id,'event_id',e.event_id,'competition_id',e.competition_id,'rider_id',e.rider_id,'horse_id',e.horse_id,'organization_id',e.organization_id,'status',e.status,'start_order',e.start_order,'is_op',coalesce(e.is_op,false));
  if actual is distinct from p_context->'entry' then raise exception '受付時から対象の出番が変わっています。要確認です';end if;
  if exists(select 1 from public.reception_requests where event_id=ev and original_entry_id=e.id and status='pending') then raise exception '同じ出番への未反映申請があります。要確認です';end if;
 elsif p_context->'entry' is distinct from 'null'::jsonb then raise exception '追加申請の照合情報が不正です';end if;
 if p_item->>'type'='withdraw' then org:=e.organization_id;rider:=e.rider_id;horse:=e.horse_id;target:=e.competition_id;
 else org:=(a->>'p_organization_id')::uuid;rider:=(a->>'p_rider_id')::uuid;horse:=(a->>'p_horse_id')::uuid;target:=(a->>'p_competition_id')::uuid;end if;
 comp_ids:=array[target];if p_item->>'type'='change' then comp_ids:=array_append(comp_ids,e.competition_id);end if;
 -- Hold the same rows through comparison and the existing save transaction (including withdrawals).
 perform 1 from public.competitions where event_id=ev and id=any(comp_ids) order by id for share;
 perform 1 from public.riders where event_id=ev and id=rider for share;
 perform 1 from public.horses where event_id=ev and id=horse for share;
 perform 1 from public.organizations where event_id=ev and id=org for share;
 select jsonb_build_object('id',o.id,'event_id',o.event_id,'name',o.name) into actual from public.organizations o where o.id=org and o.event_id=ev;
 if actual is null or actual is distinct from p_context->'organization' then raise exception '団体の登録が変更されています。要確認です';end if;
 select jsonb_build_object('id',r.id,'event_id',r.event_id,'name',r.name,'organization_id',r.organization_id,'jef_member_no',r.jef_member_no,'is_participant',r.is_participant,'roster_source',r.roster_source) into actual from public.riders r where r.id=rider and r.event_id=ev;
 if actual is null or actual is distinct from p_context->'rider' then raise exception '選手の所属・参加情報が変更されています。要確認です';end if;
 select jsonb_build_object('id',h.id,'event_id',h.event_id,'name',h.name,'organization_id',h.organization_id,'jef_registration_no',h.jef_registration_no,'is_participant',h.is_participant,'roster_source',h.roster_source) into actual from public.horses h where h.id=horse and h.event_id=ev;
 if actual is null or actual is distinct from p_context->'horse' then raise exception '馬の所属・参加情報が変更されています。要確認です';end if;
 for part in select jsonb_build_object('id',c.id,'event_id',c.event_id,'competition_no',c.competition_no,'competition_date',c.competition_date,'official',c.official,'fee',c.fee,'op_fee',c.op_fee,'member_fee',c.member_fee,'nonmember_fee',c.nonmember_fee) from public.competitions c where c.id=any(comp_ids) and c.event_id=ev order by c.id loop comps:=comps||jsonb_build_array(part);end loop;
 if comps is distinct from p_context->'competitions' or jsonb_array_length(comps)=0 then raise exception '競技の料金・参加区分・受付条件が変更されています。要確認です';end if;
 result:=public.submit_winter_reception_batch(jsonb_build_array(p_item),p_expected_total);
 -- Attach an immutable replay fingerprint only to this newly created request. Existing history is untouched.
 update public.reception_requests set payload=payload||jsonb_build_object('offlineReception',stamp) where id=ident and event_id=ev;
 return result||jsonb_build_object('receiptId',p_receipt_id);
end;$$;
revoke all on function fhs_winter_internal.submit_offline_item(uuid,jsonb,jsonb,integer) from public,anon,authenticated,service_role;
create or replace function public.submit_winter_offline_item(p_receipt_id uuid,p_item jsonb,p_context jsonb,p_expected_total integer)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部管理者が確認して送信してください';end if;
 return fhs_winter_internal.submit_offline_item(p_receipt_id,p_item,p_context,p_expected_total);
end;$$;
-- Preserve the old administrator-only public contract and its existing ACL.

create table fhs_winter_internal.received_reception(
 request_id uuid primary key,
 event_id uuid not null default 'b571f05e-ed23-4e07-929e-be2b73e601a5' check(event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'),
 receipt_id uuid not null,
 source jsonb not null check(jsonb_typeof(source)='object'),
 status text not null check(status in ('registered','review','cancelled')),
 message text not null default '',
 received_at timestamptz not null default now(),
 revision integer not null default 1 check(revision>0),
 resolution_id uuid,
 resolution jsonb,
 resolved_at timestamptz,
 resolved_by uuid
);
alter table fhs_winter_internal.received_reception enable row level security;
revoke all on table fhs_winter_internal.received_reception from public,anon,authenticated,service_role;
create index received_reception_review_time on fhs_winter_internal.received_reception(received_at,request_id) where status='review';

-- Service proxy only. Cookie/Origin checks also live in the Next route; device
-- expiry is checked here. Invalid business context is retained for the HQ PC.
create function public.receive_winter_offline_item(p_receipt_id uuid,p_source jsonb,p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r fhs_winter_internal.received_reception%rowtype; ident uuid; amount integer; previous_device text:=current_setting('fhs.winter_reception_device',true);
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception '受付専用の接続から操作してください';end if;
 if p_token_hash is null or p_token_hash!~'^[a-f0-9]{64}$' or not exists(select 1 from public.fhs_winter_settlement_devices where token_hash=p_token_hash and not revoked and expires_at>now()) then raise exception '受付接続の有効期限が切れています';end if;
 if p_receipt_id is null or jsonb_typeof(p_source) is distinct from 'object' or octet_length(p_source::text)>300000 or jsonb_typeof(p_source->'draft') is distinct from 'object' or jsonb_typeof(p_source->'context') is distinct from 'object' or coalesce(p_source#>>'{item,type}','') not in ('add','change','withdraw') or length(btrim(coalesce(p_source#>>'{item,args,p_visitor_name}',''))) not between 1 and 100 then raise exception '受付内容を確認してください';end if;
 ident:=(p_source#>>'{item,args,p_id}')::uuid;amount:=(p_source->>'total')::integer;
 if ident is null or amount is null or amount<0 then raise exception '受付番号・金額を確認してください';end if;
 perform pg_advisory_xact_lock(hashtextextended(ident::text,0));
 select * into r from fhs_winter_internal.received_reception where request_id=ident for update;
 if found then
  if r.receipt_id is distinct from p_receipt_id or r.source is distinct from p_source then raise exception '同じ受付番号の内容が異なります。元の記録は保持しています';end if;
 else
  insert into fhs_winter_internal.received_reception(request_id,receipt_id,source,status) values(ident,p_receipt_id,p_source,'review');
  perform set_config('fhs.winter_reception_device',p_token_hash,true);
  begin
   perform fhs_winter_internal.submit_offline_item(p_receipt_id,p_source->'item',p_source->'context',amount);
   update fhs_winter_internal.received_reception set status='registered',message='申請一覧に登録済み' where request_id=ident;
  exception when serialization_failure or deadlock_detected or query_canceled then raise;
   when others then
    -- The failed save subtransaction rolls back; the original received data stays.
    update fhs_winter_internal.received_reception set status='review',message=left(sqlerrm,1000) where request_id=ident;
  end;
  perform set_config('fhs.winter_reception_device',coalesce(previous_device,''),true);
  select * into r from fhs_winter_internal.received_reception where request_id=ident;
 end if;
 return jsonb_build_object('receiptId',r.receipt_id,'requestId',r.request_id,'total',(r.source->>'total')::integer,'status',r.status,'receivedAt',r.received_at);
end;$$;
revoke all on function public.receive_winter_offline_item(uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.receive_winter_offline_item(uuid,jsonb,text) to service_role;

create function public.get_winter_reception_inbox_summary()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部管理者としてログインしてください';end if;
 return jsonb_build_object('pending',(select count(*) from public.reception_requests where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and status='pending'),'review',(select count(*) from fhs_winter_internal.received_reception where status='review'));
end;$$;
revoke all on function public.get_winter_reception_inbox_summary() from public,anon,authenticated,service_role;
grant execute on function public.get_winter_reception_inbox_summary() to authenticated;

create function public.list_winter_received_reception(p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部管理者としてログインしてください';end if;
 if p_offset is null or p_offset<0 then raise exception '一覧の位置を確認してください';end if;
 return coalesce((select jsonb_agg(to_jsonb(s)) from(select request_id,receipt_id,source,status,message,received_at,revision from fhs_winter_internal.received_reception where status='review' order by received_at,request_id offset p_offset limit 100)s),'[]'::jsonb);
end;$$;
revoke all on function public.list_winter_received_reception(integer) from public,anon,authenticated,service_role;
grant execute on function public.list_winter_received_reception(integer) to authenticated;

create function public.resolve_winter_received_item(p_request_id uuid,p_action_id uuid,p_expected_revision integer,p_resolution jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r fhs_winter_internal.received_reception%rowtype; mode text:=p_resolution->>'mode';
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部管理者としてログインしてください';end if;
 if p_action_id is null or p_request_id is null or p_expected_revision is null or jsonb_typeof(p_resolution) is distinct from 'object' or coalesce(mode,'') not in ('register','cancel') or length(btrim(coalesce(p_resolution->>'reason',''))) not between 1 and 500 then raise exception '確認内容と理由を入力してください';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into r from fhs_winter_internal.received_reception where request_id=p_request_id for update;
 if not found then raise exception '受信した受付がありません';end if;
 if r.resolution_id=p_action_id then
  if r.resolution is distinct from p_resolution then raise exception '同じ操作番号の内容が異なります';end if;
  return jsonb_build_object('requestId',r.request_id,'actionId',r.resolution_id,'status',r.status);
 end if;
 if r.status<>'review' or r.revision<>p_expected_revision then raise exception '本部で確認状況が変わりました。一覧を読み直してください';end if;
 if mode='register' then
  if (p_resolution#>>'{source,item,args,p_id}')::uuid is distinct from p_request_id then raise exception '元の申請IDを保持してください';end if;
  perform fhs_winter_internal.submit_offline_item(r.receipt_id,p_resolution#>'{source,item}',p_resolution#>'{source,context}',(p_resolution#>>'{source,total}')::integer);
 end if;
 update fhs_winter_internal.received_reception set status=case when mode='register' then 'registered' else 'cancelled' end,message=p_resolution->>'reason',revision=revision+1,resolution_id=p_action_id,resolution=p_resolution,resolved_at=now(),resolved_by=auth.uid() where request_id=p_request_id returning * into r;
 return jsonb_build_object('requestId',r.request_id,'actionId',r.resolution_id,'status',r.status);
end;$$;
revoke all on function public.resolve_winter_received_item(uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.resolve_winter_received_item(uuid,uuid,integer,jsonb) to authenticated;
