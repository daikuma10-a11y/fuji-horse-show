-- Admin-only append-only corrections; original competition/payment records remain intact.
create table public.fhs_winter_charge_adjustments (
 id uuid primary key, sequence bigint generated always as identity unique,
 event_id uuid not null default 'b571f05e-ed23-4e07-929e-be2b73e601a5' check(event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'),
 organization_key uuid not null references public.organizations(id),
 delta integer not null check(delta<>0), reason text not null check(length(btrim(reason)) between 1 and 500),
 previous_id uuid references public.fhs_winter_charge_adjustments(id),
 before_total bigint not null check(before_total>=0),after_total bigint not null check(after_total>=0 and after_total=before_total+delta),
 created_at timestamptz not null default now(),created_by uuid not null references auth.users(id)
);
create index winter_charge_adjustment_org on public.fhs_winter_charge_adjustments(event_id,organization_key,sequence);
alter table public.fhs_winter_charge_adjustments enable row level security;
revoke all on public.fhs_winter_charge_adjustments from public,anon,authenticated;
grant select on public.fhs_winter_charge_adjustments to authenticated;
create policy winter_charge_adjustment_read on public.fhs_winter_charge_adjustments for select to authenticated
 using ((select auth.uid()) is not null and (select auth.jwt()->'app_metadata'->>'role')='admin');
create function fhs_winter_internal.save_charge_adjustment(p_id uuid,p_organization_id uuid,p_delta integer,p_reason text,p_expected_total bigint,p_previous_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';saved public.fhs_winter_charge_adjustments%rowtype;last_id uuid;total bigint;adjustment bigint;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '金額訂正には本部ログインが必要です';end if;
 if p_id is null or p_organization_id is null or p_delta is null or p_delta=0 or p_reason is null or length(btrim(p_reason)) not between 1 and 500 or p_expected_total is null or p_expected_total<0 then raise exception '訂正金額・理由を確認してください';end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-adjustment-id:'||p_id::text,0));
 select * into saved from public.fhs_winter_charge_adjustments where id=p_id;
 if found then
  if saved.organization_key<>p_organization_id or saved.delta<>p_delta or saved.reason<>btrim(p_reason) or saved.before_total<>p_expected_total or saved.previous_id is distinct from p_previous_id then raise exception '登録番号と訂正内容が一致しません';end if;
  return p_id;
 end if;
 if not exists(select 1 from public.organizations where id=p_organization_id and event_id=ev) then raise exception 'Winterの団体を選択してください';end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-finance:'||p_organization_id::text,0));
 select id into last_id from public.fhs_winter_charge_adjustments where organization_key=p_organization_id order by sequence desc limit 1;
 if last_id is distinct from p_previous_id then raise exception '別の訂正が保存されています。再読み込みしてください';end if;
 select coalesce(sum(delta),0) into adjustment from public.fhs_winter_charge_adjustments where organization_key=p_organization_id;
 select coalesce((select sum(entry_fee) from public.fhs_winter_initial_entries where event_id=ev and coalesce(inputs->>'billingOrganizationId',inputs->>'organizationId')=p_organization_id::text),0)
 +14000*(select count(*) from public.horses where event_id=ev and organization_id=p_organization_id and is_participant is distinct from false and (roster_source is distinct from 'shared_roster' or is_participant=true))
 +coalesce((select sum(fee_amount) from public.reception_requests where event_id=ev and organization_id=p_organization_id and status='reflected'),0)+adjustment into total;
 if total<>p_expected_total then raise exception '請求額が更新されています。再読み込みしてください';end if;
 if total+p_delta<0 then raise exception '請求総額を0円未満にはできません';end if;
 insert into public.fhs_winter_charge_adjustments(id,event_id,organization_key,delta,reason,previous_id,before_total,after_total,created_by)
 values(p_id,ev,p_organization_id,p_delta,btrim(p_reason),p_previous_id,total,total+p_delta,auth.uid());
 return p_id;
end;$$;
revoke all on function fhs_winter_internal.save_charge_adjustment(uuid,uuid,integer,text,bigint,uuid) from public,anon,authenticated;
grant execute on function fhs_winter_internal.save_charge_adjustment(uuid,uuid,integer,text,bigint,uuid) to authenticated;
create function public.save_winter_charge_adjustment(p_id uuid,p_organization_id uuid,p_delta integer,p_reason text,p_expected_total bigint,p_previous_id uuid default null)
returns uuid language sql security invoker set search_path='' as $$select fhs_winter_internal.save_charge_adjustment(p_id,p_organization_id,p_delta,p_reason,p_expected_total,p_previous_id);$$;
revoke all on function public.save_winter_charge_adjustment(uuid,uuid,integer,text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.save_winter_charge_adjustment(uuid,uuid,integer,text,bigint,uuid) to authenticated;
