-- Winter-only submission RPC. Existing Autumn policies and functions remain intact.
-- Pending requests are saved here; reflection is a separate administrator operation.
begin;
create or replace function public.submit_winter_reception_add(
  p_id uuid, p_organization_id uuid, p_competition_id uuid,
  p_rider_id uuid, p_horse_id uuid, p_visitor_name text,
  p_membership text default null, p_is_op boolean default false,
  p_instructor_confirmed boolean default false
) returns uuid
language plpgsql security definer set search_path = ''
as $$
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
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin'
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
$$;
revoke all on function public.submit_winter_reception_add(uuid,uuid,uuid,uuid,uuid,text,text,boolean,boolean) from public;
revoke all on function public.submit_winter_reception_add(uuid,uuid,uuid,uuid,uuid,text,text,boolean,boolean) from anon;
grant execute on function public.submit_winter_reception_add(uuid,uuid,uuid,uuid,uuid,text,text,boolean,boolean) to authenticated;
commit;
