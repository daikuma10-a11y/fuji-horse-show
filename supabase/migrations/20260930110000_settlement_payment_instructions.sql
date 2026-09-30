-- Payment instructions for each organization's remaining Autumn balance.
create table public.settlement_payment_instructions (
  event_id uuid not null references public.events(id),
  organization_key text not null,
  payment_method text not null check (payment_method in ('bank_transfer', 'cash_at_venue')),
  bank_details text not null default '' check (length(bank_details) <= 2000),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  primary key (event_id, organization_key),
  check (length(btrim(organization_key)) between 1 and 100),
  check (payment_method <> 'bank_transfer' or length(btrim(bank_details)) > 0)
);
alter table public.settlement_payment_instructions enable row level security;
revoke all on public.settlement_payment_instructions from public, anon;
grant select, insert, update on public.settlement_payment_instructions to authenticated;
create policy settlement_payment_instructions_admin_select on public.settlement_payment_instructions
  for select to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy settlement_payment_instructions_admin_insert on public.settlement_payment_instructions
  for insert to authenticated with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' and updated_by = (select auth.uid()));
create policy settlement_payment_instructions_admin_update on public.settlement_payment_instructions
  for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' and updated_by = (select auth.uid()));
