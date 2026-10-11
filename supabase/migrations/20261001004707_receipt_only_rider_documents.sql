-- Receipt-only documents describe money already received, never new payments.
alter table public.settlement_receipts add column document_items jsonb not null default '[]'::jsonb
  check (jsonb_typeof(document_items) = 'array' and jsonb_array_length(document_items) <= 500);
alter table public.settlement_receipts add constraint receipt_document_payment_exclusive
  check (jsonb_array_length(document_items) = 0 or jsonb_array_length(selected_items) = 0);

create function public.validate_receipt_documents() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare item jsonb; item_key text; issued bigint; cap bigint; previous bigint; received bigint;
  total bigint := 0; normal_total bigint := 0; seen text[] := '{}';
begin
  if jsonb_array_length(new.document_items) = 0 then return new; end if;
  if (auth.jwt()->'app_metadata'->>'role') is distinct from 'admin' or new.created_by is distinct from auth.uid() then
    raise exception '本部の認証を確認してください';
  end if;
  if jsonb_array_length(new.selected_items) <> 0 then raise exception '領収書のみの発行では入金を追加できません'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.event_id::text || ':' || new.organization_key, 0));
  if exists(select 1 from public.settlement_receipts where id = new.id) then return new; end if;
  for item in select value from jsonb_array_elements(new.document_items) loop
    item_key := item->>'key';
    if jsonb_typeof(item) <> 'object' or item_key is null or item_key !~ '^(normal:.+|request:.+|manual:.+)$'
       or length(item_key) > 200 or item_key = any(seen)
       or coalesce(item->>'amount','') !~ '^[0-9]+$' or coalesce(item->>'limit','') !~ '^[0-9]+$'
       or coalesce(length(item->>'label'),0) not between 1 and 2000 then
      raise exception '領収書の対象と金額を確認してください';
    end if;
    seen := array_append(seen,item_key);
    issued := (item->>'amount')::bigint; cap := (item->>'limit')::bigint;
    if issued <= 0 or cap > 2147483647 or issued > cap then raise exception '領収金額が入金済み分を超えています'; end if;
    select coalesce(sum((allocation->>'amount')::bigint),0) into previous
      from public.settlement_receipts r cross join lateral jsonb_array_elements(r.document_items) allocation
      where r.event_id = new.event_id and r.organization_key = new.organization_key and allocation->>'key' = item_key;
    if previous + issued > cap then raise exception 'この明細は領収書を発行済みです。履歴から再印刷してください'; end if;
    if item_key like 'normal:%' then
      normal_total := normal_total + issued;
    else
      select coalesce(sum(m.paid_amount),0) into received from public.settlement_manual_records m
        where m.event_id = new.event_id
        and (case m.organization_key when 'org-2' then 'org-4' when 'org-6' then 'org-8' when 'org-23' then 'org-17' when 'org-24' then 'org-25' else m.organization_key end) = new.organization_key
        and (case when item_key like 'manual:%' then m.id::text = substr(item_key,8) else m.request_id::text = substr(item_key,9) end);
      select received + coalesce(sum((allocation->>'amount')::bigint),0) into received
        from public.settlement_receipts r cross join lateral jsonb_array_elements(r.selected_items) allocation
        where r.event_id = new.event_id and r.organization_key = new.organization_key and allocation->>'key' = item_key;
      if previous + issued > received then raise exception '対象の入金済み金額を超える領収書は発行できません'; end if;
    end if;
    total := total + issued;
  end loop;
  if total <> new.amount then raise exception '領収金額と対象明細の合計が一致しません'; end if;
  if normal_total > 0 then
    select coalesce(sum(p.paid_amount),0) into received from public.settlement_prepayments p
      where p.event_id = new.event_id and p.organization_key = new.organization_key;
    select received + coalesce(sum((allocation->>'amount')::bigint),0) into received
      from public.settlement_receipts r cross join lateral jsonb_array_elements(r.selected_items) allocation
      where r.event_id = new.event_id and r.organization_key = new.organization_key and allocation->>'key' = 'normal';
    select coalesce(sum((allocation->>'amount')::bigint),0) into previous
      from public.settlement_receipts r cross join lateral jsonb_array_elements(r.document_items) allocation
      where r.event_id = new.event_id and r.organization_key = new.organization_key and allocation->>'key' like 'normal:%';
    if previous + normal_total > received then raise exception '事前エントリーの入金済み金額を超える領収書は発行できません'; end if;
  end if;
  return new;
end $$;
revoke all on function public.validate_receipt_documents() from public, anon, authenticated;
create trigger validate_receipt_documents before insert on public.settlement_receipts
for each row execute function public.validate_receipt_documents();
