-- Winter: apply OP to the selected membership category for the four special competitions.
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
 if op is null or (op and (c.official or (c.op_fee is null and c.competition_no not in ('5','8','25','32')))) then raise exception '参加区分を確認してください'; end if;
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
    if coalesce((q.payload#>>'{add,isOp}')::boolean,false) and (c.official or (c.op_fee is null and c.competition_no not in ('5','8','25','32'))) then raise exception 'OP参加を確認してください'; end if;
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

CREATE OR REPLACE FUNCTION public.submit_winter_reception_add(p_id uuid, p_organization_id uuid, p_competition_id uuid, p_rider_id uuid, p_horse_id uuid, p_visitor_name text, p_membership text DEFAULT NULL::text, p_is_op boolean DEFAULT false, p_instructor_confirmed boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_event constant uuid := 'b571f05e-ed23-4e07-929e-be2b73e601a5';
  c public.competitions%rowtype;
  r public.riders%rowtype;
  h public.horses%rowtype;
  v_name text;
  v_price integer;
  v_payload jsonb;
  v_existing public.reception_requests%rowtype;
begin
  -- Preparation-stage writes are limited to verified headquarters administrators.
  if not fhs_winter_internal.can_submit_reception()
    then raise exception 'Winter受付の保存テストには本部ログインが必要です'; end if;
  if p_id is null or p_organization_id is null or p_competition_id is null or p_rider_id is null or p_horse_id is null
    then raise exception '必要な受付項目が不足しています'; end if;
  if length(btrim(coalesce(p_visitor_name,''))) not between 1 and 100
    then raise exception '受付担当者名を入力してください'; end if;
  select name into v_name from public.organizations where id=p_organization_id and event_id=v_event;
  if not found then raise exception 'Winterの団体を選択してください'; end if;
  select * into c from public.competitions where id=p_competition_id and event_id=v_event for share;
  if not found then raise exception 'Winterの競技を選択してください'; end if;
  select * into r from public.riders where id=p_rider_id and event_id=v_event and organization_id=p_organization_id for share;
  if not found then raise exception '選手の大会と所属を確認してください'; end if;
  select * into h from public.horses where id=p_horse_id and event_id=v_event and organization_id=p_organization_id for share;
  if not found then raise exception '馬の大会と所属を確認してください'; end if;
  if (r.roster_source='shared_roster' and not r.is_participant) or (h.roster_source='shared_roster' and not h.is_participant) then raise exception '参加チェックが外れた人馬です。選び直してください';end if;
  if c.official and (nullif(btrim(r.jef_member_no),'') is null or nullif(btrim(h.jef_registration_no),'') is null)
    then raise exception '公認競技は日馬連登録済みの選手と馬を選択してください'; end if;
  v_price := public.winter_change_price(c.id,p_membership,coalesce(p_is_op,false),coalesce(p_instructor_confirmed,false));
  v_payload := jsonb_build_object(
    'id',p_id,'type','add','status','pending','orgId',p_organization_id,
    'visitorOrgId',p_organization_id,'visitorName',btrim(p_visitor_name),'organizationName',v_name,
    'fee',jsonb_build_object('addBase',3000,'addEntry',v_price,'changeBase',0,'competitionDiff',0,'total',3000+v_price),
    'add',jsonb_build_object('competitionId',p_competition_id,'competitionNo',c.competition_no,
      'playerId',p_rider_id,'playerName',r.name,'horseId',p_horse_id,'horseName',h.name,
      'organizationId',p_organization_id,'isOp',coalesce(p_is_op,false),'note','',
      'membership',p_membership,'instructorConfirmed',coalesce(p_instructor_confirmed,false))
  );
  -- Serialize retries with the same request ID, without exposing other submissions.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into v_existing from public.reception_requests where id=p_id;
  if found then
    if v_existing.event_id<>v_event or v_existing.payload<>v_payload
      then raise exception '受付番号と申請内容が一致しません'; end if;
    return p_id;
  end if;
  insert into public.reception_requests(id,event_id,request_type,organization_id,target_competition_id,
    to_competition_id,rider_id,horse_id,fee,fee_amount,status,source,payload)
  values(p_id,v_event,'add',p_organization_id,p_competition_id,p_competition_id,
    p_rider_id,p_horse_id,3000+v_price,3000+v_price,'pending','winter-reception',v_payload);
  return p_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.winter_change_price(p_comp uuid, p_membership text, p_op boolean, p_instructor boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.competitions%rowtype; price integer;
begin
 select * into c from public.competitions where id=p_comp and event_id='b571f05e-ed23-4e07-929e-be2b73e601a5';
 if not found then raise exception 'Winterの競技を確認してください'; end if;
 if p_op is null or p_instructor is null then raise exception '参加区分を確認してください'; end if;
 if c.competition_no in ('8','32') and not p_instructor then raise exception '地域乗馬指導者資格の確認が必要です'; end if;
 price:=c.fee;
 if c.member_fee is not null or c.nonmember_fee is not null then
  if p_membership is null or p_membership not in ('member','nonmember') then raise exception '会員・非会員の料金区分を選択してください'; end if;
  price:=case when p_membership='member' then c.member_fee else c.nonmember_fee end;
 end if;
 if p_op then
  if c.official then raise exception '公認競技はOP参加できません'; end if;
  if c.competition_no in ('5','8','25','32') then
   price:=price-1000;
  else
   if c.op_fee is null then raise exception 'OP参加を確認してください'; end if;
   price:=c.op_fee;
  end if;
 end if;
 if price is null or price<=0 then raise exception '競技料金を確認してください'; end if;
 return price;
end; $function$;
