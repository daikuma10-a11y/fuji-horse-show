-- Meeting work stays private and does not affect entries or settlement until confirmed.
create table public.meeting_drafts (
  id uuid primary key,
  event_id uuid not null references public.events(id),
  revision integer not null default 1 check (revision > 0),
  status text not null default 'draft' check (status in ('draft','applied','archived')),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  applied_at timestamptz
);
create unique index meeting_drafts_one_open_event on public.meeting_drafts(event_id) where status='draft';
alter table public.meeting_drafts enable row level security;
revoke all on public.meeting_drafts from anon, authenticated;
grant select, insert, update on public.meeting_drafts to authenticated;
create policy meeting_drafts_admin_read on public.meeting_drafts for select to authenticated
  using ((select auth.jwt()->'app_metadata'->>'role')='admin');
create policy meeting_drafts_admin_insert on public.meeting_drafts for insert to authenticated
  with check ((select auth.jwt()->'app_metadata'->>'role')='admin' and updated_by=(select auth.uid())
    and event_id='2af66251-66a2-4c51-8180-a5badf0584d4'::uuid);
create policy meeting_drafts_admin_update on public.meeting_drafts for update to authenticated
  using ((select auth.jwt()->'app_metadata'->>'role')='admin')
  with check ((select auth.jwt()->'app_metadata'->>'role')='admin' and updated_by=(select auth.uid())
    and event_id='2af66251-66a2-4c51-8180-a5badf0584d4'::uuid);

create or replace function public.save_meeting_draft(p_id uuid, p_revision integer, p_content jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.meeting_drafts%rowtype;
begin
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then
    raise exception '本部管理者の認証が必要です';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fhs-autumn-meeting',0));
  if jsonb_typeof(p_content->'baseOfficial') is distinct from 'array'
    or jsonb_typeof(p_content->'baseEntries') is distinct from 'array'
    or jsonb_typeof(p_content->'staged') is distinct from 'array'
    or jsonb_typeof(p_content->'submissions') is distinct from 'array'
    or jsonb_typeof(p_content->'final_orders') is distinct from 'array' then
    raise exception '打ち合わせ会の下書き内容を確認してください';
  end if;
  select * into saved from public.meeting_drafts where id=p_id for update;
  if found then
    if saved.status <> 'draft' or saved.revision <> p_revision then
      raise exception '下書きが他の担当者により更新されました。再読み込みして確認してください';
    end if;
    update public.meeting_drafts set content=p_content, revision=revision+1,
      updated_by=auth.uid(),updated_at=now() where id=p_id returning * into saved;
  else
    if p_revision <> 0 or exists(select 1 from public.meeting_drafts
      where event_id='2af66251-66a2-4c51-8180-a5badf0584d4'::uuid and status='draft') then
      raise exception '保存済みの打ち合わせ会があります。再読み込みしてください';
    end if;
    insert into public.meeting_drafts(id,event_id,content,updated_by)
      values(p_id,'2af66251-66a2-4c51-8180-a5badf0584d4',p_content,auth.uid()) returning * into saved;
  end if;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.save_meeting_draft(uuid,integer,jsonb) from public, anon;
grant execute on function public.save_meeting_draft(uuid,integer,jsonb) to authenticated;

-- Privileged writes reuse the authenticated admin-only reception and reorder routines.
-- Every request, payment record and order is committed in the same transaction.
create function public.apply_meeting_draft(p_id uuid, p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  saved public.meeting_drafts%rowtype;
  current_entries jsonb; baseline jsonb; item jsonb; req jsonb; rec jsonb; result jsonb;
  mapping jsonb := '{}'::jsonb; group_order jsonb; token text; resolved text;
  ids uuid[]; comp uuid; affected uuid[] := '{}'; req_id uuid; fee integer; paid integer;
begin
  perform public.require_reception_admin();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fhs-autumn-meeting',0));
  select * into saved from public.meeting_drafts where id=p_id for update;
  if not found or saved.event_id <> '2af66251-66a2-4c51-8180-a5badf0584d4'::uuid then
    raise exception '打ち合わせ会の下書きを確認できません';
  end if;
  if saved.status='applied' then return jsonb_build_object('status','applied'); end if;
  if saved.status <> 'draft' or saved.revision <> p_revision then
    raise exception '保存済みの下書きが更新されました。再読み込みしてください';
  end if;
  perform 1 from public.entries where event_id=saved.event_id order by id for update;
  select coalesce(jsonb_agg(to_jsonb(v) order by v.entry_id::text),'[]'::jsonb) into current_entries
    from (select entry_id,competition_id,competition_no,start_order,status,rider_id,rider_name,
      horse_id,horse_name,organization_name,is_op,result_eligible from public.reception_entries
      where event_id=saved.event_id) v;
  select coalesce(jsonb_agg(value order by value->>'entry_id'),'[]'::jsonb) into baseline
    from jsonb_array_elements(saved.content->'baseOfficial');
  if current_entries is distinct from baseline then
    raise exception '下書き作成後に正式出番表が更新されています。正式出番表を確認して下書きを作り直してください';
  end if;
  for item in select value from jsonb_array_elements(saved.content->'submissions') loop
    req := item->'request'; rec := item->'record'; req_id := (req->>'id')::uuid;
    fee := (req->>'fee_amount')::integer; paid := (rec->>'paid_amount')::integer;
    if req->>'status' <> 'pending' or req->>'source' <> 'on-site-admin'
      or (req->>'event_id')::uuid <> saved.event_id or rec->>'period' <> 'before_event'
      or (rec->>'request_id')::uuid <> req_id or rec->>'action_type' <> req->>'request_type'
      or fee < 0 or paid < 0 or paid > fee or (rec->>'bill_amount')::integer <> 0
      or (rec->>'payment_plan'='paid_before_event' and paid <> fee)
      or (rec->>'payment_plan'<>'paid_before_event' and paid <> 0) then
      raise exception '申請内容・料金・支払い状況を確認してください';
    end if;
    insert into public.reception_requests(id,event_id,request_type,fee_amount,fee,status,source,
      treated_as_withdraw_add,note,payload)
      values(req_id,saved.event_id,req->>'request_type',fee,fee,'pending','on-site-admin',
        coalesce((req->>'treated_as_withdraw_add')::boolean,false),req->>'note',req->'payload');
    result := public.resolve_and_apply_reception_request_with_affiliation(req_id,null);
    if req->>'request_type' in ('add','change') then
      if result->>'entry_id' is null then raise exception '反映後の人馬を確認できません'; end if;
      mapping := mapping || jsonb_build_object('request:'||req_id::text,result->>'entry_id');
    end if;
    insert into public.settlement_manual_records(id,event_id,request_id,period,action_type,
      organization_key,competition_key,rider_key,horse_key,details,bill_amount,paid_amount,
      payment_plan,operator_name,updated_by)
      values((rec->>'id')::uuid,saved.event_id,req_id,'before_event',rec->>'action_type',
        rec->>'organization_key',rec->>'competition_key',rec->>'rider_key',rec->>'horse_key',
        coalesce(rec->>'details',''),0,paid,rec->>'payment_plan',rec->>'operator_name',auth.uid());
  end loop;
  for group_order in select value from jsonb_array_elements(saved.content->'final_orders') loop
    select id into strict comp from public.competitions
      where event_id=saved.event_id and competition_no::text=group_order->>'competition_no';
    if comp=any(affected) then raise exception '競技が重複しています'; end if;
    affected := array_append(affected,comp); ids := '{}';
    for token in select jsonb_array_elements_text(group_order->'ids') loop
      resolved := case when token like 'request:%' then mapping->>token else token end;
      if resolved is null then raise exception '下書きの人馬と申請が一致しません'; end if;
      ids := array_append(ids,resolved::uuid);
    end loop;
    perform public.reorder_entries(comp,ids);
  end loop;
  update public.meeting_drafts set status='applied',applied_at=now(),updated_at=now(),updated_by=auth.uid()
    where id=p_id;
  return jsonb_build_object('status','applied');
end;
$$;
revoke all on function public.apply_meeting_draft(uuid,integer) from public, anon;
grant execute on function public.apply_meeting_draft(uuid,integer) to authenticated;
