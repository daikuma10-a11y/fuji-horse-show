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
