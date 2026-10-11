-- Admin-only addition of new Autumn riders/horses after the entry deadline.
-- Existing master rows are never merged or edited based on names.
create function public.register_autumn_postdeadline_master(
  p_kind text, p_name text, p_organization_id uuid,
  p_jef_number text default null, p_jef_checked boolean default false
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_event uuid := '2af66251-66a2-4c51-8180-a5badf0584d4'::uuid;
  v_name text := btrim(p_name);
  v_number text := nullif(btrim(coalesce(p_jef_number,'')), '');
  v_id uuid;
begin
  perform public.require_reception_admin();
  if p_kind not in ('rider','horse') or length(v_name) not between 1 and 100 then
    raise exception '人馬の種類と氏名・馬名を確認してください';
  end if;
  if not exists (select 1 from public.organizations where id=p_organization_id and event_id=v_event) then
    raise exception '団体を一意に確認できません';
  end if;
  if v_number is not null and (not p_jef_checked or length(v_number)>40) then
    raise exception '日馬連登録番号は本部で確認してから登録してください';
  end if;
  if p_kind='rider' then
    if exists(select 1 from public.riders where event_id=v_event and organization_id=p_organization_id
      and regexp_replace(lower(name),'[[:space:]　]','','g')=regexp_replace(lower(v_name),'[[:space:]　]','','g')) then
      raise exception '同じ団体に同名の選手がいます。既存候補を確認してください';
    end if;
    if v_number is not null and exists(select 1 from public.riders where event_id=v_event and jef_member_no=v_number) then
      raise exception 'この日馬連番号は既に登録されています';
    end if;
    insert into public.riders(event_id,organization_id,name,jef_member_no,is_participant,roster_source)
      values(v_event,p_organization_id,v_name,v_number,true,'post_deadline_admin') returning id into v_id;
  else
    if exists(select 1 from public.horses where event_id=v_event and organization_id=p_organization_id
      and regexp_replace(lower(name),'[[:space:]　]','','g')=regexp_replace(lower(v_name),'[[:space:]　]','','g')) then
      raise exception '同じ団体に同名の馬がいます。既存候補を確認してください';
    end if;
    if v_number is not null and exists(select 1 from public.horses where event_id=v_event and jef_registration_no=v_number) then
      raise exception 'この日馬連番号は既に登録されています';
    end if;
    insert into public.horses(event_id,organization_id,name,jef_registration_no,is_participant,roster_source)
      values(v_event,p_organization_id,v_name,v_number,true,'post_deadline_admin') returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.register_autumn_postdeadline_master(text,text,uuid,text,boolean) from public, anon;
grant execute on function public.register_autumn_postdeadline_master(text,text,uuid,text,boolean) to authenticated;
