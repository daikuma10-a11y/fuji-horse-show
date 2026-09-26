CREATE OR REPLACE FUNCTION public.resolve_and_apply_reception_request_with_affiliation(p_request_id uuid, p_start_order integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_request public.reception_requests%rowtype;
  v_name text;
  v_org_id uuid;
  v_result jsonb;
  v_entry_id uuid;
  v_target_comp_id uuid;
  v_from_comp_id uuid;
  v_comp_id uuid;
  v_original_id uuid;
  v_entry_text text;
  v_before public.entries%rowtype;
begin
  perform public.require_reception_admin();
  select * into v_request from public.reception_requests where id = p_request_id;
  if not found then raise exception 'request not found'; end if;
  if v_request.event_id <> '2af66251-66a2-4c51-8180-a5badf0584d4'::uuid then
    raise exception 'this operation is only available for the Autumn test event';
  end if;
  if v_request.status = 'reflected' then
    return public.resolve_and_apply_reception_request_unchecked(p_request_id, p_start_order);
  end if;
  if v_request.status <> 'pending' then
    raise exception 'only pending reception requests can be reflected';
  end if;
  v_name := nullif(v_request.payload->>'organizationName', '');
  if v_name is not null and v_request.request_type in ('add', 'change') then
    if (select count(*) from public.organizations
        where event_id = v_request.event_id and name = v_name) <> 1 then
      raise exception 'chosen organization could not be resolved uniquely';
    end if;
    select id into v_org_id from public.organizations
      where event_id = v_request.event_id and name = v_name;
  end if;
  if v_request.request_type in ('change','withdraw') then
    v_entry_text := case v_request.request_type when 'change' then v_request.payload#>>'{change,entryId}' else v_request.payload#>>'{withdraw,entryId}' end;
    if v_entry_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_original_id := v_entry_text::uuid;
    else
      v_original_id := v_request.original_entry_id;
    end if;
    if v_original_id is not null then
      select * into v_before from public.entries where id=v_original_id and event_id=v_request.event_id for update;
      if not found then raise exception '変更前の正式エントリーを確認できません'; end if;
      if found then
        update public.reception_requests
        set payload=jsonb_set(coalesce(payload,'{}'::jsonb),'{_beforeOfficialEntry}',
          jsonb_build_object('id',v_before.id,'competition_id',v_before.competition_id,'rider_id',v_before.rider_id,
            'horse_id',v_before.horse_id,'organization_id',v_before.organization_id,'start_order',v_before.start_order,
            'status',v_before.status,'source',v_before.source,'request_note',v_before.request_note),true)
        where id=p_request_id;
      end if;
    end if;
  end if;
  v_result := public.resolve_and_apply_reception_request_unchecked(p_request_id, p_start_order);
  if v_org_id is not null then
    v_entry_id := (v_result->>'entry_id')::uuid;
    update public.entries set organization_id = v_org_id, updated_at = now()
      where id = v_entry_id and event_id = v_request.event_id;
    if not found then raise exception 'reflected entry could not be updated'; end if;
    update public.reception_requests set organization_id = v_org_id
      where id = p_request_id and event_id = v_request.event_id;
  end if;
  select target_competition_id, from_competition_id
    into v_target_comp_id, v_from_comp_id
    from public.reception_requests where id = p_request_id;
  for v_comp_id in
    select distinct x.id from unnest(array[v_target_comp_id, v_from_comp_id]) as x(id)
    where x.id is not null
  loop
    perform 1 from public.entries
      where event_id = v_request.event_id and competition_id = v_comp_id for update;
    with ranked as (
      select id, row_number() over (
        order by case when lower(coalesce(status,'active')) in ('wd','withdrawn') then 1 else 0 end,
                 start_order, id
      )::integer as new_order
      from public.entries
      where event_id = v_request.event_id and competition_id = v_comp_id
    )
    update public.entries e
       set start_order = ranked.new_order, updated_at = now()
      from ranked
     where e.id = ranked.id and e.start_order is distinct from ranked.new_order;
  end loop;
  return v_result;
end
$function$;

create or replace function public.cancel_autumn_reception_request(p_request_id uuid, p_reason text, p_seed_entry_id text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_req public.reception_requests%rowtype;
  v_entry public.entries%rowtype;
  v_before jsonb;
  v_entry_id uuid;
  v_original_id uuid;
  v_from_comp uuid;
  v_comp uuid;
  v_order integer;
  v_rider uuid;
  v_horse uuid;
  v_org uuid;
  v_source text;
  v_note text;
  v_status text;
  v_name text;
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
    v_before:=v_req.payload->'_beforeOfficialEntry';
    if v_req.request_type in ('change','withdraw') then
      if v_before is not null and v_before->>'id' is not null then
        v_original_id:=(v_before->>'id')::uuid;
      elsif v_req.request_type='change' and v_req.treated_as_withdraw_add then
        if coalesce(v_req.payload#>>'{change,entryId}','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12} then
          raise exception '変更前の正式エントリーが不明です。本部で確認してください';
        end if;
        v_original_id:=(v_req.payload#>>'{change,entryId}')::uuid;
      else v_original_id:=v_entry_id;
      end if;
      if v_req.request_type='withdraw' and v_original_id is distinct from v_entry_id then
        raise exception '棄権元のエントリーを確認できません';
      end if;
    end if;
    if exists (
      select 1 from public.reception_requests later
      where later.event_id=v_req.event_id and later.id<>v_req.id
        and later.status in ('pending','reflected')
        and later.created_at>v_req.created_at
        and (later.original_entry_id in (v_entry_id,v_original_id)
          or later.entry_id in (v_entry_id,v_original_id)
          or later.payload->'change'->>'entryId' in (v_entry_id::text,v_original_id::text,coalesce(p_seed_entry_id,''))
          or later.payload->'withdraw'->>'entryId' in (v_entry_id::text,v_original_id::text,coalesce(p_seed_entry_id,'')))
    ) then raise exception '後続の申請があります。先に後続申請を確認してください'; end if;
    if v_req.request_type='add' then
      update public.entries set status='withdrawn',updated_at=now()
        where id=v_entry_id and event_id=v_req.event_id;
      v_comp:=v_entry.competition_id;
    else
      v_comp:=v_entry.competition_id;
      select * into v_entry from public.entries
        where id=v_original_id and event_id=v_req.event_id for update;
      if not found then raise exception '変更前のエントリーが見つかりません。本部で確認してください'; end if;
      v_rider:=v_entry.rider_id; v_horse:=v_entry.horse_id;
      v_org:=v_entry.organization_id; v_source:=v_entry.source;
      v_note:=v_entry.request_note; v_status:='active';
      v_from_comp:=v_entry.competition_id;
      if v_before is not null and v_before->>'id' is not null then
        v_from_comp:=(v_before->>'competition_id')::uuid;
        v_rider:=(v_before->>'rider_id')::uuid;
        v_horse:=(v_before->>'horse_id')::uuid;
        v_org:=(v_before->>'organization_id')::uuid;
        v_order:=(v_before->>'start_order')::integer;
        v_status:=coalesce(v_before->>'status','active');
        v_source:=v_before->>'source'; v_note:=v_before->>'request_note';
      elsif v_req.request_type='change' then
        -- Historical changes have no snapshot. Resolve only unambiguous original names.
        v_name:=nullif(v_req.payload#>>'{change,fromPlayerName}','');
        if v_name is null then raise exception '変更前の選手が不明です。本部で確認してください'; end if;
        if regexp_replace((select name from public.riders where id=v_rider),'[[:space:]　]','','g')
           is distinct from regexp_replace(v_name,'[[:space:]　]','','g') then
          if (select count(*) from public.riders where event_id=v_req.event_id
            and regexp_replace(name,'[[:space:]　]','','g')=regexp_replace(v_name,'[[:space:]　]','','g'))<>1
          then raise exception '変更前の選手を一意に特定できません。本部で確認してください'; end if;
          select id into v_rider from public.riders where event_id=v_req.event_id
            and regexp_replace(name,'[[:space:]　]','','g')=regexp_replace(v_name,'[[:space:]　]','','g');
        end if;
        v_name:=nullif(v_req.payload#>>'{change,fromHorseName}','');
        if v_name is null then raise exception '変更前の馬が不明です。本部で確認してください'; end if;
        if regexp_replace((select name from public.horses where id=v_horse),'[[:space:]　]','','g')
           is distinct from regexp_replace(v_name,'[[:space:]　]','','g') then
          if (select count(*) from public.horses where event_id=v_req.event_id
            and regexp_replace(name,'[[:space:]　]','','g')=regexp_replace(v_name,'[[:space:]　]','','g'))<>1
          then raise exception '変更前の馬を一意に特定できません。本部で確認してください'; end if;
          select id into v_horse from public.horses where event_id=v_req.event_id
            and regexp_replace(name,'[[:space:]　]','','g')=regexp_replace(v_name,'[[:space:]　]','','g');
        end if;
        if nullif(v_req.payload#>>'{change,fromCompetitionNo}','') is null
        then raise exception '変更前の競技が不明です。本部で確認してください'; end if;
        select id into v_from_comp from public.competitions where event_id=v_req.event_id
          and competition_no=(v_req.payload#>>'{change,fromCompetitionNo}');
        if v_from_comp is null then raise exception '変更前の競技を特定できません'; end if;
      end if;
      if v_order is null then
        select count(*)+1 into v_order from public.entries
          where event_id=v_req.event_id and competition_id=v_from_comp
            and id<>v_original_id and lower(coalesce(status,'active')) not in ('withdrawn','wd');
      end if;
      v_order:=greatest(1,v_order);
      -- Make room at the original position; old records without a snapshot go last.
      update public.entries set start_order=start_order+1,updated_at=now()
        where event_id=v_req.event_id and competition_id=v_from_comp
          and id<>v_original_id and lower(coalesce(status,'active')) not in ('withdrawn','wd')
          and start_order>=v_order;
      update public.entries set competition_id=v_from_comp,rider_id=v_rider,horse_id=v_horse,
        organization_id=v_org,start_order=v_order,status=v_status,source=v_source,
        request_note=v_note,updated_at=now()
        where id=v_original_id and event_id=v_req.event_id;
      if v_entry_id is distinct from v_original_id then
        update public.entries set status='withdrawn',updated_at=now()
          where id=v_entry_id and event_id=v_req.event_id;
      end if;
    end if;
  end if;
  update public.reception_requests
    set status='cancelled',payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object(
      '_cancellation',jsonb_build_object('reason',v_reason,'at',now(),
        'seedEntryId',nullif(btrim(p_seed_entry_id),''),
        'restoredOriginal',v_req.status='reflected' and v_req.request_type in ('change','withdraw'))
    )
    where id=v_req.id and event_id=v_req.event_id;
  for v_comp in select distinct x.id from unnest(array[v_comp,v_from_comp]) x(id) where x.id is not null loop
    perform 1 from public.entries where event_id=v_req.event_id and competition_id=v_comp for update;
    with ranked as (select id,row_number() over (
      order by case when lower(coalesce(status,'active')) in ('wd','withdrawn') then 1 else 0 end,
        start_order,id)::integer as new_order from public.entries
      where event_id=v_req.event_id and competition_id=v_comp)
    update public.entries e set start_order=ranked.new_order,updated_at=now()
      from ranked where e.id=ranked.id and e.start_order is distinct from ranked.new_order;
  end loop;
  return jsonb_build_object('status','cancelled','entry_id',v_entry_id,
    'restored_original',v_req.request_type in ('change','withdraw'));
end $$;
revoke all on function public.cancel_autumn_reception_request(uuid,text,text) from public,anon;
grant execute on function public.cancel_autumn_reception_request(uuid,text,text) to authenticated; then
          raise exception '変更前の正式エントリーが不明です。本部で確認してください';
        end if;
        v_original_id:=(v_req.payload#>>'{change,entryId}')::uuid;
      else v_original_id:=v_entry_id;
      end if;
      if v_req.request_type='withdraw' and v_original_id is distinct from v_entry_id then
        raise exception '棄権元のエントリーを確認できません';
      end if;
    end if;
    if exists (
      select 1 from public.reception_requests later
      where later.event_id=v_req.event_id and later.id<>v_req.id
        and later.status in ('pending','reflected')
        and later.created_at>v_req.created_at
        and (later.original_entry_id in (v_entry_id,v_original_id)
          or later.entry_id in (v_entry_id,v_original_id)
          or later.payload->'change'->>'entryId' in (v_entry_id::text,v_original_id::text,coalesce(p_seed_entry_id,''))
          or later.payload->'withdraw'->>'entryId' in (v_entry_id::text,v_original_id::text,coalesce(p_seed_entry_id,'')))
    ) then raise exception '後続の申請があります。先に後続申請を確認してください'; end if;
    if v_req.request_type='add' then
      update public.entries set status='withdrawn',updated_at=now()
        where id=v_entry_id and event_id=v_req.event_id;
      v_comp:=v_entry.competition_id;
    else
      select * into v_entry from public.entries
        where id=v_original_id and event_id=v_req.event_id for update;
      if not found then raise exception '変更前のエントリーが見つかりません。本部で確認してください'; end if;
      v_comp:=v_entry.competition_id;
      v_rider:=v_entry.rider_id; v_horse:=v_entry.horse_id;
      v_org:=v_entry.organization_id; v_source:=v_entry.source;
      v_note:=v_entry.request_note; v_status:='active';
      v_from_comp:=v_entry.competition_id;
      if v_before is not null and v_before->>'id' is not null then
        v_from_comp:=(v_before->>'competition_id')::uuid;
        v_rider:=(v_before->>'rider_id')::uuid;
        v_horse:=(v_before->>'horse_id')::uuid;
        v_org:=(v_before->>'organization_id')::uuid;
        v_order:=(v_before->>'start_order')::integer;
        v_status:=coalesce(v_before->>'status','active');
        v_source:=v_before->>'source'; v_note:=v_before->>'request_note';
      elsif v_req.request_type='change' then
        -- Historical changes have no snapshot. Resolve only unambiguous original names.
        v_name:=nullif(v_req.payload#>>'{change,fromPlayerName}','');
        if v_name is null then raise exception '変更前の選手が不明です。本部で確認してください'; end if;
        if regexp_replace((select name from public.riders where id=v_rider),'[[:space:]　]','','g')
           is distinct from regexp_replace(v_name,'[[:space:]　]','','g') then
          if (select count(*) from public.riders where event_id=v_req.event_id
            and regexp_replace(name,'[[:space:]　]','','g')=regexp_replace(v_name,'[[:space:]　]','','g'))<>1
          then raise exception '変更前の選手を一意に特定できません。本部で確認してください'; end if;
          select id into v_rider from public.riders where event_id=v_req.event_id
            and regexp_replace(name,'[[:space:]　]','','g')=regexp_replace(v_name,'[[:space:]　]','','g');
        end if;
        v_name:=nullif(v_req.payload#>>'{change,fromHorseName}','');
        if v_name is null then raise exception '変更前の馬が不明です。本部で確認してください'; end if;
        if regexp_replace((select name from public.horses where id=v_horse),'[[:space:]　]','','g')
           is distinct from regexp_replace(v_name,'[[:space:]　]','','g') then
          if (select count(*) from public.horses where event_id=v_req.event_id
            and regexp_replace(name,'[[:space:]　]','','g')=regexp_replace(v_name,'[[:space:]　]','','g'))<>1
          then raise exception '変更前の馬を一意に特定できません。本部で確認してください'; end if;
          select id into v_horse from public.horses where event_id=v_req.event_id
            and regexp_replace(name,'[[:space:]　]','','g')=regexp_replace(v_name,'[[:space:]　]','','g');
        end if;
        if nullif(v_req.payload#>>'{change,fromCompetitionNo}','') is null
        then raise exception '変更前の競技が不明です。本部で確認してください'; end if;
        select id into v_from_comp from public.competitions where event_id=v_req.event_id
          and competition_no=(v_req.payload#>>'{change,fromCompetitionNo}');
        if v_from_comp is null then raise exception '変更前の競技を特定できません'; end if;
      end if;
      if v_order is null then
        select count(*)+1 into v_order from public.entries
          where event_id=v_req.event_id and competition_id=v_from_comp
            and id<>v_original_id and lower(coalesce(status,'active')) not in ('withdrawn','wd');
      end if;
      v_order:=greatest(1,v_order);
      -- Make room at the original position; old records without a snapshot go last.
      update public.entries set start_order=start_order+1,updated_at=now()
        where event_id=v_req.event_id and competition_id=v_from_comp
          and id<>v_original_id and lower(coalesce(status,'active')) not in ('withdrawn','wd')
          and start_order>=v_order;
      update public.entries set competition_id=v_from_comp,rider_id=v_rider,horse_id=v_horse,
        organization_id=v_org,start_order=v_order,status=v_status,source=v_source,
        request_note=v_note,updated_at=now()
        where id=v_original_id and event_id=v_req.event_id;
      if v_entry_id is distinct from v_original_id then
        update public.entries set status='withdrawn',updated_at=now()
          where id=v_entry_id and event_id=v_req.event_id;
      end if;
    end if;
  end if;
  update public.reception_requests
    set status='cancelled',payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object(
      '_cancellation',jsonb_build_object('reason',v_reason,'at',now(),
        'seedEntryId',nullif(btrim(p_seed_entry_id),''),
        'restoredOriginal',v_req.status='reflected' and v_req.request_type in ('change','withdraw'))
    )
    where id=v_req.id and event_id=v_req.event_id;
  for v_comp in select distinct x.id from unnest(array[v_comp,v_from_comp]) x(id) where x.id is not null loop
    perform 1 from public.entries where event_id=v_req.event_id and competition_id=v_comp for update;
    with ranked as (select id,row_number() over (
      order by case when lower(coalesce(status,'active')) in ('wd','withdrawn') then 1 else 0 end,
        start_order,id)::integer as new_order from public.entries
      where event_id=v_req.event_id and competition_id=v_comp)
    update public.entries e set start_order=ranked.new_order,updated_at=now()
      from ranked where e.id=ranked.id and e.start_order is distinct from ranked.new_order;
  end loop;
  return jsonb_build_object('status','cancelled','entry_id',v_entry_id,
    'restored_original',v_req.request_type in ('change','withdraw'));
end $$;
revoke all on function public.cancel_autumn_reception_request(uuid,text,text) from public,anon;
grant execute on function public.cancel_autumn_reception_request(uuid,text,text) to authenticated;