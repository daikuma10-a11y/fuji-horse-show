create table public.settlement_receipts (
  id uuid primary key,
  event_id uuid not null references public.events(id),
  organization_key text not null,
  recipient text not null check (length(btrim(recipient)) between 1 and 200),
  amount integer not null check (amount > 0),
  tax_amount integer not null check (tax_amount >= 0 and tax_amount <= amount),
  issue_date date not null,
  purpose text not null check (length(btrim(purpose)) between 1 and 500),
  payment_method text not null check (payment_method in ('bank_transfer','cash_at_venue')),
  issuer_name text not null check (length(btrim(issuer_name)) between 1 and 200),
  issuer_address text not null check (length(issuer_address) <= 1000),
  registration_number text not null default '' check (registration_number = '' or registration_number ~ '^T[0-9]{13}$'),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);
alter table public.settlement_receipts enable row level security;
revoke all on public.settlement_receipts from public, anon;
grant select, insert on public.settlement_receipts to authenticated;
create policy settlement_receipts_admin_select on public.settlement_receipts for select to authenticated
  using ((select auth.jwt()->'app_metadata'->>'role')='admin');
create policy settlement_receipts_admin_insert on public.settlement_receipts for insert to authenticated
  with check ((select auth.jwt()->'app_metadata'->>'role')='admin' and created_by=(select auth.uid()));
create index settlement_receipts_event_org_created_idx on public.settlement_receipts(event_id,organization_key,created_at desc);
