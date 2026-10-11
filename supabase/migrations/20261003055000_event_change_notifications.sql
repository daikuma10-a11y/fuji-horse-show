create schema if not exists fhs_internal;
revoke all on schema fhs_internal from public, anon, authenticated;
create or replace function fhs_internal.notify_event_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_uuid uuid;
begin
  if TG_OP = 'DELETE' then event_uuid := OLD.event_id; else event_uuid := NEW.event_id; end if;
  -- Send only an invalidation signal. Never broadcast private reception row data.
  perform realtime.send('{}'::jsonb, 'changed', 'fhs-event-' || event_uuid::text, false);
  return null;
end;
$$;
revoke all on function fhs_internal.notify_event_change() from public, anon, authenticated;
create trigger fhs_notify_entries after insert or update or delete on public.entries
for each row execute function fhs_internal.notify_event_change();
create trigger fhs_notify_requests after insert or update or delete on public.reception_requests
for each row execute function fhs_internal.notify_event_change();
