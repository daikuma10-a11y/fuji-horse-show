begin;
select set_config('fhs.test_user',(select id::text from auth.users where raw_app_meta_data->>'role'='admin' order by id limit 1),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fhs.test_user'),'app_metadata',jsonb_build_object('role','admin'))::text,true);
create temp table action_test_state(inputs jsonb,org uuid,id1 uuid,id2 uuid,id3 uuid,before_account jsonb,before_entries jsonb,before_requests jsonb,before_payments jsonb);
insert into action_test_state(before_entries,before_requests,before_payments) select
 (select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from public.entries e),
 (select coalesce(jsonb_agg(to_jsonb(q) order by id),'[]') from public.reception_requests q),
 (select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.fhs_winter_extra_payments p);
grant all on action_test_state to authenticated;
set local role authenticated;
do $$
#variable_conflict use_variable
declare suffix text:=gen_random_uuid()::text;entity uuid;horse_entity uuid;ca uuid;cb uuid;r uuid;h uuid;oa uuid;ob uuid;c uuid;fee integer;args jsonb;id1 uuid:=gen_random_uuid();id2 uuid:=gen_random_uuid();id3 uuid:=gen_random_uuid();stamp timestamptz;e1 uuid:=gen_random_uuid();e2 uuid:=gen_random_uuid();c2 uuid;f2 integer;change_args jsonb;withdraw_args jsonb;base_entries jsonb;newr uuid;newentity uuid;
begin
 entity:=public.save_fhs_roster_entity('rider','現場検証','ゲンバケンショウ','','現場A-'||suffix);
 select updated_at into stamp from public.fhs_roster_entities where id=entity;
 perform public.save_fhs_roster_entity('rider','現場検証','ゲンバケンショウ','','現場B-'||suffix,entity,stamp,false);
 horse_entity:=public.save_fhs_roster_entity('horse','現場馬検証','ゲンバウマ','','現場A-'||suffix);
 select id into ca from public.fhs_roster_clubs where name='現場A-'||suffix;select id into cb from public.fhs_roster_clubs where name='現場B-'||suffix;
 perform public.save_fhs_winter_participants(ca,array[horse_entity],'{}');perform public.save_fhs_winter_participants(cb,array[entity],'{}');
 select rider_id into r from public.fhs_winter_reception_roster where entity_id=entity and club_id=cb;
 select horse_id into h from public.fhs_winter_reception_roster where entity_id=horse_entity and club_id=ca;
 select organization_id into oa from public.horses where id=h;select organization_id into ob from public.riders where id=r;
 select comp.id,comp.fee into c,fee from public.competitions comp where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and competition_no='1';
 args:=jsonb_build_object('organizationId',oa,'competitionId',c,'riderId',r,'horseId',h,'membership',null,'isOp',false,'instructorConfirmed',false,'entryFee',fee);
 update action_test_state set inputs=args,org=ob;

 select comp.id,comp.fee into c2,f2 from public.competitions comp where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and competition_no='2';
 perform public.register_winter_initial_entry(e1,oa,c,r,h,null,false,false,fee);
 perform public.register_winter_initial_entry(e2,oa,c2,r,h,null,false,false,f2);
 select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') into base_entries from public.entries x;
 update action_test_state set before_entries=base_entries;
 change_args:=jsonb_build_object('entryId',e1,'before',jsonb_build_object('competitionId',c,'riderId',r,'horseId',h,'isOp',false),'organizationId',oa,'competitionId',c2,'riderId',r,'horseId',h,'fromMembership',null,'fromInstructor',false,'membership',null,'isOp',false,'instructorConfirmed',false,'expectedTotal',2000+greatest(0,f2-fee),'visitorName','検証担当');
 withdraw_args:=change_args||jsonb_build_object('entryId',e2,'before',jsonb_build_object('competitionId',c2,'riderId',r,'horseId',h,'isOp',false),'expectedTotal',0);
 perform public.save_winter_settlement_actions_batch(jsonb_build_array(jsonb_build_object('id',id1,'action','change','inputs',change_args,'note','現場変更'),jsonb_build_object('id',id2,'action','withdraw','inputs',withdraw_args,'note','現場棄権')));
 perform public.save_winter_settlement_actions_batch(jsonb_build_array(jsonb_build_object('id',id1,'action','change','inputs',change_args,'note','現場変更'),jsonb_build_object('id',id2,'action','withdraw','inputs',withdraw_args,'note','現場棄権')));
 if not exists(select 1 from public.fhs_winter_settlement_only where id=id1 and action_type='change' and organization_key=ob and fee_amount=2000+greatest(0,f2-fee) and created_by=auth.uid()) then raise exception 'Change fee/org/audit incorrect';end if;
 if not exists(select 1 from public.fhs_winter_settlement_only where id=id2 and action_type='withdraw' and entry_fee=0 and fee_amount=0) then raise exception 'Withdrawal charged';end if;
 begin perform public.save_winter_settlement_action(gen_random_uuid(),'change',change_args,'重複');raise exception 'Duplicate live action accepted';exception when others then if sqlerrm not like '%登録済み%' then raise;end if;end;
 begin perform public.save_winter_settlement_action(id1,'change',change_args,'違う理由');raise exception 'Changed retry accepted';exception when others then if sqlerrm not like '%登録番号%' then raise;end if;end;
 perform public.save_winter_settlement_action(id3,'change',change_args,'現場変更取消',id1);
 perform public.save_winter_settlement_action(id3,'change',change_args,'現場変更取消',id1);
 begin perform public.save_winter_settlement_action(gen_random_uuid(),'change',change_args,'再取消',id1);raise exception 'Duplicate reversal accepted';exception when others then if sqlerrm not like '%取消済み%' then raise;end if;end;
 -- A bad row rejects the whole batch, even after a valid change was staged first.
 begin perform public.save_winter_settlement_actions_batch(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'action','change','inputs',change_args,'note','有効'),jsonb_build_object('id',gen_random_uuid(),'action','withdraw','inputs',withdraw_args||jsonb_build_object('before','{}'::jsonb),'note','不正')));raise exception 'Bad batch accepted';exception when others then if sqlerrm not like '%出番が更新%' then raise;end if;end;
 if exists(select 1 from public.fhs_winter_settlement_only q where action_type='change' and reverses_id is null and id<>id1 and inputs->>'entryId'=e1::text) then raise exception 'Partial save survived';end if;
 begin perform public.save_winter_settlement_action(gen_random_uuid(),'change',change_args||jsonb_build_object('expectedTotal',1),'料金不正');raise exception 'Wrong fee accepted';exception when others then if sqlerrm not like '%料金が更新%' then raise;end if;end;
 newentity:=public.save_fhs_roster_entity('rider','別選手検証','ベツセンシュ','','現場B-'||suffix);
 perform public.save_fhs_winter_participants(cb,array[entity,newentity],array[entity]);
 select rider_id into newr from public.fhs_winter_reception_roster where entity_id=newentity and club_id=cb;
 perform public.save_winter_settlement_action(gen_random_uuid(),'change',change_args||jsonb_build_object('riderId',newr,'expectedTotal',3000+f2),'2項目変更');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'app_metadata',jsonb_build_object('role','user'),'user_metadata',jsonb_build_object('role','admin'))::text,true);
 if exists(select 1 from public.fhs_winter_settlement_only where id=id1) then raise exception 'Nonadmin read allowed';end if;
 begin perform public.save_winter_settlement_action(gen_random_uuid(),'withdraw',withdraw_args,'非管理者');raise exception 'Nonadmin save accepted';exception when others then if sqlerrm not like '%本部ログイン%' then raise;end if;end;
end;$$;
reset role;
do $$declare state action_test_state%rowtype;a jsonb;extra bigint;
begin
 select * into state from action_test_state;
 a:=fhs_winter_internal.settlement_account(state.org)->'account';
 select sum(case when reverses_id is null then fee_amount else -fee_amount end) into extra from public.fhs_winter_settlement_only where organization_key=state.org;
 if (a->>'extraTotal')::bigint<>extra or not exists(select 1 from jsonb_array_elements(a->'lines') l where l->>'action'='現場変更') or not exists(select 1 from jsonb_array_elements(a->'lines') l where l->>'action'='現場棄権' and (l->>'amount')::integer=0) then raise exception 'Public snapshot missing actions';end if;
 if (a->>'normalTotal')::bigint<=0 then raise exception 'Withdrawal refunded initial fees';end if;
 if state.before_entries is distinct from (select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from public.entries e) then raise exception 'Formal entries changed';end if;
 if state.before_requests is distinct from (select coalesce(jsonb_agg(to_jsonb(q) order by id),'[]') from public.reception_requests q) then raise exception 'Reception requests changed';end if;
 if state.before_payments is distinct from (select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.fhs_winter_extra_payments p) then raise exception 'Payments changed';end if;
 if has_function_privilege('anon','public.save_winter_settlement_actions_batch(jsonb)','execute') then raise exception 'Anon grant leak';end if;
end;$$;
select 'PASS: fee-only change/withdraw batch, explicit price differences, multi-field surcharge, retry/cancel/duplicate guards, whole-batch rollback, unchanged start lists/requests/payments, no initial refund, snapshot actions and admin-only; ROLLBACK' as result;
rollback;
