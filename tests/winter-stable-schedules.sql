-- Execute inside BEGIN/ROLLBACK. Synthetic organizations only; never backfill applicants.
do $$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid();
 a jsonb; b jsonb; bad jsonb; v jsonb; rejected boolean; before_entries bigint; before_charges bigint;
begin
 select count(*) into before_entries from public.entries;
 select count(*) into before_charges from public.fhs_winter_initial_entries;
 insert into public.organizations(id,event_id,name) values(org,ev,'SYNTHETIC-STABLE-'||org);
 v:=jsonb_build_object('arrivalDate','2026-11-13','arrivalTime','08:30','departureDate','2026-11-15','departureTime','17:00','notes','検証用');
 a:=jsonb_build_object('eventId',ev,'organizationId',org,'organizationName','SYNTHETIC-STABLE-'||org,'requestId',repeat('1',64),'expected',null,'value',v,'reference','SYNTHETIC-STABLE','digest',repeat('a',64));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'app_metadata',jsonb_build_object('role','admin'))::text,true);
 perform public.save_winter_stable_schedule(a);
 perform public.save_winter_stable_schedule(a);
 if (select count(*) from public.fhs_winter_stable_schedules where organization_id=org)<>1 then raise exception 'duplicate retry';end if;
 b:=a||jsonb_build_object('requestId',repeat('2',64),'expected',repeat('1',64),'value',v||jsonb_build_object('arrivalTime','09:00'));
 perform public.save_winter_stable_schedule(b);
 perform public.save_winter_stable_schedule(a);
 if (select value->>'arrivalTime' from public.fhs_winter_current_stable_schedules where organization_id=org)<>'09:00' then raise exception 'old retry overwrote new schedule';end if;
 for bad in select x from (values
  (b||jsonb_build_object('requestId',repeat('3',64),'expected',null)),
  (b||jsonb_build_object('value',v)),
  (b||jsonb_build_object('requestId',repeat('3',64),'expected',repeat('2',64),'eventId',gen_random_uuid())),
  (b||jsonb_build_object('requestId',repeat('3',64),'expected',repeat('2',64),'organizationId',gen_random_uuid())),
  (b||jsonb_build_object('requestId',repeat('3',64),'expected',repeat('2',64),'organizationName','異なる団体')),
  (b||jsonb_build_object('requestId',repeat('3',64),'expected',repeat('2',64),'value',v||jsonb_build_object('arrivalDate','2026-02-30'))),
  (b||jsonb_build_object('requestId',repeat('3',64),'expected',repeat('2',64),'value',v||jsonb_build_object('arrivalDate','2025-11-13'))),
  (b||jsonb_build_object('requestId',repeat('3',64),'expected',repeat('2',64),'value',v||jsonb_build_object('arrivalDate',''))),
  (b||jsonb_build_object('requestId',repeat('3',64),'expected',repeat('2',64),'value',v||jsonb_build_object('arrivalTime','24:00'))),
  (b||jsonb_build_object('requestId',repeat('3',64),'expected',repeat('2',64),'value',v||jsonb_build_object('departureDate','2026-11-12'))),
  (b||jsonb_build_object('requestId',repeat('3',64),'expected',repeat('2',64),'value',v||jsonb_build_object('notes',null))),
  (b||jsonb_build_object('requestId',repeat('3',64),'expected',repeat('2',64),'value',v||jsonb_build_object('unexpected','field')))
 ) cases(x) loop
  rejected:=false;begin perform public.save_winter_stable_schedule(bad);exception when others then rejected:=true;end;
  if not rejected then raise exception 'invalid input accepted: %',bad;end if;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'app_metadata',jsonb_build_object('role','member'),'user_metadata',jsonb_build_object('role','admin'))::text,true);
 rejected:=false;begin perform public.save_winter_stable_schedule(a);exception when others then rejected:=true;end;
 if not rejected then raise exception 'non-admin write accepted';end if;
 perform set_config('request.jwt.claims','{}',true);
 rejected:=false;begin perform fhs_winter_private.save_stable_schedule(a);exception when others then rejected:=true;end;
 if not rejected then raise exception 'anonymous write accepted';end if;
 if has_table_privilege('authenticated','public.fhs_winter_stable_schedules','INSERT,UPDATE,DELETE') or has_table_privilege('anon','public.fhs_winter_stable_schedules','SELECT') or has_function_privilege('anon','public.save_winter_stable_schedule(jsonb)','EXECUTE') then raise exception 'unexpected write/public privilege';end if;
 if (select count(*) from public.entries)<>before_entries or (select count(*) from public.fhs_winter_initial_entries)<>before_charges then raise exception 'schedule changed entry/charge data';end if;
end;$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"role":"member"},"user_metadata":{"role":"admin"}}',true);
do $$begin
 if exists(select 1 from public.fhs_winter_current_stable_schedules) then raise exception 'RLS leaked schedule to non-admin';end if;
end;$$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}',true);
do $$declare payload jsonb;begin
 if (select count(*) from public.fhs_winter_current_stable_schedules where source_reference='SYNTHETIC-STABLE')<>1 then raise exception 'admin readback failed';end if;
 select s.payload||jsonb_build_object('requestId',repeat('3',64),'expected',s.request_id,'value',s.value||jsonb_build_object('departureTime','16:30')) into payload from public.fhs_winter_stable_schedules s where source_reference='SYNTHETIC-STABLE' order by revision desc limit 1;
 perform public.save_winter_stable_schedule(payload);
 if not exists(select 1 from public.fhs_winter_current_stable_schedules where request_id=repeat('3',64) and value->>'departureTime'='16:30') then raise exception 'authenticated admin write failed';end if;
end;$$;
reset role;
