-- An office correction replaces one initial registration atomically. Keep the old
-- registration and its audit trail, and keep the published position in the same class.
create function fhs_winter_internal.correct_group_entry(p_group uuid,p_entry uuid,p_target jsonb,p_operation uuid,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
  start public.entries%rowtype;
  horse public.horses%rowtype;
  rider public.riders%rowtype;
  comp public.competitions%rowtype;
  membership text:=p_target->>'membership';
  op boolean:=(p_target->>'op')::boolean;
  instructor boolean:=(p_target->>'instructor')::boolean;
  fee integer; identifier uuid; old_bill uuid;
  receipt jsonb; original jsonb; basis jsonb; quote jsonb; account jsonb;
  accounts jsonb:='[]'; item jsonb; positions jsonb;
begin
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部管理者でログインしてください'; end if;
  if (p_operation is null)<>(p_expected is null) or p_group is null or p_entry is null or p_operation=p_entry then raise exception '修正内容を確認してください'; end if;
  perform pg_advisory_xact_lock(hashtextextended('fhs-winter-participants',0));
  perform pg_advisory_xact_lock(hashtextextended('winter-initial:'||p_entry::text,0));
  if p_operation is not null then
    select inputs->'groupCorrection' into receipt from public.fhs_winter_initial_entries where id=p_entry and event_id=ev;
    if receipt is not null then
      if receipt->>'operation'=p_operation::text and receipt->'quote'=p_expected and receipt#>'{quote,target}'=p_target
         and receipt#>>'{quote,group}'=p_group::text then return p_expected; end if;
      raise exception 'この出番は訂正済みです。最新の団体別登録内容を確認してください';
    end if;
  end if;
  select * into strict start from public.entries where id=p_entry and event_id=ev and source='winter-initial';
  if coalesce(start.organization_id,(select organization_id from public.horses where id=start.horse_id and event_id=ev)) is distinct from p_group then raise exception '団体と出番が一致しません'; end if;
  select * into strict comp from public.competitions where id=(p_target->>'competition')::uuid and event_id=ev for share;
  select * into strict horse from public.horses where id=(p_target->>'horse')::uuid and event_id=ev for share;
  select * into strict rider from public.riders where id=(p_target->>'rider')::uuid and event_id=ev for share;
  if op is null or instructor is null or horse.organization_id is null or rider.organization_id is null or
     horse.is_participant=false or rider.is_participant=false or horse.roster_source='winter-substituted' or
     (horse.roster_source='shared_roster' and horse.is_participant is not true) or
     (rider.roster_source='shared_roster' and rider.is_participant is not true) then raise exception '今大会の参加人馬を選んでください'; end if;
  if comp.official and (nullif(btrim(horse.jef_registration_no),'') is null or nullif(btrim(rider.jef_member_no),'') is null) then raise exception '公認競技には登録番号が必要です'; end if;
  if membership is not null and (membership not in ('member','nonmember') or (comp.member_fee is null and comp.nonmember_fee is null)) then raise exception '会員区分を確認してください'; end if;
  fee:=public.winter_change_price(comp.id,membership,op,instructor);
  for identifier in select distinct id from unnest(array[start.competition_id,comp.id]) as t(id) order by id loop
    perform pg_advisory_xact_lock(hashtextextended('winter-order:'||identifier::text,0));
  end loop;
  select coalesce(inputs->>'billingOrganizationId',inputs->>'organizationId')::uuid into strict old_bill from public.fhs_winter_initial_entries where id=p_entry and event_id=ev;
  for identifier in select distinct id from unnest(array[old_bill,rider.organization_id]) as t(id) order by id loop
    perform pg_advisory_xact_lock(hashtextextended('winter-finance:'||identifier::text,0));
  end loop;
  original:=fhs_winter_internal.cancel_initial_entry(p_entry,null,null);
  if original->>'competitionId'<>start.competition_id::text or original->>'horseId'<>start.horse_id::text or original->>'riderId'<>start.rider_id::text then raise exception '対象の出番が変わりました。再表示してください'; end if;
  select x into strict basis from jsonb_array_elements(fhs_winter_internal.substitution_entries(start.horse_id)) x where x->>'id'=p_entry::text;
  if (start.competition_id,start.horse_id,start.rider_id,coalesce(start.is_op,false),basis->>'membership') is not distinct from (comp.id,horse.id,rider.id,op,membership) then raise exception '訂正する項目を選んでください'; end if;
  if exists(select from public.entries where event_id=ev and id<>p_entry and competition_id=comp.id and rider_id=rider.id and horse_id=horse.id and lower(status) not in('wd','withdrawn'))
     or exists(select from public.reception_requests where event_id=ev and status='pending' and target_competition_id=comp.id and rider_id=rider.id and horse_id=horse.id) then raise exception '同じ競技・選手・馬の登録または未反映申請があります'; end if;
  for identifier in select distinct id from unnest(array[old_bill,rider.organization_id]) as t(id) order by id loop
    account:=fhs_winter_internal.settlement_account(identifier)->'account';
    accounts:=accounts||jsonb_build_array(jsonb_build_object('id',identifier,'before',(account->>'total')::bigint,
      'delta',(case when identifier=rider.organization_id then fee else 0 end)-(case when identifier=old_bill then (original->>'fee')::int else 0 end),
      'remaining',(account->>'remaining')::bigint));
  end loop;
  quote:=jsonb_build_object('group',p_group,'entry',p_entry,'target',p_target,'original',original,'fee',fee,'accounts',accounts);
  if p_operation is null then return quote; end if;
  if quote is distinct from p_expected then raise exception '出番または請求額が変わりました。修正内容を再確認してください'; end if;
  if exists(select from public.entries where id=p_operation) then raise exception '使用済みの受付番号です'; end if;
  if start.competition_id=comp.id then
    select jsonb_agg(jsonb_build_object('id',id,'position',start_order)) into positions from public.entries
      where event_id=ev and competition_id=comp.id and lower(status) not in('wd','withdrawn');
  end if;
  perform fhs_winter_internal.cancel_initial_entry(p_entry,p_operation,original);
  perform fhs_winter_internal.register_winter_initial_entry(p_operation,horse.organization_id,comp.id,rider.id,horse.id,membership,op,instructor,fee);
  if positions is not null then
    update public.entries e set start_order=s.position,updated_at=now()
    from jsonb_to_recordset(positions) s(id uuid,position integer)
    where e.event_id=ev and e.id=case when s.id=p_entry then p_operation else s.id end and e.start_order is distinct from s.position;
  end if;
  update public.entries set request_note=start.request_note where id=p_operation and event_id=ev;
  update public.fhs_winter_initial_entries set inputs=inputs||jsonb_build_object('groupCorrection',
    jsonb_build_object('operation',p_operation,'quote',quote,'actor',auth.uid(),'at',clock_timestamp())) where id=p_entry and event_id=ev;
  for item in select value from jsonb_array_elements(accounts) loop
    account:=fhs_winter_internal.settlement_account((item->>'id')::uuid)->'account';
    if (account->>'total')::bigint is distinct from (item->>'before')::bigint+(item->>'delta')::bigint or
       (account->>'remaining')::bigint is distinct from (item->>'remaining')::bigint+(item->>'delta')::bigint then raise exception '精算と訂正額が一致しません'; end if;
  end loop;
  return quote;
exception when no_data_found then raise exception '対象の登録が更新されています。最新の団体別登録内容を確認してください';
end;
$$;
revoke all on function fhs_winter_internal.correct_group_entry(uuid,uuid,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function fhs_winter_internal.correct_group_entry(uuid,uuid,jsonb,uuid,jsonb) to authenticated;
create function public.winter_correct_group_entry(p_group uuid,p_entry uuid,p_target jsonb,p_operation uuid,p_expected jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select fhs_winter_internal.correct_group_entry(p_group,p_entry,p_target,p_operation,p_expected)
$$;
revoke all on function public.winter_correct_group_entry(uuid,uuid,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.winter_correct_group_entry(uuid,uuid,jsonb,uuid,jsonb) to authenticated;
