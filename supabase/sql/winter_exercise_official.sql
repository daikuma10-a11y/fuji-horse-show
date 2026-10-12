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
commit;
