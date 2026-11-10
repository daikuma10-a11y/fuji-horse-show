-- Preserve the original input, the cancellation receipt and the effective (billable) fee together.
alter table public.fhs_winter_initial_entries
  drop constraint fhs_winter_initial_entries_entry_fee_check,
  add constraint fhs_winter_initial_entries_entry_fee_check check (
    entry_fee > 0 or (entry_fee = 0 and inputs ? 'cancellation'
      and jsonb_typeof(inputs->'cancellation') = 'object')
  );

create function fhs_winter_internal.cancel_initial_entry(p_entry uuid, p_operation uuid, p_expected jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ev constant uuid := 'b571f05e-ed23-4e07-929e-be2b73e601a5';
  e public.entries%rowtype;
  initial public.fhs_winter_initial_entries%rowtype;
  competition uuid;
  bill uuid;
  effective_fee integer;
  previous_adjustment uuid;
  account jsonb;
  quote jsonb;
  receipt jsonb;
begin
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then
    raise exception '本部管理者でログインしてください';
  end if;
  if (p_operation is null) <> (p_expected is null) then raise exception '取消内容を再確認してください'; end if;

  perform pg_advisory_xact_lock(hashtextextended('winter-initial:' || p_entry::text,0));
  select * into strict initial from public.fhs_winter_initial_entries where event_id=ev and id=p_entry for update;
  receipt := initial.inputs->'cancellation';
  if receipt is not null then
    if receipt->>'operation' = p_operation::text and receipt->'quote' = p_expected then return p_expected; end if;
    raise exception 'この事前エントリーは取消済みです。最新の出番表を確認してください';
  end if;

  bill := coalesce(initial.inputs->>'billingOrganizationId',initial.inputs->>'organizationId')::uuid;
  select competition_id into strict competition from public.entries where id=p_entry and event_id=ev;
  perform pg_advisory_xact_lock(hashtextextended('winter-order:' || competition::text,0));
  perform pg_advisory_xact_lock(hashtextextended('winter-finance:' || bill::text,0));
  select * into strict e from public.entries where id=p_entry and event_id=ev for update;
  if e.competition_id <> competition or lower(e.status) in ('wd','withdrawn') then
    raise exception '出番が変わりました。最新の出番表を確認してください';
  end if;
  if exists(select from public.reception_requests q where q.event_id=ev and
    (q.original_entry_id=e.id or q.entry_id=e.id) and q.status in ('pending','reflected')) then
    raise exception 'この出番には受付の申請があります。「申請一覧」で該当する申請を確認してください';
  end if;
  if exists(select from public.fhs_winter_settlement_only q where q.event_id=ev and
    q.inputs->>'entryId'=e.id::text and q.reverses_id is null and
    not exists(select from public.fhs_winter_settlement_only r where r.reverses_id=q.id)) then
    raise exception 'この出番には現場登録があります。「精算」の現場履歴を確認してください';
  end if;

  -- The current price includes competition-fee differences from any prior horse swaps.
  select (x->>'oldFee')::integer into strict effective_fee
    from jsonb_array_elements(fhs_winter_internal.substitution_entries(e.horse_id)) x where x->>'id'=e.id::text;
  if effective_fee is null or effective_fee<0 then raise exception 'この出番の競技料を確認できません'; end if;
  account := fhs_winter_internal.settlement_account(bill)->'account';
  quote := jsonb_build_object('entryId',e.id,'competitionId',e.competition_id,'riderId',e.rider_id,
    'horseId',e.horse_id,'position',e.start_order,'op',e.is_op,'billTo',bill,'fee',effective_fee,
    'beforeTotal',(account->>'total')::bigint,'afterTotal',(account->>'total')::bigint-effective_fee,
    'afterRemaining',(account->>'remaining')::bigint-effective_fee);
  if (quote->>'afterTotal')::bigint < 0 then raise exception '取消後の請求が負額になります。先に精算の金額訂正を確認してください'; end if;
  if p_operation is null then return quote; end if;
  if p_expected is distinct from quote then raise exception '出番または請求額が変わりました。取消内容を再確認してください'; end if;

  receipt := jsonb_build_object('operation',p_operation,'quote',quote,'originalFee',initial.entry_fee,
    'at',clock_timestamp(),'by',auth.uid(),'originalSource',e.source);
  if initial.entry_fee <> effective_fee then
    account := fhs_winter_internal.settlement_account(bill)->'account';
    select id into previous_adjustment from public.fhs_winter_charge_adjustments where event_id=ev
      and organization_key=bill order by sequence desc limit 1;
    perform fhs_winter_internal.save_charge_adjustment(gen_random_uuid(),bill,initial.entry_fee-effective_fee,
      '事前エントリー取消に伴う競技料差額の取消（出番ID '||e.id::text||'）',
      (account->>'total')::bigint,previous_adjustment);
  end if;
  update public.fhs_winter_initial_entries set entry_fee=0,
    inputs=inputs||jsonb_build_object('cancellation',receipt) where event_id=ev and id=e.id;
  -- Reuse the existing non-running status for DB operations. The distinct source hides the
  -- cancelled row from the Winter programme while keeping all registration IDs and histories.
  update public.entries set source='winter-initial-cancelled',status='withdrawn',start_order=null,
    updated_at=now() where event_id=ev and id=e.id;
  with active as (
    select id,row_number() over(order by start_order nulls last,created_at,id) as pos
    from public.entries where event_id=ev and competition_id=competition and lower(status) not in ('wd','withdrawn')
  ) update public.entries other set start_order=a.pos,updated_at=now() from active a
    where other.id=a.id and other.start_order is distinct from a.pos;


  account := fhs_winter_internal.settlement_account(bill)->'account';
  if account->'total' is distinct from quote->'afterTotal' or account->'remaining' is distinct from quote->'afterRemaining' then
    raise exception '取消後の請求と確認額が一致しません';
  end if;
  return quote;
exception when no_data_found then
  raise exception '対象のWinter事前エントリーが見つかりません。最新の出番表を確認してください';
end;
$$;

revoke all on function fhs_winter_internal.cancel_initial_entry(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function fhs_winter_internal.cancel_initial_entry(uuid,uuid,jsonb) to authenticated;
create function public.winter_cancel_initial_entry(p_entry uuid,p_operation uuid,p_expected jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select fhs_winter_internal.cancel_initial_entry(p_entry,p_operation,p_expected)
$$;
revoke all on function public.winter_cancel_initial_entry(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.winter_cancel_initial_entry(uuid,uuid,jsonb) to authenticated;
