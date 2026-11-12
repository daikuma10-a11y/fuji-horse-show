-- Winter bills use their own entry, onsite and payment ledgers. Reuse the immutable
-- receipt archive and its existing admin policies; no balance or payment is written.
create function fhs_winter_internal.validate_receipt_document() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ev constant uuid := 'b571f05e-ed23-4e07-929e-be2b73e601a5';
  club uuid := new.organization_key::uuid;
  account jsonb;
  item jsonb;
  item_key text;
  source_id uuid;
  source_fee bigint;
  already bigint;
  issued_total bigint;
  subtotal bigint := 0;
  seen text[] := '{}';
begin
  if new.event_id <> ev or (auth.jwt()->'app_metadata'->>'role') is distinct from 'admin'
     or new.created_by is distinct from auth.uid() then raise exception 'Winter本部の認証を確認してください'; end if;
  if club::text <> new.organization_key or jsonb_array_length(new.document_items) = 0 or jsonb_array_length(new.selected_items) <> 0
    then raise exception '入金済みの領収対象を選んでください'; end if;
  perform pg_advisory_xact_lock(hashtextextended('winter-finance:'||club::text,0));
  perform pg_advisory_xact_lock(hashtextextended(ev::text||':'||club::text,0));
  if exists(select 1 from public.settlement_receipts where id=new.id) then return new; end if;
  account := fhs_winter_internal.settlement_account(club)->'account';
  select coalesce(sum(amount),0) into issued_total from public.settlement_receipts
    where event_id=ev and organization_key=new.organization_key;
  if issued_total + new.amount > least((account->>'total')::bigint,
      (account->>'advancePaid')::bigint + (account->>'extraPaid')::bigint)
    then raise exception '請求総額または確認済み入金の未発行分を超えています。履歴を読み直してください'; end if;
  for item in select value from jsonb_array_elements(new.document_items) loop
    item_key := item->>'key';
    if jsonb_typeof(item) <> 'object' or item_key is null or item_key = any(seen)
      or item_key !~ '^(normal:(entry|horse)|request|manual|adjustment):[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      or coalesce(item->>'amount','') !~ '^[1-9][0-9]{0,9}$' or coalesce(item->>'limit','') !~ '^[1-9][0-9]{0,9}$'
      or coalesce(length(btrim(item->>'label')),0) not between 1 and 2000 then raise exception '領収対象の明細を確認してください'; end if;
    seen := array_append(seen,item_key);
    source_id := right(item_key,36)::uuid;
    case
      when item_key like 'normal:entry:%' then
        select entry_fee into source_fee from public.fhs_winter_initial_entries
          where id=source_id and event_id=ev and coalesce(inputs->>'billingOrganizationId',inputs->>'organizationId')=club::text;
      when item_key like 'normal:horse:%' then
        select (account->'horseRegistration'->>'unitFee')::bigint into source_fee
          from jsonb_array_elements(account->'horseRegistration'->'horses') h where h->>'id'=source_id::text;
      when item_key like 'request:%' then
        select fee_amount into source_fee from public.reception_requests
          where id=source_id and event_id=ev and organization_id=club and status='reflected';
      when item_key like 'manual:%' then
        select r.fee_amount into source_fee from public.fhs_winter_settlement_only r
          where r.id=source_id and r.event_id=ev and r.organization_key=club and r.reverses_id is null
          and not exists(select 1 from public.fhs_winter_settlement_only x where x.event_id=ev and x.reverses_id=r.id);
      else
        select delta into source_fee from public.fhs_winter_charge_adjustments
          where id=source_id and event_id=ev and organization_key=club;
    end case;
    select coalesce(sum((a->>'amount')::bigint),0) into already
      from public.settlement_receipts r cross join lateral jsonb_array_elements(r.document_items) a
      where r.event_id=ev and r.organization_key=new.organization_key and a->>'key'=item_key;
    if source_fee is null or source_fee <> (item->>'limit')::bigint or already+(item->>'amount')::bigint > source_fee
      then raise exception '明細が変更されたか、領収書が発行済みです。履歴を読み直してください'; end if;
    subtotal := subtotal + (item->>'amount')::bigint;
  end loop;
  if subtotal <> new.amount then raise exception '領収金額と明細合計を確認してください'; end if;
  return new;
end $$;
revoke all on function fhs_winter_internal.validate_receipt_document() from public, anon, authenticated;

-- The original validator and all non-Winter dispatch remain the same.
drop trigger validate_receipt_documents on public.settlement_receipts;
create trigger validate_receipt_documents before insert on public.settlement_receipts
  for each row when (new.event_id <> 'b571f05e-ed23-4e07-929e-be2b73e601a5'::uuid)
  execute function public.validate_receipt_documents();
create trigger validate_winter_receipt_documents before insert on public.settlement_receipts
  for each row when (new.event_id = 'b571f05e-ed23-4e07-929e-be2b73e601a5'::uuid)
  execute function fhs_winter_internal.validate_receipt_document();

-- The UI can use the original prepayment validator until this Winter extension is installed.
create function public.winter_receipt_balance(p_organization uuid) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare account jsonb; issued bigint;
begin
  if auth.uid() is null or (auth.jwt()->'app_metadata'->>'role') is distinct from 'admin'
    then raise exception '本部の認証を確認してください'; end if;
  account := fhs_winter_internal.settlement_account(p_organization)->'account';
  select coalesce(sum(amount),0) into issued from public.settlement_receipts
    where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'::uuid and organization_key=p_organization::text;
  return greatest(0,least((account->>'total')::bigint,(account->>'advancePaid')::bigint+(account->>'extraPaid')::bigint)-issued);
end $$;
revoke all on function public.winter_receipt_balance(uuid) from public, anon;
grant execute on function public.winter_receipt_balance(uuid) to authenticated;
