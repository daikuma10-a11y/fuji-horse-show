begin;
select set_config('fhs.test_user',(select id::text from auth.users where raw_app_meta_data->>'role'='admin' order by id limit 1),true);
do $$begin if nullif(current_setting('fhs.test_user',true),'') is null then raise exception 'Missing admin test identity';end if;end$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fhs.test_user'),'app_metadata',jsonb_build_object('role','admin'))::text,true);
set local role authenticated;
do $$
declare suffix text:=gen_random_uuid()::text; ca uuid; cb uuid; r uuid; h uuid; ra uuid; rb uuid; ha uuid; oa uuid; ob uuid; stamp timestamptz; comp record; id1 uuid:=gen_random_uuid(); id2 uuid:=gen_random_uuid(); fee integer; before_aut bigint; before_winter bigint; saved jsonb; invalid uuid;
begin
 select count(*) into before_aut from public.entries where event_id='2af66251-66a2-4c51-8180-a5badf0584d4';
 select count(*) into before_winter from public.entries where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5';
 r:=public.save_fhs_roster_entity('rider','複数所属検証','フクスウショゾク','','所属A検証-'||suffix);
 select updated_at into stamp from public.fhs_roster_entities where id=r;
 perform public.save_fhs_roster_entity('rider','複数所属検証','フクスウショゾク','','所属B検証-'||suffix,r,stamp,false);
 if (select count(*) from public.fhs_roster_affiliations where entity_id=r and ended_at is null)<>2 then raise exception 'Existing affiliation lost';end if;
 select id into ca from public.fhs_roster_clubs where name='所属A検証-'||suffix;
 select id into cb from public.fhs_roster_clubs where name='所属B検証-'||suffix;
 h:=public.save_fhs_roster_entity('horse','馬所属検証','ウマショゾク','','所属A検証-'||suffix);
 perform public.save_fhs_winter_participants(ca,array[r,h],'{}');
 perform public.save_fhs_winter_participants(cb,array[r],'{}');
 select rider_id into ra from public.fhs_winter_reception_roster where entity_id=r and club_id=ca;
 select rider_id into rb from public.fhs_winter_reception_roster where entity_id=r and club_id=cb;
 select horse_id into ha from public.fhs_winter_reception_roster where entity_id=h and club_id=ca;
 select organization_id into oa from public.riders where id=ra;
 select organization_id into ob from public.riders where id=rb;
 if ra=rb or oa=ob or ra is null or rb is null then raise exception 'Multi-affiliation event identity missing';end if;
 select * into comp from public.competitions where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and competition_no='1';
 fee:=comp.fee;
 perform public.register_winter_initial_entry(id1,oa,comp.id,rb,ha,null,false,false,fee);
 if public.register_winter_initial_entry(id1,oa,comp.id,rb,ha,null,false,false,fee)<>id1 then raise exception 'Cross-club retry failed';end if;
 select inputs into saved from public.fhs_winter_initial_entries where id=id1;
 if saved->>'organizationId'<>oa::text or saved->>'billingOrganizationId'<>ob::text then raise exception 'Horse/billing snapshot incorrect';end if;
 if not exists(select 1 from public.entries where id=id1 and organization_id=ob and rider_id=rb and horse_id=ha) then raise exception 'Entry affiliations incorrect';end if;
 -- Same person may represent the other affiliation too; preserve selected affiliation IDs.
 perform public.register_winter_initial_entry(id2,oa,comp.id,ra,ha,null,true,false,comp.op_fee);
 if public.register_winter_initial_entry(id2,oa,comp.id,ra,ha,null,true,false,comp.op_fee)<>id2 then raise exception 'Same-club legacy retry failed';end if;
 if (select inputs ? 'billingOrganizationId' from public.fhs_winter_initial_entries where id=id2) then raise exception 'Same-club snapshot changed';end if;
 select id into invalid from public.riders where event_id='2af66251-66a2-4c51-8180-a5badf0584d4' limit 1;
 if invalid is not null then
 begin
 perform public.register_winter_initial_entry(gen_random_uuid(),oa,comp.id,invalid,ha,null,false,false,fee);
 raise exception 'Autumn rider accepted';
 exception when others then if sqlerrm not like '%選手の大会%' then raise;end if;end;
 end if;
 update public.riders set is_participant=false where id=rb;
 begin
 perform public.register_winter_initial_entry(gen_random_uuid(),oa,comp.id,rb,ha,null,false,false,fee);
 raise exception 'Inactive rider accepted';
 exception when others then if sqlerrm not like '%参加チェック%' then raise;end if;end;
 if (select count(*) from public.entries where event_id='2af66251-66a2-4c51-8180-a5badf0584d4')<>before_aut then raise exception 'Autumn changed';end if;
 if (select count(*) from public.entries where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5')<>before_winter+2 then raise exception 'Unexpected Winter writes';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fhs.test_user'),'app_metadata',jsonb_build_object('role','user'))::text,true);
 begin
 perform public.register_winter_initial_entry(gen_random_uuid(),oa,comp.id,ra,ha,null,false,false,fee);
 raise exception 'Nonadmin write accepted';
 exception when others then if sqlerrm not like '%本部ログイン%' then raise;end if;end;
end$$;
rollback;
select 'PASS: one identity/two affiliations, both participant selections, cross-club entry/rider billing, stable retry, legacy snapshot, OP, event/auth/participant guards; fixtures rolled back' as result;
