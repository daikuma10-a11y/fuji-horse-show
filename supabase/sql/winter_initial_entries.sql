begin;
-- Confirmed entry fee only; this is not a payment receipt or an imported invoice total.
create table public.fhs_winter_initial_entries (
 id uuid primary key references public.entries(id),
 event_id uuid not null check(event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'),
 inputs jsonb not null,
 entry_fee integer not null check(entry_fee>0),
 created_by uuid not null,
 created_at timestamptz not null default now()
);
alter table public.fhs_winter_initial_entries enable row level security;
revoke all on public.fhs_winter_initial_entries from public,anon,authenticated;
grant select on public.fhs_winter_initial_entries to authenticated;
create policy initial_entry_admin_read on public.fhs_winter_initial_entries for select to authenticated
 using(auth.uid() is not null and auth.jwt()->'app_metadata'->>'role'='admin');
-- entries intentionally has no direct authenticated INSERT privilege.
-- This restricted Winter RPC is the only new writer; table permissions stay unchanged.
create schema if not exists fhs_winter_internal;
revoke all on schema fhs_winter_internal from public,anon;
grant usage on schema fhs_winter_internal to authenticated;
create function fhs_winter_internal.register_winter_initial_entry(
 p_id uuid,p_organization_id uuid,p_competition_id uuid,p_rider_id uuid,p_horse_id uuid,
 p_membership text,p_is_op boolean,p_instructor_confirmed boolean,p_expected_fee integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 c public.competitions%rowtype; r public.riders%rowtype; h public.horses%rowtype;
 saved public.fhs_winter_initial_entries%rowtype; args jsonb; price integer; pos integer;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '事前エントリー登録には本部ログインが必要です';end if;
 if p_id is null or p_organization_id is null or p_competition_id is null or p_rider_id is null or p_horse_id is null or p_is_op is null or p_instructor_confirmed is null or p_expected_fee is null then raise exception '団体・競技・人馬・料金区分を確認してください';end if;
 args:=jsonb_build_object('organizationId',p_organization_id,'competitionId',p_competition_id,'riderId',p_rider_id,'horseId',p_horse_id,'membership',p_membership,'isOp',p_is_op,'instructorConfirmed',p_instructor_confirmed,'entryFee',p_expected_fee);
 perform pg_advisory_xact_lock(hashtextextended('winter-initial:'||p_id::text,0));
 select * into saved from public.fhs_winter_initial_entries where id=p_id;
 if found then
  if saved.event_id<>ev or saved.inputs is distinct from args then raise exception '登録番号と事前エントリー内容が一致しません';end if;
  return p_id;
 end if;
 if exists(select 1 from public.entries where id=p_id) then raise exception '使用済みの登録番号です';end if;
 if not exists(select 1 from public.organizations where id=p_organization_id and event_id=ev) then raise exception 'Winterの団体を選択してください';end if;
 select * into c from public.competitions where id=p_competition_id and event_id=ev for share;
 if not found then raise exception 'Winterの競技を選択してください';end if;
 select * into r from public.riders where id=p_rider_id and event_id=ev and organization_id=p_organization_id for share;
 if not found then raise exception '選手の大会・所属を確認してください';end if;
 select * into h from public.horses where id=p_horse_id and event_id=ev and organization_id=p_organization_id for share;
 if not found then raise exception '馬の大会・所属を確認してください';end if;
 if (r.roster_source='shared_roster' and not r.is_participant) or (h.roster_source='shared_roster' and not h.is_participant) then raise exception '参加チェックを保存した人馬を選択してください';end if;
 if c.official and (nullif(btrim(r.jef_member_no),'') is null or nullif(btrim(h.jef_registration_no),'') is null) then raise exception '公認競技は日馬連登録済みの人馬を選択してください';end if;
 price:=public.winter_change_price(c.id,p_membership,p_is_op,p_instructor_confirmed);
 if price is distinct from p_expected_fee then raise exception '競技料金が更新されています。再読み込みして確認し直してください';end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-order:'||c.id::text,0));
 if exists(select 1 from public.entries where event_id=ev and competition_id=c.id and rider_id=r.id and horse_id=h.id and lower(status) not in('wd','withdrawn')) then raise exception '同じ競技・選手・馬の出番が登録済みです';end if;
 if exists(select 1 from public.reception_requests where event_id=ev and target_competition_id=c.id and rider_id=r.id and horse_id=h.id and status='pending') then raise exception '同じ人馬の未反映申請があります。先に申請を確認してください';end if;
 select coalesce(max(start_order),0)+1 into pos from public.entries where event_id=ev and competition_id=c.id and lower(status) not in('wd','withdrawn');
 insert into public.entries(id,event_id,competition_id,rider_id,horse_id,organization_id,start_order,status,source,is_op)
 values(p_id,ev,c.id,r.id,h.id,p_organization_id,pos,'active','winter-initial',p_is_op);
 insert into public.fhs_winter_initial_entries(id,event_id,inputs,entry_fee,created_by) values(p_id,ev,args,price,auth.uid());
 return p_id;
end;$$;
revoke all on function fhs_winter_internal.register_winter_initial_entry(uuid,uuid,uuid,uuid,uuid,text,boolean,boolean,integer) from public,anon;
grant execute on function fhs_winter_internal.register_winter_initial_entry(uuid,uuid,uuid,uuid,uuid,text,boolean,boolean,integer) to authenticated;
create function public.register_winter_initial_entry(
 p_id uuid,p_organization_id uuid,p_competition_id uuid,p_rider_id uuid,p_horse_id uuid,
 p_membership text,p_is_op boolean,p_instructor_confirmed boolean,p_expected_fee integer
) returns uuid language sql security invoker set search_path='' as $$
 select fhs_winter_internal.register_winter_initial_entry(p_id,p_organization_id,p_competition_id,p_rider_id,p_horse_id,p_membership,p_is_op,p_instructor_confirmed,p_expected_fee);
$$;
revoke all on function public.register_winter_initial_entry(uuid,uuid,uuid,uuid,uuid,text,boolean,boolean,integer) from public,anon;
grant execute on function public.register_winter_initial_entry(uuid,uuid,uuid,uuid,uuid,text,boolean,boolean,integer) to authenticated;
commit;
