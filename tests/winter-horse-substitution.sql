-- Run with rollback in a test database containing the Winter program and a dummy admin.
begin;
do $test$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 org uuid:=gen_random_uuid(); club uuid:=gen_random_uuid(); a uuid:=gen_random_uuid();
 b uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid();
 rider uuid:=gen_random_uuid(); other_rider uuid:=gen_random_uuid();
 first uuid:=gen_random_uuid(); second uuid:=gen_random_uuid(); free_start uuid:=gen_random_uuid();
 normal public.competitions%rowtype; cheaper public.competitions%rowtype; friendship public.competitions%rowtype;
 actor uuid; edits jsonb; q jsonb; saved jsonb; opts jsonb; new_h uuid; amount int; latefee int; ticket uuid:=gen_random_uuid();
begin
 select id into strict actor from auth.users where raw_app_meta_data->>'role'='admin' order by id limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'app_metadata',jsonb_build_object('role','admin'))::text,true);
 if has_function_privilege('anon','public.winter_horse_substitution(uuid,uuid,text,jsonb,uuid,jsonb)','execute') then raise exception 'anonymous write'; end if;
 select * into strict normal from public.competitions where event_id=ev and competition_no='6';
 select * into strict cheaper from public.competitions where event_id=ev and competition_no='1';
 select * into strict friendship from public.competitions where event_id=ev and competition_no='①';
 insert into public.organizations(id,event_id,name) values(org,ev,'テスト差し替え'||org::text);
 insert into public.fhs_roster_clubs(id,name) values(club,'テスト差し替え'||org::text);
 insert into public.fhs_roster_entities(id,kind,name,reading) values(ea,'horse','テスト旧馬','きゅうば'),(eb,'horse','テスト新馬','しんば');
 insert into public.fhs_roster_affiliations(entity_id,club_id) values(ea,club),(eb,club);
 insert into public.fhs_winter_participants(event_id,entity_id,club_id,name_snapshot,reading_snapshot,club_name_snapshot)
 values(ev,ea,club,'テスト旧馬','きゅうば','テスト差し替え'||org::text);
 insert into public.horses(id,event_id,organization_id,name,is_participant,roster_source) values(a,ev,org,'テスト旧馬',true,'shared_roster'),(b,ev,org,'テスト予備馬',true,'shared_roster');
 insert into public.fhs_winter_reception_roster(entity_id,club_id,horse_id) values(ea,club,a);
 insert into public.riders(id,event_id,organization_id,name,is_participant) values(rider,ev,org,'テスト選手1',true),(other_rider,ev,org,'テスト選手2',true);
 insert into public.entries(id,event_id,organization_id,rider_id,horse_id,competition_id,start_order,status,source,is_op) values
 (first,ev,org,rider,a,normal.id,10001,'active','winter-initial',false),
 (second,ev,org,other_rider,a,normal.id,10002,'active','winter-initial',false),
 (free_start,ev,org,rider,a,friendship.id,10001,'active','winter-initial',false);
 insert into public.fhs_winter_initial_entries(id,event_id,inputs,entry_fee,created_by)
 select e.id,ev,jsonb_build_object('horseId',a,'riderId',e.rider_id,'competitionId',e.competition_id,'organizationId',org),c.fee,actor
 from public.entries e join public.competitions c on e.competition_id=c.id where e.horse_id=a;
 opts:=public.winter_horse_substitution(a,null,null,'[]',null,null);
 select jsonb_agg(jsonb_build_object('id',x->>'id','competition',case when x->>'competition'=normal.id::text then cheaper.id else friendship.id end,'op',false,'membership',null,'instructor',false)) into edits from jsonb_array_elements(opts->'entries') x;
 q:=public.winter_horse_substitution(a,eb,'roster',edits,null,null);
 latefee:=case when (q->>'late')::boolean then 2000 else 0 end;
 if (q#>>'{billing,0,service}')::int<>latefee or (q#>>'{billing,0,difference}')::int<>2*(cheaper.fee-normal.fee) or (q->>'registration')::int<>0 then raise exception 'incorrect quote: %',q; end if;
 begin
   perform public.winter_horse_substitution(a,eb,'roster',edits,ticket,q||'{"registration":1}');
   raise exception 'stale preview accepted';
 exception when raise_exception then if sqlerrm not like '出番・名簿・料金%' then raise; end if; end;
 if not exists(select from public.entries where horse_id=a and id=first) then raise exception 'preview changed data'; end if;
 saved:=public.winter_horse_substitution(a,eb,'roster',edits,ticket,q);
 if saved<>q or public.winter_horse_substitution(a,eb,'roster',edits,ticket,q)<>q then raise exception 'retry mismatch'; end if;
 select horse_id into strict new_h from public.fhs_winter_reception_roster where entity_id=eb and club_id=club;
 if (select count(*) from public.entries where horse_id=new_h and event_id=ev)<>3 or (select is_participant from public.horses where id=a)
    or not exists(select from public.entries where id=free_start and start_order=10001) then raise exception 'incorrect transfer'; end if;
 select coalesce(sum(delta),0) into amount from public.fhs_winter_charge_adjustments where organization_key=org;
 if amount<>latefee+2*(cheaper.fee-normal.fee) then raise exception 'incorrect billing delta'; end if;
 opts:=public.winter_horse_substitution(new_h,null,null,'[]',null,null);
 select jsonb_agg(jsonb_build_object('id',x->>'id','competition',x->>'competition','op',false,'membership',null,'instructor',false)) into edits from jsonb_array_elements(opts->'entries') x;
 q:=public.winter_horse_substitution(new_h,b,'event',edits,null,null);
 if (q->>'registration')::int<>-14000 or (q#>>'{billing,0,difference}')::int<>0 then raise exception 'incorrect repeat substitution'; end if;
end;$test$;
rollback;
