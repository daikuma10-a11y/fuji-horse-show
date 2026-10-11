-- Extend Winter on-site audit ledger; formal entries are read/locked, never changed.
alter table public.fhs_winter_settlement_only add column action_type text not null default 'add' check(action_type in('add','change','withdraw'));
alter table public.fhs_winter_settlement_only drop constraint fhs_winter_settlement_only_entry_fee_check;
alter table public.fhs_winter_settlement_only drop constraint fhs_winter_settlement_only_check;
alter table public.fhs_winter_settlement_only add constraint winter_onsite_fee_check check(entry_fee>=0 and ((action_type='add' and entry_fee>0 and fee_amount=entry_fee+3000) or (action_type='change' and entry_fee>0 and fee_amount>=2000) or (action_type='withdraw' and entry_fee=0 and fee_amount=0)));
create function fhs_winter_internal.save_settlement_action(p_id uuid,p_action text,p_inputs jsonb,p_note text,p_reverses_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
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
   total:=case when n>=2 then 3000+price else 2000+greatest(0,price-old_price) end;
  end if;
  if total<>(args->>'expectedTotal')::integer then raise exception '競技料金が更新されています。料金を確認してください';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-finance:'||org::text,0));
 if p_reverses_id is not null and (fhs_winter_internal.settlement_account(org)->'account'->>'total')::bigint<total then raise exception '取消後の請求額が0円未満になります。金額訂正を確認してください';end if;
 insert into public.fhs_winter_settlement_only(id,event_id,organization_key,action_type,inputs,entry_fee,fee_amount,note,reverses_id,created_by) values(p_id,ev,org,p_action,p_inputs,price,total,btrim(p_note),p_reverses_id,auth.uid());
 return p_id;
end;$$;
revoke all on function fhs_winter_internal.save_settlement_action(uuid,text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function fhs_winter_internal.save_settlement_action(uuid,text,jsonb,text,uuid) to authenticated;
create function public.save_winter_settlement_action(p_id uuid,p_action text,p_inputs jsonb,p_note text,p_reverses_id uuid default null) returns uuid language sql security invoker set search_path='' as $$select fhs_winter_internal.save_settlement_action(p_id,p_action,p_inputs,p_note,p_reverses_id);$$;
revoke all on function public.save_winter_settlement_action(uuid,text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.save_winter_settlement_action(uuid,text,jsonb,text,uuid) to authenticated;
create function fhs_winter_internal.save_settlement_actions_batch(p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare x jsonb;ids jsonb:='[]';
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '現場登録には本部ログインが必要です';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 100 then raise exception '1〜100件の一覧を入力してください';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r group by r->>'id' having count(*)>1) then raise exception '登録番号が重複しています';end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-onsite-operation',0));
 -- Match the existing addition batch lock order to avoid finance/entry lock inversion.
 perform pg_advisory_xact_lock(hashtextextended('winter-finance:'||r.organization_id::text,0)) from public.riders r where r.id in(select (a->'inputs'->>'riderId')::uuid from jsonb_array_elements(p_rows) a) order by r.organization_id;
 for x in select value from jsonb_array_elements(p_rows) loop ids:=ids||jsonb_build_array(fhs_winter_internal.save_settlement_action((x->>'id')::uuid,x->>'action',x->'inputs',x->>'note'));end loop;
 return ids;
end;$$;
revoke all on function fhs_winter_internal.save_settlement_actions_batch(jsonb) from public,anon,authenticated;
grant execute on function fhs_winter_internal.save_settlement_actions_batch(jsonb) to authenticated;
create function public.save_winter_settlement_actions_batch(p_rows jsonb) returns jsonb language sql security invoker set search_path='' as $$select fhs_winter_internal.save_settlement_actions_batch(p_rows);$$;
revoke all on function public.save_winter_settlement_actions_batch(jsonb) from public,anon,authenticated;
grant execute on function public.save_winter_settlement_actions_batch(jsonb) to authenticated;

create or replace function fhs_winter_internal.settlement_account(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5'; org jsonb;initial bigint;horses jsonb;headcount bigint;extra bigint;paid bigint;advance jsonb;instruction jsonb;lines jsonb;corrections jsonb;adjustment bigint;pending bigint;missing bigint;warnings jsonb:='[]';a jsonb;version text;payment bigint;
begin
 select jsonb_build_object('id',id,'event_id',event_id,'name',name) into org from public.organizations where id=p_org and event_id=ev;
 if org is null then raise exception 'Winterの団体を選択してください';end if;
 select coalesce(sum(entry_fee),0) into initial from public.fhs_winter_initial_entries where event_id=ev and coalesce(inputs->>'billingOrganizationId',inputs->>'organizationId')=p_org::text;
 select count(*),coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by id),'[]') into headcount,horses from public.horses where event_id=ev and organization_id=p_org and is_participant is distinct from false and (roster_source is distinct from 'shared_roster' or is_participant=true);
 select jsonb_build_object('paid_amount',paid_amount,'updated_at',updated_at) into advance from public.settlement_prepayments where event_id=ev and organization_key=p_org::text;
 paid:=coalesce((advance->>'paid_amount')::bigint,0);
 select jsonb_build_object('payment_method',payment_method,'bank_details',bank_details,'updated_at',updated_at) into instruction from public.settlement_payment_instructions where event_id=ev and organization_key=p_org::text;
 select coalesce(sum(case when reverses_id is null then amount else -amount end),0) into payment from public.fhs_winter_extra_payments where event_id=ev and organization_key=p_org;
 select coalesce(sum(delta),0),coalesce(jsonb_agg(jsonb_build_object('id',id,'delta',delta,'reason',reason,'before_total',before_total,'after_total',after_total) order by sequence),'[]') into adjustment,corrections from public.fhs_winter_charge_adjustments where event_id=ev and organization_key=p_org;
 select coalesce(sum(fee_amount),0) into extra from public.reception_requests where event_id=ev and organization_id=p_org and status='reflected';
 select extra+coalesce(sum(case when reverses_id is null then fee_amount else -fee_amount end),0) into extra from public.fhs_winter_settlement_only where event_id=ev and organization_key=p_org;
 select count(*) into pending from public.reception_requests where event_id=ev and organization_id=p_org and status='pending';
 select count(*) into missing from public.entries e where e.event_id=ev and e.organization_id=p_org
 and not exists(select 1 from public.fhs_winter_initial_entries i where i.id=e.id and i.event_id=ev)
 and not exists(select 1 from public.reception_requests q where q.entry_id=e.id and q.event_id=ev and q.status='reflected');
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'action',case q.request_type when 'add' then '追加' when 'change' then '変更' else '棄権' end,
 'competitionLabel',case when bc.id is not null and bc.id<>c.id then bc.name||' → ' else '' end||case when c.competition_no~'^[0-9]+$' then '第'||c.competition_no||'競技 ' else c.competition_no||' ' end||c.name,
 'rider',case when br.id is not null and br.id<>r.id then br.name||' → ' else '' end||r.name,
 'horse',case when bh.id is not null and bh.id<>h.id then bh.name||' → ' else '' end||h.name,'amount',q.fee_amount)
 order by c.competition_date,coalesce(nullif(regexp_replace(c.competition_no,'[^0-9]','','g'),''),'0')::integer,q.id),'[]') into lines
 from public.reception_requests q join public.competitions c on c.id=q.target_competition_id and c.event_id=ev join public.riders r on r.id=q.rider_id and r.event_id=ev join public.horses h on h.id=q.horse_id and h.event_id=ev
 left join public.competitions bc on bc.id=nullif(q.payload->'before'->>'competitionId','')::uuid and bc.event_id=ev
 left join public.riders br on br.id=nullif(q.payload->'before'->>'riderId','')::uuid and br.event_id=ev
 left join public.horses bh on bh.id=nullif(q.payload->'before'->>'horseId','')::uuid and bh.event_id=ev
 where q.event_id=ev and q.organization_id=p_org and q.status='reflected';
 if jsonb_array_length(lines)<>(select count(*) from public.reception_requests where event_id=ev and organization_id=p_org and status='reflected') then raise exception '明細の人馬・競技を確認できません';end if;
 select lines||coalesce(jsonb_agg(jsonb_build_object('id',q.id,'action',case q.action_type when 'change' then '現場変更' when 'withdraw' then '現場棄権' else '現場追加' end||case when q.reverses_id is null then '' else '取消' end,'competitionLabel',case when bc.id is not null and bc.id<>c.id then bc.name||' → ' else '' end||case when c.competition_no~'^[0-9]+$' then '第'||c.competition_no||'競技 ' else c.competition_no||' ' end||c.name,'rider',case when br.id is not null and br.id<>r.id then br.name||' → ' else '' end||r.name,'horse',case when bh.id is not null and bh.id<>h.id then bh.name||' → ' else '' end||h.name,'amount',case when q.reverses_id is null then q.fee_amount else -q.fee_amount end) order by q.created_at,q.id),'[]') into lines
 from public.fhs_winter_settlement_only q join public.competitions c on c.id=(q.inputs->>'competitionId')::uuid and c.event_id=ev join public.riders r on r.id=(q.inputs->>'riderId')::uuid and r.event_id=ev join public.horses h on h.id=(q.inputs->>'horseId')::uuid and h.event_id=ev left join public.competitions bc on bc.id=nullif(q.inputs->'before'->>'competitionId','')::uuid and bc.event_id=ev left join public.riders br on br.id=nullif(q.inputs->'before'->>'riderId','')::uuid and br.event_id=ev left join public.horses bh on bh.id=nullif(q.inputs->'before'->>'horseId','')::uuid and bh.event_id=ev where q.event_id=ev and q.organization_key=p_org;
 if jsonb_array_length(lines)<>(select count(*) from public.reception_requests where event_id=ev and organization_id=p_org and status='reflected')+(select count(*) from public.fhs_winter_settlement_only where event_id=ev and organization_key=p_org) then raise exception '現場登録明細の人馬・競技を確認できません';end if;
 if pending>0 then warnings:=warnings||jsonb_build_array('未反映の申請があります。本部での反映後に再確認してください。');end if;
 if advance is null and initial+headcount*14000>0 then warnings:=warnings||jsonb_build_array('事前入金は未確認です。本部に確認してください。');end if;
 if missing>0 then warnings:=warnings||jsonb_build_array('料金履歴を確認できない出番があります。本部に確認してください。');end if;
 if initial+headcount*14000+extra+adjustment-paid-payment<0 then warnings:=warnings||jsonb_build_array('過入金があります。返金・充当を本部に確認してください。');end if;
 if initial+headcount*14000+extra+adjustment<0 then raise exception '請求額を確認できません';end if;
 a:=jsonb_build_object('organization',org,'normalTotal',initial,'horseRegistration',jsonb_build_object('count',headcount,'unitFee',14000,'total',headcount*14000,'horses',horses),
 'initialTotal',initial+headcount*14000,'extraTotal',extra,'adjustmentTotal',adjustment,'total',initial+headcount*14000+extra+adjustment,
 'advance',advance,'advancePaid',paid,'extraPaid',payment,'remaining',initial+headcount*14000+extra+adjustment-paid-payment,'instruction',instruction,'adjustments',corrections,'lines',lines,'warnings',warnings,'pending',pending);
 version:=encode(extensions.digest(a::text,'sha256'),'hex');
 return jsonb_build_object('account',a,'version',version);
end;$$;

