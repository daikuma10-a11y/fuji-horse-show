begin;
do $$declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5'; admin_id uuid;
 org uuid:=gen_random_uuid(); rider uuid:=gen_random_uuid(); rider2 uuid:=gen_random_uuid(); horse uuid:=gen_random_uuid(); comp uuid; price integer;
 original uuid:=gen_random_uuid(); original2 uuid:=gen_random_uuid(); receipt uuid:=gen_random_uuid(); ident uuid:=gen_random_uuid(); change_id uuid:=gen_random_uuid(); withdraw_id uuid:=gen_random_uuid(); bad_id uuid:=gen_random_uuid();
 token text:=repeat('a',64);source jsonb;bad_source jsonb;action uuid:=gen_random_uuid();resolution jsonb;before_entries integer;before_requests integer;
 ctx jsonb; change_ctx jsonb; wd_ctx jsonb; item jsonb; change_item jsonb; wd_item jsonb; result jsonb; denied boolean;
begin
 select id into admin_id from auth.users where raw_app_meta_data->>'role'='admin' order by id limit 1;
 if admin_id is null then raise exception 'Missing test admin';end if;

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

 -- ACLs and in-function JWT checks are both required.
 if has_table_privilege('authenticated','fhs_winter_internal.received_reception','select') or has_table_privilege('service_role','fhs_winter_internal.received_reception','insert') or has_function_privilege('authenticated','public.receive_winter_offline_item(uuid,jsonb,text)','execute') or has_function_privilege('anon','public.get_winter_reception_inbox_summary()','execute') or has_function_privilege('service_role','public.resolve_winter_received_item(uuid,uuid,integer,jsonb)','execute') then raise exception 'Unexpected direct grant';end if;
 select count(*) into before_entries from public.entries;
 select count(*) into before_requests from public.reception_requests;
 insert into public.fhs_winter_settlement_devices(token_hash,expires_at,revoked) values(token,now()+interval '1 hour',false);
 source:=jsonb_build_object('draft',jsonb_build_object('synthetic',true),'item',item,'context',ctx,'total',3000+price);
 perform set_config('request.jwt.claims','{}',true);denied:=false;begin perform public.receive_winter_offline_item(receipt,source,token);exception when others then denied:=true;end;if not denied then raise exception 'Anonymous receiver allowed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','user_metadata',jsonb_build_object('role','admin'))::text,true);
 denied:=false;begin perform public.get_winter_reception_inbox_summary();exception when others then denied:=true;end;if not denied then raise exception 'Metadata-spoof summary allowed';end if;
 denied:=false;begin perform public.list_winter_received_reception();exception when others then denied:=true;end;if not denied then raise exception 'Metadata-spoof list allowed';end if;
 denied:=false;begin perform public.resolve_winter_received_item(ident,action,1,'{}');exception when others then denied:=true;end;if not denied then raise exception 'Metadata-spoof resolution allowed';end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 denied:=false;begin perform public.receive_winter_offline_item(receipt,source,repeat('b',64));exception when others then denied:=true;end;if not denied then raise exception 'Invalid device allowed';end if;
 update public.fhs_winter_settlement_devices set expires_at=now()-interval '1 second' where token_hash=token;
 denied:=false;begin perform public.receive_winter_offline_item(receipt,source,token);exception when others then denied:=true;end;if not denied then raise exception 'Expired device allowed';end if;
 update public.fhs_winter_settlement_devices set expires_at=now()+interval '1 hour' where token_hash=token;
 result:=public.receive_winter_offline_item(receipt,source,token);
 if result->>'status'<>'registered' or result->>'requestId'<>ident::text or result->>'receiptId'<>receipt::text then raise exception 'Receiver acknowledgement mismatch %',result;end if;
 perform public.receive_winter_offline_item(receipt,source,token);
 if (select count(*) from public.reception_requests where id=ident)<>1 then raise exception 'Receiver duplicate';end if;
 denied:=false;begin perform public.receive_winter_offline_item(receipt,jsonb_set(source,'{item,args,p_note}','"changed"'),token);exception when others then denied:=true;end;if not denied then raise exception 'Changed payload retry accepted';end if;
 -- Invalid business context must reach the HQ review inbox without a business write.
 bad_source:=jsonb_set(source,'{item,args,p_id}',to_jsonb(bad_id));bad_source:=jsonb_set(bad_source,'{context,competitions,0,op_fee}','1');
 result:=public.receive_winter_offline_item(receipt,bad_source,token);
 if result->>'status'<>'review' or exists(select 1 from public.reception_requests where id=bad_id) then raise exception 'Stale context was not retained for review';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','app_metadata',jsonb_build_object('role','admin'))::text,true);
 result:=public.get_winter_reception_inbox_summary();if (result->>'review')::integer<1 or (result->>'pending')::integer<1 then raise exception 'Summary did not reveal receipt';end if;
 if not exists(select 1 from jsonb_array_elements(public.list_winter_received_reception()) r where r->>'request_id'=bad_id::text and r->'source'=bad_source) then raise exception 'Original review source missing';end if;
 resolution:=jsonb_build_object('mode','register','reason','合成試験：現在の料金を確認','source',jsonb_set(jsonb_set(source,'{item,args,p_id}',to_jsonb(bad_id)),'{context}',ctx));
 result:=public.resolve_winter_received_item(bad_id,action,1,resolution);
 perform public.resolve_winter_received_item(bad_id,action,1,resolution);
 if result->>'status'<>'registered' or (select r.source from fhs_winter_internal.received_reception r where r.request_id=bad_id)<>bad_source or (select count(*) from public.reception_requests where id=bad_id)<>1 then raise exception 'Resolution retry/source preservation failure';end if;
 denied:=false;begin perform public.resolve_winter_received_item(bad_id,action,1,jsonb_set(resolution,'{reason}','"changed"'));exception when others then denied:=true;end;if not denied then raise exception 'Changed resolution action accepted';end if;
 denied:=false;begin perform public.resolve_winter_received_item(bad_id,gen_random_uuid(),1,resolution);exception when others then denied:=true;end;if not denied then raise exception 'Concurrent resolution accepted';end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 result:=public.receive_winter_offline_item(receipt,bad_source,token);
 if result->>'status'<>'registered' then raise exception 'Original device retry did not acknowledge resolved receipt';end if;
 -- Change and withdrawal retain the existing business validator and pending-only behavior.
 change_ctx:=jsonb_set(ctx,'{entry}',(select to_jsonb(t) from(select id as entry_id,event_id,competition_id,rider_id,horse_id,organization_id,status,start_order,coalesce(is_op,false) as is_op from public.entries where id=original)t));
 change_ctx:=jsonb_set(change_ctx,'{rider}',(select to_jsonb(t) from(select id,event_id,name,organization_id,jef_member_no,is_participant,roster_source from public.riders where id=rider2)t));
 change_item:=jsonb_build_object('type','change','args',jsonb_build_object('p_id',change_id,'p_entry_id',original,'p_before',jsonb_build_object('competitionId',comp,'riderId',rider,'horseId',horse,'isOp',false),'p_before_organization_id',org,'p_competition_id',comp,'p_rider_id',rider2,'p_horse_id',horse,'p_organization_id',org,'p_visitor_name','合成来訪者','p_from_membership',null,'p_membership',null,'p_is_op',false,'p_from_instructor',false,'p_instructor',false,'p_expected_total',2000,'p_master_form',true));
 result:=public.receive_winter_offline_item(receipt,jsonb_build_object('draft','{}'::jsonb,'item',change_item,'context',change_ctx,'total',2000),token);if result->>'status'<>'registered' then raise exception 'Change failed %',result;end if;
 wd_ctx:=jsonb_set(ctx,'{entry}',(select to_jsonb(t) from(select id as entry_id,event_id,competition_id,rider_id,horse_id,organization_id,status,start_order,coalesce(is_op,false) as is_op from public.entries where id=original2)t));
 wd_item:=jsonb_build_object('type','withdraw','args',jsonb_build_object('p_id',withdraw_id,'p_entry_id',original2,'p_visitor_name','合成来訪者'));
 result:=public.receive_winter_offline_item(receipt,jsonb_build_object('draft','{}'::jsonb,'item',wd_item,'context',wd_ctx,'total',0),token);if result->>'status'<>'registered' then raise exception 'Withdrawal failed %',result;end if;
 -- A duplicate-target conflict is retained; cancelling review does not cancel the original pending request.
 bad_id:=gen_random_uuid();bad_source:=jsonb_build_object('draft','{}'::jsonb,'item',jsonb_set(wd_item,'{args,p_id}',to_jsonb(bad_id)),'context',wd_ctx,'total',0);
 result:=public.receive_winter_offline_item(receipt,bad_source,token);if result->>'status'<>'review' then raise exception 'Conflict not visible to HQ';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','app_metadata',jsonb_build_object('role','admin'))::text,true);
 action:=gen_random_uuid();resolution:='{"mode":"cancel","reason":"合成試験：重複対象を確認"}';
 result:=public.resolve_winter_received_item(bad_id,action,1,resolution);perform public.resolve_winter_received_item(bad_id,action,1,resolution);
 if result->>'status'<>'cancelled' or (select r.source from fhs_winter_internal.received_reception r where r.request_id=bad_id)<>bad_source or (select status from public.reception_requests where id=withdraw_id)<>'pending' then raise exception 'Review cancellation affected original';end if;
 if (select count(*) from public.entries)<>before_entries or exists(select 1 from public.entries where id in(original,original2) and (status<>'active' or rider_id<>rider)) or (select count(*) from public.reception_requests)<>before_requests+4 then raise exception 'Unexpected reflection or business writes';end if;
end $$;
rollback;
select 'PASS: receiver ACL/JWT/device expiry, add/change/withdraw pending-only, exact replay, mismatch rejection, stale/conflict HQ retention, admin resolution/cancel with immutable original and retry guard; synthetic fixture transaction rolled back' as verification;
