-- Synthetic numbers identify exercise records only; they are NOT JEF registrations.
begin;
do $$
declare b fhs_winter_internal.exercise_baseline%rowtype;r uuid;h uuid;rn text;hn text;
begin
 select * into b from fhs_winter_internal.exercise_baseline where run_id='winter-exercise-20261012-v1' and status='active' for update;
 if not found then raise exception 'Active exercise missing';end if;
 for i in 1..10 loop
  r:=(b.manifest->'riders'->>(i-1))::uuid;h:=(b.manifest->'horses'->>(i-1))::uuid;
  rn:='9999902026101201'||lpad(i::text,6,'0');hn:='9999902026101202'||lpad(i::text,6,'0');
  if not exists(select 1 from public.fhs_roster_entities where id=r and kind='rider' and source_reference=b.run_id) or not exists(select 1 from public.fhs_roster_entities where id=h and kind='horse' and source_reference=b.run_id) then raise exception 'Fixture identity mismatch';end if;
  if exists(select 1 from public.fhs_roster_entities where (id=r and jef_number is not null and jef_number<>rn) or(id=h and jef_number is not null and jef_number<>hn)) then raise exception 'Fixture number was edited. Review before replacing.';end if;
  if exists(select 1 from public.riders where jef_member_no=rn and id<>r) or exists(select 1 from public.horses where jef_registration_no=hn and id<>h) then raise exception 'Synthetic number collision';end if;
  update public.fhs_roster_entities set jef_number=case when id=r then rn else hn end,updated_at=now() where id in(r,h) and source_reference=b.run_id;
  update public.fhs_winter_participants set jef_number_snapshot=case when entity_id=r then rn else hn end where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and entity_id in(r,h);
  update public.riders set jef_member_no=rn where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and id=r;
  update public.horses set jef_registration_no=hn where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and id=h;
 end loop;
end;$$;
do $$
declare ev uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';m jsonb;c uuid;o uuid;r uuid;h uuid;entry uuid:=gen_random_uuid();a uuid:=gen_random_uuid();bad uuid:=gen_random_uuid();fee integer;denied boolean;original public.entries%rowtype;change_id uuid:=gen_random_uuid();
begin
 select manifest into m from fhs_winter_internal.exercise_baseline where run_id='winter-exercise-20261012-v1';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from auth.users where raw_app_meta_data->>'role'='admin' order by id limit 1),'app_metadata',jsonb_build_object('role','admin'))::text,true);
 select comp.id,comp.fee into c,fee from public.competitions comp where comp.event_id=ev and comp.official order by comp.competition_no limit 1;
 o:=(m->'organizations'->>0)::uuid;r:=(m->'riders'->>0)::uuid;h:=(m->'horses'->>0)::uuid;
 perform public.register_winter_initial_entry(entry,o,c,r,h,null,false,false,fee);
 perform public.submit_winter_reception_add(a,o,c,r,h,'架空公認検証');perform public.reflect_winter_reception_request(a);
 if (select fee_amount from public.reception_requests where id=a)<>fee+3000 then raise exception 'Official addition price mismatch';end if;
 select * into original from public.entries where id=(m->'entries'->>0)::uuid;
 perform public.submit_winter_reception_change(change_id,original.id,jsonb_build_object('competitionId',original.competition_id,'riderId',original.rider_id,'horseId',original.horse_id,'isOp',original.is_op),c,r,h,'架空公認変更',null,null,false,false,false,2000+greatest(0,fee-public.winter_change_price(original.competition_id,null,false,false)));
 perform public.reflect_winter_change_request(change_id);
 if (select competition_id from public.entries where id=original.id)<>c then raise exception 'Unofficial to official change failed';end if;

 denied:=false;begin perform public.submit_winter_reception_add(bad,o,c,r,h,'架空公認検証',null,true,false);exception when others then denied:=true;end;
 if not denied or exists(select 1 from public.reception_requests where id=bad) then raise exception 'Official OP allowed';end if;
 o:=(m->'organizations'->>5)::uuid;r:=(m->'riders'->>10)::uuid;h:=(m->'horses'->>10)::uuid;
 denied:=false;begin perform public.register_winter_initial_entry(bad,o,c,r,h,null,false,false,fee);exception when others then denied:=true;end;
 if not denied or exists(select 1 from public.entries where id=bad) then raise exception 'Unregistered official initial allowed';end if;
 denied:=false;begin perform public.submit_winter_reception_add(bad,o,c,r,h,'架空公認検証');exception when others then denied:=true;end;
 if not denied or exists(select 1 from public.reception_requests where id=bad) then raise exception 'Unregistered official add allowed';end if;
end;$$;
rollback;
