-- Autumn test event only: maintain unique start orders after reception reflection.
-- Withdrawn entries are kept at the end of the official list.
create or replace function public.resolve_and_apply_reception_request_with_affiliation(
  p_request_id uuid, p_start_order integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_request public.reception_requests%rowtype;
  v_name text;
  v_org_id uuid;
  v_result jsonb;
  v_entry_id uuid;
  v_target_comp_id uuid;
  v_from_comp_id uuid;
  v_comp_id uuid;
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

-- Repair the already duplicated positions in Autumn competition 1.
-- Preserve every entry and record each changed number for audit.
with ranked as (
  select e.id, e.event_id, e.competition_id, e.start_order as old_order,
    row_number() over (
      order by case when lower(coalesce(e.status,'active')) in ('wd','withdrawn') then 1 else 0 end,
               e.start_order, e.id
    )::integer as new_order
  from public.entries e
  join public.competitions c on c.id = e.competition_id
  where e.event_id = '2af66251-66a2-4c51-8180-a5badf0584d4'
    and c.competition_no = '1'
), changed as (
  update public.entries e
     set start_order = ranked.new_order, updated_at = now()
    from ranked
   where e.id = ranked.id and e.start_order is distinct from ranked.new_order
  returning e.id
)
insert into public.entry_change_history (
  event_id, entry_id, change_type, old_start_order, new_start_order, reason, changed_by
)
select ranked.event_id, ranked.id, 'start_order_change',
       ranked.old_order, ranked.new_order,
       'Autumn test event: move withdrawn entries after active starts to remove duplicate numbers',
       'codex'
from ranked join changed on changed.id = ranked.id;
