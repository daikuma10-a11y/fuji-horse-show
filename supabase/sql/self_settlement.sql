create table public.self_settlement_devices (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id), token_hash text not null unique,
 created_by uuid not null references auth.users(id), expires_at timestamptz not null, revoked boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.self_settlement_confirmations (
 id uuid primary key, event_id uuid not null references public.events(id), organization_key text not null,
 device_id uuid not null references public.self_settlement_devices(id), confirmed_by text not null check(length(btrim(confirmed_by)) between 1 and 100),
 payment_method text not null check(payment_method in ('bank_transfer','cash_at_venue','no_payment_due')),
 amount integer not null check(amount>=0), version text not null, document jsonb not null, created_at timestamptz not null default now(),
 unique(event_id,organization_key,version,payment_method)
);
alter table public.self_settlement_devices enable row level security;
alter table public.self_settlement_confirmations enable row level security;
revoke all on public.self_settlement_devices, public.self_settlement_confirmations from public,anon,authenticated;
grant all on public.self_settlement_devices, public.self_settlement_confirmations to service_role;
grant select on public.self_settlement_confirmations to authenticated;
create policy self_confirmations_admin_read on public.self_settlement_confirmations for select to authenticated using((select auth.jwt()->'app_metadata'->>'role')='admin');
create index self_confirmation_org on public.self_settlement_confirmations(event_id,organization_key,created_at desc);
create index self_device_creator on public.self_settlement_devices(created_by);
create index self_confirmation_device on public.self_settlement_confirmations(device_id);

create function public.self_settlement_financial_version(p_event uuid) returns text
language sql stable security invoker set search_path='' as $$
 select md5(jsonb_build_object(
  'fees',(select coalesce(jsonb_agg(to_jsonb(t) order by source_type,source_id),'[]') from public.settlement_fee_overrides t where event_id=p_event),
  'advance',(select coalesce(jsonb_agg(to_jsonb(t) order by organization_key),'[]') from public.settlement_prepayments t where event_id=p_event),
  'manual',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.settlement_manual_records t where event_id=p_event),
  'receipts',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.settlement_receipts t where event_id=p_event),
  'requests',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.reception_requests t where event_id=p_event),
  'competitions',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.competitions t where event_id=p_event)
 )::text)
$$;
revoke all on function public.self_settlement_financial_version(uuid) from public,anon,authenticated;
grant execute on function public.self_settlement_financial_version(uuid) to service_role;

create function public.confirm_self_settlement(p_token_hash text,p_id uuid,p_org text,p_name text,p_method text,p_version text,p_financial_version text,p_document jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.self_settlement_devices; result public.self_settlement_confirmations; saved_by uuid;
begin
 select * into d from public.self_settlement_devices where token_hash=p_token_hash and not revoked and expires_at>now();
 if d.id is null then raise exception '精算端末の認証が切れました'; end if;
 if p_document->'document'->>'organizationKey' is distinct from p_org or p_method not in ('bank_transfer','cash_at_venue','no_payment_due') then raise exception '確定内容が不正です'; end if;
 select * into result from public.self_settlement_confirmations where id=p_id;
 if result.id is not null then
  if result.organization_key<>p_org or result.device_id<>d.id or result.version<>p_version or result.payment_method<>p_method then raise exception '受付番号が別の内容で使用されています'; end if;
  return to_jsonb(result);
 end if;
 lock table public.settlement_fee_overrides,public.settlement_prepayments,public.settlement_manual_records,public.settlement_receipts,public.reception_requests,public.competitions in share mode;
 if public.self_settlement_financial_version(d.event_id)<>p_financial_version then raise exception '金額が更新されました。明細を開き直してください'; end if;
 insert into public.self_settlement_confirmations(id,event_id,organization_key,device_id,confirmed_by,payment_method,amount,version,document)
 values(p_id,d.event_id,p_org,d.id,btrim(p_name),p_method,(p_document->'document'->>'due')::integer,p_version,p_document)
 on conflict(event_id,organization_key,version,payment_method) do nothing returning * into result;
 if result.id is null then select * into result from public.self_settlement_confirmations where event_id=d.event_id and organization_key=p_org and version=p_version and payment_method=p_method; end if;
 if p_method<>'no_payment_due' then
  insert into public.settlement_payment_instructions(event_id,organization_key,payment_method,bank_details,updated_by,updated_at)
  values(d.event_id,p_org,p_method,coalesce(p_document->'document'->>'bankDetails',''),d.created_by,now())
  on conflict(event_id,organization_key) do update set payment_method=excluded.payment_method,bank_details=excluded.bank_details,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 end if;
 return to_jsonb(result);
end $$;
revoke all on function public.confirm_self_settlement(text,uuid,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_self_settlement(text,uuid,text,text,text,text,text,jsonb) to service_role;
