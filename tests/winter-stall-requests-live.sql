-- Approved live integration check. Entire script is one rolled-back transaction.
-- Only generated synthetic organization/horse/request/plan rows are inserted.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 org uuid:=gen_random_uuid(); horse uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid();
 rid text:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text); groups jsonb; plan jsonb; expected text; req jsonb;
begin
 insert into public.organizations(id,event_id,name) values(org,ev,'SYNTHETIC-STALL-REQUEST');
 insert into public.horses(id,event_id,organization_id,name,roster_source,is_participant) values(horse,ev,org,'SYNTHETIC-REQUEST-HORSE','shared_roster',true);
 select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'horses',hs.horses) order by o.id) into groups from public.organizations o cross join lateral (
  select jsonb_agg(jsonb_build_object('id',h.id,'name',h.name) order by h.id) horses from public.horses h where h.event_id=ev and h.organization_id=o.id and (h.roster_source is distinct from 'shared_roster' or h.is_participant=true)
 ) hs where o.event_id=ev and hs.horses is not null;
 select request_id into expected from public.fhs_stable_allocation_versions where event_id=ev order by revision desc limit 1;
 req:=jsonb_build_object('eventId',ev,'organizationId',org,'organizationName','SYNTHETIC-STALL-REQUEST','requestId',rid,'expected',null,'value',jsonb_build_object('imports',jsonb_build_array(jsonb_build_object('digest',repeat('d',64),'text','4番厩舎希望','source','synthetic.xlsx C20')),'manual','メールによる補足','barn','4','neighborId','','relation','','reason','検証用','corridor',false,'confirmed',true));
 plan:=jsonb_build_object('eventId',ev,'requestId',md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),'expected',expected,'value',jsonb_build_object('version',1,'template','gotemba-2025-v1','groups',groups,'options',jsonb_build_object('priorityId','','smallMax',0,'useSCorridor',false,'trOverrides','{}'::jsonb),'cells',jsonb_build_object('4:1',jsonb_build_object('kind','horse','groupId',org,'horseId',horse,'note','')),'tents','{}'::jsonb,'corridors','[]'::jsonb,'wireHorseSlots','[]'::jsonb,'registrationComplete',true,'createdAt','2026-10-31T00:00:00Z'));
 perform set_config('test.stall_request',req::text,true);perform set_config('test.stall_plan',plan::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'app_metadata',jsonb_build_object('role','admin'))::text,true);
end;$$;
set local role authenticated;
do $$
declare a jsonb:=current_setting('test.stall_request')::jsonb; b jsonb; bad jsonb; p jsonb:=current_setting('test.stall_plan')::jsonb; oldp jsonb; rejected boolean; versions jsonb; requests jsonb;
begin
 perform public.save_winter_stall_request(a);perform public.save_winter_stall_request(a);
 if (select count(*) from public.fhs_stall_request_versions where request_id=a->>'requestId')<>1 then raise exception 'duplicate request';end if;
 b:=a||jsonb_build_object('requestId',md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),'expected',a->>'requestId','value',(a->'value')||jsonb_build_object('reason','変更後の検証理由'));
 perform public.save_winter_stall_request(b);perform public.save_winter_stall_request(a);
 if (select request_id from public.fhs_current_stall_requests where organization_id=(a->>'organizationId')::uuid) is distinct from b->>'requestId' then raise exception 'old retry changed current version';end if;
 for bad in select x from (values
  (a||jsonb_build_object('requestId',md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text))),
  (b||jsonb_build_object('value',(b->'value')||jsonb_build_object('manual','改変'))),
  (b||jsonb_build_object('requestId',md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),'expected',b->>'requestId','value',(b->'value')||jsonb_build_object('imports','[]'::jsonb)))
 ) v(x) loop
  rejected:=false;begin perform public.save_winter_stall_request(bad);exception when raise_exception then rejected:=true;end;
  if not rejected then raise exception 'conflict or original alteration accepted';end if;
 end loop;
 select coalesce(jsonb_object_agg(organization_id,request_id),'{}'::jsonb),coalesce(jsonb_object_agg(organization_id,value),'{}'::jsonb) into versions,requests from public.fhs_current_stall_requests r where event_id=(a->>'eventId')::uuid and exists(select 1 from jsonb_array_elements(p->'value'->'groups') g where g->>'id'=r.organization_id::text);
 p:=jsonb_set(p,'{value,options,layout}',jsonb_build_object('enabledBarns',jsonb_build_array('S','1','2','3','4','5','6','7','8','9','10'),'normalHorseLimit',13,'extraTR',false,'requests',requests,'requestVersions',versions));
 perform public.save_winter_stall_allocation(p);
 oldp:=p||jsonb_build_object('requestId',md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),'expected',p->>'requestId');
 oldp:=jsonb_set(oldp,array['value','options','layout','requestVersions',a->>'organizationId'],a->'requestId');
 rejected:=false;begin perform public.save_winter_stall_allocation(oldp);exception when raise_exception then if sqlerrm not like '%要望が更新%' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'stale request plan accepted';end if;
 if has_table_privilege('authenticated','public.fhs_stall_request_versions','INSERT,UPDATE,DELETE') or has_table_privilege('anon','public.fhs_stall_request_versions','SELECT') or has_function_privilege('anon','public.save_winter_stall_request(jsonb)','EXECUTE') then raise exception 'unexpected privileges';end if;
 perform set_config('test.stall_current',b->>'requestId',true);
 perform set_config('request.jwt.claims',jsonb_set(current_setting('request.jwt.claims')::jsonb,'{app_metadata,role}','"member"')::text,true);
 if exists(select 1 from public.fhs_current_stall_requests) then raise exception 'non-admin RLS leak';end if;
 rejected:=false;begin perform public.save_winter_stall_request(a);exception when raise_exception then if sqlerrm not like '%本部ログイン%' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'non-admin write accepted';end if;
 perform set_config('request.jwt.claims',jsonb_set(current_setting('request.jwt.claims')::jsonb,'{app_metadata,role}','"admin"')::text,true);
 if not exists(select 1 from public.fhs_current_stall_requests where request_id=current_setting('test.stall_current') and value->>'manual'='メールによる補足') then raise exception 'admin readback failed';end if;
end;$$;
rollback;
select 'PASS: live authenticated save/readback, retry, conflict, immutable original, stale plan rejection and non-admin denial; all synthetic rows rolled back' as result;
