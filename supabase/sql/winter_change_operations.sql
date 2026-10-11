begin;
-- Internal price helper. Only the administrator-checked Winter RPC calls it.
create or replace function public.winter_change_price(p_comp uuid,p_membership text,p_op boolean,p_instructor boolean)
returns integer language plpgsql security invoker set search_path='' as $$
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
  if c.official or c.op_fee is null then raise exception 'OP参加を確認してください'; end if;
  price:=c.op_fee;
 end if;
 if price is null or price<=0 then raise exception '競技料金を確認してください'; end if;
 return price;
end; $$;
revoke all on function public.winter_change_price(uuid,text,boolean,boolean) from public,anon,authenticated;

create or replace function public.submit_winter_reception_change(p_id uuid,p_entry_id uuid,p_before jsonb,p_competition_id uuid,p_rider_id uuid,p_horse_id uuid,p_visitor_name text,p_from_membership text,p_membership text,p_is_op boolean,p_from_instructor boolean,p_instructor boolean,p_expected_total integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_event constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 e public.entries%rowtype; c public.competitions%rowtype; q public.reception_requests%rowtype;
 inputs jsonb; snapshot jsonb; fields jsonb:='[]'; n integer:=0; old_price integer; new_price integer;
 total integer; addbase integer:=0; addentry integer:=0; changebase integer:=0; diff integer:=0; org uuid;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です'; end if;
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
end; $$;
revoke all on function public.submit_winter_reception_change(uuid,uuid,jsonb,uuid,uuid,uuid,text,text,text,boolean,boolean,boolean,integer) from public,anon;
grant execute on function public.submit_winter_reception_change(uuid,uuid,jsonb,uuid,uuid,uuid,text,text,text,boolean,boolean,boolean,integer) to authenticated;

create or replace function public.reflect_winter_change_request(p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
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
 if snapshot is distinct from q.payload->'before' then raise exception '変更対象が更新されています。申請を本部で確認してください'; end if;
 select * into c from public.competitions where id=q.to_competition_id and event_id=v_event for share;
 if not found then raise exception 'Winterの競技を確認してください'; end if;
 if not exists(select 1 from public.riders where id=q.rider_id and event_id=v_event and organization_id=q.organization_id and (not c.official or nullif(btrim(jef_member_no),'') is not null)) or not exists(select 1 from public.horses where id=q.horse_id and event_id=v_event and organization_id=q.organization_id and (not c.official or nullif(btrim(jef_registration_no),'') is not null)) then raise exception '変更後の所属・公認登録を再確認してください'; end if;
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
end; $$;
revoke all on function public.reflect_winter_change_request(uuid) from public,anon;
grant execute on function public.reflect_winter_change_request(uuid) to authenticated;
commit;
