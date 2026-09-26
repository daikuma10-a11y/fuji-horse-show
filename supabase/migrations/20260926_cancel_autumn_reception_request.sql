create or replace function public.cancel_autumn_reception_request(p_request_id uuid, p_reason text, p_seed_entry_id text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_req public.reception_requests%rowtype;
  v_entry public.entries%rowtype;
  v_entry_id uuid;
  v_comp uuid;
  v_other uuid;
  v_reason text := nullif(btrim(p_reason), '');
begin
  perform public.require_reception_admin();
  if v_reason is null then raise exception '取消理由を入力してください'; end if;
  select * into v_req from public.reception_requests
    where id=p_request_id and event_id='2af66251-66a2-4c51-8180-a5badf0584d4'::uuid for update;
  if not found then raise exception 'Autumnの申請が見つかりません'; end if;
  if v_req.status='cancelled' then return jsonb_build_object('status','cancelled'); end if;
  if v_req.status not in ('pending','reflected') then raise exception 'この申請は取り消せません'; end if;
  if v_req.status='reflected' then
    v_entry_id := coalesce(v_req.entry_id,v_req.original_entry_id);
    if v_entry_id is null then raise exception '正式エントリーとの紐付けがありません。本部で確認してください'; end if;
    select * into v_entry from public.entries
      where id=v_entry_id and event_id=v_req.event_id for update;
    if not found then raise exception '正式エントリーが見つかりません。本部で確認してください'; end if;
    if exists (
      select 1 from public.reception_requests later
      where later.event_id=v_req.event_id and later.id<>v_req.id
        and later.status in ('pending','reflected')
        and later.created_at>v_req.created_at
        and (later.original_entry_id=v_entry_id or later.entry_id=v_entry_id
          or later.payload->'change'->>'entryId'=v_entry_id::text
          or later.payload->'withdraw'->>'entryId'=v_entry_id::text)
    ) then raise exception '後続の申請があります。先に後続申請を確認してください'; end if;
    if v_req.request_type<>'add' and nullif(btrim(p_seed_entry_id),'') is null then
      raise exception '元エントリー料金を特定できません。本部で確認してください';
    end if;
    -- Keep the official row and history, while removing it from the active start order.
    update public.entries set status='withdrawn',updated_at=now()
      where id=v_entry.id and event_id=v_req.event_id;
    v_comp:=v_entry.competition_id;
    -- For a change represented as withdrawal + add, also hide its old entry.
    if v_req.request_type='change' and v_req.treated_as_withdraw_add and
      v_req.original_entry_id is distinct from v_entry_id then
      update public.entries set status='withdrawn',updated_at=now()
        where id=v_req.original_entry_id and event_id=v_req.event_id;
    end if;
  end if;
  update public.reception_requests
    set status='cancelled',
        payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object(
          '_cancellation',jsonb_build_object('reason',v_reason,'at',now(),'seedEntryId',nullif(btrim(p_seed_entry_id),''))
        )
    where id=v_req.id and event_id=v_req.event_id;
  if v_comp is not null then
    perform 1 from public.entries where event_id=v_req.event_id and competition_id=v_comp for update;
    with ranked as (
      select id,row_number() over (
        order by case when lower(coalesce(status,'active')) in ('wd','withdrawn') then 1 else 0 end,
                 start_order,id
      )::integer as new_order
      from public.entries where event_id=v_req.event_id and competition_id=v_comp
    )
    update public.entries e set start_order=ranked.new_order,updated_at=now()
      from ranked where e.id=ranked.id and e.start_order is distinct from ranked.new_order;
  end if;
  return jsonb_build_object('status','cancelled','entry_id',v_entry_id);
end $$;
revoke all on function public.cancel_autumn_reception_request(uuid,text,text) from public,anon;
grant execute on function public.cancel_autumn_reception_request(uuid,text,text) to authenticated;