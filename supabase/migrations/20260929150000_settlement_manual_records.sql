-- Admin-only accounting for off-list venue changes and payment timing of post-deadline requests.
-- A linked request contributes its fee through reception_requests only; bill_amount must be zero.
create table public.settlement_manual_records (
  id uuid primary key,
  event_id uuid not null references public.events(id),
  request_id uuid unique references public.reception_requests(id),
  period text not null check (period in ('before_event', 'at_venue')),
  action_type text not null check (action_type in ('add', 'change', 'withdraw')),
  organization_key text not null,
  competition_key text not null,
  rider_key text not null,
  horse_key text not null,
  details text not null default '',
  bill_amount integer not null check (bill_amount >= 0),
  paid_amount integer not null check (paid_amount >= 0),
  payment_plan text not null check (payment_plan in ('paid_before_event', 'pay_at_venue', 'pay_after_event')),
  operator_name text not null check (length(btrim(operator_name)) between 1 and 100),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check ((request_id is null and period = 'at_venue') or (request_id is not null and period = 'before_event' and bill_amount = 0)),
  check (request_id is not null or paid_amount <= bill_amount)
);
alter table public.settlement_manual_records enable row level security;
revoke all on public.settlement_manual_records from public, anon;
grant select, insert on public.settlement_manual_records to authenticated;
create policy settlement_manual_records_admin_select on public.settlement_manual_records
  for select to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy settlement_manual_records_admin_insert on public.settlement_manual_records
  for insert to authenticated with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' and updated_by = (select auth.uid()));
