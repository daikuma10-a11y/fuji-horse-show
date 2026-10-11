begin;
select set_config('fhs.test_user',(select id::text from auth.users where raw_app_meta_data->>'role'='admin' order by id limit 1),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fhs.test_user'),'app_metadata',jsonb_build_object('role','admin'))::text,true);
create temp table onsite_test_state(inputs jsonb,org uuid,id1 uuid,id2 uuid,id3 uuid,before_account jsonb,before_entries jsonb,before_requests jsonb,before_payments jsonb);
insert into onsite_test_state(before_entries,before_requests,before_payments) select
 (select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from public.entries e),
 (select coalesce(jsonb_agg(to_jsonb(q) order by id),'[]') from public.reception_requests q),
 (select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.fhs_winter_extra_payments p);
grant all on onsite_test_state to authenticated;
set local role authenticated;
do $$
#variable_conflict use_variable
declare suffix text:=gen_random_uuid()::text;entity uuid;horse_entity uuid;ca uuid;cb uuid;r uuid;h uuid;oa uuid;ob uuid;c uuid;fee integer;args jsonb;id1 uuid:=gen_random_uuid();id2 uuid:=gen_random_uuid();id3 uuid:=gen_random_uuid();stamp timestamptz;
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
 update onsite_test_state set inputs=args,org=ob;
 -- Intentional repeat runs have separate stable IDs; request retries reuse the same ID.
 perform public.save_winter_settlement_only_batch(jsonb_build_array(jsonb_build_object('id',id1,'inputs',args,'note','再走行1'),jsonb_build_object('id',id2,'inputs',args,'note','再走行2')));
 perform public.save_winter_settlement_only_batch(jsonb_build_array(jsonb_build_object('id',id1,'inputs',args,'note','再走行1'),jsonb_build_object('id',id2,'inputs',args,'note','再走行2')));
 if (select count(*) from public.fhs_winter_settlement_only where id in(id1,id2))<>2 then raise exception 'Retry duplicate';end if;
 if not exists(select 1 from public.fhs_winter_settlement_only where id=id1 and organization_key=ob and fee_amount=fee+3000 and created_by=auth.uid()) then raise exception 'Cross-club billing/fee/audit wrong';end if;
 begin perform public.save_winter_settlement_only(id1,args,'違う備考');raise exception 'Changed retry accepted';exception when others then if sqlerrm not like '%登録番号%' then raise;end if;end;
 begin perform public.save_winter_settlement_only_batch(jsonb_build_array(jsonb_build_object('id',id3,'inputs',args,'note','有効'),jsonb_build_object('id',gen_random_uuid(),'inputs',args||jsonb_build_object('entryFee',fee+1),'note','不正')));raise exception 'Bad batch accepted';exception when others then if sqlerrm not like '%競技料金が更新%' then raise;end if;end;
 if exists(select 1 from public.fhs_winter_settlement_only where id=id3) then raise exception 'Partial batch survived';end if;
 perform public.save_winter_settlement_only(id3,args,'誤登録取消',id1);perform public.save_winter_settlement_only(id3,args,'誤登録取消',id1);
 begin perform public.save_winter_settlement_only(gen_random_uuid(),args,'二重取消',id1);raise exception 'Duplicate cancellation accepted';exception when others then if sqlerrm not like '%取消済み%' then raise;end if;end;
 begin perform public.save_winter_settlement_only(gen_random_uuid(),args,'取消の取消',id3);raise exception 'Reversal of reversal accepted';exception when others then if sqlerrm not like '%取り消す現場登録%' then raise;end if;end;
 begin update public.fhs_winter_settlement_only set note='直接変更' where id=id1;raise exception 'Direct update accepted';exception when insufficient_privilege then null;end;
 -- Test OP plus explicit instructor/member categories using the same master helper.
 for c in select id from public.competitions where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and (member_fee is not null or op_fee is not null) loop
  select coalesce(comp.member_fee,comp.fee) into fee from public.competitions comp where comp.id=c;
  perform public.save_winter_settlement_only(gen_random_uuid(),args||jsonb_build_object('competitionId',c,'membership','member','instructorConfirmed',true,'entryFee',fee),'会員検証');
 end loop;
 select comp.id,comp.op_fee into c,fee from public.competitions comp where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and not official and op_fee is not null order by id limit 1;
 perform public.save_winter_settlement_only(gen_random_uuid(),args||jsonb_build_object('competitionId',c,'isOp',true,'membership','member','instructorConfirmed',true,'entryFee',fee),'OP検証');
 select comp.id,comp.nonmember_fee into c,fee from public.competitions comp where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and nonmember_fee is not null order by id limit 1;
 perform public.save_winter_settlement_only(gen_random_uuid(),args||jsonb_build_object('competitionId',c,'membership','nonmember','instructorConfirmed',true,'entryFee',fee),'非会員検証');
 begin perform public.save_winter_settlement_only(gen_random_uuid(),args||jsonb_build_object('competitionId',c,'entryFee',fee,'instructorConfirmed',true),'区分なし');raise exception 'Missing membership accepted';exception when others then if sqlerrm not like '%会員・非会員%' then raise;end if;end;
 select comp.id,comp.fee into c,fee from public.competitions comp where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and competition_no='8';
 begin perform public.save_winter_settlement_only(gen_random_uuid(),args||jsonb_build_object('competitionId',c,'entryFee',fee,'instructorConfirmed',false),'資格なし');raise exception 'Missing qualification accepted';exception when others then if sqlerrm not like '%資格の確認%' then raise;end if;end;
 select coalesce(sum(case when reverses_id is null then fee_amount else -fee_amount end),0) into fee from public.fhs_winter_settlement_only where organization_key=ob;
 perform public.save_winter_charge_adjustment(gen_random_uuid(),ob,100,'現場追加後の訂正検証',fee,null);
 -- Record IDs for the server snapshot checks outside the authenticated role.
 update onsite_test_state t set id1=id1,id2=id2,id3=id3;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'app_metadata',jsonb_build_object('role','user'),'user_metadata',jsonb_build_object('role','admin'))::text,true);
 if exists(select 1 from public.fhs_winter_settlement_only where id=id1) then raise exception 'Nonadmin read allowed';end if;
 begin perform public.save_winter_settlement_only(gen_random_uuid(),args,'非管理者');raise exception 'Nonadmin save accepted';exception when others then if sqlerrm not like '%本部ログイン%' then raise;end if;end;
end;$$;
reset role;
do $$declare state onsite_test_state%rowtype;a jsonb;amount bigint;
begin
 select * into state from onsite_test_state;
 a:=fhs_winter_internal.settlement_account(state.org)->'account';
 select sum(case when reverses_id is null then fee_amount else -fee_amount end) into amount from public.fhs_winter_settlement_only where organization_key=state.org;
 if (a->>'extraTotal')::bigint<>amount or jsonb_array_length(a->'lines')<>(select count(*) from public.fhs_winter_settlement_only where organization_key=state.org) then raise exception 'Server snapshot missing on-site charges';end if;
 if state.before_entries is distinct from (select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from public.entries e) then raise exception 'Start list changed';end if;
 if state.before_requests is distinct from (select coalesce(jsonb_agg(to_jsonb(q) order by id),'[]') from public.reception_requests q) then raise exception 'Requests changed';end if;
 if state.before_payments is distinct from (select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.fhs_winter_extra_payments p) then raise exception 'Payment marked paid';end if;
 if has_function_privilege('anon','public.save_winter_settlement_only_batch(jsonb)','execute') then raise exception 'Anonymous grant leak';end if;
end;$$;
select 'PASS: on-site atomic batch, re-run and idempotency, cross-club billing, fees, reversal/audit, no entries/requests/payment changes, snapshot integration, admin-only; ROLLBACK' as result;
rollback;
