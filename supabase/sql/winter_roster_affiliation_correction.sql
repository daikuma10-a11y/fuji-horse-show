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
