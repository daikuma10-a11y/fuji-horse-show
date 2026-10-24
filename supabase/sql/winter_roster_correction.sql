-- Explicit administrative correction. Keep identity IDs and all event entries/charges.
create table public.fhs_winter_roster_corrections (
 request_id uuid primary key, event_id uuid not null check(event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'),
 entity_id uuid not null references public.fhs_roster_entities(id), actor uuid not null,
 input jsonb not null, before_state jsonb not null, after_state jsonb not null, created_at timestamptz not null default now()
);
create index fhs_winter_roster_correction_entity_idx on public.fhs_winter_roster_corrections(entity_id,created_at);
alter table public.fhs_winter_roster_corrections enable row level security;
revoke all on public.fhs_winter_roster_corrections from public,anon,authenticated;
grant select,insert on public.fhs_winter_roster_corrections to authenticated;
create policy winter_roster_correction_admin_read on public.fhs_winter_roster_corrections for select to authenticated using((select auth.uid()) is not null and (select auth.jwt())->'app_metadata'->>'role'='admin');
create policy winter_roster_correction_admin_insert on public.fhs_winter_roster_corrections for insert to authenticated with check((select auth.uid()) is not null and actor=(select auth.uid()) and (select auth.jwt())->'app_metadata'->>'role'='admin');

create function public.fhs_winter_roster_correction_state(p_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.fhs_roster_entities%rowtype; result jsonb;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です';end if;
 select * into e from public.fhs_roster_entities where id=p_id and archived_at is null;
 if not found then raise exception '訂正する既存人馬を確認してください';end if;
 if exists(select 1 from public.fhs_winter_participants p left join public.fhs_winter_reception_roster b on b.entity_id=p.entity_id and b.club_id=p.club_id
 left join public.riders r on r.id=b.rider_id left join public.horses h on h.id=b.horse_id
 where p.entity_id=p_id and (p.event_id<>'b571f05e-ed23-4e07-929e-be2b73e601a5' or coalesce(r.event_id,h.event_id) is distinct from p.event_id or (e.kind='rider')<>(b.rider_id is not null))) then raise exception '既存のWinter人馬との対応を確認できません';end if;
 select jsonb_build_object(
 'entity',jsonb_build_object('name',e.name,'reading',e.reading,'jef',coalesce(e.jef_number,''),'updatedAt',e.updated_at),
 'clubs',coalesce((select jsonb_agg(a.club_id order by a.club_id) from public.fhs_roster_affiliations a where a.entity_id=p_id and a.ended_at is null),'[]'::jsonb),
 'participants',coalesce((select jsonb_agg(jsonb_build_object('clubId',p.club_id,'name',p.name_snapshot,'reading',p.reading_snapshot,'jef',coalesce(p.jef_number_snapshot,''),'clubName',p.club_name_snapshot,
 'targetId',coalesce(r.id,h.id),'targetName',coalesce(r.name,h.name),'targetJef',coalesce(r.jef_member_no,h.jef_registration_no,''),
 'organizationId',coalesce(r.organization_id,h.organization_id),'organizationName',coalesce(o.name,''),'participating',coalesce(r.is_participant,h.is_participant,true)) order by p.club_id)
 from public.fhs_winter_participants p join public.fhs_winter_reception_roster b on b.entity_id=p.entity_id and b.club_id=p.club_id
 left join public.riders r on r.id=b.rider_id left join public.horses h on h.id=b.horse_id left join public.organizations o on o.id=coalesce(r.organization_id,h.organization_id)
 where p.entity_id=p_id and p.event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'),'[]'::jsonb)) into result;
 return result;
end;$$;

create function public.correct_fhs_winter_roster_identity(p_input jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5'; ident uuid; req uuid; e public.fhs_roster_entities%rowtype; previous public.fhs_winter_roster_corrections%rowtype;
 before_value jsonb; expected jsonb; after_value jsonb; n text; rd text; num text; club text;
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
 if num is not null and exists(select 1 from public.fhs_roster_entities where id<>ident and kind=e.kind and jef_number=num) then raise exception 'この日馬連番号は別の既存人馬に登録されています。番号のある候補を選んで所属を追加してください';end if;
 perform public.save_fhs_roster_entity(e.kind,n,rd,coalesce(num,''),club,ident,e.updated_at,false);
 update public.fhs_winter_participants set name_snapshot=n,reading_snapshot=rd,jef_number_snapshot=num where entity_id=ident and event_id=ev;
 update public.riders r set name=n,jef_member_no=num from public.fhs_winter_reception_roster b join public.fhs_winter_participants p on p.entity_id=b.entity_id and p.club_id=b.club_id and p.event_id=ev where b.entity_id=ident and b.rider_id=r.id and r.event_id=ev;
 update public.horses h set name=n,jef_registration_no=num from public.fhs_winter_reception_roster b join public.fhs_winter_participants p on p.entity_id=b.entity_id and p.club_id=b.club_id and p.event_id=ev where b.entity_id=ident and b.horse_id=h.id and h.event_id=ev;
 after_value:=public.fhs_winter_roster_correction_state(ident);
 insert into public.fhs_winter_roster_corrections(request_id,event_id,entity_id,actor,input,before_state,after_state) values(req,ev,ident,auth.uid(),p_input,before_value,after_value);
 return ident;
end;$$;
revoke all on function public.fhs_winter_roster_correction_state(uuid),public.correct_fhs_winter_roster_identity(jsonb) from public,anon;
grant execute on function public.fhs_winter_roster_correction_state(uuid),public.correct_fhs_winter_roster_identity(jsonb) to authenticated;
