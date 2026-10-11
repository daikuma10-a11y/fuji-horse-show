-- Append-only receipt history. A payment plan or print never calls this RPC.
create table public.fhs_winter_extra_payments (
 id uuid primary key,
 event_id uuid not null default 'b571f05e-ed23-4e07-929e-be2b73e601a5' check(event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'),
 organization_key uuid not null references public.organizations(id),
 amount integer not null check(amount between 1 and 2147483647),
 payment_method text not null check(payment_method in('bank_transfer','cash_at_venue')),
 note text not null check(length(btrim(note)) between 1 and 500),
 reverses_id uuid unique references public.fhs_winter_extra_payments(id),
 created_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id)
);
create index fhs_winter_extra_payments_org_idx on public.fhs_winter_extra_payments(event_id,organization_key,id);
alter table public.fhs_winter_extra_payments enable row level security;
revoke all on public.fhs_winter_extra_payments from public,anon,authenticated;
grant select on public.fhs_winter_extra_payments to authenticated;
create policy winter_extra_payments_admin_read on public.fhs_winter_extra_payments for select to authenticated
 using ((select auth.uid()) is not null and (select auth.jwt()->'app_metadata'->>'role')='admin');
create function fhs_winter_internal.save_extra_payment(p_id uuid,p_organization_id uuid,p_amount integer,p_payment_method text,p_note text,p_reverses_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5'; saved public.fhs_winter_extra_payments%rowtype; original public.fhs_winter_extra_payments%rowtype;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '入金の記録には本部ログインが必要です';end if;
 if p_id is null or p_organization_id is null or p_amount is null or p_amount<1 or p_payment_method is null or p_payment_method not in('bank_transfer','cash_at_venue') or p_note is null or length(btrim(p_note)) not between 1 and 500 then raise exception '入金額・方法・確認内容を入力してください';end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-payment:'||p_id::text,0));
 select * into saved from public.fhs_winter_extra_payments where id=p_id;
 if found then
  if saved.organization_key<>p_organization_id or saved.amount<>p_amount or saved.payment_method<>p_payment_method or saved.note<>btrim(p_note) or saved.reverses_id is distinct from p_reverses_id then raise exception '登録番号と入金内容が一致しません';end if;
  return p_id;
 end if;
 if not exists(select 1 from public.organizations where id=p_organization_id and event_id=ev) then raise exception 'Winterの団体を選択してください';end if;
 if p_reverses_id is not null then
  select * into original from public.fhs_winter_extra_payments where id=p_reverses_id for update;
  if not found or original.organization_key<>p_organization_id or original.reverses_id is not null or original.amount<>p_amount or original.payment_method<>p_payment_method then raise exception '取り消す入金内容を確認してください';end if;
  if exists(select 1 from public.fhs_winter_extra_payments where reverses_id=p_reverses_id) then raise exception 'この入金は取消済みです';end if;
 end if;
 insert into public.fhs_winter_extra_payments(id,event_id,organization_key,amount,payment_method,note,reverses_id,created_by)
 values(p_id,ev,p_organization_id,p_amount,p_payment_method,btrim(p_note),p_reverses_id,auth.uid());
 return p_id;
end;$$;
revoke all on function fhs_winter_internal.save_extra_payment(uuid,uuid,integer,text,text,uuid) from public,anon,authenticated;
grant execute on function fhs_winter_internal.save_extra_payment(uuid,uuid,integer,text,text,uuid) to authenticated;
create function public.save_winter_extra_payment(p_id uuid,p_organization_id uuid,p_amount integer,p_payment_method text,p_note text,p_reverses_id uuid default null)
returns uuid language sql security invoker set search_path='' as $$
 select fhs_winter_internal.save_extra_payment(p_id,p_organization_id,p_amount,p_payment_method,p_note,p_reverses_id);
$$;
revoke all on function public.save_winter_extra_payment(uuid,uuid,integer,text,text,uuid) from public,anon,authenticated;
grant execute on function public.save_winter_extra_payment(uuid,uuid,integer,text,text,uuid) to authenticated;
