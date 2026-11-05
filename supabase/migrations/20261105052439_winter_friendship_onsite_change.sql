-- November 2026 Winter only. Preserve saved requests, reversals, ACLs and retry keys.

CREATE OR REPLACE FUNCTION fhs_winter_internal.save_settlement_action(p_id uuid, p_action text, p_inputs jsonb, p_note text, p_reverses_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';saved public.fhs_winter_settlement_only%rowtype;orig public.fhs_winter_settlement_only%rowtype;e public.entries%rowtype;c public.competitions%rowtype;r public.riders%rowtype;h public.horses%rowtype;args jsonb;snapshot jsonb;org uuid;price integer:=0;old_price integer;total integer:=0;n integer:=0;changed boolean:=false;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '現場登録には本部ログインが必要です';end if;
 if p_id is null or p_action is null or p_action not in('add','change','withdraw') or p_inputs is null or p_note is null or length(btrim(p_note)) not between 1 and 500 then raise exception '現場変更・棄権の内容と備考を確認してください';end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-onsite-operation',0));
 perform pg_advisory_xact_lock(hashtextextended('winter-onsite:'||p_id::text,0));
 select * into saved from public.fhs_winter_settlement_only where id=p_id;
 if found then
  if saved.action_type<>p_action or saved.inputs<>p_inputs or saved.note<>btrim(p_note) or saved.reverses_id is distinct from p_reverses_id then raise exception '登録番号と現場登録内容が一致しません';end if;return p_id;
 end if;
 if p_reverses_id is not null then
  select * into orig from public.fhs_winter_settlement_only where id=p_reverses_id for update;
  if not found or orig.action_type<>p_action or orig.inputs<>p_inputs or orig.reverses_id is not null then raise exception '取り消す現場登録を確認してください';end if;
  if exists(select 1 from public.fhs_winter_settlement_only where reverses_id=p_reverses_id) then raise exception 'この現場登録は取消済みです';end if;
  org:=orig.organization_key;price:=orig.entry_fee;total:=orig.fee_amount;
 else
  if p_action='add' then raise exception '現場追加の専用操作を使用してください';end if;
  args:=jsonb_build_object('entryId',(p_inputs->>'entryId')::uuid,'before',p_inputs->'before','organizationId',(p_inputs->>'organizationId')::uuid,'competitionId',(p_inputs->>'competitionId')::uuid,'riderId',(p_inputs->>'riderId')::uuid,'horseId',(p_inputs->>'horseId')::uuid,'fromMembership',p_inputs->>'fromMembership','fromInstructor',(p_inputs->>'fromInstructor')::boolean,'membership',p_inputs->>'membership','isOp',(p_inputs->>'isOp')::boolean,'instructorConfirmed',(p_inputs->>'instructorConfirmed')::boolean,'expectedTotal',(p_inputs->>'expectedTotal')::integer,'visitorName',btrim(p_inputs->>'visitorName'));
  if args is distinct from p_inputs or exists(select 1 from jsonb_each(args) where key not in('membership','fromMembership') and value='null'::jsonb) or length(coalesce(args->>'visitorName','')) not between 1 and 100 then raise exception '現場登録の人馬・料金区分・担当者を確認してください';end if;
  select * into e from public.entries where id=(args->>'entryId')::uuid and event_id=ev for share;
  if not found or lower(e.status) in('wd','withdrawn') then raise exception 'Winterの出走中の出番を選択してください';end if;
  snapshot:=jsonb_build_object('competitionId',e.competition_id,'riderId',e.rider_id,'horseId',e.horse_id,'isOp',coalesce(e.is_op,false));
  if snapshot is distinct from args->'before' then raise exception '変更前の出番が更新されています。選び直してください';end if;
  if exists(select 1 from public.reception_requests where event_id=ev and original_entry_id=e.id and status='pending') then raise exception 'この出番には未反映の申請があります';end if;
  if exists(select 1 from public.fhs_winter_settlement_only q where event_id=ev and action_type in('change','withdraw') and inputs->>'entryId'=e.id::text and reverses_id is null and not exists(select 1 from public.fhs_winter_settlement_only v where v.reverses_id=q.id)) then raise exception 'この出番の精算専用変更・棄権は登録済みです。履歴を確認し、訂正する場合は取消後に再登録してください';end if;
  select * into r from public.riders where id=(args->>'riderId')::uuid and event_id=ev for share;
  select * into h from public.horses where id=(args->>'horseId')::uuid and event_id=ev and organization_id=(args->>'organizationId')::uuid for share;
  if r.id is null or h.id is null or not exists(select 1 from public.organizations where id=r.organization_id and event_id=ev) or not exists(select 1 from public.organizations where id=h.organization_id and event_id=ev) then raise exception '人馬の大会・所属を確認してください';end if;
  select * into c from public.competitions where id=(args->>'competitionId')::uuid and event_id=ev for share;
  if not found then raise exception 'Winterの競技を確認してください';end if;
  org:=r.organization_id;
  if p_action='withdraw' then
   if snapshot is distinct from jsonb_build_object('competitionId',c.id,'riderId',r.id,'horseId',h.id,'isOp',(args->>'isOp')::boolean) then raise exception '棄権は元の競技・人馬を選択してください';end if;
  else
   if r.is_participant=false or h.is_participant=false or (r.roster_source='shared_roster' and r.is_participant is distinct from true) or (h.roster_source='shared_roster' and h.is_participant is distinct from true) then raise exception '参加チェック済みの人馬を選択してください';end if;
   if c.official and (nullif(btrim(r.jef_member_no),'') is null or nullif(btrim(h.jef_registration_no),'') is null) then raise exception '公認競技は日馬連登録済み人馬を選択してください';end if;
   old_price:=public.winter_change_price(e.competition_id,args->>'fromMembership',coalesce(e.is_op,false),(args->>'fromInstructor')::boolean);
   price:=public.winter_change_price(c.id,args->>'membership',(args->>'isOp')::boolean,(args->>'instructorConfirmed')::boolean);
   if e.competition_id<>c.id then n:=n+1;end if;if e.rider_id<>r.id then n:=n+1;end if;if e.horse_id<>h.id then n:=n+1;end if;
   changed:=n>0 or coalesce(e.is_op,false)<>(args->>'isOp')::boolean or (e.competition_id=c.id and args->>'fromMembership' is distinct from args->>'membership' and (c.member_fee is not null or c.nonmember_fee is not null));
   if not changed then raise exception '変更する項目を選択してください';end if;
   total:=case when c.competition_no in ('①','②','③','④') and exists (
     select 1 from public.competitions old_comp
      where old_comp.id=e.competition_id and old_comp.event_id=e.event_id
        and old_comp.competition_no in ('①','②','③','④')) then 0 when n>=2 then 3000+price else 2000+greatest(0,price-old_price) end;
  end if;
  if total<>(args->>'expectedTotal')::integer then raise exception '競技料金が更新されています。料金を確認してください';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-finance:'||org::text,0));
 if p_reverses_id is not null and (fhs_winter_internal.settlement_account(org)->'account'->>'total')::bigint<total then raise exception '取消後の請求額が0円未満になります。金額訂正を確認してください';end if;
 insert into public.fhs_winter_settlement_only(id,event_id,organization_key,action_type,inputs,entry_fee,fee_amount,note,reverses_id,created_by) values(p_id,ev,org,p_action,p_inputs,price,total,btrim(p_note),p_reverses_id,auth.uid());
 return p_id;
end;$function$;

-- Only these Winter competition IDs can have zero-cost on-site change snapshots.
do $migration$
declare friendship_ids text[];
begin
 select array_agg(id::text order by competition_no) into friendship_ids
   from public.competitions where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'
   and competition_no in ('①','②','③','④') and name like 'フレンドシップ%';
 if cardinality(friendship_ids) is distinct from 4 then raise exception 'Winterフレンドシップ4競技を照合できません'; end if;
 alter table public.fhs_winter_settlement_only drop constraint winter_onsite_fee_check;
 execute format($constraint$
   alter table public.fhs_winter_settlement_only add constraint winter_onsite_fee_check check (
    entry_fee>=0 and (
     (action_type='add' and entry_fee>0 and fee_amount=entry_fee+3000) or
     (action_type='change' and entry_fee>0 and (fee_amount>=2000 or
       (fee_amount=0 and ((inputs#>>'{before,competitionId}')=any(%L::text[]) and
       (inputs->>'competitionId')=any(%L::text[])) is true))) or
     (action_type='withdraw' and entry_fee=0 and fee_amount=0)))
 $constraint$,friendship_ids,friendship_ids);
end;
$migration$;
