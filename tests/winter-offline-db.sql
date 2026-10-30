begin;
do $$declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5'; admin_id uuid;
 org uuid:=gen_random_uuid(); rider uuid:=gen_random_uuid(); rider2 uuid:=gen_random_uuid(); horse uuid:=gen_random_uuid(); comp uuid; price integer;
 original uuid:=gen_random_uuid(); original2 uuid:=gen_random_uuid(); receipt uuid:=gen_random_uuid(); ident uuid:=gen_random_uuid(); change_id uuid:=gen_random_uuid(); withdraw_id uuid:=gen_random_uuid(); bad_id uuid:=gen_random_uuid();
 ctx jsonb; change_ctx jsonb; wd_ctx jsonb; item jsonb; change_item jsonb; wd_item jsonb; result jsonb; denied boolean;
begin
 select id into admin_id from auth.users where raw_app_meta_data->>'role'='admin' order by id limit 1;
 if admin_id is null then raise exception 'Missing test admin';end if;
 if has_function_privilege('anon','public.submit_winter_offline_item(uuid,jsonb,jsonb,integer)','execute') then raise exception 'Anonymous grant';end if;
 insert into public.organizations(id,event_id,name)values(org,ev,'ROLLBACK_OFFLINE_合成クラブ');
 insert into public.riders(id,event_id,organization_id,name,jef_member_no)values(rider,ev,org,'OFFLINE合成選手1','TEST'),(rider2,ev,org,'OFFLINE合成選手2','TEST');
 insert into public.horses(id,event_id,organization_id,name,jef_registration_no)values(horse,ev,org,'OFFLINE合成馬','TEST');
 select id,fee into comp,price from public.competitions where event_id=ev and competition_no='1';
 insert into public.entries(id,event_id,competition_id,rider_id,horse_id,organization_id,start_order,status,is_op)values(original,ev,comp,rider,horse,org,999991,'active',false),(original2,ev,comp,rider,horse,org,999992,'active',false);
 ctx:=jsonb_build_object('organization',(select to_jsonb(t) from(select id,event_id,name from public.organizations where id=org)t),
 'rider',(select to_jsonb(t) from(select id,event_id,name,organization_id,jef_member_no,is_participant,roster_source from public.riders where id=rider)t),
 'horse',(select to_jsonb(t) from(select id,event_id,name,organization_id,jef_registration_no,is_participant,roster_source from public.horses where id=horse)t),
 'competitions',jsonb_build_array((select to_jsonb(t) from(select id,event_id,competition_no,competition_date,official,fee,op_fee,member_fee,nonmember_fee from public.competitions where id=comp)t)),'entry',null);
 item:=jsonb_build_object('type','add','args',jsonb_build_object('p_id',ident,'p_organization_id',org,'p_competition_id',comp,'p_rider_id',rider,'p_horse_id',horse,'p_visitor_name','合成来訪者','p_membership',null,'p_is_op',false,'p_instructor_confirmed',false,'p_note','OFFLINE合成試験','p_expected_total',3000+price,'p_master_form',true));
 perform set_config('request.jwt.claims','{}',true);denied:=false;begin perform public.submit_winter_offline_item(receipt,item,ctx,3000+price);exception when others then denied:=true;end;if not denied then raise exception 'Anonymous caller allowed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','user_metadata',jsonb_build_object('role','admin'))::text,true);denied:=false;begin perform public.submit_winter_offline_item(receipt,item,ctx,3000+price);exception when others then denied:=true;end;if not denied then raise exception 'User metadata authority allowed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','app_metadata',jsonb_build_object('role','admin'))::text,true);
 -- Data changed since capture: reject without writes, including a count/price offset that sums to the same total.
 denied:=false;begin perform public.submit_winter_offline_item(receipt,item,jsonb_set(ctx,'{competitions,0,op_fee}','1'),3000+price);exception when others then denied:=true;end;if not denied or exists(select 1 from public.reception_requests where id=ident) then raise exception 'Changed fee accepted';end if;
 result:=public.submit_winter_offline_item(receipt,item,ctx,3000+price);
 if result->>'receiptId'<>receipt::text or result->'ids'<>jsonb_build_array(ident) then raise exception 'Receipt mismatch';end if;
 perform public.submit_winter_offline_item(receipt,item,ctx,3000+price);
 if (select count(*) from public.reception_requests where id=ident)<>1 then raise exception 'Duplicate add';end if;
 denied:=false;begin perform public.submit_winter_offline_item(receipt,jsonb_set(item,'{args,p_note}','"changed"'),ctx,3000+price);exception when others then denied:=true;end;if not denied then raise exception 'Payload collision accepted';end if;
 denied:=false;begin perform public.submit_winter_offline_item(gen_random_uuid(),item,ctx,3000+price);exception when others then denied:=true;end;if not denied then raise exception 'Receipt ID changed';end if;
 change_ctx:=jsonb_set(ctx,'{entry}',(select to_jsonb(t) from(select id as entry_id,event_id,competition_id,rider_id,horse_id,organization_id,status,start_order,coalesce(is_op,false) as is_op from public.entries where id=original)t));
 change_ctx:=jsonb_set(change_ctx,'{rider}',(select to_jsonb(t) from(select id,event_id,name,organization_id,jef_member_no,is_participant,roster_source from public.riders where id=rider2)t));
 change_item:=jsonb_build_object('type','change','args',jsonb_build_object('p_id',change_id,'p_entry_id',original,'p_before',jsonb_build_object('competitionId',comp,'riderId',rider,'horseId',horse,'isOp',false),'p_before_organization_id',org,'p_competition_id',comp,'p_rider_id',rider2,'p_horse_id',horse,'p_organization_id',org,'p_visitor_name','合成来訪者','p_from_membership',null,'p_membership',null,'p_is_op',false,'p_from_instructor',false,'p_instructor',false,'p_expected_total',2000,'p_master_form',true));
 perform public.submit_winter_offline_item(receipt,change_item,change_ctx,2000);
 wd_ctx:=jsonb_set(ctx,'{entry}',(select to_jsonb(t) from(select id as entry_id,event_id,competition_id,rider_id,horse_id,organization_id,status,start_order,coalesce(is_op,false) as is_op from public.entries where id=original2)t));
 wd_item:=jsonb_build_object('type','withdraw','args',jsonb_build_object('p_id',withdraw_id,'p_entry_id',original2,'p_visitor_name','合成来訪者'));
 update public.entries set start_order=999993 where id=original2;
 denied:=false;begin perform public.submit_winter_offline_item(receipt,wd_item,wd_ctx,0);exception when others then denied:=true;end;if not denied or exists(select 1 from public.reception_requests where id=withdraw_id) then raise exception 'Changed withdrawal target accepted';end if;
 update public.entries set start_order=999992 where id=original2;
 perform public.submit_winter_offline_item(receipt,wd_item,wd_ctx,0);
 denied:=false;begin perform public.submit_winter_offline_item(receipt,jsonb_set(wd_item,'{args,p_id}',to_jsonb(bad_id)),wd_ctx,0);exception when others then denied:=true;end;if not denied then raise exception 'Duplicate target accepted';end if;
 -- Saved result survives subsequent original-entry changes and never re-applies billing.
 update public.entries set start_order=999994 where id=original2;
 perform public.submit_winter_offline_item(receipt,wd_item,wd_ctx,0);
 if (select count(*) from public.reception_requests where id in(ident,change_id,withdraw_id) and status='pending')<>3 or (select sum(fee_amount) from public.reception_requests where id in(ident,change_id,withdraw_id))<>5000+price then raise exception 'Pending/fee total mismatch';end if;
 if (select count(*) from public.entries where organization_id=org)<>2 or exists(select 1 from public.entries where id in(original,original2) and (status<>'active' or rider_id<>rider)) then raise exception 'Automatic reflection';end if;
 perform public.reflect_winter_reception_request(ident);
 perform public.submit_winter_offline_item(receipt,item,ctx,3000+price);
 if (select count(*) from public.entries where organization_id=org)<>3 then raise exception 'Reflection replay duplicate';end if;
end $$;
rollback;
select 'PASS: admin-only, spoof rejection, atomic context/fee checks, add/change/withdraw pending saves, stable receipt/item replay, payload collision, duplicate target, no automatic reflection, explicit reflection replay; synthetic fixtures rolled back' as verification;
