-- Public reception remains open; the staff-origin marker requires an admin JWT.
alter policy reception_requests_insert_autumn on public.reception_requests
  with check (
    event_id = (
      select id from public.events
      where name ilike '%autumn%'
      order by created_at desc limit 1
    )
    and status = 'pending'
    and (
      coalesce(source, '') <> 'on-site-admin'
      or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    )
  );
