create table fhs_winter_internal.exercise_baseline (
 run_id text primary key,
 created_at timestamptz not null default now(),
 status text not null check(status in ('active','cleared')),
 baseline_entries jsonb not null,
 previous_monitor jsonb,
 manifest jsonb not null
);
alter table fhs_winter_internal.exercise_baseline enable row level security;
revoke all on fhs_winter_internal.exercise_baseline from public,anon,authenticated;
