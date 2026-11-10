-- A venue activity is separate from competitions, entries, charges and inspection times.
create table public.fhs_winter_arena_openings (
  event_id uuid not null references public.events(id) check (event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'),
  opening_date date not null,
  section_id text not null check (section_id='dressage'),
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  primary key (event_id,opening_date,section_id)
);
alter table public.fhs_winter_arena_openings enable row level security;
revoke all on public.fhs_winter_arena_openings from public,anon,authenticated;
grant select,update(start_time) on public.fhs_winter_arena_openings to authenticated;
create policy winter_arena_read on public.fhs_winter_arena_openings for select to authenticated
  using ((select auth.uid()) is not null and (select auth.jwt())->'app_metadata'->>'role'='admin');
create policy winter_arena_time on public.fhs_winter_arena_openings for update to authenticated
  using ((select auth.uid()) is not null and (select auth.jwt())->'app_metadata'->>'role'='admin')
  with check ((select auth.uid()) is not null and (select auth.jwt())->'app_metadata'->>'role'='admin');
insert into public.fhs_winter_arena_openings(event_id,opening_date,section_id,start_time)
  values ('b571f05e-ed23-4e07-929e-be2b73e601a5','2026-11-13','dressage','14:00');
create trigger winter_arena_opening_updated after update on public.fhs_winter_arena_openings
  for each row execute function fhs_winter_internal.signal_update();
