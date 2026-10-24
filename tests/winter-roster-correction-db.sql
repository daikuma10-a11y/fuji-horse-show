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
