-- Approved 2026-10-24: protect the two retained JEF lookup tables before importing source data.
-- No changes to participant/entry/settlement tables, accounts or admin roles.
-- Lookup reads use the same server-controlled app_metadata admin claim as Winter.
begin;
alter table public.jef_rider_master enable row level security;
alter table public.jef_horse_master enable row level security;
revoke all on public.jef_rider_master, public.jef_horse_master from public, anon, authenticated;
grant select on public.jef_rider_master, public.jef_horse_master to authenticated;
create policy jef_rider_master_admin_read on public.jef_rider_master
 for select to authenticated
 using ((select auth.uid()) is not null and coalesce((select auth.jwt())->'app_metadata'->>'role','')='admin');
create policy jef_horse_master_admin_read on public.jef_horse_master
 for select to authenticated
 using ((select auth.uid()) is not null and coalesce((select auth.jwt())->'app_metadata'->>'role','')='admin');
-- No browser INSERT/UPDATE/DELETE policy. Retained-source import uses the authorized backend.
-- Apply/check before loading dated data. Preserve newer rows and reject conflicting same-date rows.
commit;
