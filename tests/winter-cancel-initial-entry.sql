-- Run against an isolated Winter schema. All horses, accounts and competitions here are fixtures.
begin;
do $test$
declare
  ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
  actor uuid:=gen_random_uuid(); bill uuid:=gen_random_uuid(); owner_id uuid:=gen_random_uuid();
  r uuid:=gen_random_uuid(); h uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); op uuid:=gen_random_uuid();
  q jsonb; saved jsonb; acct jsonb;
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'app_metadata',jsonb_build_object('role','admin'))::text,true);
  insert into public.organizations(id,event_id,name) values (bill,ev,'検証請求先'),(owner_id,ev,'検証馬の所属');
  insert into public.horses(id,event_id,organization_id,name,is_participant) values(h,ev,owner_id,'検証馬',true);
  insert into public.riders(id,event_id,organization_id,name,is_participant) values(r,ev,bill,'検証選手',true);
  insert into public.competitions(id,event_id,competition_no,competition_date,name,fee,official,arena)
    values(c,ev,'検証',date '2026-11-14','取消用',8000,false,'A');
  insert into public.entries(id,event_id,organization_id,competition_id,rider_id,horse_id,start_order,source,status,is_op)
    values(a,ev,bill,c,r,h,1,'winter-initial','active',false),(b,ev,bill,c,r,h,2,'winter-initial','active',true);
  insert into public.fhs_winter_initial_entries(id,event_id,inputs,entry_fee,created_by,created_at)
    select e.id,ev,jsonb_build_object('organizationId',owner_id,'billingOrganizationId',bill,'competitionId',c,'riderId',r,'horseId',h,'entryFee',price),
      price,actor,now()-interval '1 day' from (values(a,8000),(b,7000)) e(id,price);
  insert into public.settlement_prepayments(event_id,organization_key,paid_amount,note,updated_by) values(ev,bill::text,15000,'テスト',actor);
  if has_function_privilege('anon','public.winter_cancel_initial_entry(uuid,uuid,jsonb)','execute') then raise exception 'anonymous permission'; end if;
  q:=public.winter_cancel_initial_entry(a,null,null);
  if q->>'fee'<>'8000' or q->>'beforeTotal'<>'15000' or q->>'afterTotal'<>'7000' or q->>'afterRemaining'<>'-8000' then raise exception 'quote: %',q; end if;
  begin perform public.winter_cancel_initial_entry(a,op,q||'{"position":3}');raise exception 'accepted stale';
    exception when raise_exception then if sqlerrm not like '出番または請求額%' then raise; end if; end;
  if (select entry_fee from public.fhs_winter_initial_entries where id=a)<>8000 then raise exception 'preview mutated'; end if;
  saved:=public.winter_cancel_initial_entry(a,op,q);
  if saved<>q or public.winter_cancel_initial_entry(a,op,q)<>q then raise exception 'retry'; end if;
  begin perform public.winter_cancel_initial_entry(a,gen_random_uuid(),q);raise exception 'cancelled twice';
    exception when raise_exception then if sqlerrm not like '%取消済み%' then raise; end if; end;
  if not exists(select from public.entries where id=a and source='winter-initial-cancelled' and start_order is null)
    or not exists(select from public.entries where id=b and start_order=1 and status='active')
    or not exists(select from public.fhs_winter_initial_entries where id=a and entry_fee=0 and inputs#>>'{cancellation,originalFee}'='8000')
    or not exists(select from public.settlement_prepayments where organization_key=bill::text and paid_amount=15000) then raise exception 'incorrect scope'; end if;
  acct:=fhs_winter_internal.settlement_account(owner_id)->'account';
  if (acct->>'total')::int<>14000 then raise exception 'horse registration changed'; end if;

  -- A previous substitution reduced the competition fee and charged a separate service fee.
  insert into fhs_winter_internal.horse_substitutions(id,input,quote,confirmed_by,confirmed_at)
    values(gen_random_uuid(),'{}',jsonb_build_object('entries',jsonb_build_array(jsonb_build_object('id',b,'newFee',4000))),actor,now());
  perform fhs_winter_internal.save_charge_adjustment(gen_random_uuid(),bill,-1000,'テスト：競技料差額 -3,000円＋変更料 2,000円',7000,null);
  q:=public.winter_cancel_initial_entry(b,null,null);
  if q->>'fee'<>'4000' or q->>'afterTotal'<>'2000' then raise exception 'incorrect swapped amount: %',q; end if;
  perform public.winter_cancel_initial_entry(b,gen_random_uuid(),q);
  if (fhs_winter_internal.settlement_account(bill)#>>'{account,total}')::int<>2000 then raise exception 'lost service fee'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'app_metadata','{}'::jsonb)::text,true);
  begin perform public.winter_cancel_initial_entry(a,null,null);raise exception 'nonadmin accepted';
    exception when raise_exception then if sqlerrm not like '%本部管理者%' then raise; end if; end;
end;
$test$;
rollback;
