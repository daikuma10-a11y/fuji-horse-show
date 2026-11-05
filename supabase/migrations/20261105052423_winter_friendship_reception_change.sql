-- November 2026 Winter only. Preserve saved requests, reversals, ACLs and retry keys.

CREATE OR REPLACE FUNCTION fhs_winter_internal.submit_master_change(p_organization_id uuid, p_before_organization_id uuid, p_id uuid, p_entry_id uuid, p_before jsonb, p_competition_id uuid, p_rider_id uuid, p_horse_id uuid, p_visitor_name text, p_from_membership text, p_membership text, p_is_op boolean, p_from_instructor boolean, p_instructor boolean, p_expected_total integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_event constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 e public.entries%rowtype; c public.competitions%rowtype; q public.reception_requests%rowtype;
 inputs jsonb; snapshot jsonb; fields jsonb:='[]'; n integer:=0; free_change boolean; old_price integer; new_price integer;
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
 free_change:=c.competition_no in ('①','②','③','④') and exists (
     select 1 from public.competitions old_comp
      where old_comp.id=e.competition_id and old_comp.event_id=e.event_id
        and old_comp.competition_no in ('①','②','③','④'));
 if not free_change then
  if n>=2 then addbase:=3000; addentry:=new_price;
  else changebase:=2000; diff:=greatest(0,new_price-old_price); end if;
 end if;
 total:=addbase+addentry+changebase+diff;
 if total<>p_expected_total then raise exception '競技料金が更新されています。料金を確認し直してください'; end if;
 insert into public.reception_requests(id,event_id,request_type,original_entry_id,from_competition_id,to_competition_id,target_competition_id,rider_id,horse_id,organization_id,status,source,fee,fee_amount,payload)
 values(p_id,v_event,'change',e.id,e.competition_id,c.id,c.id,p_rider_id,p_horse_id,org,'pending','winter-reception',total,total,
 jsonb_build_object('masterFormVersion',1,'visitorName',btrim(p_visitor_name),'inputs',inputs,'before',snapshot,'changedFields',fields,'treatedAsWithdrawAdd',(not free_change and n>=2),'fromEntryFee',old_price,'toEntryFee',new_price,'fee',jsonb_build_object('addBase',addbase,'addEntry',addentry,'changeBase',changebase,'competitionDiff',diff,'total',total),'change',jsonb_build_object('toCompetitionId',c.id,'toPlayerId',p_rider_id,'toHorseId',p_horse_id,'toIsOp',p_is_op,'membership',p_membership)));
 return p_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.submit_winter_reception_change(p_id uuid, p_entry_id uuid, p_before jsonb, p_competition_id uuid, p_rider_id uuid, p_horse_id uuid, p_visitor_name text, p_from_membership text, p_membership text, p_is_op boolean, p_from_instructor boolean, p_instructor boolean, p_expected_total integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_event constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 e public.entries%rowtype; c public.competitions%rowtype; q public.reception_requests%rowtype;
 inputs jsonb; snapshot jsonb; fields jsonb:='[]'; n integer:=0; free_change boolean; old_price integer; new_price integer;
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
 free_change:=c.competition_no in ('①','②','③','④') and exists (
     select 1 from public.competitions old_comp
      where old_comp.id=e.competition_id and old_comp.event_id=e.event_id
        and old_comp.competition_no in ('①','②','③','④'));
 if not free_change then
  if n>=2 then addbase:=3000; addentry:=new_price;
  else changebase:=2000; diff:=greatest(0,new_price-old_price); end if;
 end if;
 total:=addbase+addentry+changebase+diff;
 if total<>p_expected_total then raise exception '競技料金が更新されています。料金を確認し直してください'; end if;
 insert into public.reception_requests(id,event_id,request_type,original_entry_id,from_competition_id,to_competition_id,target_competition_id,rider_id,horse_id,organization_id,status,source,fee,fee_amount,payload)
 values(p_id,v_event,'change',e.id,e.competition_id,c.id,c.id,p_rider_id,p_horse_id,org,'pending','winter-reception',total,total,
 jsonb_build_object('visitorName',btrim(p_visitor_name),'inputs',inputs,'before',snapshot,'changedFields',fields,'treatedAsWithdrawAdd',(not free_change and n>=2),'fromEntryFee',old_price,'toEntryFee',new_price,'fee',jsonb_build_object('addBase',addbase,'addEntry',addentry,'changeBase',changebase,'competitionDiff',diff,'total',total),'change',jsonb_build_object('toCompetitionId',c.id,'toPlayerId',p_rider_id,'toHorseId',p_horse_id,'toIsOp',p_is_op,'membership',p_membership)));
 return p_id;
end; $function$;
