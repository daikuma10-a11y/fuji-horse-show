-- Applied to the Autumn test project on 2026-09-26.
-- Explicit affiliation is processed only for the Autumn event and only after require_reception_admin().
CREATE OR REPLACE FUNCTION public.resolve_and_apply_reception_request_with_affiliation(p_request_id uuid, p_start_order integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request public.reception_requests%rowtype;
  v_name text;
  v_org_id uuid;
  v_result jsonb;
  v_entry_id uuid;
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
  return v_result;
end
$function$
;
revoke all on function public.resolve_and_apply_reception_request_with_affiliation(uuid,integer) from public, anon;
grant execute on function public.resolve_and_apply_reception_request_with_affiliation(uuid,integer) to authenticated;
