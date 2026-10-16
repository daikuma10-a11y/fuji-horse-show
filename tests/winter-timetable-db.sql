begin;
do $$
declare c uuid; other uuid; before_note text; old jsonb; saved jsonb; denied boolean;
begin
select id,notes into c,before_note from public.competitions where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' order by competition_no limit 1;
if c is null then raise exception 'no Winter competition';end if;
begin old:=before_note::jsonb->'winterTimetable'; exception when invalid_text_representation then old:=null;end;
if has_function_privilege('anon','public.save_winter_timetable(uuid,text,text,text,jsonb)','execute') then raise exception 'anon write';end if;
perform set_config('request.jwt.claims','{}',true);
denied:=false;begin perform public.save_winter_timetable(c,'08:15','08:30','final',old);exception when others then denied:=true;end;if not denied then raise exception 'auth bypass';end if;
perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{"role":"admin"}}',true);
saved:=public.save_winter_timetable(c,'08:15','08:30','final',old);
if (select notes::jsonb->'winterTimetable' from public.competitions where id=c) is distinct from saved then raise exception 'readback mismatch';end if;
denied:=false;begin perform public.save_winter_timetable(c,'08:15','09:30','final',old);exception when others then denied:=true;end;if not denied then raise exception 'stale accepted';end if;
denied:=false;begin perform public.save_winter_timetable(c,'25:00','09:30','final',saved);exception when others then denied:=true;end;if not denied then raise exception 'invalid time accepted';end if;
select id into other from public.competitions where event_id<>'b571f05e-ed23-4e07-929e-be2b73e601a5' limit 1;
if other is null then raise exception 'other event missing';end if;
denied:=false;begin perform public.save_winter_timetable(other,'08:15','08:30','final',null);exception when others then denied:=true;end;if not denied then raise exception 'other event accepted';end if;
saved:=public.save_winter_timetable(c,null,null,'provisional',saved);if saved->>'start_time' is not null then raise exception 'clear failed';end if;
end $$;
rollback;
select 'PASS: authenticated timetable save/readback, CAS, invalid time, clearing, event isolation; all writes rolled back' as result;
