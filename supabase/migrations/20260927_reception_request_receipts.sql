-- Allow a visitor to check whether the UUIDs from their own submitted batch
-- were committed after a lost response. Never expose request contents here.
create or replace view public.reception_request_receipts as
select id, event_id
from public.reception_requests
where event_id = '2af66251-66a2-4c51-8180-a5badf0584d4'::uuid;

revoke all on public.reception_request_receipts from public;
grant select on public.reception_request_receipts to anon, authenticated;
