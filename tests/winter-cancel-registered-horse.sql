-- Isolated fixtures: no real registration is needed to exercise an entire horse cancellation.
begin;
do $test$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 owner_id uuid:=gen_random_uuid(); bill uuid:=gen_random_uuid(); h uuid:=gen_random_uuid(); reserve uuid:=gen_random_uuid();
 keep uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); other_entry uuid:=gen_random_uuid(); op uuid:=gen_random_uuid();
 q jsonb; unchanged jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'app_metadata',jsonb_build_object('role','admin'))::text,true);
 insert into public.organizations(id,event_id,name) values(owner_id,ev,'参加取消・所属'),(bill,ev,'参加取消・請求先');
 insert into public.horses(id,event_id,organization_id,name,is_participant) values
  (h,ev,owner_id,'同名の馬',true),(keep,ev,owner_id,'同名の馬',true),(reserve,ev,owner_id,'出番なしの馬',true);
 insert into public.riders(id,event_id,organization_id,name,is_participant) values(r,ev,bill,'テスト',true);
 insert into public.competitions(id,event_id,competition_no,competition_date,name,fee,official,arena)
  values(c,ev,'検証',date '2026-11-14','検証',8000,false,'A');
 insert into public.entries(id,event_id,organization_id,competition_id,rider_id,horse_id,start_order,source,status,is_op)
  values(a,ev,bill,c,r,h,1,'winter-initial','active',false),(b,ev,bill,c,r,h,2,'winter-initial','active',true),
        (other_entry,ev,bill,c,r,keep,3,'winter-initial','active',false);
 insert into public.fhs_winter_initial_entries(id,event_id,inputs,entry_fee,created_by)
  select x.id,ev,jsonb_build_object('organizationId',owner_id,'billingOrganizationId',bill,'competitionId',c,'riderId',r,'horseId',x.horse),8000,actor
  from (values(a,h),(b,h),(other_entry,keep)) x(id,horse);
 insert into public.settlement_prepayments(event_id,organization_key,paid_amount,note,updated_by) values(ev,bill::text,30000,'テスト',actor);
 q:=public.winter_cancel_registered_horse(owner_id,h,null,null);
 if jsonb_array_length(q->'entries')<>2 or jsonb_array_length(q->'billing')<>2 then raise exception 'preview'; end if;
 begin perform public.winter_cancel_registered_horse(owner_id,h,op,q||'{"name":"different"}');raise exception 'accepted stale quote';
 exception when raise_exception then if sqlerrm not like '馬・出番または請求%' then raise; end if;end;
 if (select count(*) from public.entries where horse_id=h and status='active')<>2 then raise exception 'partial cancellation'; end if;
 perform public.winter_cancel_registered_horse(owner_id,h,op,q);
 if public.winter_cancel_registered_horse(owner_id,h,op,q)<>q then raise exception 'retry'; end if;
 if exists(select from public.horses where id=h and is_participant=true)
 or (select count(*) from public.entries where horse_id=h and source='winter-initial-cancelled')<>2
 or not exists(select from public.entries where id=other_entry and start_order=1 and status='active')
 or (fhs_winter_internal.settlement_account(owner_id)#>>'{account,total}')::integer<>28000
 or (fhs_winter_internal.settlement_account(bill)#>>'{account,remaining}')::integer<>-22000
 or (select paid_amount from public.settlement_prepayments where organization_key=bill::text)<>30000 then raise exception 'scope or billing'; end if;
 q:=public.winter_cancel_registered_horse(owner_id,reserve,null,null);
 if jsonb_array_length(q->'entries')<>0 then raise exception 'reserve starts'; end if;
 perform public.winter_cancel_registered_horse(owner_id,reserve,gen_random_uuid(),q);
 if (fhs_winter_internal.settlement_account(owner_id)#>>'{account,total}')::integer<>14000 then raise exception 'reserve fee'; end if;
 if has_function_privilege('anon','public.winter_cancel_registered_horse(uuid,uuid,uuid,jsonb)','execute') then raise exception 'anonymous privilege'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'app_metadata','{}'::jsonb)::text,true);
 begin perform public.winter_cancel_registered_horse(owner_id,keep,null,null);raise exception 'nonadmin accepted';
 exception when raise_exception then if sqlerrm not like '%本部管理者%' then raise; end if;end;
end;
$test$;
rollback;
