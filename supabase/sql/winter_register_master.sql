begin;
create or replace function public.register_winter_reception_master(
  p_kind text, p_name text, p_organization_id uuid default null,
  p_jef_number text default null, p_jef_checked boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_event constant uuid := 'b571f05e-ed23-4e07-929e-be2b73e601a5';
  v_id uuid; v_number text; v_name text := btrim(p_name);
begin
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin'
    then raise exception '本部ログインが必要です'; end if;
  if p_kind is null or p_kind not in ('organization','rider','horse')
    then raise exception '登録する種類を選択してください'; end if;
  if v_name is null or length(v_name) not between 1 and 100
    then raise exception '名前は1文字から100文字で入力してください'; end if;
  if length(coalesce(p_jef_number,''))>100 then raise exception '登録番号を確認してください'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_event::text||p_kind||coalesce(p_organization_id::text,'')||v_name,0));
  if p_kind='organization' then
    select id into v_id from public.organizations where event_id=v_event and name=v_name;
    if v_id is not null then return v_id; end if;
    insert into public.organizations(event_id,name) values(v_event,v_name) returning id into v_id;
    return v_id;
  end if;
  if not exists(select 1 from public.organizations where id=p_organization_id and event_id=v_event)
    then raise exception 'Winterの所属団体を選択してください'; end if;
  if nullif(btrim(p_jef_number),'') is not null and not coalesce(p_jef_checked,false)
    then raise exception '日馬連の登録番号を確認してから登録してください'; end if;
  if p_kind='rider' then
    select id,jef_member_no into v_id,v_number from public.riders where event_id=v_event and organization_id=p_organization_id and name=v_name;
    if v_id is not null then
      if coalesce(nullif(btrim(v_number),''),'')<>coalesce(nullif(btrim(p_jef_number),''),'') then raise exception '同名選手の登録番号が異なります。本部で照合してください'; end if;
      return v_id;
    end if;
    insert into public.riders(event_id,organization_id,name,jef_member_no,roster_source)
    values(v_event,p_organization_id,v_name,nullif(btrim(p_jef_number),''),'post_deadline_admin') returning id into v_id;
  else
    select id,jef_registration_no into v_id,v_number from public.horses where event_id=v_event and organization_id=p_organization_id and name=v_name;
    if v_id is not null then
      if coalesce(nullif(btrim(v_number),''),'')<>coalesce(nullif(btrim(p_jef_number),''),'') then raise exception '同名馬の登録番号が異なります。本部で照合してください'; end if;
      return v_id;
    end if;
    insert into public.horses(event_id,organization_id,name,jef_registration_no,roster_source)
    values(v_event,p_organization_id,v_name,nullif(btrim(p_jef_number),''),'post_deadline_admin') returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.register_winter_reception_master(text,text,uuid,text,boolean) from public, anon;
grant execute on function public.register_winter_reception_master(text,text,uuid,text,boolean) to authenticated;
commit;
