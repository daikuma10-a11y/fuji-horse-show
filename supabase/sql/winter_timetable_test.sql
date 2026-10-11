begin;
do $$
declare c uuid;autumn uuid;denied boolean;result jsonb;prior_notes text;
begin
 if has_function_privilege('anon','public.save_winter_timetable(uuid,text,text,text,jsonb)','execute') then raise exception 'write permission leak';end if;
 select id into c from public.competitions where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and competition_no='1';
 select id into autumn from public.competitions where event_id<>'b571f05e-ed23-4e07-929e-be2b73e601a5' limit 1;
 denied:=false;begin perform public.save_winter_timetable(c,'08:00','08:30','provisional',null);exception when others then denied:=true;end;if not denied then raise exception 'auth bypass';end if;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{"role":"admin"}}',true);
 select notes into prior_notes from public.competitions where id=c;
 result:=public.save_winter_timetable(c,'08:00','08:30','provisional',null);
 if (select notes::jsonb->>'originalNotes' from public.competitions where id=c) is distinct from prior_notes then raise exception 'notes not preserved';end if;
 if result->>'inspection_time'<>'08:00' or result->>'phase'<>'provisional' then raise exception 'save failed';end if;
 denied:=false;begin perform public.save_winter_timetable(c,'09:00','09:30','final',null);exception when others then denied:=true;end;if not denied then raise exception 'stale write';end if;
 result:=public.save_winter_timetable(c,null,null,'final',result);
 if result->>'start_time' is not null then raise exception 'clear time failed';end if;
 denied:=false;begin perform public.save_winter_timetable(c,'25:00','08:00','final',result);exception when others then denied:=true;end;if not denied then raise exception 'invalid time';end if;
 denied:=false;begin perform public.save_winter_timetable(autumn,'08:00','08:30','final',null);exception when others then denied:=true;end;if not denied then raise exception 'other event accepted';end if;
end $$;
rollback;
select 'PASS: Winter-only timetable, admin authorization, times validated, clearing allowed, stale writes rejected; test time settings rolled back' as verification;
