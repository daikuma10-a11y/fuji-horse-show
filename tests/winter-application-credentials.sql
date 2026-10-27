-- Run inside BEGIN / ROLLBACK. Synthetic fixtures only; no applicant backfill.
do $$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 club uuid:=gen_random_uuid(); org uuid:=gen_random_uuid(); rider uuid:=gen_random_uuid(); horse uuid:=gen_random_uuid();
 re uuid:=gen_random_uuid(); he uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid();
 a jsonb; b jsonb; h jsonb; bad jsonb; rejected boolean;
begin
 insert into public.fhs_roster_clubs(id,name) values(club,'SYNTHETIC-CREDENTIAL-'||club);
 insert into public.organizations(id,event_id,name) values(org,ev,'SYNTHETIC-CREDENTIAL-'||club);
 insert into public.fhs_roster_entities(id,kind,name) values(re,'rider','合成資格選手'),(he,'horse','合成宣言馬');
 insert into public.riders(id,event_id,organization_id,name,is_participant,roster_source) values(rider,ev,org,'合成資格選手',true,'shared_roster');
 insert into public.horses(id,event_id,organization_id,name,is_participant,roster_source) values(horse,ev,org,'合成宣言馬',true,'shared_roster');
 insert into public.fhs_winter_reception_roster(entity_id,club_id,rider_id,horse_id) values(re,club,rider,null),(he,club,null,horse);
 insert into public.fhs_winter_participants(event_id,entity_id,club_id,name_snapshot,reading_snapshot,club_name_snapshot) values(ev,re,club,'合成資格選手','','SYNTHETIC-CREDENTIAL-'||club),(ev,he,club,'合成宣言馬','','SYNTHETIC-CREDENTIAL-'||club);
 a:=jsonb_build_object('eventId',ev,'entityId',re,'clubId',club,'targetId',rider,'kind','rider','name','合成資格選手','jef','','value','A','requestId',repeat('1',64),'expected',null,'digest',repeat('a',64),'reference','SYNTHETIC-CREDENTIAL','location','選手名簿!E6');
 h:=a||jsonb_build_object('entityId',he,'targetId',horse,'kind','horse','name','合成宣言馬','value','中B','requestId',repeat('3',64),'location','馬匹名簿!C7');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'app_metadata',jsonb_build_object('role','admin'))::text,true);
 if public.save_winter_application_credential(a)<>repeat('1',64) or public.save_winter_application_credential(h)<>repeat('3',64) then raise exception 'save failed'; end if;
 perform public.save_winter_application_credential(a);
 if (select count(*) from public.fhs_winter_application_credentials where entity_id=re)<>1 then raise exception 'duplicate retry'; end if;
 b:=a||jsonb_build_object('requestId',repeat('2',64),'value','B','expected',repeat('1',64),'digest',repeat('b',64));
 perform public.save_winter_application_credential(b);
 perform public.save_winter_application_credential(a);
 if (select value from public.fhs_winter_current_credentials where entity_id=re)<>'B' then raise exception 'old retry overwrote new grade'; end if;
 for bad in select v from (values
  (b||jsonb_build_object('requestId',repeat('4',64),'expected',null)),
  (a||jsonb_build_object('value','C')),
  (b||jsonb_build_object('requestId',repeat('4',64),'expected',repeat('2',64),'value','')),
  (b||jsonb_build_object('requestId',repeat('4',64),'expected',repeat('2',64),'eventId',gen_random_uuid())),
  (b||jsonb_build_object('requestId',repeat('4',64),'expected',repeat('2',64),'targetId',horse)),
  (b||jsonb_build_object('requestId',repeat('4',64),'expected',repeat('2',64),'clubId',gen_random_uuid())),
  (b||jsonb_build_object('requestId',repeat('4',64),'expected',repeat('2',64),'name','別人')),
  (b||jsonb_build_object('unexpected','field'))
 ) cases(v) loop
  rejected:=false;begin perform public.save_winter_application_credential(bad);exception when others then rejected:=true;end;
  if not rejected then raise exception 'invalid input accepted: %',bad;end if;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'app_metadata',jsonb_build_object('role','member'),'user_metadata',jsonb_build_object('role','admin'))::text,true);
 rejected:=false;begin perform public.save_winter_application_credential(a);exception when others then rejected:=true;end;
 if not rejected then raise exception 'non-admin accepted';end if;
 perform set_config('request.jwt.claims','{}',true);
 rejected:=false;begin perform fhs_winter_private.save_application_credential(a);exception when others then rejected:=true;end;
 if not rejected then raise exception 'anonymous accepted';end if;
 if has_table_privilege('authenticated','public.fhs_winter_application_credentials','INSERT,UPDATE,DELETE') or has_table_privilege('anon','public.fhs_winter_application_credentials','SELECT') or has_function_privilege('anon','public.save_winter_application_credential(jsonb)','EXECUTE') then raise exception 'unexpected write/public privilege';end if;
end;$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"role":"member"},"user_metadata":{"role":"admin"}}',true);
do $$begin
 if exists(select 1 from public.fhs_winter_current_credentials) then raise exception 'RLS leaked credentials to non-admin';end if;
end;$$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"role":"admin"}}',true);
do $$declare saved jsonb;begin
 if (select count(*) from public.fhs_winter_current_credentials where source_reference='SYNTHETIC-CREDENTIAL')<>2 then raise exception 'admin readback failed';end if;
 select payload||jsonb_build_object('requestId',repeat('4',64),'expected',request_id,'value','中C') into saved from public.fhs_winter_application_credentials where source_reference='SYNTHETIC-CREDENTIAL' and kind='horse' order by revision desc limit 1;
 perform public.save_winter_application_credential(saved);
 if not exists(select 1 from public.fhs_winter_current_credentials where request_id=repeat('4',64) and value='中C') then raise exception 'authenticated admin RPC write failed';end if;
end;$$;
reset role;
