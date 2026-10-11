-- Winter only: append-only on-site addition/re-run charges; never writes entries.
create table public.fhs_winter_settlement_only (
 id uuid primary key,
 event_id uuid not null default 'b571f05e-ed23-4e07-929e-be2b73e601a5' check(event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'),
 organization_key uuid not null references public.organizations(id),
 inputs jsonb not null, entry_fee integer not null check(entry_fee>0), fee_amount integer not null check(fee_amount=entry_fee+3000),
 note text not null check(length(btrim(note)) between 1 and 500),
 reverses_id uuid unique references public.fhs_winter_settlement_only(id),
 created_at timestamptz not null default now(),created_by uuid not null references auth.users(id)
);
create index winter_settlement_only_org on public.fhs_winter_settlement_only(event_id,organization_key,id);
alter table public.fhs_winter_settlement_only enable row level security;
revoke all on public.fhs_winter_settlement_only from public,anon,authenticated;
grant select on public.fhs_winter_settlement_only to authenticated;
create policy winter_settlement_only_admin_read on public.fhs_winter_settlement_only for select to authenticated using((select auth.uid()) is not null and (select auth.jwt()->'app_metadata'->>'role')='admin');
create function fhs_winter_internal.save_settlement_only(p_id uuid,p_inputs jsonb,p_note text,p_reverses_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5'; saved public.fhs_winter_settlement_only%rowtype;original public.fhs_winter_settlement_only%rowtype;
 c public.competitions%rowtype;r public.riders%rowtype;h public.horses%rowtype;price integer;args jsonb;org uuid;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '現場登録には本部ログインが必要です';end if;
 if p_id is null or p_inputs is null or p_note is null or length(btrim(p_note)) not between 1 and 500 then raise exception '現場登録の内容・備考を確認してください';end if;
 args:=jsonb_build_object('organizationId',(p_inputs->>'organizationId')::uuid,'competitionId',(p_inputs->>'competitionId')::uuid,'riderId',(p_inputs->>'riderId')::uuid,'horseId',(p_inputs->>'horseId')::uuid,'membership',p_inputs->>'membership','isOp',(p_inputs->>'isOp')::boolean,'instructorConfirmed',(p_inputs->>'instructorConfirmed')::boolean,'entryFee',(p_inputs->>'entryFee')::integer);
 if args is distinct from p_inputs or exists(select 1 from jsonb_each(args) where key<>'membership' and value='null'::jsonb) then raise exception '現場登録の料金区分を確認してください';end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-onsite-operation',0));
 perform pg_advisory_xact_lock(hashtextextended('winter-onsite:'||p_id::text,0));
 select * into saved from public.fhs_winter_settlement_only where id=p_id;
 if found then
  if saved.inputs<>args or saved.note<>btrim(p_note) or saved.reverses_id is distinct from p_reverses_id then raise exception '登録番号と現場登録内容が一致しません';end if;
  return p_id;
 end if;
 if p_reverses_id is not null then
  select * into original from public.fhs_winter_settlement_only where id=p_reverses_id for update;
  if not found or original.reverses_id is not null or original.inputs<>args then raise exception '取り消す現場登録を確認してください';end if;
  if exists(select 1 from public.fhs_winter_settlement_only where reverses_id=p_reverses_id) then raise exception 'この現場登録は取消済みです';end if;
  org:=original.organization_key;price:=original.entry_fee;
 else
  select * into c from public.competitions where id=(args->>'competitionId')::uuid and event_id=ev for share;
  if not found then raise exception 'Winterの競技を選択してください';end if;
  select * into r from public.riders where id=(args->>'riderId')::uuid and event_id=ev for share;
  if not found or not exists(select 1 from public.organizations where id=r.organization_id and event_id=ev) then raise exception '選手の所属を確認してください';end if;
  select * into h from public.horses where id=(args->>'horseId')::uuid and event_id=ev and organization_id=(args->>'organizationId')::uuid for share;
  if not found or not exists(select 1 from public.organizations where id=h.organization_id and event_id=ev) then raise exception '馬の所属を確認してください';end if;
  if r.is_participant=false or h.is_participant=false or (r.roster_source='shared_roster' and r.is_participant is distinct from true) or (h.roster_source='shared_roster' and h.is_participant is distinct from true) then raise exception '参加チェックを保存した人馬を選択してください';end if;
  if c.official and (nullif(btrim(r.jef_member_no),'') is null or nullif(btrim(h.jef_registration_no),'') is null) then raise exception '公認競技は日馬連登録済み人馬を選択してください';end if;
  price:=public.winter_change_price(c.id,args->>'membership',(args->>'isOp')::boolean,(args->>'instructorConfirmed')::boolean);
  if price<>(args->>'entryFee')::integer then raise exception '競技料金が更新されています。確認し直してください';end if;
  org:=r.organization_id;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-finance:'||org::text,0));
 if p_reverses_id is not null and (fhs_winter_internal.settlement_account(org)->'account'->>'total')::bigint<price+3000 then raise exception '取消後の請求額が0円未満になります。先に金額訂正を確認してください';end if;
 insert into public.fhs_winter_settlement_only(id,event_id,organization_key,inputs,entry_fee,fee_amount,note,reverses_id,created_by)
 values(p_id,ev,org,args,price,price+3000,btrim(p_note),p_reverses_id,auth.uid());
 return p_id;
end;$$;
revoke all on function fhs_winter_internal.save_settlement_only(uuid,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function fhs_winter_internal.save_settlement_only(uuid,jsonb,text,uuid) to authenticated;
create function public.save_winter_settlement_only(p_id uuid,p_inputs jsonb,p_note text,p_reverses_id uuid default null)
returns uuid language sql security invoker set search_path='' as $$select fhs_winter_internal.save_settlement_only(p_id,p_inputs,p_note,p_reverses_id);$$;
revoke all on function public.save_winter_settlement_only(uuid,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.save_winter_settlement_only(uuid,jsonb,text,uuid) to authenticated;
create function fhs_winter_internal.save_settlement_only_batch(p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare row jsonb; ids jsonb:='[]';baseorg text;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '現場登録には本部ログインが必要です';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 100 then raise exception '1〜100件の一覧を入力してください';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) x group by x->>'id' having count(*)>1) then raise exception '登録番号が重複しています';end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-onsite-operation',0));
 baseorg:=p_rows->0->'inputs'->>'organizationId';
 -- Acquire finance locks in a consistent order across all rows and cancellation paths.
 perform pg_advisory_xact_lock(hashtextextended('winter-finance:'||r.organization_id::text,0)) from public.riders r where r.id in(select (x->'inputs'->>'riderId')::uuid from jsonb_array_elements(p_rows) x) order by r.organization_id;
 for row in select value from jsonb_array_elements(p_rows) loop
  if (row->'inputs'->>'organizationId') is distinct from baseorg then raise exception '同じ馬の所属団体でまとめて登録してください';end if;
  ids:=ids||jsonb_build_array(fhs_winter_internal.save_settlement_only((row->>'id')::uuid,row->'inputs',row->>'note',null));
 end loop;
 return ids;
end;$$;
revoke all on function fhs_winter_internal.save_settlement_only_batch(jsonb) from public,anon,authenticated;
grant execute on function fhs_winter_internal.save_settlement_only_batch(jsonb) to authenticated;
create function public.save_winter_settlement_only_batch(p_rows jsonb) returns jsonb language sql security invoker set search_path='' as $$select fhs_winter_internal.save_settlement_only_batch(p_rows);$$;
revoke all on function public.save_winter_settlement_only_batch(jsonb) from public,anon,authenticated;
grant execute on function public.save_winter_settlement_only_batch(jsonb) to authenticated;

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
 select lines||coalesce(jsonb_agg(jsonb_build_object('id',q.id,'action',case when q.reverses_id is null then '現場追加' else '現場追加取消' end,'competitionLabel',case when c.competition_no~'^[0-9]+$' then '第'||c.competition_no||'競技 ' else c.competition_no||' ' end||c.name,'rider',r.name,'horse',h.name,'amount',case when q.reverses_id is null then q.fee_amount else -q.fee_amount end) order by q.created_at,q.id),'[]') into lines
 from public.fhs_winter_settlement_only q join public.competitions c on c.id=(q.inputs->>'competitionId')::uuid and c.event_id=ev join public.riders r on r.id=(q.inputs->>'riderId')::uuid and r.event_id=ev join public.horses h on h.id=(q.inputs->>'horseId')::uuid and h.event_id=ev where q.event_id=ev and q.organization_key=p_org;
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

create or replace function fhs_winter_internal.save_charge_adjustment(p_id uuid,p_organization_id uuid,p_delta integer,p_reason text,p_expected_total bigint,p_previous_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';saved public.fhs_winter_charge_adjustments%rowtype;last_id uuid;total bigint;adjustment bigint;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '金額訂正には本部ログインが必要です';end if;
 if p_id is null or p_organization_id is null or p_delta is null or p_delta=0 or p_reason is null or length(btrim(p_reason)) not between 1 and 500 or p_expected_total is null or p_expected_total<0 then raise exception '訂正金額・理由を確認してください';end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-adjustment-id:'||p_id::text,0));
 select * into saved from public.fhs_winter_charge_adjustments where id=p_id;
 if found then
  if saved.organization_key<>p_organization_id or saved.delta<>p_delta or saved.reason<>btrim(p_reason) or saved.before_total<>p_expected_total or saved.previous_id is distinct from p_previous_id then raise exception '登録番号と訂正内容が一致しません';end if;
  return p_id;
 end if;
 if not exists(select 1 from public.organizations where id=p_organization_id and event_id=ev) then raise exception 'Winterの団体を選択してください';end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-finance:'||p_organization_id::text,0));
 select id into last_id from public.fhs_winter_charge_adjustments where organization_key=p_organization_id order by sequence desc limit 1;
 if last_id is distinct from p_previous_id then raise exception '別の訂正が保存されています。再読み込みしてください';end if;
 select coalesce(sum(delta),0) into adjustment from public.fhs_winter_charge_adjustments where organization_key=p_organization_id;
 select coalesce((select sum(entry_fee) from public.fhs_winter_initial_entries where event_id=ev and coalesce(inputs->>'billingOrganizationId',inputs->>'organizationId')=p_organization_id::text),0)
 +14000*(select count(*) from public.horses where event_id=ev and organization_id=p_organization_id and is_participant is distinct from false and (roster_source is distinct from 'shared_roster' or is_participant=true))
 +coalesce((select sum(fee_amount) from public.reception_requests where event_id=ev and organization_id=p_organization_id and status='reflected'),0)+coalesce((select sum(case when reverses_id is null then fee_amount else -fee_amount end) from public.fhs_winter_settlement_only where event_id=ev and organization_key=p_organization_id),0)+adjustment into total;
 if total<>p_expected_total then raise exception '請求額が更新されています。再読み込みしてください';end if;
 if total+p_delta<0 then raise exception '請求総額を0円未満にはできません';end if;
 insert into public.fhs_winter_charge_adjustments(id,event_id,organization_key,delta,reason,previous_id,before_total,after_total,created_by)
 values(p_id,ev,p_organization_id,p_delta,btrim(p_reason),p_previous_id,total,total+p_delta,auth.uid());
 return p_id;
end;$$;
