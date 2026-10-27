-- Current affiliations can move independently of already recorded event clubs.
create or replace function public.correct_fhs_winter_roster_identity(p_input jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5'; ident uuid; req uuid; e public.fhs_roster_entities%rowtype; previous public.fhs_winter_roster_corrections%rowtype;
 before_value jsonb; expected jsonb; after_value jsonb; n text; rd text; num text; club text; destination uuid; ending uuid[]:='{}';
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です';end if;
 if p_input->>'eventId' is distinct from ev::text then raise exception 'Winterの訂正だけを受け付けます';end if;
 ident:=(p_input->>'entityId')::uuid;req:=(p_input->>'requestId')::uuid;
 n:=btrim(p_input->>'name');rd:=btrim(p_input->>'reading');num:=nullif(btrim(p_input->>'jef'),'');club:=btrim(p_input->>'clubName');
 if ident is null or req is null or coalesce(length(n),0) not between 1 and 100 or coalesce(length(rd),0) not between 1 and 100 or coalesce(length(club),0) not between 1 and 100 or (num is not null and num!~'^[0-9]+$') then raise exception '名前・読み・番号・団体を確認してください';end if;
 perform pg_advisory_xact_lock(hashtextextended('fhs-winter-participants',0));
 select * into previous from public.fhs_winter_roster_corrections where request_id=req;
 if found then
  if previous.input is distinct from p_input then raise exception '同じ訂正番号の内容が異なります';end if;
  return previous.entity_id;
 end if;
 select * into e from public.fhs_roster_entities where id=ident for update;
 if not found or e.archived_at is not null or e.kind is distinct from p_input->>'kind' then raise exception '訂正する既存人馬を確認してください';end if;
 perform p.entity_id from public.fhs_winter_participants p where p.entity_id=ident order by p.club_id for update;
 perform r.id from public.riders r join public.fhs_winter_reception_roster b on b.rider_id=r.id where b.entity_id=ident order by r.id for update of r;
 perform h.id from public.horses h join public.fhs_winter_reception_roster b on b.horse_id=h.id where b.entity_id=ident order by h.id for update of h;
 before_value:=public.fhs_winter_roster_correction_state(ident);expected:=p_input->'expected';
 -- Timestamp JSON formatting differs between PostgREST and PostgreSQL; compare as timestamps.
 if (expected->'entity'->>'updatedAt')::timestamptz is distinct from e.updated_at or (expected #- '{entity,updatedAt}') is distinct from (before_value #- '{entity,updatedAt}') then raise exception '名簿またはWinter参加登録が別の操作で変わりました。再照合して変更前の内容を確認してください';end if;
 -- Optional fields retain compatibility with the earlier add-only client.
 if p_input ? 'endClubIds' then
  if jsonb_typeof(p_input->'endClubIds') is distinct from 'array' or jsonb_array_length(p_input->'endClubIds')>200 then raise exception '終了する所属を確認してください';end if;
  select coalesce(array_agg(x::uuid order by x::uuid),'{}') into ending from jsonb_array_elements_text(p_input->'endClubIds') x;
 end if;
 if cardinality(ending)<>(select count(distinct x) from unnest(ending) x) or exists(select 1 from unnest(ending) x where x is null or not exists(select 1 from public.fhs_roster_affiliations a where a.entity_id=ident and a.club_id=x and a.ended_at is null)) then raise exception '終了する現在の所属が変わりました。再照合してください';end if;
 if nullif(p_input->>'destinationClubId','') is not null then
  destination:=(p_input->>'destinationClubId')::uuid;
  perform id from public.fhs_roster_clubs where id=destination and name=club for share;
  if not found then raise exception '選択した所属先クラブの名前が変わりました。再照合してください';end if;
 else
  select id into destination from public.fhs_roster_clubs where name=club;
 end if;
 if destination=any(ending) then raise exception '移動先の所属は終了できません';end if;
 if num is not null and exists(select 1 from public.fhs_roster_entities where id<>ident and kind=e.kind and jef_number=num) then raise exception 'この日馬連番号は別の既存人馬に登録されています。番号のある候補を選んで所属を追加してください';end if;
 perform public.save_fhs_roster_entity(e.kind,n,rd,coalesce(num,''),club,ident,e.updated_at,false);
 -- End only memberships explicitly checked for this identity; retain their history.
 update public.fhs_roster_affiliations set ended_at=clock_timestamp() where entity_id=ident and club_id=any(ending) and ended_at is null;

 update public.fhs_winter_participants set name_snapshot=n,reading_snapshot=rd,jef_number_snapshot=num where entity_id=ident and event_id=ev;
 update public.riders r set name=n,jef_member_no=num from public.fhs_winter_reception_roster b join public.fhs_winter_participants p on p.entity_id=b.entity_id and p.club_id=b.club_id and p.event_id=ev where b.entity_id=ident and b.rider_id=r.id and r.event_id=ev;
 update public.horses h set name=n,jef_registration_no=num from public.fhs_winter_reception_roster b join public.fhs_winter_participants p on p.entity_id=b.entity_id and p.club_id=b.club_id and p.event_id=ev where b.entity_id=ident and b.horse_id=h.id and h.event_id=ev;
 after_value:=public.fhs_winter_roster_correction_state(ident);
 insert into public.fhs_winter_roster_corrections(request_id,event_id,entity_id,actor,input,before_state,after_state) values(req,ev,ident,auth.uid(),p_input,before_value,after_value);
 return ident;
end;$$;
-- This block rolls back every synthetic fixture itself, including on successful assertions.
-- It can run at the end of the migration: any assertion failure aborts that migration.
do $test$
declare ident uuid; other_id uuid; club_id uuid; club2 uuid; stamp timestamptz; input jsonb; original_input jsonb; current_state jsonb; target_ids jsonb; before_entries text; after_entries text; prefix text:='訂正試験-'||gen_random_uuid()::text; number text:='999'||floor(random()*1000000000000)::bigint::text; ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
begin
 if has_function_privilege('anon','public.correct_fhs_winter_roster_identity(jsonb)','execute') then raise exception 'anonymous execute allowed';end if;
 if has_table_privilege('authenticated','public.fhs_winter_roster_corrections','update') or has_table_privilege('authenticated','public.fhs_winter_roster_corrections','delete') then raise exception 'audit history mutable';end if;
 begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'app_metadata',jsonb_build_object('role','admin'))::text,true);
  execute 'set local role authenticated';
  select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text,'[]')) into before_entries from public.entries e;
  ident:=public.save_fhs_roster_entity('horse',prefix||'旧名','キュウメイ','',prefix||'団体1');
  select id into club_id from public.fhs_roster_clubs where name=prefix||'団体1';
  perform public.save_fhs_winter_participants(club_id,array[ident],'{}');
  select updated_at into stamp from public.fhs_roster_entities where id=ident;
  perform public.save_fhs_roster_entity('horse',prefix||'旧名','キュウメイ','',prefix||'団体2',ident,stamp,false);
  select id into club2 from public.fhs_roster_clubs where name=prefix||'団体2';
  perform public.save_fhs_winter_participants(club2,array[ident],'{}');
  current_state:=public.fhs_winter_roster_correction_state(ident);
  select jsonb_agg(x->'targetId' order by x->>'clubId') into target_ids from jsonb_array_elements(current_state->'participants') x;
  input:=jsonb_build_object('requestId',gen_random_uuid(),'eventId',ev,'entityId',ident,'kind','horse','clubName',prefix||'団体3','name',prefix||'訂正名','reading','テイセイメイ','jef',number,'expected',current_state);
  original_input:=input;
  if public.correct_fhs_winter_roster_identity(input)<>ident then raise exception 'identity changed';end if;
  current_state:=public.fhs_winter_roster_correction_state(ident);
  if current_state->'entity'->>'name'<>prefix||'訂正名' or current_state->'entity'->>'jef'<>number or jsonb_array_length(current_state->'clubs')<>3 then raise exception 'master or affiliation correction failed';end if;
  if jsonb_array_length(current_state->'participants')<>2 or (select jsonb_agg(x->'targetId' order by x->>'clubId') from jsonb_array_elements(current_state->'participants') x)<>target_ids then raise exception 'Winter identities changed';end if;
  if exists(select 1 from jsonb_array_elements(current_state->'participants') x where x->>'name'<>prefix||'訂正名' or x->>'targetName'<>prefix||'訂正名' or x->>'jef'<>number or x->>'targetJef'<>number or x->>'reading'<>'テイセイメイ') then raise exception 'Winter correction not synchronized';end if;
  perform public.correct_fhs_winter_roster_identity(input);
  if (select count(*) from public.fhs_winter_roster_corrections where entity_id=ident)<>1 then raise exception 'duplicate correction history';end if;
  begin
   perform public.correct_fhs_winter_roster_identity(input||jsonb_build_object('name','different replay'));
   raise exception 'changed replay accepted';
  exception when others then if sqlerrm not like '%同じ訂正番号%' then raise;end if;end;
  begin
   perform public.correct_fhs_winter_roster_identity(input||jsonb_build_object('requestId',gen_random_uuid()));
   raise exception 'stale correction accepted';
  exception when others then if sqlerrm not like '%別の操作で変わりました%' then raise;end if;end;
  input:=input||jsonb_build_object('requestId',gen_random_uuid(),'expected',current_state);
  begin
   perform public.correct_fhs_winter_roster_identity(input||jsonb_build_object('eventId',gen_random_uuid()));
   raise exception 'another event accepted';
  exception when others then if sqlerrm not like '%Winterの訂正%' then raise;end if;end;
  other_id:=public.save_fhs_roster_entity('horse',prefix||'別馬','ベツウマ',number||'1',prefix||'団体1');
  begin
   perform public.correct_fhs_winter_roster_identity(input||jsonb_build_object('jef',number||'1'));
   raise exception 'duplicate number accepted';
  exception when others then if sqlerrm not like '%別の既存人馬%' then raise;end if;end;
  -- The snapshot comparison includes the event-side name, not only the master timestamp.
  update public.horses set name=prefix||'別操作' where id=(target_ids->>0)::uuid;
  begin
   perform public.correct_fhs_winter_roster_identity(input);
   raise exception 'event-side conflict accepted';
  exception when others then if sqlerrm not like '%別の操作で変わりました%' then raise;end if;end;
  -- Riders use the same operation and preserve an absent membership number.
  other_id:=public.save_fhs_roster_entity('rider',prefix||'誤字','ナマエ','',prefix||'団体1');
  perform public.save_fhs_winter_participants(club_id,array[ident,other_id],array[ident]);
  input:=jsonb_build_object('requestId',gen_random_uuid(),'eventId',ev,'entityId',other_id,'kind','rider','clubName',prefix||'団体1','name',prefix||'正字','reading','ナマエ','jef','','expected',public.fhs_winter_roster_correction_state(other_id));
  perform public.correct_fhs_winter_roster_identity(input);
  if not exists(select 1 from public.riders r join public.fhs_winter_reception_roster b on b.rider_id=r.id where b.entity_id=other_id and r.name=prefix||'正字' and r.jef_member_no is null) then raise exception 'rider correction failed';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'app_metadata',jsonb_build_object('role','user'),'user_metadata',jsonb_build_object('role','admin'))::text,true);
  begin
   perform public.correct_fhs_winter_roster_identity(input);
   raise exception 'nonadmin accepted';
  exception when others then if sqlerrm not like '%本部ログイン%' then raise;end if;end;
  if exists(select 1 from public.fhs_winter_roster_corrections) then raise exception 'nonadmin can read audit';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'app_metadata',jsonb_build_object('role','admin'))::text,true);
  select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text,'[]')) into after_entries from public.entries e;
  if before_entries is distinct from after_entries then raise exception 'existing entries changed';end if;
  raise sqlstate 'ZX001' using message='successful synthetic correction test rollback';
 exception when sqlstate 'ZX001' then null;end;
end;$test$;
-- Synthetic memberships only. The successful test also rolls back every fixture.
do $test$
declare ident uuid; c1 uuid; c2 uuid; c3 uuid; stamp timestamptz; before_value jsonb; after_value jsonb; input jsonb;
 prefix text:='所属移動試験-'||gen_random_uuid()::text; ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
begin
 begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'app_metadata',jsonb_build_object('role','admin'))::text,true);
  execute 'set local role authenticated';
  ident:=public.save_fhs_roster_entity('horse',prefix,'ゴウセイウマ','',prefix||'旧所属');
  select id into c1 from public.fhs_roster_clubs where name=prefix||'旧所属';
  perform public.save_fhs_winter_participants(c1,array[ident],'{}');
  select updated_at into stamp from public.fhs_roster_entities where id=ident;
  perform public.save_fhs_roster_entity('horse',prefix,'ゴウセイウマ','',prefix||'兼所属',ident,stamp,false);
  select id into c2 from public.fhs_roster_clubs where name=prefix||'兼所属';
  before_value:=public.fhs_winter_roster_correction_state(ident);
  input:=jsonb_build_object('requestId',gen_random_uuid(),'eventId',ev,'entityId',ident,'kind','horse','clubName',prefix||'手入力先','destinationClubId',null,'endClubIds',jsonb_build_array(c1),'name',prefix,'reading','ゴウセイウマ','jef','','expected',before_value);
  perform public.correct_fhs_winter_roster_identity(input);
  after_value:=public.fhs_winter_roster_correction_state(ident);
  select id into c3 from public.fhs_roster_clubs where name=prefix||'手入力先';
  if c3 is null or after_value->'clubs' is distinct from (select jsonb_agg(x order by x) from unnest(array[c2,c3]) x) then raise exception 'destination/retained affiliations incorrect';end if;
  if not exists(select 1 from public.fhs_roster_affiliations where entity_id=ident and club_id=c1 and ended_at is not null) then raise exception 'prior affiliation history lost';end if;
  if before_value->'participants' is distinct from after_value->'participants' then raise exception 'event participant or billing identity moved';end if;
  perform public.correct_fhs_winter_roster_identity(input);
  if (select count(*) from public.fhs_winter_roster_corrections where entity_id=ident)<>1 then raise exception 'replay added history';end if;
  input:=input||jsonb_build_object('requestId',gen_random_uuid(),'destinationClubId',c3,'expected',after_value);
  begin
   perform public.correct_fhs_winter_roster_identity(input||jsonb_build_object('endClubIds',jsonb_build_array(c3)));
   raise exception 'destination ended';
  exception when others then if sqlerrm not like '%移動先の所属%' then raise;end if;end;
  begin
   perform public.correct_fhs_winter_roster_identity(input||jsonb_build_object('endClubIds',jsonb_build_array(c1)));
   raise exception 'already ended membership accepted';
  exception when others then if sqlerrm not like '%終了する現在の所属%' then raise;end if;end;
  begin
   perform public.correct_fhs_winter_roster_identity(input||jsonb_build_object('endClubIds',jsonb_build_array(gen_random_uuid())));
   raise exception 'unknown membership accepted';
  exception when others then if sqlerrm not like '%終了する現在の所属%' then raise;end if;end;
  begin
   perform public.correct_fhs_winter_roster_identity(input||jsonb_build_object('endClubIds','[]'::jsonb,'clubName',prefix||'間違った名前'));
   raise exception 'mismatched destination identity accepted';
  exception when others then if sqlerrm not like '%所属先クラブの名前%' then raise;end if;end;
  -- Choosing an existing destination reuses its ID and only ends the checked membership.
  input:=input||jsonb_build_object('clubName',prefix||'兼所属','destinationClubId',c2,'endClubIds',jsonb_build_array(c3));
  perform public.correct_fhs_winter_roster_identity(input);
  after_value:=public.fhs_winter_roster_correction_state(ident);
  if after_value->'clubs'<>jsonb_build_array(c2) or before_value->'participants' is distinct from after_value->'participants' then raise exception 'explicit transfer changed preserved data';end if;
  -- Event participants already recorded under the old club can be retained without re-adding the affiliation.
  perform public.save_fhs_winter_participants(c1,array[ident],array[ident]);
  if exists(select 1 from public.fhs_roster_affiliations where entity_id=ident and club_id=c1 and ended_at is null) then raise exception 'old affiliation silently restored';end if;
  if (select count(*) from public.fhs_roster_clubs where name like prefix||'%')<>3 then raise exception 'duplicate club created';end if;
  raise sqlstate 'ZX002' using message='successful affiliation transfer test rollback';
 exception when sqlstate 'ZX002' then null;end;
end;$test$;
