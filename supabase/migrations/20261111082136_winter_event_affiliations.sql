-- A sporting affiliation belongs to the event. Applications, club memberships
-- and financial records continue to use their original organization keys.
create table public.fhs_winter_event_affiliations (
  organization_id uuid primary key references public.organizations(id),
  event_id uuid not null check (event_id = 'b571f05e-ed23-4e07-929e-be2b73e601a5'),
  official_club_id uuid not null references public.fhs_roster_clubs(id),
  official_name text not null
);
create index fhs_winter_event_affiliations_club_idx
  on public.fhs_winter_event_affiliations(official_club_id);

create function fhs_winter_internal.set_event_affiliation_name()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.organizations
    where id = new.organization_id and event_id = new.event_id for share;
  if not found then raise exception '大会の団体IDが一致しません'; end if;
  select name into strict new.official_name from public.fhs_roster_clubs
    where id = new.official_club_id for share;
  return new;
end;
$$;
revoke all on function fhs_winter_internal.set_event_affiliation_name() from public, anon, authenticated;
create trigger set_affiliation_name before insert or update on public.fhs_winter_event_affiliations
  for each row execute function fhs_winter_internal.set_event_affiliation_name();
create trigger fhs_winter_signal after insert or update or delete on public.fhs_winter_event_affiliations
  for each row execute function fhs_winter_internal.signal_update();

alter table public.fhs_winter_event_affiliations enable row level security;
revoke all on public.fhs_winter_event_affiliations from public, anon, authenticated, service_role;
grant select (event_id, organization_id, official_name) on public.fhs_winter_event_affiliations to anon, authenticated;
create policy winter_affiliation_read on public.fhs_winter_event_affiliations
  for select to anon, authenticated
  using (exists (select 1 from public.organizations o where o.id = organization_id
    and o.event_id = 'b571f05e-ed23-4e07-929e-be2b73e601a5'));
