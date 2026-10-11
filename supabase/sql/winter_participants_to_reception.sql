-- Winter participant publication is atomic with the existing participation save.
-- No entries, applications, fees or Autumn records are created here.
begin;
create table public.fhs_winter_reception_roster (
 entity_id uuid not null references public.fhs_roster_entities(id),
 club_id uuid not null references public.fhs_roster_clubs(id),
 rider_id uuid unique references public.riders(id),
 horse_id uuid unique references public.horses(id),
 primary key(entity_id,club_id),
 check ((rider_id is null) <> (horse_id is null))
);
alter table public.fhs_winter_reception_roster enable row level security;
revoke all on public.fhs_winter_reception_roster from public,anon,authenticated;
grant select,insert,update on public.fhs_winter_reception_roster to authenticated;
create policy winter_roster_admin on public.fhs_winter_reception_roster for all to authenticated
 using(auth.uid() is not null and auth.jwt()->'app_metadata'->>'role'='admin')
 with check(auth.uid() is not null and auth.jwt()->'app_metadata'->>'role'='admin');
create or replace function public.save_fhs_winter_participants(p_club_id uuid,p_ids uuid[],p_expected_ids uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5'; actual uuid[]; expected uuid[]; org uuid; item record; linked public.fhs_winter_reception_roster%rowtype; target uuid;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です';end if;
 if p_ids is null or p_expected_ids is null or not exists(select 1 from public.fhs_roster_clubs where id=p_club_id) then raise exception '団体と参加者を確認してください';end if;
 perform pg_advisory_xact_lock(hashtextextended('fhs-winter-participants',0));
 select coalesce(array_agg(entity_id order by entity_id),'{}') into actual from public.fhs_winter_participants where event_id=ev and club_id=p_club_id;
 select coalesce(array_agg(x order by x),'{}') into expected from unnest(p_expected_ids) x;
 if actual is distinct from expected then raise exception '参加名簿が別の操作で更新されています。再読み込みしてください';end if;
 if cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids) x) or exists(select 1 from unnest(p_ids) x where x is null or (not exists(select 1 from public.fhs_roster_affiliations where entity_id=x and club_id=p_club_id and ended_at is null) and not exists(select 1 from public.fhs_winter_participants where event_id=ev and entity_id=x and club_id=p_club_id))) then raise exception '団体に所属する人馬を選択してください';end if;
 if exists(select 1 from public.fhs_roster_entities e where e.id=any(p_ids) and e.archived_at is not null and not exists(select 1 from public.fhs_winter_participants where event_id=ev and entity_id=e.id and club_id=p_club_id)) then raise exception '削除済みの人馬は新たに参加登録できません';end if;
 -- Serialize against submission's FOR SHARE locks before checking references.
 perform r.id from public.riders r join public.fhs_winter_reception_roster m on m.rider_id=r.id where m.club_id=p_club_id and r.event_id=ev order by r.id for update of r;
 perform h.id from public.horses h join public.fhs_winter_reception_roster m on m.horse_id=h.id where m.club_id=p_club_id and h.event_id=ev order by h.id for update of h;
 -- Never detach people already referenced by an entry or an application.
 if exists(select 1 from public.fhs_winter_reception_roster m where m.club_id=p_club_id and not(m.entity_id=any(p_ids)) and (
  exists(select 1 from public.entries e where e.event_id=ev and (e.rider_id=m.rider_id or e.horse_id=m.horse_id)) or
  exists(select 1 from public.reception_requests q where q.event_id=ev and (q.rider_id=m.rider_id or q.horse_id=m.horse_id or q.payload::text like '%'||coalesce(m.rider_id,m.horse_id)::text||'%'))
 )) then raise exception '出番表・受付申請に使用済みの人馬は参加チェックを外せません。棄権や変更の手続きをしてください';end if;
 delete from public.fhs_winter_participants where event_id=ev and club_id=p_club_id and not(entity_id=any(p_ids));
 insert into public.fhs_winter_participants(event_id,entity_id,club_id,name_snapshot,reading_snapshot,jef_number_snapshot,club_name_snapshot)
 select ev,e.id,p_club_id,e.name,e.reading,e.jef_number,c.name from public.fhs_roster_entities e cross join public.fhs_roster_clubs c where e.id=any(p_ids) and c.id=p_club_id
 on conflict(event_id,entity_id,club_id) do nothing;
 -- Existing snapshots remain authoritative even after the common master is edited.
 if cardinality(p_ids)>0 then
  insert into public.organizations(event_id,name)
  select ev,c.name from public.fhs_roster_clubs c where c.id=p_club_id
  on conflict(event_id,name) do update set name=excluded.name returning id into org;
 end if;
 for item in select s.*,e.kind from public.fhs_winter_participants s join public.fhs_roster_entities e on e.id=s.entity_id where s.event_id=ev and s.club_id=p_club_id loop
  select * into linked from public.fhs_winter_reception_roster where entity_id=item.entity_id and club_id=p_club_id;
  if not found then
   if item.kind='rider' then
    insert into public.riders(event_id,organization_id,name,jef_member_no,is_participant,roster_source)
    values(ev,org,item.name_snapshot,item.jef_number_snapshot,true,'shared_roster') returning id into target;
    insert into public.fhs_winter_reception_roster(entity_id,club_id,rider_id) values(item.entity_id,p_club_id,target);
   else
    insert into public.horses(event_id,organization_id,name,jef_registration_no,is_participant,roster_source)
    values(ev,org,item.name_snapshot,item.jef_number_snapshot,true,'shared_roster') returning id into target;
    insert into public.fhs_winter_reception_roster(entity_id,club_id,horse_id) values(item.entity_id,p_club_id,target);
   end if;
  else
   -- Reselection reuses the stable event ID; no name-only identity merge.
   update public.riders set is_participant=true,name=item.name_snapshot,jef_member_no=item.jef_number_snapshot where id=linked.rider_id and event_id=ev;
   update public.horses set is_participant=true,name=item.name_snapshot,jef_registration_no=item.jef_number_snapshot where id=linked.horse_id and event_id=ev;
  end if;
 end loop;
 update public.riders r set is_participant=false from public.fhs_winter_reception_roster m where m.club_id=p_club_id and m.rider_id=r.id and r.event_id=ev and not(m.entity_id=any(p_ids));
 update public.horses h set is_participant=false from public.fhs_winter_reception_roster m where m.club_id=p_club_id and m.horse_id=h.id and h.event_id=ev and not(m.entity_id=any(p_ids));
 return jsonb_build_object('eventId',ev,'count',cardinality(p_ids));
end;$$;
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
