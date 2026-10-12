-- Run only after the organizer finishes the exercise. Never clear unrelated data.
begin;
do $$
declare ev uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';b fhs_winter_internal.exercise_baseline%rowtype;orgs uuid[];fixture_riders uuid[];fixture_horses uuid[];ents uuid[];requests uuid[];saved jsonb;actual jsonb;
begin
 select * into b from fhs_winter_internal.exercise_baseline where run_id='winter-exercise-20261012-v1' for update;
 if not found then raise exception 'Exercise baseline missing';end if;
 if b.status='cleared' then return;end if;
 select array_agg(x::uuid) into orgs from jsonb_array_elements_text(b.manifest->'organizations') x;
 select array_agg(x::uuid) into fixture_riders from jsonb_array_elements_text(b.manifest->'riders') x;
 select array_agg(x::uuid) into fixture_horses from jsonb_array_elements_text(b.manifest->'horses') x;
 if exists(select 1 from public.entries where event_id=ev and ((organization_id=any(orgs) and (not(rider_id=any(fixture_riders)) or not(horse_id=any(fixture_horses)))) or ((rider_id=any(fixture_riders) or horse_id=any(fixture_horses)) and not(organization_id=any(orgs))))) then raise exception 'Test and real entries are mixed. Stop and review manually.';end if;
 if exists(select 1 from public.reception_requests where event_id=ev and ((organization_id=any(orgs) and (not(rider_id=any(fixture_riders)) or not(horse_id=any(fixture_horses)))) or ((rider_id=any(fixture_riders) or horse_id=any(fixture_horses)) and not(organization_id=any(orgs))))) then raise exception 'Test and real requests are mixed. Stop and review manually.';end if;
 if exists(select 1 from public.fhs_roster_affiliations where (entity_id=any(fixture_riders) or entity_id=any(fixture_horses)) and not(club_id=any(orgs))) or exists(select 1 from public.fhs_roster_affiliations where club_id=any(orgs) and not(entity_id=any(fixture_riders) or entity_id=any(fixture_horses))) then raise exception 'Test roster affiliations changed outside manifest. Stop and review manually.';end if;
 select coalesce(jsonb_agg(x-'start_order'-'updated_at' order by x->>'id'),'[]') into saved from jsonb_array_elements(b.baseline_entries) x;
 select coalesce(jsonb_agg(to_jsonb(e)-'start_order'-'updated_at' order by e.id),'[]') into actual from public.entries e where e.event_id=ev and not(e.organization_id=any(orgs));
 if actual is distinct from saved then raise exception 'Real entries changed since test started. Do not overwrite them.';end if;
 select coalesce(array_agg(id),'{}') into ents from public.entries where event_id=ev and organization_id=any(orgs);
 select coalesce(array_agg(id),'{}') into requests from public.reception_requests where event_id=ev and organization_id=any(orgs);
 if exists(select 1 from public.reception_requests where event_id=ev and not(organization_id=any(orgs)) and (entry_id=any(ents) or original_entry_id=any(ents))) or exists(select 1 from public.reception_requests where id=any(requests) and original_entry_id is not null and not(original_entry_id=any(ents))) then raise exception 'Test requests reference real entries. Stop and review manually.';end if;
 delete from public.fhs_winter_settlement_confirmations where event_id=ev and organization_key=any(orgs);
 delete from public.fhs_winter_extra_payments where event_id=ev and organization_key=any(orgs);
 delete from public.fhs_winter_charge_adjustments where event_id=ev and organization_key=any(orgs);
 delete from public.fhs_winter_settlement_only where event_id=ev and organization_key=any(orgs);
 delete from public.settlement_prepayments where event_id=ev and organization_key in(select x::text from unnest(orgs) x);
 delete from public.settlement_payment_instructions where event_id=ev and organization_key in(select x::text from unnest(orgs) x);
 delete from public.settlement_manual_records where request_id=any(requests);
 delete from public.fhs_winter_withdraw_restorations where event_id=ev and request_id=any(requests);
 delete from public.fhs_winter_meeting_requests where event_id=ev and request_id=any(requests);
 delete from public.reception_requests where event_id=ev and id=any(requests);
 delete from public.fhs_winter_initial_entries where event_id=ev and id=any(ents);
 delete from public.entry_change_history where entry_id=any(ents);
 delete from public.entries where event_id=ev and id=any(ents);
 delete from public.fhs_winter_participants where event_id=ev and club_id=any(orgs);
 delete from public.fhs_winter_reception_roster where club_id=any(orgs);
 delete from public.riders where event_id=ev and id=any(fixture_riders);
 delete from public.horses where event_id=ev and id=any(fixture_horses);
 delete from public.organizations where event_id=ev and id=any(orgs);
 delete from public.fhs_roster_affiliations where club_id=any(orgs);
 delete from public.fhs_roster_entities where id=any(fixture_riders) or id=any(fixture_horses);
 delete from public.fhs_roster_clubs where id=any(orgs);
 -- Only the original saved order is restored; all other original fields were checked above.
 update public.entries e set start_order=(x->>'start_order')::integer,updated_at=(x->>'updated_at')::timestamptz from jsonb_array_elements(b.baseline_entries) x where e.id=(x->>'id')::uuid and e.event_id=ev;
 delete from public.fhs_winter_monitor where event_id=ev;
 if b.previous_monitor is not null then
  insert into public.fhs_winter_monitor(event_id,state,revision,updated_at,updated_by) values(ev,b.previous_monitor->'state',(b.previous_monitor->>'revision')::bigint,(b.previous_monitor->>'updated_at')::timestamptz,(b.previous_monitor->>'updated_by')::uuid);
 end if;
 update public.fhs_winter_updates set monitor_revision=monitor_revision+1,updated_at=now() where event_id=ev;
 update fhs_winter_internal.exercise_baseline set status='cleared' where run_id=b.run_id;
end;$$;
commit;
