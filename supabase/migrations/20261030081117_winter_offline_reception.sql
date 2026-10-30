-- Additive admin-only gateway. Reuses the approved pending-request transaction; no new tables,
-- no auth relaxation, no automatic reflection/payment, and no changes to other event gateways.
create or replace function public.submit_winter_offline_item(p_receipt_id uuid,p_item jsonb,p_context jsonb,p_expected_total integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 a jsonb:=p_item->'args'; ident uuid:=(a->>'p_id')::uuid; stamp jsonb; result jsonb;
 q public.reception_requests%rowtype; e public.entries%rowtype;
 org uuid; rider uuid; horse uuid; target uuid; comp_ids uuid[]; actual jsonb; part jsonb; comps jsonb:='[]';
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部管理者が確認して送信してください';end if;
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
revoke all on function public.submit_winter_offline_item(uuid,jsonb,jsonb,integer) from public,anon;
grant execute on function public.submit_winter_offline_item(uuid,jsonb,jsonb,integer) to authenticated;
