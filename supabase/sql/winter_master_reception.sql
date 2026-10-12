-- Extend Winter adapters to the approved Autumn master form. Legacy endpoints keep their contracts.
-- Privileged implementations remain private, authenticated wrappers are invoker-only.
create or replace function fhs_winter_internal.submit_master_add(p_args jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 ident uuid;org uuid;comp uuid;rider uuid;horse uuid;visitor text;membership text;op boolean;instructor boolean;note text;expected integer;
 r public.riders%rowtype;h public.horses%rowtype;c public.competitions%rowtype;q public.reception_requests%rowtype;
 inputs jsonb;price integer;orgname text;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です';end if;
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
end;$$;
revoke all on function fhs_winter_internal.submit_master_add(jsonb) from public,anon,authenticated;
grant execute on function fhs_winter_internal.submit_master_add(jsonb) to authenticated;
create or replace function public.submit_winter_master_add(p_args jsonb) returns uuid language sql security invoker set search_path='' as $$select fhs_winter_internal.submit_master_add(p_args);$$;
revoke all on function public.submit_winter_master_add(jsonb) from public,anon,authenticated;
grant execute on function public.submit_winter_master_add(jsonb) to authenticated;

create or replace function fhs_winter_internal.submit_master_change(p_organization_id uuid,p_before_organization_id uuid,p_id uuid,p_entry_id uuid,p_before jsonb,p_competition_id uuid,p_rider_id uuid,p_horse_id uuid,p_visitor_name text,p_from_membership text,p_membership text,p_is_op boolean,p_from_instructor boolean,p_instructor boolean,p_expected_total integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_event constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 e public.entries%rowtype; c public.competitions%rowtype; q public.reception_requests%rowtype;
 inputs jsonb; snapshot jsonb; fields jsonb:='[]'; n integer:=0; old_price integer; new_price integer;
 total integer; addbase integer:=0; addentry integer:=0; changebase integer:=0; diff integer:=0; org uuid; r public.riders%rowtype; h public.horses%rowtype;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です'; end if;
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
end; $$;
revoke all on function fhs_winter_internal.submit_master_change(uuid,uuid,uuid,uuid,jsonb,uuid,uuid,uuid,text,text,text,boolean,boolean,boolean,integer) from public,anon,authenticated;
grant execute on function fhs_winter_internal.submit_master_change(uuid,uuid,uuid,uuid,jsonb,uuid,uuid,uuid,text,text,text,boolean,boolean,boolean,integer) to authenticated;
create or replace function public.submit_winter_master_change(p_args jsonb) returns uuid language sql security invoker set search_path='' as $$
 select fhs_winter_internal.submit_master_change((p_args->>'p_organization_id')::uuid,(p_args->>'p_before_organization_id')::uuid,(p_args->>'p_id')::uuid,(p_args->>'p_entry_id')::uuid,p_args->'p_before',(p_args->>'p_competition_id')::uuid,(p_args->>'p_rider_id')::uuid,(p_args->>'p_horse_id')::uuid,p_args->>'p_visitor_name',p_args->>'p_from_membership',p_args->>'p_membership',(p_args->>'p_is_op')::boolean,(p_args->>'p_from_instructor')::boolean,(p_args->>'p_instructor')::boolean,(p_args->>'p_expected_total')::integer);
$$;
revoke all on function public.submit_winter_master_change(jsonb) from public,anon,authenticated;
grant execute on function public.submit_winter_master_change(jsonb) to authenticated;

-- One transaction: either every pending request is saved, or none is saved.
create or replace function public.submit_winter_reception_batch(p_items jsonb,p_expected_total integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5'; item jsonb; a jsonb; ident uuid; entry_ident uuid;
 ids jsonb:='[]'; seen uuid[]:='{}'; originals uuid[]:='{}'; org uuid; row_org uuid; total integer:=0; n integer:=0; result uuid;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です'; end if;
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
end; $$;
revoke all on function public.submit_winter_reception_batch(jsonb,integer) from public,anon;
grant execute on function public.submit_winter_reception_batch(jsonb,integer) to authenticated;

create or replace function fhs_winter_internal.confirm_meeting_batch(p_items jsonb,p_expected_total integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;a jsonb;ident uuid;entryid uuid;ids jsonb:='[]';seen uuid[]:='{}';sources uuid[]:='{}';ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';fee integer;total integer:=0;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '打ち合わせ会の確定には本部ログインが必要です';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 or p_expected_total is null or p_expected_total<0 then raise exception '1〜50件の一覧と料金を確認してください';end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-meeting-confirm',0));
 for item in select value from jsonb_array_elements(p_items) order by value#>>'{args,p_id}' loop
  ident:=(item#>>'{args,p_id}')::uuid;
  if ident is null or ident=any(seen) or (item->>'expected_total')::integer is null or (item->>'expected_total')::integer<0 then raise exception '受付番号・個別料金を確認してください';end if;
  seen:=array_append(seen,ident);perform pg_advisory_xact_lock(hashtextextended(ident::text,0));
  if item->>'type' in('change','withdraw') then entryid:=(item#>>'{args,p_entry_id}')::uuid;if entryid is null or entryid=any(sources) then raise exception '同じ出番の変更・棄権が重複しています';end if;sources:=array_append(sources,entryid);end if;
 end loop;
 perform 1 from public.entries where event_id=ev and id=any(sources) order by id for update;
 for item in select value from jsonb_array_elements(p_items) loop
  a:=item->'args';ident:=(a->>'p_id')::uuid;
  case item->>'type'
   when 'add' then perform case when coalesce((a->>'p_master_form')::boolean,false) then public.submit_winter_master_add(a) else public.submit_winter_reception_add(ident,(a->>'p_organization_id')::uuid,(a->>'p_competition_id')::uuid,(a->>'p_rider_id')::uuid,(a->>'p_horse_id')::uuid,a->>'p_visitor_name',a->>'p_membership',(a->>'p_is_op')::boolean,(a->>'p_instructor_confirmed')::boolean) end;
   when 'change' then perform case when coalesce((a->>'p_master_form')::boolean,false) then public.submit_winter_master_change(a) else public.submit_winter_reception_change(ident,(a->>'p_entry_id')::uuid,a->'p_before',(a->>'p_competition_id')::uuid,(a->>'p_rider_id')::uuid,(a->>'p_horse_id')::uuid,a->>'p_visitor_name',a->>'p_from_membership',a->>'p_membership',(a->>'p_is_op')::boolean,(a->>'p_from_instructor')::boolean,(a->>'p_instructor')::boolean,(a->>'p_expected_total')::integer) end;
   when 'withdraw' then perform public.submit_winter_reception_withdraw(ident,(a->>'p_entry_id')::uuid,a->>'p_visitor_name');
   else raise exception '申請種別を確認してください';
  end case;
  select fee_amount into fee from public.reception_requests where id=ident and event_id=ev;
  if fee is null or fee<>(item->>'expected_total')::integer then raise exception '個別の料金が変更されています。確認し直してください';end if;
  total:=total+fee;ids:=ids||jsonb_build_array(ident);
 end loop;
 if total<>p_expected_total then raise exception '合計料金が一致しません';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  ident:=(item#>>'{args,p_id}')::uuid;
  case item->>'type' when 'change' then perform public.reflect_winter_change_request(ident);else perform public.reflect_winter_reception_request(ident);end case;
  if not exists(select 1 from public.reception_requests where id=ident and event_id=ev and status='reflected') then raise exception '出番表への反映を確認できません';end if;
  insert into public.fhs_winter_meeting_requests(request_id,event_id,confirmed_by) values(ident,ev,auth.uid()) on conflict(request_id) do nothing;
 end loop;
 return jsonb_build_object('ids',ids,'total',total);
end;$$;

create or replace function fhs_winter_internal.check_master_target(p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';q public.reception_requests%rowtype;c public.competitions%rowtype;r public.riders%rowtype;h public.horses%rowtype;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です';end if;
 select * into q from public.reception_requests where id=p_request_id and event_id=ev;
 if not found or q.payload->>'masterFormVersion' is distinct from '1' then raise exception 'Winterの共通受付を確認してください';end if;
 select * into c from public.competitions where id=q.to_competition_id and event_id=ev for share;
 if not found then raise exception 'Winterの競技を確認してください';end if;
 select * into r from public.riders where id=q.rider_id and event_id=ev for share;
 if not found then raise exception '選手の大会を確認してください';end if;
 select * into h from public.horses where id=q.horse_id and event_id=ev for share;
 if not found then raise exception '馬の大会を確認してください';end if;
 if q.organization_id is distinct from r.organization_id and q.organization_id is distinct from h.organization_id then raise exception '選手または馬の所属を再確認してください';end if;
 if not exists(select 1 from public.organizations where id=q.organization_id and event_id=ev) then raise exception 'Winterの団体を確認してください';end if;
 if not exists(select 1 from public.organizations where id=r.organization_id and event_id=ev) or not exists(select 1 from public.organizations where id=h.organization_id and event_id=ev) then raise exception '人馬の所属大会を確認してください';end if;
 if (r.roster_source='shared_roster' and not coalesce(r.is_participant,false)) or (h.roster_source='shared_roster' and not coalesce(h.is_participant,false)) then raise exception '参加チェックが外れた人馬です';end if;
 if c.official and (nullif(btrim(r.jef_member_no),'') is null or nullif(btrim(h.jef_registration_no),'') is null) then raise exception '所属と公認登録を再確認してください';end if;
end;$$;
revoke all on function fhs_winter_internal.check_master_target(uuid) from public,anon,authenticated;

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
    v_entry:=q.id;
    if exists(select 1 from public.entries where id=v_entry) then raise exception '出番IDが既に使われています'; end if;
    select case when c.official then 0 else coalesce(max(start_order),0)+1 end into v_position from public.entries where event_id=v_event and competition_id=v_comp and lower(status) not in ('wd','withdrawn');
    insert into public.entries(id,event_id,competition_id,rider_id,horse_id,organization_id,start_order,status,source,is_op)
      values(v_entry,v_event,v_comp,q.rider_id,q.horse_id,q.organization_id,v_position,'active','winter-reception',coalesce((q.payload#>>'{add,isOp}')::boolean,false));
    if q.payload->>'masterFormVersion'='1' then update public.entries set request_note=q.payload#>>'{add,note}' where id=v_entry and event_id=v_event;end if;
  else
    select * into e from public.entries where id=q.original_entry_id and event_id=v_event and competition_id=v_comp for update;
    if not found or lower(e.status) in ('wd','withdrawn') then raise exception '棄権対象が変更されています。本部で確認してください'; end if;
    v_entry:=e.id;
    update public.entries set status='withdrawn',start_order=null,updated_at=now() where id=e.id and event_id=v_event;
  end if;
  with numbered as (select id,row_number() over(order by start_order nulls last,created_at,id)::integer as n from public.entries where event_id=v_event and competition_id=v_comp and lower(status) not in ('wd','withdrawn'))
    update public.entries target set start_order=n.n,updated_at=now() from numbered n where target.id=n.id and target.event_id=v_event;
  update public.reception_requests set status='reflected',entry_id=v_entry,reflected_at=now() where id=q.id and event_id=v_event;
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
 return entry;
end; $function$;

