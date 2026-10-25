-- Public Winter reception: pending requests only, using the existing server/device path.
-- No anonymous table/RPC grants and no changes to reflection, meeting or payment authorization.
create or replace function fhs_winter_internal.can_submit_reception()
returns boolean language sql stable security invoker set search_path='' as $$
 select (auth.uid() is not null and coalesce(auth.jwt()->'app_metadata'->>'role','')='admin')
 or (coalesce(auth.jwt()->>'role','')='service_role' and exists(
   select 1 from public.fhs_winter_settlement_devices d
   where d.token_hash=current_setting('fhs.winter_reception_device',true)
   and not d.revoked and d.expires_at>now()
 ));
$$;
revoke all on function fhs_winter_internal.can_submit_reception() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION fhs_winter_internal.submit_master_add(p_args jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 ident uuid;org uuid;comp uuid;rider uuid;horse uuid;visitor text;membership text;op boolean;instructor boolean;note text;expected integer;
 r public.riders%rowtype;h public.horses%rowtype;c public.competitions%rowtype;q public.reception_requests%rowtype;
 inputs jsonb;price integer;orgname text;
begin
 if not fhs_winter_internal.can_submit_reception() then raise exception '本部ログインが必要です';end if;
 if jsonb_typeof(p_args) is distinct from 'object' then raise exception '受付項目を確認してください';end if;
 ident:=(p_args->>'p_id')::uuid;org:=(p_args->>'p_organization_id')::uuid;comp:=(p_args->>'p_competition_id')::uuid;rider:=(p_args->>'p_rider_id')::uuid;horse:=(p_args->>'p_horse_id')::uuid;visitor:=btrim(p_args->>'p_visitor_name');membership:=p_args->>'p_membership';op:=(p_args->>'p_is_op')::boolean;instructor:=(p_args->>'p_instructor_confirmed')::boolean;note:=btrim(coalesce(p_args->>'p_note',''));expected:=(p_args->>'p_expected_total')::integer;
 if ident is null or org is null or comp is null or rider is null or horse is null or length(coalesce(visitor,'')) not between 1 and 100 or op is null or instructor is null or expected is null or expected<0 or length(note)>4000 then raise exception '団体・人馬・担当者・料金・要望を確認してください';end if;
 inputs:=jsonb_build_object('id',ident,'organizationId',org,'competitionId',comp,'riderId',rider,'horseId',horse,'visitorName',visitor,'membership',membership,'isOp',op,'instructorConfirmed',instructor,'note',note,'expectedTotal',expected);
 perform pg_advisory_xact_lock(hashtextextended(ident::text,0));
 select * into q from public.reception_requests where id=ident;
 if found then
  if q.event_id<>ev or q.request_type<>'add' or q.payload->>'masterFormVersion' is distinct from '1' or q.payload->'inputs' is distinct from inputs then raise exception '受付番号と申請内容が一致しません';end if;
  return ident;
 end if;
 select name into orgname from public.organizations where id=org and event_id=ev;
 if not found then raise exception 'Winterの団体を選択してください';end if;
 select * into c from public.competitions where id=comp and event_id=ev for share;
 if not found then raise exception 'Winterの競技を選択してください';end if;
 select * into r from public.riders where id=rider and event_id=ev for share;
 if not found then raise exception '選手の大会を確認してください';end if;
 select * into h from public.horses where id=horse and event_id=ev for share;
 if not found then raise exception '馬の大会を確認してください';end if;
 if org is distinct from r.organization_id and org is distinct from h.organization_id then raise exception '選手または馬の所属を選択してください';end if;
 if not exists(select 1 from public.organizations where id=r.organization_id and event_id=ev) or not exists(select 1 from public.organizations where id=h.organization_id and event_id=ev) then raise exception '人馬の所属大会を確認してください';end if;
 if (r.roster_source='shared_roster' and not coalesce(r.is_participant,false)) or (h.roster_source='shared_roster' and not coalesce(h.is_participant,false)) then raise exception '参加チェックが外れた人馬です。選び直してください';end if;
 if c.official and (nullif(btrim(r.jef_member_no),'') is null or nullif(btrim(h.jef_registration_no),'') is null) then raise exception '公認競技は日馬連登録済みの人馬を選択してください';end if;
 price:=public.winter_change_price(comp,membership,op,instructor);
 if expected<>3000+price then raise exception '競技料金が更新されています。料金を確認し直してください';end if;
 insert into public.reception_requests(id,event_id,request_type,organization_id,target_competition_id,to_competition_id,rider_id,horse_id,fee,fee_amount,status,source,payload)
 values(ident,ev,'add',org,comp,comp,rider,horse,3000+price,3000+price,'pending','winter-reception',jsonb_build_object('id',ident,'type','add','status','pending','orgId',org,'visitorOrgId',org,'visitorName',visitor,'organizationName',orgname,'masterFormVersion',1,'inputs',inputs,'fee',jsonb_build_object('addBase',3000,'addEntry',price,'changeBase',0,'competitionDiff',0,'total',3000+price),'add',jsonb_build_object('competitionId',comp,'competitionNo',c.competition_no,'playerId',rider,'playerName',r.name,'horseId',horse,'horseName',h.name,'organizationId',org,'isOp',op,'note',note,'membership',membership,'instructorConfirmed',instructor)));
 return ident;
end;$function$
;

CREATE OR REPLACE FUNCTION fhs_winter_internal.submit_master_change(p_organization_id uuid, p_before_organization_id uuid, p_id uuid, p_entry_id uuid, p_before jsonb, p_competition_id uuid, p_rider_id uuid, p_horse_id uuid, p_visitor_name text, p_from_membership text, p_membership text, p_is_op boolean, p_from_instructor boolean, p_instructor boolean, p_expected_total integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_event constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 e public.entries%rowtype; c public.competitions%rowtype; q public.reception_requests%rowtype;
 inputs jsonb; snapshot jsonb; fields jsonb:='[]'; n integer:=0; old_price integer; new_price integer;
 total integer; addbase integer:=0; addentry integer:=0; changebase integer:=0; diff integer:=0; org uuid; r public.riders%rowtype; h public.horses%rowtype;
begin
 if not fhs_winter_internal.can_submit_reception() then raise exception '本部ログインが必要です'; end if;
 if p_organization_id is null or p_before_organization_id is null or p_id is null or p_entry_id is null or p_competition_id is null or p_rider_id is null or p_horse_id is null or p_before is null or p_expected_total is null or length(btrim(coalesce(p_visitor_name,''))) not between 1 and 100 then raise exception '変更内容を確認してください'; end if;
 inputs:=jsonb_build_object('entryId',p_entry_id,'before',p_before,'competitionId',p_competition_id,'riderId',p_rider_id,'horseId',p_horse_id,'visitorName',btrim(p_visitor_name),'fromMembership',p_from_membership,'membership',p_membership,'isOp',p_is_op,'fromInstructor',p_from_instructor,'instructor',p_instructor,'expectedTotal',p_expected_total,'organizationId',p_organization_id,'beforeOrganizationId',p_before_organization_id);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into q from public.reception_requests where id=p_id;
 if found then
  if q.event_id<>v_event or q.request_type<>'change' or q.payload->>'masterFormVersion' is distinct from '1' or q.payload->'inputs' is distinct from inputs then raise exception '受付番号と変更内容が一致しません'; end if;
  return p_id;
 end if;
 select * into e from public.entries where id=p_entry_id and event_id=v_event for update;
 if not found or lower(e.status) in ('wd','withdrawn') then raise exception 'Winterの出走中の人馬を選択してください'; end if;
 snapshot:=jsonb_build_object('competitionId',e.competition_id,'riderId',e.rider_id,'horseId',e.horse_id,'isOp',coalesce(e.is_op,false));
 if e.organization_id is distinct from p_before_organization_id or snapshot is distinct from p_before then raise exception '変更前の人馬が更新されています。最新の出番表で選び直してください'; end if;
 if exists(select 1 from public.reception_requests where event_id=v_event and original_entry_id=e.id and status='pending') then raise exception 'この人馬には未反映の申請があります'; end if;
 select * into c from public.competitions where id=p_competition_id and event_id=v_event for share;
 if not found then raise exception 'Winterの競技を選択してください'; end if;
 org:=p_organization_id;
 if not exists(select 1 from public.organizations where id=org and event_id=v_event) then raise exception 'Winterの団体を選択してください';end if;
 select * into r from public.riders where id=p_rider_id and event_id=v_event for share;
 if not found then raise exception '選手の大会を確認してください';end if;
 select * into h from public.horses where id=p_horse_id and event_id=v_event for share;
 if not found then raise exception '馬の大会を確認してください';end if;
 if org is distinct from r.organization_id and org is distinct from h.organization_id then raise exception '選手または馬の所属を選択してください';end if;
 if not exists(select 1 from public.organizations where id=r.organization_id and event_id=v_event) or not exists(select 1 from public.organizations where id=h.organization_id and event_id=v_event) then raise exception '人馬の所属大会を確認してください';end if;
 if (r.roster_source='shared_roster' and not coalesce(r.is_participant,false)) or (h.roster_source='shared_roster' and not coalesce(h.is_participant,false)) then raise exception '参加チェックが外れた人馬です';end if;
 if c.official and (nullif(btrim(r.jef_member_no),'') is null or nullif(btrim(h.jef_registration_no),'') is null) then raise exception '公認競技は日馬連登録済みの人馬を選択してください';end if;
 old_price:=public.winter_change_price(e.competition_id,p_from_membership,coalesce(e.is_op,false),p_from_instructor);
 new_price:=public.winter_change_price(p_competition_id,p_membership,p_is_op,p_instructor);
 if e.competition_id<>p_competition_id then n:=n+1; fields:=fields||'"competition"'::jsonb; end if;
 if e.rider_id<>p_rider_id then n:=n+1; fields:=fields||'"player"'::jsonb; end if;
 if e.horse_id<>p_horse_id then n:=n+1; fields:=fields||'"horse"'::jsonb; end if;
 if coalesce(e.is_op,false)<>p_is_op then fields:=fields||'"op"'::jsonb; end if;
 if e.competition_id=p_competition_id and p_from_membership is distinct from p_membership and (c.member_fee is not null or c.nonmember_fee is not null) then fields:=fields||'"membership"'::jsonb; end if;
 if jsonb_array_length(fields)=0 then raise exception '変更する項目を選択してください'; end if;
 if n>=2 then addbase:=3000; addentry:=new_price; else changebase:=2000; diff:=greatest(0,new_price-old_price); end if;
 total:=addbase+addentry+changebase+diff;
 if total<>p_expected_total then raise exception '競技料金が更新されています。料金を確認し直してください'; end if;
 insert into public.reception_requests(id,event_id,request_type,original_entry_id,from_competition_id,to_competition_id,target_competition_id,rider_id,horse_id,organization_id,status,source,fee,fee_amount,payload)
 values(p_id,v_event,'change',e.id,e.competition_id,c.id,c.id,p_rider_id,p_horse_id,org,'pending','winter-reception',total,total,
 jsonb_build_object('masterFormVersion',1,'visitorName',btrim(p_visitor_name),'inputs',inputs,'before',snapshot,'changedFields',fields,'treatedAsWithdrawAdd',n>=2,'fromEntryFee',old_price,'toEntryFee',new_price,'fee',jsonb_build_object('addBase',addbase,'addEntry',addentry,'changeBase',changebase,'competitionDiff',diff,'total',total),'change',jsonb_build_object('toCompetitionId',c.id,'toPlayerId',p_rider_id,'toHorseId',p_horse_id,'toIsOp',p_is_op,'membership',p_membership)));
 return p_id;
end; $function$
;

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
  if coalesce(p_is_op,false) and (c.official or c.op_fee is null)
    then raise exception 'この競技はOP参加を受け付けていません'; end if;
  if c.competition_no in ('8','32') and not coalesce(p_instructor_confirmed,false)
    then raise exception '地域乗馬指導者資格の確認が必要です'; end if;
  v_price := c.fee;
  if c.member_fee is not null or c.nonmember_fee is not null then
    if p_membership is null or p_membership not in ('member','nonmember')
      then raise exception '会員・非会員の料金区分を選択してください'; end if;
    v_price := case when p_membership='member' then c.member_fee else c.nonmember_fee end;
  end if;
  if coalesce(p_is_op,false) then v_price := c.op_fee; end if;
  if v_price is null or v_price<=0 then raise exception '競技料金が未設定です。本部に確認してください'; end if;
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
$function$
;

CREATE OR REPLACE FUNCTION public.submit_winter_reception_batch(p_items jsonb, p_expected_total integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5'; item jsonb; a jsonb; ident uuid; entry_ident uuid;
 ids jsonb:='[]'; seen uuid[]:='{}'; originals uuid[]:='{}'; org uuid; row_org uuid; total integer:=0; n integer:=0; result uuid;
begin
 if not fhs_winter_internal.can_submit_reception() then raise exception '本部ログインが必要です'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' then raise exception '受付一覧を確認してください'; end if;
 if jsonb_array_length(p_items) not between 1 and 50 or p_expected_total is null or p_expected_total<0 then raise exception '受付件数と合計金額を確認してください'; end if;
 -- Lock all request IDs in a consistent order, including retries.
 for item in select value from jsonb_array_elements(p_items) order by value#>>'{args,p_id}' loop
   ident:=(item#>>'{args,p_id}')::uuid;
   if ident is null or ident=any(seen) then raise exception '受付番号が重複しています'; end if;
   seen:=array_append(seen,ident); perform pg_advisory_xact_lock(hashtextextended(ident::text,0));
   if item->>'type' in ('change','withdraw') then
     entry_ident:=(item#>>'{args,p_entry_id}')::uuid;
     if entry_ident is null or entry_ident=any(originals) then raise exception '同じ出番の変更・棄権は一度に1件ずつ確定してください'; end if;
     originals:=array_append(originals,entry_ident);
   end if;
 end loop;
 perform 1 from public.entries where event_id=ev and id=any(originals) order by id for update;
 for item in select value from jsonb_array_elements(p_items) loop
   n:=n+1; a:=item->'args';
   begin
     case item->>'type'
       when 'add' then result:=case when coalesce((a->>'p_master_form')::boolean,false) then public.submit_winter_master_add(a) else public.submit_winter_reception_add((a->>'p_id')::uuid,(a->>'p_organization_id')::uuid,(a->>'p_competition_id')::uuid,(a->>'p_rider_id')::uuid,(a->>'p_horse_id')::uuid,a->>'p_visitor_name',a->>'p_membership',(a->>'p_is_op')::boolean,(a->>'p_instructor_confirmed')::boolean) end;
       when 'change' then result:=case when coalesce((a->>'p_master_form')::boolean,false) then public.submit_winter_master_change(a) else public.submit_winter_reception_change((a->>'p_id')::uuid,(a->>'p_entry_id')::uuid,a->'p_before',(a->>'p_competition_id')::uuid,(a->>'p_rider_id')::uuid,(a->>'p_horse_id')::uuid,a->>'p_visitor_name',a->>'p_from_membership',a->>'p_membership',(a->>'p_is_op')::boolean,(a->>'p_from_instructor')::boolean,(a->>'p_instructor')::boolean,(a->>'p_expected_total')::integer) end;
       when 'withdraw' then result:=public.submit_winter_reception_withdraw((a->>'p_id')::uuid,(a->>'p_entry_id')::uuid,a->>'p_visitor_name');
       else raise exception '申請の種類を確認してください';
     end case;
     select organization_id into row_org from public.reception_requests where id=result and event_id=ev;
     if row_org is null or (org is not null and org<>row_org) then raise exception '団体ごとにまとめて確定してください'; end if;
     org:=row_org;
     select total+fee_amount into total from public.reception_requests where id=result and event_id=ev;
     ids:=ids||jsonb_build_array(result);
   exception when others then raise exception '%件目：%',n,sqlerrm;
   end;
 end loop;
 if total is distinct from p_expected_total then raise exception '料金が変更されています。入力内容と最新料金を確認し直してください'; end if;
 return jsonb_build_object('ids',ids,'total',total);
end; $function$
;

CREATE OR REPLACE FUNCTION public.submit_winter_reception_change(p_id uuid, p_entry_id uuid, p_before jsonb, p_competition_id uuid, p_rider_id uuid, p_horse_id uuid, p_visitor_name text, p_from_membership text, p_membership text, p_is_op boolean, p_from_instructor boolean, p_instructor boolean, p_expected_total integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_event constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 e public.entries%rowtype; c public.competitions%rowtype; q public.reception_requests%rowtype;
 inputs jsonb; snapshot jsonb; fields jsonb:='[]'; n integer:=0; old_price integer; new_price integer;
 total integer; addbase integer:=0; addentry integer:=0; changebase integer:=0; diff integer:=0; org uuid;
begin
 if not fhs_winter_internal.can_submit_reception() then raise exception '本部ログインが必要です'; end if;
 if p_id is null or p_entry_id is null or p_competition_id is null or p_rider_id is null or p_horse_id is null or p_before is null or p_expected_total is null or length(btrim(coalesce(p_visitor_name,''))) not between 1 and 100 then raise exception '変更内容を確認してください'; end if;
 inputs:=jsonb_build_object('entryId',p_entry_id,'before',p_before,'competitionId',p_competition_id,'riderId',p_rider_id,'horseId',p_horse_id,'visitorName',btrim(p_visitor_name),'fromMembership',p_from_membership,'membership',p_membership,'isOp',p_is_op,'fromInstructor',p_from_instructor,'instructor',p_instructor,'expectedTotal',p_expected_total);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into q from public.reception_requests where id=p_id;
 if found then
  if q.event_id<>v_event or q.request_type<>'change' or q.payload->'inputs' is distinct from inputs then raise exception '受付番号と変更内容が一致しません'; end if;
  return p_id;
 end if;
 select * into e from public.entries where id=p_entry_id and event_id=v_event for update;
 if not found or lower(e.status) in ('wd','withdrawn') then raise exception 'Winterの出走中の人馬を選択してください'; end if;
 snapshot:=jsonb_build_object('competitionId',e.competition_id,'riderId',e.rider_id,'horseId',e.horse_id,'isOp',coalesce(e.is_op,false));
 if snapshot is distinct from p_before then raise exception '変更前の人馬が更新されています。最新の出番表で選び直してください'; end if;
 if exists(select 1 from public.reception_requests where event_id=v_event and original_entry_id=e.id and status='pending') then raise exception 'この人馬には未反映の申請があります'; end if;
 select * into c from public.competitions where id=p_competition_id and event_id=v_event for share;
 if not found then raise exception 'Winterの競技を選択してください'; end if;
 select organization_id into org from public.riders where id=p_rider_id and event_id=v_event and (not c.official or nullif(btrim(jef_member_no),'') is not null);
 if not found then raise exception '選手の大会・公認登録を確認してください'; end if;
 if not exists(select 1 from public.horses where id=p_horse_id and event_id=v_event and organization_id=org and (not c.official or nullif(btrim(jef_registration_no),'') is not null)) then raise exception '馬の大会・所属・公認登録を確認してください'; end if;
 old_price:=public.winter_change_price(e.competition_id,p_from_membership,coalesce(e.is_op,false),p_from_instructor);
 new_price:=public.winter_change_price(p_competition_id,p_membership,p_is_op,p_instructor);
 if e.competition_id<>p_competition_id then n:=n+1; fields:=fields||'"competition"'::jsonb; end if;
 if e.rider_id<>p_rider_id then n:=n+1; fields:=fields||'"player"'::jsonb; end if;
 if e.horse_id<>p_horse_id then n:=n+1; fields:=fields||'"horse"'::jsonb; end if;
 if coalesce(e.is_op,false)<>p_is_op then fields:=fields||'"op"'::jsonb; end if;
 if e.competition_id=p_competition_id and p_from_membership is distinct from p_membership and (c.member_fee is not null or c.nonmember_fee is not null) then fields:=fields||'"membership"'::jsonb; end if;
 if jsonb_array_length(fields)=0 then raise exception '変更する項目を選択してください'; end if;
 if n>=2 then addbase:=3000; addentry:=new_price; else changebase:=2000; diff:=greatest(0,new_price-old_price); end if;
 total:=addbase+addentry+changebase+diff;
 if total<>p_expected_total then raise exception '競技料金が更新されています。料金を確認し直してください'; end if;
 insert into public.reception_requests(id,event_id,request_type,original_entry_id,from_competition_id,to_competition_id,target_competition_id,rider_id,horse_id,organization_id,status,source,fee,fee_amount,payload)
 values(p_id,v_event,'change',e.id,e.competition_id,c.id,c.id,p_rider_id,p_horse_id,org,'pending','winter-reception',total,total,
 jsonb_build_object('visitorName',btrim(p_visitor_name),'inputs',inputs,'before',snapshot,'changedFields',fields,'treatedAsWithdrawAdd',n>=2,'fromEntryFee',old_price,'toEntryFee',new_price,'fee',jsonb_build_object('addBase',addbase,'addEntry',addentry,'changeBase',changebase,'competitionDiff',diff,'total',total),'change',jsonb_build_object('toCompetitionId',c.id,'toPlayerId',p_rider_id,'toHorseId',p_horse_id,'toIsOp',p_is_op,'membership',p_membership)));
 return p_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.submit_winter_reception_withdraw(p_id uuid, p_entry_id uuid, p_visitor_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_event constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
  e public.entries%rowtype; q public.reception_requests%rowtype; v_payload jsonb;
begin
  if not fhs_winter_internal.can_submit_reception() then raise exception '本部ログインが必要です'; end if;
  if p_id is null or p_entry_id is null or length(btrim(coalesce(p_visitor_name,''))) not between 1 and 100 then raise exception '人馬と受付担当者名を確認してください'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into q from public.reception_requests where id=p_id;
  if found then
    if q.event_id<>v_event or q.request_type<>'withdraw' or q.original_entry_id<>p_entry_id or q.payload->>'visitorName'<>btrim(p_visitor_name) then raise exception '受付番号と申請内容が一致しません'; end if;
    return p_id;
  end if;
  select * into e from public.entries where id=p_entry_id and event_id=v_event for update;
  if not found or lower(e.status) in ('wd','withdrawn') then raise exception 'Winterの出走中の人馬を選択してください'; end if;
  if exists(select 1 from public.reception_requests where event_id=v_event and original_entry_id=e.id and status='pending') then raise exception 'この人馬には未反映の申請があります。先に本部で確認してください'; end if;
  v_payload:=jsonb_build_object('type','withdraw','visitorName',btrim(p_visitor_name),'withdraw',jsonb_build_object('entryId',e.id,'competitionId',e.competition_id,'playerId',e.rider_id,'horseId',e.horse_id));
  insert into public.reception_requests(id,event_id,request_type,original_entry_id,target_competition_id,from_competition_id,rider_id,horse_id,organization_id,status,source,payload,fee,fee_amount)
    values(p_id,v_event,'withdraw',e.id,e.competition_id,e.competition_id,e.rider_id,e.horse_id,e.organization_id,'pending','winter-reception',v_payload,0,0);
  return p_id;
end; $function$
;

-- The service route proves its device here. Never fabricate an admin JWT/user identity.
create or replace function public.submit_winter_public_reception_batch(p_items jsonb,p_expected_total integer,p_visitor_name text,p_token_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item jsonb; saved jsonb; previous_device text:=current_setting('fhs.winter_reception_device',true);
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception '受付画面から操作してください';end if;
 if p_token_hash is null or p_token_hash!~'^[a-f0-9]{64}$' or not exists(select 1 from public.fhs_winter_settlement_devices where token_hash=p_token_hash and not revoked and expires_at>now()) then raise exception '受付の有効期限が切れました。もう一度確定してください';end if;
 if jsonb_typeof(p_items) is distinct from 'array' then raise exception '受付一覧を確認してください';end if;
 if jsonb_array_length(p_items) not between 1 and 50 then raise exception '受付件数を確認してください';end if;
 if p_visitor_name is not null and length(btrim(p_visitor_name)) not between 1 and 100 then raise exception '受付に来た方のお名前を入力してください';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if (item->>'type') is null or item->>'type' not in ('add','change','withdraw') then raise exception '受付の種類を確認してください';end if;
  if p_visitor_name is null then
   -- Old frozen queues retain exact per-request names. They can only acknowledge existing requests.
   if not exists(select 1 from public.reception_requests q where q.id=(item#>>'{args,p_id}')::uuid and q.event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'::uuid and q.payload->>'visitorName'=btrim(item#>>'{args,p_visitor_name}')) then raise exception '受付に来た方のお名前を入力してください';end if;
  elsif item#>>'{args,p_visitor_name}' is distinct from btrim(p_visitor_name) then raise exception '受付に来た方のお名前が一致しません';end if;
 end loop;
 perform set_config('fhs.winter_reception_device',p_token_hash,true);
 saved:=public.submit_winter_reception_batch(p_items,p_expected_total);
 perform set_config('fhs.winter_reception_device',coalesce(previous_device,''),true);
 return saved;
end;$$;
revoke all on function public.submit_winter_public_reception_batch(jsonb,integer,text,text) from public,anon,authenticated;
grant execute on function public.submit_winter_public_reception_batch(jsonb,integer,text,text) to service_role;
