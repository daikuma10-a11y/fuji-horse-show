-- A horse and all of its initial starts are one administrative cancellation.
create table fhs_winter_internal.horse_cancellations (
  operation_id uuid primary key,
  horse_id uuid not null,
  organization_id uuid not null,
  quote jsonb not null,
  confirmed_by uuid not null,
  confirmed_at timestamptz not null default clock_timestamp()
);
revoke all on fhs_winter_internal.horse_cancellations from public,anon,authenticated;

create function fhs_winter_internal.cancel_registered_horse(p_org uuid,p_horse uuid,p_operation uuid,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  ev constant uuid := 'b571f05e-ed23-4e07-929e-be2b73e601a5';
  horse public.horses%rowtype;
  receipt fhs_winter_internal.horse_cancellations%rowtype;
  entry_id uuid; bill uuid; item jsonb; account jsonb; quote jsonb;
  starts jsonb := '[]'; bills jsonb := '[]'; decrease bigint;
begin
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then
    raise exception '本部管理者でログインしてください';
  end if;
  if (p_operation is null)<>(p_expected is null) then raise exception '参加取消の内容を確認してください'; end if;
  perform pg_advisory_xact_lock(hashtextextended('fhs-winter-participants',0));
  if p_operation is not null then
    select * into receipt from fhs_winter_internal.horse_cancellations where operation_id=p_operation;
    if found then
      if receipt.horse_id=p_horse and receipt.organization_id=p_org and receipt.quote=p_expected then return receipt.quote; end if;
      raise exception '前回の取消内容と一致しません';
    end if;
  end if;
  select * into horse from public.horses where id=p_horse and organization_id=p_org and event_id=ev for update;
  if not found or horse.is_participant=false or (horse.roster_source='shared_roster' and horse.is_participant is distinct from true)
    then raise exception '選択中の団体の参加馬を確認してください'; end if;
  if exists(select from public.reception_requests q where q.event_id=ev and q.status='pending'
    and (q.horse_id=p_horse or q.payload::text like '%'||p_horse::text||'%' or exists(
      select from public.entries e where e.event_id=ev and e.horse_id=p_horse and e.id in(q.entry_id,q.original_entry_id)))) then
    raise exception 'この馬に未反映の受付があります。申請一覧を確認してください';
  end if;
  -- Only initial starts and their fees can be rescinded here. Preserve all immutable receipts.
  if exists(select from public.entries e where e.event_id=ev and e.horse_id=p_horse
    and e.source is distinct from 'winter-initial-cancelled'
    and (e.source is distinct from 'winter-initial' or lower(e.status) in('wd','withdrawn'))) then
    raise exception 'この馬には当日受付または棄権の履歴があります。申請・精算の内訳を確認してください';
  end if;
  for entry_id in select e.id from public.entries e where e.event_id=ev and e.horse_id=p_horse
    and e.source='winter-initial' order by e.competition_id,e.id loop
    item:=fhs_winter_internal.cancel_initial_entry(entry_id,null,null);
    starts:=starts||jsonb_build_array(item);
  end loop;
  for bill in select org from (select p_org org union select (x->>'billTo')::uuid from jsonb_array_elements(starts)x) g order by org loop
    perform pg_advisory_xact_lock(hashtextextended('winter-finance:'||bill::text,0));
    account:=fhs_winter_internal.settlement_account(bill)->'account';
    select coalesce(sum((x->>'fee')::bigint),0) into decrease from jsonb_array_elements(starts)x where x->>'billTo'=bill::text;
    if bill=p_org then decrease:=decrease+14000; end if;
    if (account->>'total')::bigint<decrease then raise exception '取消後の請求が負額になります。精算の金額訂正を確認してください'; end if;
    bills:=bills||jsonb_build_array(jsonb_build_object('id',bill,'before',(account->>'total')::bigint,
      'after',(account->>'total')::bigint-decrease,'remaining',(account->>'remaining')::bigint-decrease));
  end loop;
  quote:=jsonb_build_object('horseId',horse.id,'organizationId',p_org,'name',horse.name,'number',horse.jef_registration_no,
    'registration',14000,'entries',starts,'billing',bills);
  if p_operation is null then return quote; end if;
  if quote is distinct from p_expected then raise exception '馬・出番または請求が更新されました。取消内容を再確認してください'; end if;
  for item in select value from jsonb_array_elements(starts) loop
    entry_id:=(item->>'entryId')::uuid;
    -- Earlier rows in this transaction may have shifted the position and running balance.
    perform fhs_winter_internal.cancel_initial_entry(entry_id,p_operation,
      fhs_winter_internal.cancel_initial_entry(entry_id,null,null));
  end loop;
  delete from public.fhs_winter_participants p using public.fhs_winter_reception_roster m
    where p.event_id=ev and m.horse_id=p_horse and p.club_id=m.club_id and p.entity_id=m.entity_id;
  update public.horses set is_participant=false,
    roster_source=case when roster_source='shared_roster' then roster_source else 'winter-substituted' end
    where event_id=ev and id=p_horse;
  for item in select value from jsonb_array_elements(bills) loop
    account:=fhs_winter_internal.settlement_account((item->>'id')::uuid)->'account';
    if account->'total' is distinct from item->'after' or account->'remaining' is distinct from item->'remaining' then
      raise exception '取消後の請求と確認額が一致しません';
    end if;
  end loop;
  insert into fhs_winter_internal.horse_cancellations(operation_id,horse_id,organization_id,quote,confirmed_by)
    values(p_operation,p_horse,p_org,quote,auth.uid());
  return quote;
end;
$$;
revoke all on function fhs_winter_internal.cancel_registered_horse(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function fhs_winter_internal.cancel_registered_horse(uuid,uuid,uuid,jsonb) to authenticated;
create function public.winter_cancel_registered_horse(p_org uuid,p_horse uuid,p_operation uuid,p_expected jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select fhs_winter_internal.cancel_registered_horse(p_org,p_horse,p_operation,p_expected)
$$;
revoke all on function public.winter_cancel_registered_horse(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.winter_cancel_registered_horse(uuid,uuid,uuid,jsonb) to authenticated;
