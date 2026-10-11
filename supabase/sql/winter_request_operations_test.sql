begin;
do $$
declare
 v_event uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5'; o uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); h uuid:=gen_random_uuid();
 c uuid; official_c uuid; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); w uuid:=gen_random_uuid(); rejected boolean:=false; baseline bigint;
begin
 select count(*) into baseline from public.entries where event_id<>v_event;
 if has_function_privilege('anon','public.reflect_winter_reception_request(uuid)','execute') then raise exception 'anon execution allowed'; end if;
 begin perform public.list_winter_reception_requests(); exception when others then rejected:=true; end;
 if not rejected then raise exception 'unauthenticated list allowed'; end if;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{"role":"admin"}}',true);
 insert into public.organizations(id,event_id,name) values(o,v_event,'検証用ROLLBACK団体');
 insert into public.riders(id,event_id,organization_id,name,jef_member_no) values(r,v_event,o,'検証選手','TEST');
 insert into public.horses(id,event_id,organization_id,name,jef_registration_no) values(h,v_event,o,'検証馬','TEST');
 select id into c from public.competitions where event_id=v_event and competition_no='5';
 select id into official_c from public.competitions where event_id=v_event and official order by competition_no limit 1;
 perform public.submit_winter_reception_add(a,o,c,r,h,'検証','member');
 perform public.reflect_winter_reception_request(a);
 perform public.reflect_winter_reception_request(a);
 if (select count(*) from public.entries where id=a)<>1 then raise exception 'retry duplicate'; end if;
 perform public.submit_winter_reception_add(b,o,c,r,h,'検証','member'); perform public.reflect_winter_reception_request(b);
 if (select start_order from public.entries where id=b)<>(select start_order+1 from public.entries where id=a) then raise exception 'nonofficial not last'; end if;
 perform public.submit_winter_reception_add(d,o,official_c,r,h,'検証'); perform public.reflect_winter_reception_request(d);
 if (select start_order from public.entries where id=d)<>1 then raise exception 'official not first'; end if;
 perform public.submit_winter_reception_withdraw(w,a,'検証');
 perform public.submit_winter_reception_withdraw(w,a,'検証');
 if (select fee from public.reception_requests where id=w)<>0 then raise exception 'withdraw fee'; end if;
 perform public.reflect_winter_reception_request(w); perform public.reflect_winter_reception_request(w);
 if (select status from public.entries where id=a)<>'withdrawn' then raise exception 'not withdrawn'; end if;
 if (select start_order from public.entries where id=b)<>1 then raise exception 'gap after withdrawal'; end if;
 rejected:=false;
 begin perform public.submit_winter_reception_withdraw(gen_random_uuid(),a,'検証'); exception when others then rejected:=true; end;
 if not rejected then raise exception 'already withdrawn accepted'; end if;
 if exists(select 1 from public.list_winter_reception_requests() where event_id<>v_event) then raise exception 'event leak'; end if;
 if (select count(*) from public.entries where event_id<>v_event)<>baseline then raise exception 'other event changed'; end if;
end $$;
rollback;
select 'PASS: admin restriction, event isolation, add ordering, retry, zero-fee withdrawal and renumbering; fixtures rolled back' as verification;
