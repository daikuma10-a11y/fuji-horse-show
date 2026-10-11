-- Selected receipts are also immutable payment allocations. Existing receipts stay unchanged.
alter table public.settlement_receipts add column selected_items jsonb not null default '[]'::jsonb
  check (jsonb_typeof(selected_items) = 'array');

create function public.validate_receipt_item_payments() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare item jsonb; item_key text; paid bigint; cap bigint; existing_paid bigint; total bigint := 0; seen text[] := '{}';
begin
  if jsonb_array_length(new.selected_items) = 0 then return new; end if;
  if (auth.jwt()->'app_metadata'->>'role') is distinct from 'admin' or new.created_by is distinct from auth.uid() then
    raise exception '本部の認証を確認してください';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.event_id::text || ':' || new.organization_key, 0));
  -- ON CONFLICT retry must not apply the payment twice.
  if exists(select 1 from public.settlement_receipts where id = new.id) then return new; end if;
  for item in select value from jsonb_array_elements(new.selected_items) loop
    item_key := item->>'key';
    if item_key is null or item_key !~ '^(normal|request:.+|manual:.+)$' or length(item_key) > 200 or item_key = any(seen)
       or coalesce(item->>'amount','') !~ '^[0-9]+$' or coalesce(item->>'limit','') !~ '^[0-9]+$'
       or coalesce(length(item->>'label'),0) not between 1 and 2000 then
      raise exception '精算対象と金額を確認してください';
    end if;
    seen := array_append(seen,item_key);
    paid := (item->>'amount')::bigint; cap := (item->>'limit')::bigint;
    if paid <= 0 or cap > 2147483647 or paid > cap then raise exception '精算金額が対象の残額を超えています'; end if;
    select coalesce(sum((allocation->>'amount')::bigint),0) into existing_paid
    from public.settlement_receipts r cross join lateral jsonb_array_elements(r.selected_items) allocation
    where r.event_id = new.event_id and r.organization_key = new.organization_key and allocation->>'key' = item_key;
    if existing_paid + paid > cap then
      raise exception 'この明細は既に精算されています。再読み込みして残額を確認してください';
    end if;
    total := total + paid;
  end loop;
  if total <> new.amount then raise exception '領収金額と精算明細の合計が一致しません'; end if;
  return new;
end $$;
revoke all on function public.validate_receipt_item_payments() from public, anon, authenticated;
create trigger validate_receipt_item_payments before insert on public.settlement_receipts
for each row execute function public.validate_receipt_item_payments();
