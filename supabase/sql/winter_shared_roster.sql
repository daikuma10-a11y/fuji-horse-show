-- Additive preparation schema; does not modify Autumn/event tables.
begin;
create table public.fhs_roster_clubs (
 id uuid primary key default gen_random_uuid(), name text not null unique check(length(btrim(name)) between 1 and 150), created_at timestamptz not null default now()
);
create table public.fhs_roster_entities (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('rider','horse')),
 name text not null check(length(btrim(name)) between 1 and 100), jef_number text check(jef_number ~ '^[0-9]+$'),
 reading text not null default '', reading_source text not null default 'manual', source_reference text,
 updated_at timestamptz not null default now(), archived_at timestamptz, unique(kind,jef_number)
);
create table public.fhs_roster_affiliations (
 id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.fhs_roster_entities(id),
 club_id uuid not null references public.fhs_roster_clubs(id), started_at timestamptz not null default now(), ended_at timestamptz
);
create unique index fhs_roster_current_membership on public.fhs_roster_affiliations(entity_id,club_id) where ended_at is null;
create index fhs_roster_club_members on public.fhs_roster_affiliations(club_id) where ended_at is null;
create table public.fhs_winter_participants (
 event_id uuid not null check(event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'),
 entity_id uuid not null references public.fhs_roster_entities(id), club_id uuid not null references public.fhs_roster_clubs(id),
 name_snapshot text not null, reading_snapshot text not null, jef_number_snapshot text,
 club_name_snapshot text not null, selected_at timestamptz not null default now(), primary key(event_id,entity_id,club_id)
);
alter table public.fhs_roster_clubs enable row level security;
alter table public.fhs_roster_entities enable row level security;
alter table public.fhs_roster_affiliations enable row level security;
alter table public.fhs_winter_participants enable row level security;
revoke all on public.fhs_roster_clubs,public.fhs_roster_entities,public.fhs_roster_affiliations,public.fhs_winter_participants from public,anon,authenticated;
grant select,insert,update on public.fhs_roster_clubs,public.fhs_roster_entities,public.fhs_roster_affiliations to authenticated;
grant select,insert,update,delete on public.fhs_winter_participants to authenticated;
create policy roster_club_admin on public.fhs_roster_clubs for all to authenticated using(auth.uid() is not null and auth.jwt()->'app_metadata'->>'role'='admin') with check(auth.uid() is not null and auth.jwt()->'app_metadata'->>'role'='admin');
create policy roster_entity_admin on public.fhs_roster_entities for all to authenticated using(auth.uid() is not null and auth.jwt()->'app_metadata'->>'role'='admin') with check(auth.uid() is not null and auth.jwt()->'app_metadata'->>'role'='admin');
create policy roster_affiliation_admin on public.fhs_roster_affiliations for all to authenticated using(auth.uid() is not null and auth.jwt()->'app_metadata'->>'role'='admin') with check(auth.uid() is not null and auth.jwt()->'app_metadata'->>'role'='admin');
create policy roster_participant_admin on public.fhs_winter_participants for all to authenticated using(auth.uid() is not null and auth.jwt()->'app_metadata'->>'role'='admin') with check(auth.uid() is not null and auth.jwt()->'app_metadata'->>'role'='admin');

create function public.save_fhs_roster_entity(p_kind text,p_name text,p_reading text,p_jef_number text,p_club_name text,p_id uuid default null,p_expected_updated_at timestamptz default null,p_replace_affiliations boolean default false)
returns uuid language plpgsql security invoker set search_path='' as $$
declare ident uuid; club uuid; actual public.fhs_roster_entities%rowtype; num text:=nullif(btrim(p_jef_number),'');
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です'; end if;
 if p_kind is null or p_kind not in('rider','horse') or coalesce(length(btrim(p_name)),0) not between 1 and 100 or coalesce(length(btrim(p_club_name)),0) not between 1 and 150 then raise exception '種類・氏名・所属を確認してください'; end if;
 if num is not null and num !~ '^[0-9]+$' then raise exception '日馬連番号は数字または空欄で入力してください';end if;
 if length(coalesce(p_reading,''))>200 then raise exception '読みは200文字以内で入力してください';end if;
 insert into public.fhs_roster_clubs(name) values(btrim(p_club_name)) on conflict(name) do update set name=excluded.name returning id into club;
 if p_id is null then
  if num is not null and exists(select 1 from public.fhs_roster_entities where kind=p_kind and jef_number=num) then raise exception '同じ日馬連番号の登録があります。既存の人馬を編集してください';end if;
  insert into public.fhs_roster_entities(kind,name,reading,jef_number) values(p_kind,btrim(p_name),coalesce(btrim(p_reading),''),num) returning id into ident;
 else
  select * into actual from public.fhs_roster_entities where id=p_id for update;
  if not found or actual.kind<>p_kind or actual.archived_at is not null then raise exception '編集する人馬を確認してください';end if;
  if p_expected_updated_at is distinct from actual.updated_at then raise exception '別の操作で名簿が更新されています。再読み込みしてください';end if;
  ident:=p_id;
  update public.fhs_roster_entities set name=btrim(p_name),reading=coalesce(btrim(p_reading),''),reading_source='manual',jef_number=num,updated_at=clock_timestamp() where id=ident;
 end if;
 if coalesce(p_replace_affiliations,false) then
  update public.fhs_roster_affiliations set ended_at=clock_timestamp() where entity_id=ident and club_id<>club and ended_at is null;
 end if;
 if not exists(select 1 from public.fhs_roster_affiliations where entity_id=ident and club_id=club and ended_at is null) then
  insert into public.fhs_roster_affiliations(entity_id,club_id) values(ident,club);
 end if;
 return ident;
end;$$;
create function public.save_fhs_winter_participants(p_club_id uuid,p_ids uuid[],p_expected_ids uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5'; actual uuid[]; expected uuid[];
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です';end if;
 if p_ids is null or p_expected_ids is null or not exists(select 1 from public.fhs_roster_clubs where id=p_club_id) then raise exception '団体と参加者を確認してください';end if;
 perform pg_advisory_xact_lock(hashtextextended('fhs-winter-participants',0));
 select coalesce(array_agg(entity_id order by entity_id),'{}') into actual from public.fhs_winter_participants where event_id=ev and club_id=p_club_id;
 select coalesce(array_agg(x order by x),'{}') into expected from unnest(p_expected_ids) x;
 if actual is distinct from expected then raise exception '参加名簿が別の操作で更新されています。再読み込みしてください';end if;
 if cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids) x) or exists(select 1 from unnest(p_ids) x where x is null or (not exists(select 1 from public.fhs_roster_affiliations where entity_id=x and club_id=p_club_id and ended_at is null) and not exists(select 1 from public.fhs_winter_participants where event_id=ev and entity_id=x and club_id=p_club_id))) then raise exception '団体に所属する人馬を選択してください';end if;
 if exists(select 1 from public.fhs_roster_entities e where e.id=any(p_ids) and e.archived_at is not null and not exists(select 1 from public.fhs_winter_participants where event_id=ev and entity_id=e.id and club_id=p_club_id)) then raise exception '削除済みの人馬は新たに参加登録できません';end if;
 delete from public.fhs_winter_participants where event_id=ev and club_id=p_club_id and not(entity_id=any(p_ids));
 insert into public.fhs_winter_participants(event_id,entity_id,club_id,name_snapshot,reading_snapshot,jef_number_snapshot,club_name_snapshot)
 select ev,e.id,p_club_id,e.name,e.reading,e.jef_number,c.name from public.fhs_roster_entities e cross join public.fhs_roster_clubs c where e.id=any(p_ids) and c.id=p_club_id
 on conflict(event_id,entity_id,club_id) do nothing;
 return jsonb_build_object('eventId',ev,'count',cardinality(p_ids));
end;$$;
create function public.archive_fhs_roster_entity(p_id uuid,p_expected_updated_at timestamptz)
returns uuid language plpgsql security invoker set search_path='' as $$
declare actual public.fhs_roster_entities%rowtype;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です';end if;
 select * into actual from public.fhs_roster_entities where id=p_id for update;
 if not found or actual.updated_at is distinct from p_expected_updated_at then raise exception '名簿が更新されています。再読み込みしてください';end if;
 update public.fhs_roster_entities set archived_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_id;
 return p_id;
end;$$;
revoke all on function public.save_fhs_roster_entity(text,text,text,text,text,uuid,timestamptz,boolean),public.save_fhs_winter_participants(uuid,uuid[],uuid[]),public.archive_fhs_roster_entity(uuid,timestamptz) from public,anon;
grant execute on function public.save_fhs_roster_entity(text,text,text,text,text,uuid,timestamptz,boolean),public.save_fhs_winter_participants(uuid,uuid[],uuid[]),public.archive_fhs_roster_entity(uuid,timestamptz) to authenticated;
commit;
