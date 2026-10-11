-- All test writes are rolled back. No existing entry or payment is retained as changed.
begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',
  (select id from auth.users where raw_app_meta_data->>'role'='admin' limit 1),
  'role','authenticated','app_metadata',jsonb_build_object('role','admin'))::text,true);
set local role authenticated;
do $$
declare
  event uuid := '2af66251-66a2-4c51-8180-a5badf0584d4';
  draft_id uuid := gen_random_uuid(); baseline jsonb; content jsonb; submissions jsonb := '[]';
  ids jsonb; final_orders jsonb := '[]'; item jsonb; req jsonb; rec jsonb; payload jsonb;
  req_id uuid; add_id uuid; official_add uuid; change_id uuid; withdraw_id uuid;
  e record; c record; action text; fee integer; normal_count integer; before_requests integer;
  before_manual integer; failed boolean; saved jsonb; expected uuid; index integer := 0;
begin
  select count(*) into normal_count from public.entries where event_id=event;
  select count(*) into before_requests from public.reception_requests where event_id=event;
  select count(*) into before_manual from public.settlement_manual_records where event_id=event;
  select coalesce(jsonb_agg(to_jsonb(v) order by v.entry_id::text),'[]') into baseline
    from (select entry_id,competition_id,competition_no,start_order,status,rider_id,rider_name,
      horse_id,horse_name,organization_name,is_op,result_eligible from public.reception_entries where event_id=event) v;
  -- Four actions across an unofficial and an official competition.
  for index in 1..4 loop
    action := case index when 1 then 'add' when 2 then 'change' when 3 then 'withdraw' else 'add' end;
    select * into strict c from public.competitions where event_id=event and competition_no=case when index=4 then '5' else '1' end;
    select * into e from public.reception_entries where event_id=event and competition_id=c.id
      and lower(status) not in ('wd','withdrawn') and rider_id is not null and horse_id is not null
      order by start_order offset case when index=3 then 1 else 0 end limit 1;
    if e.entry_id is null then raise exception 'test requires active entries'; end if;
    req_id := gen_random_uuid();
    if index=1 then add_id:=req_id; elsif index=2 then change_id:=req_id; elsif index=3 then withdraw_id:=req_id; else official_add:=req_id; end if;
    fee := case action when 'add' then 3000+c.fee when 'withdraw' then 0 else 2000+case when e.is_op then 1000 else 0 end end;
    payload := jsonb_build_object('id',req_id,'type',action,'orgId','test-org','onSiteAdmin',true,
      'postDeadlinePeriod','before_event','visitorName','DB回帰検証','organizationName',e.organization_name);
    if action='add' then
      payload:=payload||jsonb_build_object('add',jsonb_build_object('competitionNo',c.competition_no::integer,
        'competitionId','c-'||c.competition_no,'officialPlayerId',e.rider_id,'officialHorseId',e.horse_id,
        'playerName',e.rider_name,'horseName',e.horse_name,'isOp',false));
    elsif action='change' then
      expected:=e.entry_id;
      payload:=payload||jsonb_build_object('change',jsonb_build_object('entryId',e.entry_id,
        'fromCompetitionNo',1,'toCompetitionNo',1,'fromCompetitionId','c-1','toCompetitionId','c-1',
        'officialPlayerId',e.rider_id,'officialHorseId',e.horse_id,'toPlayerName',e.rider_name,
        'toHorseName',e.horse_name,'toIsOp',not coalesce(e.is_op,false),'treatedAsWithdrawAdd',false));
    else
      payload:=payload||jsonb_build_object('withdraw',jsonb_build_object('entryId',e.entry_id,'competitionNo',1,'competitionId','c-1'));
    end if;
    req:=jsonb_build_object('id',req_id,'event_id',event,'request_type',action,'status','pending',
      'source','on-site-admin','fee_amount',fee,'fee',fee,'payload',payload,'treated_as_withdraw_add',false);
    rec:=jsonb_build_object('id',gen_random_uuid(),'request_id',req_id,'period','before_event',
      'action_type',action,'organization_key','test-org','competition_key','c-'||c.competition_no,
      'rider_key',e.rider_id,'horse_key',e.horse_id,'details','','bill_amount',0,'paid_amount',0,
      'payment_plan','pay_at_venue','operator_name','DB回帰検証');
    submissions:=submissions||jsonb_build_array(jsonb_build_object('request',req,'record',rec));
  end loop;
  for c in select * from public.competitions where event_id=event and competition_no in ('1','5') loop
    select coalesce(jsonb_agg(case when entry_id=expected and c.competition_no='1' then 'request:'||change_id::text else entry_id::text end order by start_order),'[]')
      into ids from public.reception_entries where event_id=event and competition_id=c.id
      and lower(status) not in ('wd','withdrawn')
      and entry_id is distinct from (submissions->2->'request'->'payload'->'withdraw'->>'entryId')::uuid;
    ids := case when c.official then jsonb_build_array('request:'||official_add::text)||ids else ids||jsonb_build_array('request:'||add_id::text) end;
    final_orders:=final_orders||jsonb_build_array(jsonb_build_object('competition_no',c.competition_no::integer,'ids',ids));
  end loop;
  content:=jsonb_build_object('baseOfficial',baseline,'baseEntries','[]'::jsonb,'staged','[]'::jsonb,
    'orders','{}'::jsonb,'submissions',submissions,'final_orders',final_orders);
  saved:=public.save_meeting_draft(draft_id,0,content);
  if (select count(*) from public.entries where event_id=event)<>normal_count
    or (select count(*) from public.reception_requests where event_id=event)<>before_requests
    or (select count(*) from public.settlement_manual_records where event_id=event)<>before_manual then
    raise exception 'draft save affected official data';
  end if;
  failed:=false;
  begin perform public.save_meeting_draft(draft_id,0,content); exception when others then failed:=true; end;
  if not failed then raise exception 'stale revision was accepted'; end if;
  -- Force an error after all requests have been processed. All their writes must roll back.
  saved:=public.save_meeting_draft(draft_id,1,jsonb_set(content,'{final_orders,0,ids}','[]'::jsonb));
  failed:=false;
  begin perform public.apply_meeting_draft(draft_id,2); exception when others then
    if sqlerrm not like '%entry list must contain%' then raise exception 'unexpected apply error: %',sqlerrm; end if;
    failed:=true;
  end;
  if not failed or (select count(*) from public.reception_requests where event_id=event)<>before_requests
    or (select count(*) from public.entries where event_id=event)<>normal_count
    or (select count(*) from public.settlement_manual_records where event_id=event)<>before_manual then
    raise exception 'failed reflection left partial writes';
  end if;
  saved:=public.save_meeting_draft(draft_id,2,content);
  perform public.apply_meeting_draft(draft_id,3);
  if (select count(*) from public.reception_requests where id in(add_id,change_id,withdraw_id,official_add) and status='reflected')<>4
    or (select count(*) from public.settlement_manual_records where request_id in(add_id,change_id,withdraw_id,official_add))<>4
    or (select status from public.meeting_drafts where id=draft_id)<>'applied' then
    raise exception 'reflection did not produce all requests and settlement records';
  end if;
  if (select start_order from public.entries where id=(select entry_id from public.reception_requests where id=official_add))<>1 then
    raise exception 'official addition did not become first';
  end if;
  if (select status from public.entries where id=(select entry_id from public.reception_requests where id=withdraw_id))<>'withdrawn' then
    raise exception 'withdrawal did not reflect';
  end if;
  if (select entry_id from public.reception_requests where id=change_id)<>expected then
    raise exception 'change did not preserve original entry';
  end if;
  perform public.apply_meeting_draft(draft_id,3);
  if (select count(*) from public.reception_requests where event_id=event)<>before_requests+4 then
    raise exception 'retry duplicated requests';
  end if;
  draft_id:=gen_random_uuid();
  saved:=public.save_meeting_draft(draft_id,0,content);
  failed:=false;
  begin perform public.apply_meeting_draft(draft_id,1); exception when others then
    if sqlerrm not like '%正式出番表が更新%' then raise exception 'unexpected conflict error: %',sqlerrm; end if;
    failed:=true;
  end;
  if not failed then raise exception 'changed official data was overwritten'; end if;
  perform public.archive_meeting_draft(draft_id,1);
  if (select status from public.meeting_drafts where id=draft_id)<>'archived' then raise exception 'draft history was not archived'; end if;
end;
$$;
rollback;
select 'meeting save / add / change / withdraw / official order / atomic rollback / revision / retry: PASS' as verification;
