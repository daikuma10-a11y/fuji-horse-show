-- Transaction-only integration test. No fixture survives ROLLBACK.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{"role":"admin"}}',true);
do $$
declare a uuid; b uuid; r uuid; h uuid; ri uuid; hi uuid; org uuid; c uuid; e uuid; old_name text; n bigint; rejected boolean;
begin
 select count(*) into n from public.riders where event_id='2af66251-66a2-4c51-8180-a5badf0584d4';
 insert into public.fhs_roster_clubs(name) values('検証専用団体A-'||gen_random_uuid()) returning id into a;
 insert into public.fhs_roster_clubs(name) values('検証専用団体B-'||gen_random_uuid()) returning id into b;
 insert into public.fhs_roster_entities(kind,name,reading) values('rider','検証選手','ケンショウ') returning id into r;
 insert into public.fhs_roster_entities(kind,name,reading) values('horse','検証馬','ケンショウ') returning id into h;
 insert into public.fhs_roster_affiliations(entity_id,club_id) values(r,a),(r,b),(h,a);
 perform public.save_fhs_winter_participants(a,array[r,h],'{}');
 select rider_id into ri from public.fhs_winter_reception_roster where entity_id=r and club_id=a;
 select horse_id into hi from public.fhs_winter_reception_roster where entity_id=h and club_id=a;
 if ri is null or hi is null then raise exception 'Missing reception IDs';end if;
 select organization_id,name into org,old_name from public.riders where id=ri;
 perform public.save_fhs_winter_participants(a,array[r,h],array[r,h]);
 if ri<>(select rider_id from public.fhs_winter_reception_roster where entity_id=r and club_id=a) or (select count(*) from public.riders where organization_id=org)<>1 then raise exception 'Retry duplicated identity';end if;
 perform public.save_fhs_winter_participants(b,array[r],'{}');
 if ri=(select rider_id from public.fhs_winter_reception_roster where entity_id=r and club_id=b) then raise exception 'Multiple affiliations collapsed';end if;
 update public.fhs_roster_entities set name='変更した共通名' where id=r;
 perform public.save_fhs_winter_participants(a,array[r,h],array[r,h]);
 if (select name from public.riders where id=ri)<>old_name then raise exception 'Snapshot changed';end if;
 rejected:=false;
 begin perform public.save_fhs_winter_participants(a,array[r],'{}');exception when others then rejected:=true;end;
 if not rejected then raise exception 'Stale save accepted';end if;
 perform public.save_fhs_winter_participants(a,array[r],array[r,h]);
 if (select is_participant from public.horses where id=hi) is distinct from false then raise exception 'Deselection not hidden';end if;
 select id into c from public.competitions where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and not official and competition_no='1';
 if c is null then raise exception 'Missing test competition';end if;
 rejected:=false;
 begin perform public.submit_winter_reception_add(gen_random_uuid(),org,c,ri,hi,'検証');exception when others then
 if sqlerrm not like '%参加チェック%' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'Stale reception selection accepted';end if;
 perform public.save_fhs_winter_participants(a,array[r,h],array[r]);
 if hi<>(select horse_id from public.fhs_winter_reception_roster where entity_id=h and club_id=a) then raise exception 'Reselection duplicated horse';end if;
 e:=public.submit_winter_reception_add(gen_random_uuid(),org,c,ri,hi,'検証');
 if not exists(select 1 from public.reception_requests q join public.competitions cp on cp.id=c where q.id=e and q.fee=cp.fee+3000 and q.event_id='b571f05e-ed23-4e07-929e-be2b73e601a5') then raise exception 'Add fee or isolation incorrect';end if;
 rejected:=false;
 begin perform public.save_fhs_winter_participants(a,array[r],array[r,h]);exception when others then
 if sqlerrm not like '%使用済み%' then raise;end if;rejected:=true;end;
 if not rejected or not exists(select 1 from public.fhs_winter_participants where entity_id=h and club_id=a) then raise exception 'Used participant detached';end if;
 if n<>(select count(*) from public.riders where event_id='2af66251-66a2-4c51-8180-a5badf0584d4') then raise exception 'Autumn changed';end if;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{"role":"user"}}',true);
 if exists(select 1 from public.fhs_winter_reception_roster) then raise exception 'Nonadmin read allowed';end if;
 rejected:=false;
 begin perform public.save_fhs_winter_participants(a,'{}',array[r,h]);exception when others then rejected:=true;end;
 if not rejected then raise exception 'Nonadmin save allowed';end if;
end;$$;
rollback;
select 'PASS: atomic publication, retry IDs, multiple clubs, immutable snapshots, stale save refusal, deselection/reselection, fee submission, historical protection, Winter isolation, nonadmin refusal; fixtures rolled back' as result;
