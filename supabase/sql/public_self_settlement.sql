-- Visitor sessions carry no administrator identity. All direct table grants and
-- administrator-only RLS policies remain unchanged. The service-only checkout
-- function still validates charge snapshots and only saves payment instructions.
alter table public.self_settlement_devices alter column created_by drop not null;
alter table public.settlement_payment_instructions alter column updated_by drop not null;
comment on column public.self_settlement_devices.created_by is 'Admin who provisioned a legacy device; null for an automatically provisioned visitor session';
comment on column public.settlement_payment_instructions.updated_by is 'Admin updater; null for visitor confirmation, whose name and device are recorded in self_settlement_confirmations';
