-- Admin-only per-entry corrections. Never rewrite competition prices or request fees.
create table if not exists public.settlement_fee_overrides (
  event_id uuid not null references public.events(id),
  source_type text not null check (source_type in ('normal', 'add')),
  source_id text not null,
  original_fee integer not null check (original_fee >= 0),
  corrected_fee integer not null check (corrected_fee >= 0),
  reason text not null check (length(btrim(reason)) between 1 and 500),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (event_id, source_type, source_id)
);

alter table public.settlement_fee_overrides enable row level security;
revoke all on public.settlement_fee_overrides from public, anon;
grant select, insert, update on public.settlement_fee_overrides to authenticated;

create policy settlement_fee_overrides_admin_select
  on public.settlement_fee_overrides for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy settlement_fee_overrides_admin_insert
  on public.settlement_fee_overrides for insert to authenticated
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and updated_by = (select auth.uid()));
create policy settlement_fee_overrides_admin_update
  on public.settlement_fee_overrides for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and updated_by = (select auth.uid()));

-- Records the amount already received for the ordinary, advance entry bill.
-- It does not alter reception charges or presume that any existing club paid.
create table if not exists public.settlement_prepayments (
  event_id uuid not null references public.events(id),
  organization_key text not null,
  paid_amount integer not null check (paid_amount >= 0),
  note text not null default '',
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (event_id, organization_key)
);
alter table public.settlement_prepayments enable row level security;
revoke all on public.settlement_prepayments from public, anon;
grant select, insert, update on public.settlement_prepayments to authenticated;
create policy settlement_prepayments_admin_select on public.settlement_prepayments
  for select to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy settlement_prepayments_admin_insert on public.settlement_prepayments
  for insert to authenticated with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' and updated_by = (select auth.uid()));
create policy settlement_prepayments_admin_update on public.settlement_prepayments
  for update to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' and updated_by = (select auth.uid()));
