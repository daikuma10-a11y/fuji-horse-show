-- Request payloads contain visitor names and all clubs' fees. Only verified
-- office accounts may read them; anonymous users retain the ability to submit.
drop policy if exists reception_requests_read on public.reception_requests;
create policy reception_requests_admin_read
  on public.reception_requests for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- The public start list needs to omit cancelled additions. Expose only the
-- affected entry IDs, never request payloads, fees or visitor information.
create or replace view public.reception_cancelled_entry_ids as
select distinct r.event_id, coalesce(r.entry_id, r.original_entry_id) as entry_id
from public.reception_requests r
where r.status = 'cancelled'
  and coalesce(r.entry_id, r.original_entry_id) is not null
  and r.event_id = '2af66251-66a2-4c51-8180-a5badf0584d4'::uuid
  and (r.request_type = 'add' or r.treated_as_withdraw_add is true)
  and r.payload -> '_cancellation' ->> 'at' is not null;

revoke all on public.reception_cancelled_entry_ids from public;
grant select on public.reception_cancelled_entry_ids to anon, authenticated;
