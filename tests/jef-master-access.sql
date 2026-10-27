-- Synthetic ACL/RLS check. Every inserted row is rolled back.
begin;
insert into public.jef_rider_master (import_date,member_no,name,rider_grade)
 values ('1900-01-01','__jef_access_test_rider__','合成選手','A');
insert into public.jef_horse_master (import_date,registration_no,name,grade)
 values ('1900-01-01','__jef_access_test_horse__','合成馬','中障害Ｄ');

set local role anon;
do $$
declare t text;
begin
 foreach t in array array['jef_rider_master','jef_horse_master'] loop
  begin
   execute format('select count(*) from public.%I',t);
   raise exception 'Anonymous read unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
 end loop;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000123","role":"authenticated","user_metadata":{"role":"admin"},"app_metadata":{}}',true);
do $$
begin
 if exists(select 1 from public.jef_rider_master where member_no='__jef_access_test_rider__')
 or exists(select 1 from public.jef_horse_master where registration_no='__jef_access_test_horse__') then
  raise exception 'User metadata incorrectly grants admin access';
 end if;
end $$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000123","role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$
begin
 if (select count(*) from public.jef_rider_master where member_no='__jef_access_test_rider__')<>1
 or (select count(*) from public.jef_horse_master where registration_no='__jef_access_test_horse__')<>1 then
  raise exception 'Administrator cannot read the source tables';
 end if;
end $$;

do $$
declare sql text;
begin
 foreach sql in array array[
  'insert into public.jef_rider_master (member_no,name) select ''synthetic'',''synthetic'' where false',
  'insert into public.jef_horse_master (registration_no,name) select ''synthetic'',''synthetic'' where false',
  'update public.jef_rider_master set name=name where false',
  'update public.jef_horse_master set name=name where false',
  'delete from public.jef_rider_master where false',
  'delete from public.jef_horse_master where false'
 ] loop
  begin
   execute sql;
   raise exception 'Direct browser write unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
 end loop;
end $$;
reset role;

do $$
declare role_name text; table_name text; permission text;
begin
 foreach role_name in array array['anon','authenticated'] loop
  foreach table_name in array array['public.jef_rider_master','public.jef_horse_master'] loop
   foreach permission in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if has_table_privilege(role_name,table_name,permission) then raise exception 'Unexpected direct table privilege'; end if;
   end loop;
  end loop;
 end loop;
end $$;
rollback;
select 'PASS: anonymous and ordinary-user reads blocked; admin reads allowed; all browser writes denied; synthetic rows rolled back' result;
