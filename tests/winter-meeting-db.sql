begin;
do $$
declare
 ev uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5'; o uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); h uuid:=gen_random_uuid();
 c1 uuid; c4 uuid; c5 uuid; old1 uuid:=gen_random_uuid(); old2 uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); ch uuid:=gen_random_uuid(); wd uuid:=gen_random_uuid();
 o2 uuid:=gen_random_uuid();r2 uuid:=gen_random_uuid();h2 uuid:=gen_random_uuid();id2 uuid:=gen_random_uuid();items jsonb; retry_result jsonb; late_good uuid:=gen_random_uuid();bad jsonb; bad_id uuid:=gen_random_uuid(); denied boolean; baseline bigint;
begin
 select count(*) into baseline from public.reception_requests where event_id<>ev;
 if has_function_privilege('anon','public.confirm_winter_meeting_batch(jsonb,integer)','execute') then raise exception 'anon permission leak'; end if;
 denied:=false;begin perform public.confirm_winter_meeting_batch('[]',0);exception when others then denied:=true;end;
 if not denied then raise exception 'auth bypass';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from auth.users where raw_app_meta_data->>'role'='admin' order by id limit 1),'app_metadata',jsonb_build_object('role','admin'))::text,true);
 insert into public.organizations(id,event_id,name) values(o,ev,'一括検証ROLLBACK団体');
 insert into public.riders(id,event_id,organization_id,name,jef_member_no) values(r,ev,o,'一括検証選手','TEST');
 insert into public.horses(id,event_id,organization_id,name,jef_registration_no) values(h,ev,o,'一括検証馬','TEST');
 select id into c1 from public.competitions where event_id=ev and competition_no='1';
 select id into c4 from public.competitions where event_id=ev and competition_no='4';
 select id into c5 from public.competitions where event_id=ev and competition_no='5';
 perform public.submit_winter_reception_add(old1,o,c1,r,h,'検証');perform public.reflect_winter_reception_request(old1);
 perform public.submit_winter_reception_add(old2,o,c1,r,h,'検証');perform public.reflect_winter_reception_request(old2);
 items:=jsonb_build_array(
 jsonb_build_object('type','add','args',jsonb_build_object('p_id',a,'p_organization_id',o,'p_competition_id',c1,'p_rider_id',r,'p_horse_id',h,'p_visitor_name','検証','p_is_op',false,'p_instructor_confirmed',false)),
 jsonb_build_object('type','change','args',jsonb_build_object('p_id',ch,'p_entry_id',old1,'p_before',jsonb_build_object('competitionId',c1,'riderId',r,'horseId',h,'isOp',false),'p_competition_id',c4,'p_rider_id',r,'p_horse_id',h,'p_visitor_name','検証','p_is_op',false,'p_from_instructor',false,'p_instructor',false,'p_expected_total',4000)),
 jsonb_build_object('type','withdraw','args',jsonb_build_object('p_id',wd,'p_entry_id',old2,'p_visitor_name','検証')));
 insert into public.organizations(id,event_id,name) values(o2,ev,'打ち合わせ会別団体');
 insert into public.riders(id,event_id,organization_id,name,jef_member_no) values(r2,ev,o2,'別団体選手','TEST');
 insert into public.horses(id,event_id,organization_id,name,jef_registration_no) values(h2,ev,o2,'別団体馬','TEST');
 items:=jsonb_set(items,'{0,expected_total}','11000')||'[]'::jsonb;items:=jsonb_set(items,'{1,expected_total}','4000');items:=jsonb_set(items,'{2,expected_total}','0');
 items:=items||jsonb_build_array(jsonb_build_object('type','add','expected_total',11000,'args',jsonb_build_object('p_id',id2,'p_organization_id',o2,'p_competition_id',c1,'p_rider_id',r2,'p_horse_id',h2,'p_visitor_name','検証','p_is_op',false,'p_instructor_confirmed',false)));
 retry_result:=public.confirm_winter_meeting_batch(items,26000);
 if retry_result<>jsonb_build_object('ids',jsonb_build_array(a,ch,wd,id2),'total',26000) then raise exception 'receipt mismatch'; end if;
 if public.confirm_winter_meeting_batch(items,26000)<>retry_result then raise exception 'retry mismatch';end if;
 perform public.reflect_winter_reception_request(a);perform public.reflect_winter_change_request(ch);perform public.reflect_winter_reception_request(wd);
 if public.confirm_winter_meeting_batch(items,26000)<>retry_result then raise exception 'post reflection retry mismatch';end if;
 if (select count(*) from public.reception_requests where id in(a,ch,wd,id2) and status='reflected' and exists(select 1 from public.fhs_winter_meeting_requests m where m.request_id=public.reception_requests.id))<>4 then raise exception 'Missing reflected meeting audit';end if;
 if not exists(select 1 from public.entries where id=old2 and status='withdrawn') then raise exception 'Withdrawal not reflected';end if;
 if not exists(select 1 from public.entries where id=old1 and competition_id=c4) then raise exception 'Change not reflected';end if;
 -- A failure during the second reflection must roll back even the first reflected entry.
 insert into public.entries(id,event_id,competition_id,rider_id,horse_id,organization_id,start_order,status,source,is_op) values(bad_id,ev,c1,r,h,o,999,'active','meeting-test',false);
 bad:=jsonb_build_array(jsonb_set(items->0,'{args,p_id}',to_jsonb(late_good::text)),jsonb_set(items->0,'{args,p_id}',to_jsonb(bad_id::text)));
 denied:=false;begin perform public.confirm_winter_meeting_batch(bad,22000);exception when others then denied:=true;end;
 if not denied or exists(select 1 from public.entries where id=late_good) or exists(select 1 from public.reception_requests where id in(late_good,bad_id)) then raise exception 'Partial reflection survived';end if;
 -- A later invalid item must roll back the earlier successful add.
 bad:=jsonb_build_array(jsonb_set(items->0,'{args,p_id}',to_jsonb(bad_id::text)),jsonb_set(jsonb_set(items->0,'{args,p_id}',to_jsonb(gen_random_uuid()::text)),'{args,p_competition_id}',to_jsonb(c5::text)));
 denied:=false;begin perform public.confirm_winter_meeting_batch(bad,22000);exception when others then denied:=true;end;
 if not denied or exists(select 1 from public.reception_requests where id=bad_id) then raise exception 'partial save';end if;
 bad:=jsonb_build_array(jsonb_set(items->0,'{args,p_id}',to_jsonb(bad_id::text)));
 denied:=false;begin perform public.confirm_winter_meeting_batch(bad,1);exception when others then denied:=true;end;
 if not denied or exists(select 1 from public.reception_requests where id=bad_id) then raise exception 'price mismatch saved';end if;
 denied:=false;begin perform public.confirm_winter_meeting_batch(jsonb_build_array(items->0,items->0),22000);exception when others then denied:=true;end;
 if not denied then raise exception 'duplicate IDs accepted';end if;
 if (select count(*) from public.reception_requests where event_id<>ev)<>baseline then raise exception 'other event changed';end if;
end $$;
rollback;
select 'PASS: meeting multi-club save + reflect audit, atomic mixed batch, authorization, retries after reflection, rejection rolls all items back, expected total and duplicate IDs; fixtures rolled back' as verification;
