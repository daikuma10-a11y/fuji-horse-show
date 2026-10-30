-- Entire script must run inside BEGIN/ROLLBACK. No actual assignment survives.
do $$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 actor uuid:=gen_random_uuid(); org uuid:=gen_random_uuid(); horse uuid:=gen_random_uuid(); groups jsonb; p jsonb; a jsonb; b jsonb; bad jsonb; cell jsonb; expected text;
 rejected boolean; before_entries bigint; before_charges bigint; before_horses bigint;
begin
 select count(*) into before_entries from public.entries;select count(*) into before_charges from public.fhs_winter_initial_entries;select count(*) into before_horses from public.horses;
 insert into public.organizations(id,event_id,name) values(org,ev,'SYNTHETIC-STALL');
 insert into public.horses(id,event_id,organization_id,name,roster_source,is_participant) values(horse,ev,org,'SYNTHETIC-HORSE','shared_roster',true);
 select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'horses',hs.horses) order by o.id) into groups from public.organizations o cross join lateral (
  select jsonb_agg(jsonb_build_object('id',h.id,'name',h.name) order by h.id) horses from public.horses h where h.event_id=ev and h.organization_id=o.id and (h.roster_source is distinct from 'shared_roster' or h.is_participant=true)
 ) hs where o.event_id=ev and hs.horses is not null;
 select request_id into expected from public.fhs_stable_allocation_versions where event_id=ev order by revision desc limit 1;
 p:=jsonb_build_object('version',1,'template','gotemba-2025-v1','groups',groups,'options',jsonb_build_object('priorityId','','smallMax',3,'useSCorridor',true,'trOverrides','{}'::jsonb),'cells','{}'::jsonb,'tents','{}'::jsonb,'corridors','[]'::jsonb,'wireHorseSlots','[]'::jsonb,'registrationComplete',true,'createdAt','2026-10-30T00:00:00Z');
 cell:=jsonb_build_object('kind','horse','groupId',org,'horseId',horse,'note','');
 p:=p||jsonb_build_object('cells',jsonb_build_object('S:1',cell));
 a:=jsonb_build_object('eventId',ev,'requestId',repeat('a',64),'expected',expected,'value',p);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'app_metadata',jsonb_build_object('role','admin'))::text,true);
 perform public.save_winter_stall_allocation(a);perform public.save_winter_stall_allocation(a);
 if (select count(*) from public.fhs_stable_allocation_versions where request_id=repeat('a',64))<>1 then raise exception 'duplicate save';end if;
 b:=a||jsonb_build_object('requestId',repeat('b',64),'expected',repeat('a',64),'value',p||jsonb_build_object('cells',jsonb_build_object('1:TR1',cell),'wireHorseSlots',jsonb_build_array('1:TR1')));
 perform public.save_winter_stall_allocation(b);perform public.save_winter_stall_allocation(a);
 if (select request_id from public.fhs_stable_allocation_versions where event_id=ev order by revision desc limit 1)<>repeat('b',64) then raise exception 'old retry restored old plan';end if;
 for bad in select x from (values
  (b||jsonb_build_object('requestId',repeat('c',64),'expected',null)),
  (b||jsonb_build_object('requestId',repeat('c',64),'expected',repeat('b',64),'eventId',gen_random_uuid())),
  (b||jsonb_build_object('value',p)),
  (b||jsonb_build_object('requestId',repeat('c',64),'expected',repeat('b',64),'value',p||jsonb_build_object('cells',jsonb_build_object('1:TR1',cell)))),
  (b||jsonb_build_object('requestId',repeat('c',64),'expected',repeat('b',64),'value',p||jsonb_build_object('cells',jsonb_build_object('S:1',cell,'S:2',cell)))),
  (b||jsonb_build_object('requestId',repeat('c',64),'expected',repeat('b',64),'value',p||jsonb_build_object('cells',jsonb_build_object('11:1',cell)))),
  (b||jsonb_build_object('requestId',repeat('c',64),'expected',repeat('b',64),'value',p||jsonb_build_object('cells',jsonb_build_object('1:19',cell)))),
  (b||jsonb_build_object('requestId',repeat('c',64),'expected',repeat('b',64),'value',p||jsonb_build_object('registrationComplete',false))),
  (b||jsonb_build_object('requestId',repeat('c',64),'expected',repeat('b',64),'value',p||jsonb_build_object('tents',jsonb_build_object('11:tent1',org)))),
  (b||jsonb_build_object('requestId',repeat('c',64),'expected',repeat('b',64),'value',p||jsonb_build_object('groups',jsonb_build_array(groups->0,groups->0))))
 ) v(x) loop
  rejected:=false;begin perform public.save_winter_stall_allocation(bad);exception when others then rejected:=true;end;
  if not rejected then raise exception 'malformed plan accepted: %',bad;end if;
 end loop;
 update public.horses set name='RENAMED-SYNTHETIC' where id=horse;
 rejected:=false;begin perform public.save_winter_stall_allocation(b||jsonb_build_object('requestId',repeat('c',64),'expected',repeat('b',64)));exception when others then rejected:=true;end;
 if not rejected then raise exception 'stale roster accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'app_metadata',jsonb_build_object('role','member'),'user_metadata',jsonb_build_object('role','admin'))::text,true);
 rejected:=false;begin perform public.save_winter_stall_allocation(a);exception when others then rejected:=true;end;if not rejected then raise exception 'metadata auth spoof';end if;
 perform set_config('request.jwt.claims','{}',true);
 rejected:=false;begin perform fhs_winter_private.save_stall_allocation(a);exception when others then rejected:=true;end;if not rejected then raise exception 'anonymous write';end if;
 if has_table_privilege('authenticated','public.fhs_stable_allocation_versions','INSERT,UPDATE,DELETE') or has_table_privilege('anon','public.fhs_stable_allocation_versions','SELECT') or has_function_privilege('anon','public.save_winter_stall_allocation(jsonb)','EXECUTE') then raise exception 'unexpected privileges';end if;
 if (select count(*) from public.entries)<>before_entries or (select count(*) from public.fhs_winter_initial_entries)<>before_charges or (select count(*) from public.horses)<>before_horses+1 then raise exception 'unrelated records changed';end if;
end;$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"role":"member"},"user_metadata":{"role":"admin"}}',true);
do $$begin if exists(select 1 from public.fhs_stable_allocation_versions)then raise exception 'RLS leak';end if;end;$$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}',true);
do $$begin if not exists(select 1 from public.fhs_stable_allocation_versions where request_id=repeat('b',64))then raise exception 'admin read failed';end if;end;$$;
reset role;
