begin;
-- Separate Winter endpoints; existing Autumn functions and policies are untouched.
create or replace function public.list_winter_reception_requests(p_offset integer default 0)
returns setof public.reception_requests language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です'; end if;
  if p_offset is null or p_offset<0 then raise exception '取得位置が不正です'; end if;
  return query select q.* from public.reception_requests q
    where q.event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'
    order by q.created_at desc,q.id limit 200 offset p_offset;
end; $$;

create or replace function public.submit_winter_reception_withdraw(p_id uuid,p_entry_id uuid,p_visitor_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_event constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
  e public.entries%rowtype; q public.reception_requests%rowtype; v_payload jsonb;
begin
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です'; end if;
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
end; $$;

create or replace function public.reflect_winter_reception_request(p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
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
    if not exists(select 1 from public.riders where id=q.rider_id and event_id=v_event and organization_id=q.organization_id and (not c.official or nullif(btrim(jef_member_no),'') is not null))
      or not exists(select 1 from public.horses where id=q.horse_id and event_id=v_event and organization_id=q.organization_id and (not c.official or nullif(btrim(jef_registration_no),'') is not null))
      then raise exception '所属と公認登録を再確認してください'; end if;
    if coalesce((q.payload#>>'{add,isOp}')::boolean,false) and (c.official or c.op_fee is null) then raise exception 'OP参加を確認してください'; end if;
    v_entry:=q.id;
    if exists(select 1 from public.entries where id=v_entry) then raise exception '出番IDが既に使われています'; end if;
    select case when c.official then 0 else coalesce(max(start_order),0)+1 end into v_position from public.entries where event_id=v_event and competition_id=v_comp and lower(status) not in ('wd','withdrawn');
    insert into public.entries(id,event_id,competition_id,rider_id,horse_id,organization_id,start_order,status,source,is_op)
      values(v_entry,v_event,v_comp,q.rider_id,q.horse_id,q.organization_id,v_position,'active','winter-reception',coalesce((q.payload#>>'{add,isOp}')::boolean,false));
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
end; $$;
revoke all on function public.list_winter_reception_requests(integer) from public,anon;
revoke all on function public.submit_winter_reception_withdraw(uuid,uuid,text) from public,anon;
revoke all on function public.reflect_winter_reception_request(uuid) from public,anon;
grant execute on function public.list_winter_reception_requests(integer) to authenticated;
grant execute on function public.submit_winter_reception_withdraw(uuid,uuid,text) to authenticated;
grant execute on function public.reflect_winter_reception_request(uuid) to authenticated;
commit;
