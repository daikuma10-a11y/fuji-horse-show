begin;
select set_config('fhs.test_user',(select id::text from auth.users where raw_app_meta_data->>'role'='admin' order by id limit 1),true);
do $$declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';oa uuid:=gen_random_uuid();ob uuid:=gen_random_uuid();r uuid:=gen_random_uuid();r2 uuid:=gen_random_uuid();h uuid:=gen_random_uuid();c1 uuid;c4 uuid;c6 uuid;price integer;opprice integer;q1 uuid:=gen_random_uuid();q2 uuid:=gen_random_uuid();qc uuid:=gen_random_uuid();qm uuid:=gen_random_uuid();late uuid:=gen_random_uuid();pending uuid:=gen_random_uuid();payment uuid:=gen_random_uuid();a jsonb;before jsonb;args jsonb;receipt jsonb;denied boolean;prior_fee jsonb;baseline bigint;pos integer;restored public.entries%rowtype;
begin
 select count(*) into baseline from public.entries where event_id<>ev;
 if has_function_privilege('anon','public.reflect_winter_request_at_position(uuid,integer)','execute') or has_function_privilege('anon','public.cancel_winter_request(uuid,text)','execute') then raise exception 'Permission leak';end if;
 perform set_config('request.jwt.claims','{}',true);denied:=false;begin perform public.cancel_winter_request(q1,'検証');exception when others then denied:=true;end;if not denied then raise exception 'Anonymous bypass';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fhs.test_user'),'app_metadata',jsonb_build_object('role','admin'))::text,true);
 insert into public.organizations(id,event_id,name)values(oa,ev,'ROLLBACK反映所属A'),(ob,ev,'ROLLBACK反映所属B');
 insert into public.riders(id,event_id,organization_id,name,jef_member_no)values(r,ev,oa,'検証選手A','TEST'),(r2,ev,ob,'検証選手B','TEST');
 insert into public.horses(id,event_id,organization_id,name,jef_registration_no)values(h,ev,oa,'検証馬','TEST');
 select id,fee,op_fee into c1,price,opprice from public.competitions where event_id=ev and competition_no='1';select id into c4 from public.competitions where event_id=ev and competition_no='4';select id into c6 from public.competitions where event_id=ev and competition_no='6';
 a:=jsonb_build_object('p_id',q1,'p_organization_id',oa,'p_competition_id',c1,'p_rider_id',r,'p_horse_id',h,'p_visitor_name','検証','p_membership',null,'p_is_op',true,'p_instructor_confirmed',false,'p_note','元の要望','p_expected_total',3000+opprice);
 perform public.submit_winter_master_add(a);perform public.reflect_winter_request_at_position(q1,1);perform public.reflect_winter_request_at_position(q1,1);
 if (select start_order from public.entries where id=q1)<>1 or (select count(*) from public.fhs_winter_request_effects where request_id=q1)<>1 then raise exception 'Explicit position/audit/retry wrong';end if;
 denied:=false;begin perform public.reflect_winter_request_at_position(q1,2);exception when others then denied:=true;end;if not denied then raise exception 'Mismatched retry repositioned';end if;
 perform public.submit_winter_master_add(a||jsonb_build_object('p_id',q2,'p_is_op',false,'p_expected_total',3000+price));perform public.reflect_winter_request_at_position(q2,1);
 if (select start_order from public.entries where id=q2)<>1 or (select start_order from public.entries where id=q1)<>2 then raise exception 'Position insertion wrong';end if;
 -- Reordering after success is not undone by a lost-response retry.
 update public.entries set start_order=case when id=q1 then 1 else 2 end where id in(q1,q2);
 perform public.reflect_winter_request_at_position(q2,1);
 if (select start_order from public.entries where id=q2)<>2 then raise exception 'Retry repeated ordering';end if;
 before:=jsonb_build_object('competitionId',c1,'riderId',r,'horseId',h,'isOp',true);
 args:=jsonb_build_object('p_id',qc,'p_entry_id',q1,'p_before',before,'p_before_organization_id',oa,'p_organization_id',ob,'p_competition_id',c1,'p_rider_id',r2,'p_horse_id',h,'p_visitor_name','検証','p_from_membership',null,'p_membership',null,'p_is_op',false,'p_from_instructor',false,'p_instructor',false,'p_expected_total',2000+price-opprice);
 perform public.submit_winter_master_change(args);denied:=false;begin perform public.reflect_winter_request_at_position(qc,1);exception when others then denied:=true;end;if not denied then raise exception 'Normal change position accepted';end if;
 perform public.reflect_winter_request_at_position(qc,null);select payload->'fee' into prior_fee from public.reception_requests where id=qc;
 receipt:=public.cancel_winter_request(qc,'誤った選手変更');perform public.cancel_winter_request(qc,'誤った選手変更');
 select * into restored from public.entries where id=q1;
 if restored.rider_id<>r or restored.organization_id<>oa or not restored.is_op or restored.request_note<>'元の要望' then raise exception 'Before rider/organization/OP/note not restored';end if;
 select max(start_order) into pos from public.entries where event_id=ev and competition_id=c1 and lower(status) not in('wd','withdrawn');if restored.start_order<>pos then raise exception 'Restore not appended';end if;
 if (select payload->'fee' from public.reception_requests where id=qc) is distinct from prior_fee or (select status from public.reception_requests where id=qc)<>'cancelled' or (select count(*) from public.fhs_winter_request_cancellations where request_id=qc)<>1 then raise exception 'Fee/audit cancellation wrong';end if;
 denied:=false;begin perform public.cancel_winter_request(qc,'違う理由');exception when others then denied:=true;end;if not denied then raise exception 'Changed cancellation retry accepted';end if;
 -- Cancelling an addition excludes its fee; never delete its saved charge or incoming payment.
 perform public.save_winter_extra_payment(payment,oa,500,'cash_at_venue','検証入金');
 perform public.cancel_winter_request(q1,'追加の誤申請');perform public.cancel_winter_request(q1,'追加の誤申請');
 if (select status from public.entries where id=q1)<>'withdrawn' or (select amount from public.fhs_winter_extra_payments where id=payment)<>500 or (select fee_amount from public.reception_requests where id=q1)<>3000+opprice then raise exception 'Addition cancellation/payment history wrong';end if;
 -- Two-field changes create a replacement. Cancel restores the original ID at the tail.
 args:=args||jsonb_build_object('p_id',qm,'p_entry_id',q2,'p_before',jsonb_build_object('competitionId',c1,'riderId',r,'horseId',h,'isOp',false),'p_competition_id',c4,'p_expected_total',13000);
 perform public.submit_winter_master_change(args);perform public.reflect_winter_request_at_position(qm,1);
 if (select status from public.entries where id=q2)<>'withdrawn' then raise exception 'Replacement did not withdraw original';end if;
 perform public.cancel_winter_request(qm,'複数変更の取消');
 if (select status from public.entries where id=qm)<>'withdrawn' or (select status from public.entries where id=q2)<>'active' or (select rider_id from public.entries where id=q2)<>r then raise exception 'Replacement cancellation wrong';end if;
 -- Late changes prevent an old request cancellation from overwriting them.
 args:=args||jsonb_build_object('p_id',late,'p_entry_id',q2,'p_competition_id',c1,'p_expected_total',2000);
 perform public.submit_winter_master_change(args);perform public.reflect_winter_request_at_position(late,null);
 denied:=false;begin perform public.cancel_winter_request(q2,'古い追加の取消');exception when others then denied:=true;end;if not denied then raise exception 'Old request overwrote later changes';end if;
 perform public.cancel_winter_request(late,'最新変更の取消');
 -- Pending cancellation changes no start entries.
 pending:=gen_random_uuid();perform public.submit_winter_master_add(a||jsonb_build_object('p_id',pending));perform public.cancel_winter_request(pending,'未反映の誤申請');if exists(select 1 from public.entries where id=pending) then raise exception 'Pending cancellation created entry';end if;
 -- Unspecified position retains official-first behavior.
 pending:=gen_random_uuid();perform public.submit_winter_master_add(a||jsonb_build_object('p_id',pending,'p_competition_id',c6,'p_is_op',false,'p_expected_total',15000));perform public.reflect_winter_request_at_position(pending,null);if (select start_order from public.entries where id=pending)<>1 then raise exception 'Official default not first';end if;
 if (select count(*) from public.entries where event_id<>ev)<>baseline then raise exception 'Other tournament modified';end if;
end$$;
rollback;
select 'PASS: explicit/default positions, position retry stability, original rider/affiliation/OP/note restoration at tail, replacement reversal, pending cancellation, immutable fees/payments, later-request conflict, cancellation retries and authorization; ROLLBACK' as verification;
