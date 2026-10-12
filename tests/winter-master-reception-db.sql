begin;
select set_config('fhs.test_user',(select id::text from auth.users where raw_app_meta_data->>'role'='admin' order by id limit 1),true);
do $$declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();oc uuid:=gen_random_uuid();r uuid:=gen_random_uuid();r2 uuid:=gen_random_uuid();h uuid:=gen_random_uuid();q uuid:=gen_random_uuid();q2 uuid:=gen_random_uuid();wd uuid:=gen_random_uuid();legacy uuid:=gen_random_uuid();entry uuid;comp uuid;comp5 uuid;comp8 uuid;args jsonb;change_args jsonb;items jsonb;receipt jsonb;denied boolean;baseline jsonb;counts jsonb;price integer;
begin
 if nullif(current_setting('fhs.test_user',true),'') is null then raise exception 'Missing admin test identity';end if;
 select jsonb_object_agg(event_id::text,n) into baseline from (select event_id,count(*) n from public.entries where event_id<>ev group by event_id)s;
 if has_function_privilege('anon','public.submit_winter_master_add(jsonb)','execute') or has_function_privilege('anon','public.submit_winter_master_change(jsonb)','execute') or has_function_privilege('authenticated','fhs_winter_internal.check_master_target(uuid)','execute') then raise exception 'Permission leak';end if;
 perform set_config('request.jwt.claims','{}',true);
 denied:=false;begin perform public.submit_winter_master_add('{}');exception when others then denied:=true;end;if not denied then raise exception 'Anonymous bypass';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fhs.test_user'),'app_metadata',jsonb_build_object('role','admin'))::text,true);
 insert into public.organizations(id,event_id,name)values(oa,ev,'ROLLBACK共通受付所属A'),(ob,ev,'ROLLBACK共通受付所属B'),(oc,ev,'ROLLBACK無関係所属');
 insert into public.riders(id,event_id,organization_id,name,jef_member_no)values(r,ev,oa,'同名複数所属検証','TEST'),(r2,ev,ob,'同名複数所属検証','TEST');
 insert into public.horses(id,event_id,organization_id,name,jef_registration_no)values(h,ev,ob,'検証馬','TEST');
 select id,fee into comp,price from public.competitions where event_id=ev and competition_no='1';
 select id into comp5 from public.competitions where event_id=ev and competition_no='5';
 select id into comp8 from public.competitions where event_id=ev and competition_no='8';
 args:=jsonb_build_object('p_id',q,'p_organization_id',oa,'p_competition_id',comp,'p_rider_id',r,'p_horse_id',h,'p_visitor_name','検証担当者','p_membership',null,'p_is_op',false,'p_instructor_confirmed',false,'p_note','希望位置：選手02の前','p_expected_total',3000+price,'p_master_form',true);
 items:=jsonb_build_array(jsonb_build_object('type','add','args',args));
 receipt:=public.submit_winter_reception_batch(items,3000+price);perform public.submit_winter_reception_batch(items,3000+price);
 if receipt->'ids'<>jsonb_build_array(q) or (select count(*) from public.reception_requests where id=q)<>1 or (select payload#>>'{add,note}' from public.reception_requests where id=q)<>'希望位置：選手02の前' then raise exception 'Note/save/retry wrong';end if;
 entry:=public.reflect_winter_reception_request(q);perform public.reflect_winter_reception_request(q);
 if (select organization_id from public.entries where id=entry)<>oa or (select horse_id from public.entries where id=entry)<>h or (select request_note from public.entries where id=entry)<>'希望位置：選手02の前' then raise exception 'Affiliation/note reflection wrong';end if;
 -- Retry even if current fees change: the saved snapshot, not new price, acknowledges the same ID.
 update public.competitions set fee=fee+1 where id=comp;
 perform public.submit_winter_reception_batch(items,3000+price);update public.competitions set fee=price where id=comp;
 denied:=false;begin perform public.submit_winter_master_add(args||jsonb_build_object('p_note','異なる要望'));exception when others then denied:=true;end;if not denied then raise exception 'Mismatched retry allowed';end if;
 denied:=false;begin perform public.submit_winter_master_add(args||jsonb_build_object('p_id',gen_random_uuid(),'p_organization_id',oc));exception when others then denied:=true;end;if not denied then raise exception 'Unrelated club allowed';end if;
 denied:=false;begin perform public.submit_winter_master_add(args||jsonb_build_object('p_id',gen_random_uuid(),'p_competition_id',comp5));exception when others then denied:=true;end;if not denied then raise exception 'Missing membership allowed';end if;
 denied:=false;begin perform public.submit_winter_master_add(args||jsonb_build_object('p_id',gen_random_uuid(),'p_competition_id',comp8,'p_membership','member'));exception when others then denied:=true;end;if not denied then raise exception 'Missing instructor allowed';end if;
 change_args:=jsonb_build_object('p_id',q2,'p_entry_id',entry,'p_before',jsonb_build_object('competitionId',comp,'riderId',r,'horseId',h,'isOp',false),'p_before_organization_id',oa,'p_competition_id',comp,'p_rider_id',r2,'p_horse_id',h,'p_organization_id',ob,'p_visitor_name','検証担当者','p_from_membership',null,'p_membership',null,'p_is_op',false,'p_from_instructor',false,'p_instructor',false,'p_expected_total',2000,'p_master_form',true);
 perform public.submit_winter_reception_batch(jsonb_build_array(jsonb_build_object('type','change','args',change_args)),2000);
 perform public.reflect_winter_change_request(q2);perform public.submit_winter_master_change(change_args);
 if (select rider_id from public.entries where id=entry)<>r2 or (select organization_id from public.entries where id=entry)<>ob or (select fee_amount from public.reception_requests where id=q2)<>2000 then raise exception 'Multiple-affiliation change lost';end if;
 -- New/legacy/withdraw paths can share one batch. A failing row rolls the complete batch back.
 legacy:=gen_random_uuid();wd:=gen_random_uuid();
 items:=jsonb_build_array(jsonb_build_object('type','add','args',args||jsonb_build_object('p_id',legacy)),jsonb_build_object('type','add','args',args||jsonb_build_object('p_id',gen_random_uuid(),'p_organization_id',oc)));
 denied:=false;begin perform public.submit_winter_reception_batch(items,2*(3000+price));exception when others then denied:=true;end;
 if not denied or exists(select 1 from public.reception_requests where id=legacy) then raise exception 'Partial batch save';end if;
 -- Meeting route uses the same master and reflects atomically.
 q:=gen_random_uuid();args:=args||jsonb_build_object('p_id',q,'p_organization_id',ob,'p_rider_id',r2);
 items:=jsonb_build_array(jsonb_build_object('type','add','args',args,'expected_total',3000+price));
 perform public.confirm_winter_meeting_batch(items,3000+price);perform public.confirm_winter_meeting_batch(items,3000+price);
 if (select status from public.reception_requests where id=q)<>'reflected' or (select count(*) from public.fhs_winter_meeting_requests where request_id=q)<>1 then raise exception 'Meeting route/audit/retry wrong';end if;
 -- Late participation revocation rejects reflection, without writing an entry.
 q:=gen_random_uuid();perform public.submit_winter_master_add(args||jsonb_build_object('p_id',q));
 update public.horses set roster_source='shared_roster',is_participant=false where id=h;
 denied:=false;begin perform public.reflect_winter_reception_request(q);exception when others then denied:=true;end;
 if not denied or (select status from public.reception_requests where id=q)<>'pending' then raise exception 'Inactive participant reflected';end if;
 select jsonb_object_agg(event_id::text,n) into counts from (select event_id,count(*) n from public.entries where event_id<>ev group by event_id)s;
 if counts is distinct from baseline then raise exception 'Other event modified';end if;
end $$;
rollback;
select 'PASS: master add/change batches, notes through reflection, explicit cross-club affiliation, same-name IDs, server fees, auth denial, frozen retry after price change, atomic rollback, meeting audit and participation recheck; fixtures rolled back' as verification;
