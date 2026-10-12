begin;

do $$
declare ev uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';m jsonb:='{"runId": "winter-exercise-20261012-v1", "organizations": ["3b0b1bfb-b127-5bbd-9138-d18bee15fc9c", "dee575a6-6769-5a5b-b340-b58dfec6735a", "4660c6ab-6b21-5c5c-8fff-ead727cf496b", "7532bea6-743e-51f4-a7be-3e78ac941ef2", "cd888003-fdfc-57e1-88da-9ba23dffedbe", "b425ce7f-d9a2-5831-80ef-a20bccc9af31", "4325a176-06b3-5954-817f-ed1283a39725", "b5edd961-4497-5b08-a0dc-f086b9bd8b07", "0d175ce1-6a79-5d83-97e3-aee65cd36fdf", "ad330249-4d23-5d36-8393-3f1e93eaf44f"], "riders": ["c1cbb884-0029-56c4-ac1b-5fcef515ed94", "42ebd37d-19d2-5695-9366-f380d5a2452e", "0e11815b-5269-559d-a2d4-a9a646f1ee02", "c2b314b5-d7ce-5b9a-aae2-455b80814887", "68d9845a-067a-5f81-aa33-f49b40143513", "369238f4-c913-5ca0-8318-a30eb209b8a8", "f2fb66f5-ba5f-561b-bb4f-fa664c86a32c", "0039d283-8644-5983-a3d4-0a7c2878bd9a", "9a3685a7-a4c5-5253-be53-4d8232d52539", "fd7db201-7fcd-5718-88ca-64f9379277fe", "387208d3-5dbe-5db2-8d04-1f99f2b22a37", "915234b7-4db3-54b5-860a-a6144a56f98b", "f2336a3e-8bf0-5a7e-b717-1495276d52db", "d3ff986d-285f-5866-9835-fd97bdffdb04", "58c497f0-264e-580d-af85-522eb7ae18bc", "dc3a9559-3acd-5b5b-abd5-a00dc7ebde88", "56a2c13e-9d89-57bd-bb72-a92bdb212d3a", "e8167b2c-f48e-5c61-a33c-337cfc38e17b", "6fad5719-f10b-5edd-8fe8-21172c5972b0", "8a5f777c-97ee-52a8-aefd-de203f65d32d"], "horses": ["e2e50768-84bd-5a83-8908-0871d4584823", "40779a05-933c-5e6d-8399-e71ec2ce8916", "6f3b0ab1-549a-5fce-b772-cbfb27b01032", "2f2b4228-082d-5ae0-bad3-5678e39e5b87", "0cd2a376-aa59-5cc7-a08a-647bc9cd30bf", "acf483f6-1577-5fbf-9d41-7c61779f7fc1", "bc65ece2-cab6-5d39-9fee-78d4ba0ee234", "4f4d73d4-c308-5e09-9808-e978451c1d00", "dbb0a264-bb32-5cac-a99a-c3d3c4f2f504", "6741a160-49c0-5070-97bc-f08e489afbd9", "2f2a7fc1-789f-580d-b188-9473ce0a5acc", "05bbd581-f449-5270-a9b0-ff01c85e933d", "e02afa71-4a0d-5486-a1a1-66c41576f939", "9499853a-4797-5c28-bbdd-a6c90dc73880", "8b8a539a-913c-5c93-ac9e-f79f48a577a4", "a17274e4-2a24-57e3-9bab-4759634c6484", "37051530-70d5-556b-98a9-8380fb53b0eb", "8b834027-add7-5709-a654-df3044ba9819", "03f0803d-1f07-5c2a-a5a5-688339374374", "f6a3ff9a-9cb3-5a94-b65c-d6f8896e35eb"], "entries": ["7e170645-b6a6-5662-802d-6b62ce4d6ac7", "a2886dbc-ccda-5dbf-9f49-31134c2ef429", "340cb1f1-491b-5821-9cde-b41910f50541", "ff556562-6236-561a-aa72-cdc654b6e8e4", "fcb2a71e-b0bb-5e19-917a-967bb894c34f", "83b43c91-47da-5ae1-bc88-a2a56cf6cc58", "d20bc447-7877-53be-8da9-d40ea0a1c1c2", "53272b96-bbf6-588b-9d93-3a81a4b6386a", "62059d33-abc5-5bfc-8ea3-be9599f7808c", "681d59c3-f004-56f2-9253-b952e9cd3759", "b646cc50-810c-5c03-846d-31ace78cf081", "391e3d70-53d5-5a66-b183-5cc3df1c7b19", "997fd4f0-bb9f-5516-8851-86943f4dce98", "67dc9130-4a39-5e29-94b0-0cda050bdba5", "4b75b5e1-de07-517d-8a16-a1058a92ae32", "42be46a9-3c87-56a3-b640-8f2f3094f9cf", "1c522c36-78e3-5941-a86a-70fb55bbf88b", "163e5766-402a-529b-8573-4c628f2e434d", "bdfffa2e-1ccc-5274-85fa-495ba0cb8290", "a1b953cb-3268-5501-b9ad-759ed5b158ec"]}'::jsonb;uid uuid;o uuid;r uuid;h uuid;c uuid;price integer;compno text;
begin
 if exists(select 1 from fhs_winter_internal.exercise_baseline where run_id=m->>'runId') then raise exception 'This exercise already exists. Inspect it before reinstalling.';end if;
 select id into uid from auth.users where raw_app_meta_data->>'role'='admin' order by id limit 1;if uid is null then raise exception 'No admin';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'app_metadata',jsonb_build_object('role','admin'))::text,true);
 if exists(select 1 from public.organizations where id::text in(select jsonb_array_elements_text(m->'organizations'))) or exists(select 1 from public.fhs_roster_entities where id::text in(select jsonb_array_elements_text(m->'riders') union select jsonb_array_elements_text(m->'horses'))) then raise exception 'Fixture ID collision';end if;
 insert into fhs_winter_internal.exercise_baseline(run_id,status,baseline_entries,previous_monitor,manifest) values(m->>'runId','active',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.entries e where event_id=ev),'[]'),(select to_jsonb(x) from public.fhs_winter_monitor x where event_id=ev),m);
 for i in 1..1 loop
  o:=(m->'organizations'->>(i-1))::uuid;
  insert into public.fhs_roster_clubs(id,name) values(o,'【テスト】架空クラブ'||lpad(i::text,2,'0'));
  insert into public.organizations(id,event_id,name) values(o,ev,'【テスト】架空クラブ'||lpad(i::text,2,'0'));
 end loop;
 for i in 1..2 loop
  o:=(m->'organizations'->>((i-1)/2))::uuid;r:=(m->'riders'->>(i-1))::uuid;h:=(m->'horses'->>(i-1))::uuid;
  insert into public.fhs_roster_entities(id,kind,name,reading,source_reference) values(r,'rider','【テスト】選手'||lpad(i::text,2,'0'),'テストセンシュ'||i,m->>'runId'),(h,'horse','【テスト】馬'||lpad(i::text,2,'0'),'テストウマ'||i,m->>'runId');
  insert into public.fhs_roster_affiliations(entity_id,club_id) values(r,o),(h,o);
  insert into public.riders(id,event_id,organization_id,name,is_participant,roster_source) values(r,ev,o,'【テスト】選手'||lpad(i::text,2,'0'),true,'shared_roster');
  insert into public.horses(id,event_id,organization_id,name,is_participant,roster_source) values(h,ev,o,'【テスト】馬'||lpad(i::text,2,'0'),true,'shared_roster');
  insert into public.fhs_winter_reception_roster(entity_id,club_id,rider_id) values(r,o,r);
  insert into public.fhs_winter_reception_roster(entity_id,club_id,horse_id) values(h,o,h);
  insert into public.fhs_winter_participants(event_id,entity_id,club_id,name_snapshot,reading_snapshot,club_name_snapshot) select ev,e.id,o,e.name,e.reading,cl.name from public.fhs_roster_entities e cross join public.fhs_roster_clubs cl where e.id in(r,h) and cl.id=o;
  compno:=case when i<=10 then '1' else '2' end;
  select id into c from public.competitions where event_id=ev and competition_no=compno and not official;
  if c is null then raise exception 'Nonofficial exercise competition missing';end if;
  price:=public.winter_change_price(c,null,false,false);
  perform public.register_winter_initial_entry((m->'entries'->>(i-1))::uuid,o,c,r,h,null,false,false,price);
 end loop;
 for i in 1..1 loop
  o:=(m->'organizations'->>(i-1))::uuid;
  insert into public.settlement_prepayments(event_id,organization_key,paid_amount,note,updated_by) values(ev,o::text,0,'【テスト】事前入金0円を確認（架空・実入金なし）',uid);
 end loop;
end;$$;

do $$
declare m jsonb;ev uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';o uuid;r uuid;h uuid;entry uuid;c uuid;a uuid:=gen_random_uuid();w uuid:=gen_random_uuid();
begin
 select manifest into m from fhs_winter_internal.exercise_baseline where run_id='winter-exercise-20261012-v1';o:=(m->'organizations'->>0)::uuid;r:=(m->'riders'->>0)::uuid;h:=(m->'horses'->>0)::uuid;entry:=(m->'entries'->>0)::uuid;
 select competition_id into c from public.entries where id=entry;
 perform public.submit_winter_reception_add(a,o,c,r,h,'架空テスト');perform public.reflect_winter_reception_request(a);
 perform public.submit_winter_reception_withdraw(w,entry,'架空テスト');perform public.reflect_winter_reception_request(w);perform public.restore_winter_withdraw(w,'架空テスト復元');
end;$$;

-- Run only after the organizer finishes the exercise. Never clear unrelated data.

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

select (select count(*) from public.organizations where name like '【テスト】架空クラブ%') as remaining_test_clubs;
rollback;
