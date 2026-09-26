-- Keep explicit office placement. With no position selected, insert an
-- official competition addition before the current first active entry.
CREATE OR REPLACE FUNCTION public.resolve_and_apply_reception_request_unchecked(p_request_id uuid, p_start_order integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.reception_requests%rowtype; p jsonb; q jsonb; v_comp_no integer; v_from_comp_no integer; v_entry_id uuid; v_comp_id uuid; v_from_comp_id uuid; v_rider_id uuid; v_horse_id uuid; v_org_id uuid; v_new_id uuid; v_order integer; v_name text;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 select * into r from public.reception_requests where id=p_request_id for update; if not found then raise exception 'request not found'; end if;
 if r.status='reflected' then return jsonb_build_object('ok',true,'already_reflected',true,'entry_id',r.entry_id); end if;
 p:=coalesce(r.payload,'{}'); q:=case r.request_type when 'add' then coalesce(p->'add','{}') when 'withdraw' then coalesce(p->'withdraw','{}') else coalesce(p->'change','{}') end;
 if r.request_type='add' then v_comp_no:=coalesce(nullif(q->>'competitionNo','')::int,nullif(regexp_replace(coalesce(q->>'competitionId',''),'[^0-9]','','g'),'')::int); else v_comp_no:=coalesce(nullif(q->>'toCompetitionNo','')::int,nullif(q->>'competitionNo','')::int,nullif(regexp_replace(coalesce(q->>'toCompetitionId',q->>'competitionId',''),'[^0-9]','','g'),'')::int); v_from_comp_no:=coalesce(nullif(q->>'fromCompetitionNo','')::int,nullif(q->>'competitionNo','')::int,nullif(regexp_replace(coalesce(q->>'fromCompetitionId',q->>'competitionId',''),'[^0-9]','','g'),'')::int); end if;
 select id into v_comp_id from public.competitions where event_id=r.event_id and competition_no=v_comp_no::text limit 1; if v_comp_id is null then raise exception 'competition could not be resolved'; end if;
 if v_from_comp_no is not null then select id into v_from_comp_id from public.competitions where event_id=r.event_id and competition_no=v_from_comp_no::text limit 1; end if;
 if r.request_type in ('withdraw','change') then begin v_entry_id:=nullif(q->>'entryId','')::uuid; exception when invalid_text_representation then v_entry_id:=null; end; if v_entry_id is not null and not exists(select 1 from public.entries where id=v_entry_id and event_id=r.event_id) then v_entry_id:=null; end if; if v_entry_id is null then raise exception 'entry could not be resolved'; end if; select rider_id,horse_id,organization_id into v_rider_id,v_horse_id,v_org_id from public.entries where id=v_entry_id; end if;
 if r.request_type='add' then
   v_name:=nullif(q->>'playerName',''); select id into v_rider_id from public.riders where event_id=r.event_id and regexp_replace(name,'[[:space:]　]','','g')=regexp_replace(v_name,'[[:space:]　]','','g') order by case when roster_source='entry' then 0 else 1 end,id limit 1;
   v_name:=nullif(q->>'horseName',''); select id into v_horse_id from public.horses where event_id=r.event_id and regexp_replace(name,'[[:space:]　]','','g')=regexp_replace(v_name,'[[:space:]　]','','g') order by id limit 1;
 end if;
 if r.request_type='change' then
   if nullif(q->>'toPlayerName','') is not null then select id into v_rider_id from public.riders where event_id=r.event_id and regexp_replace(name,'[[:space:]　]','','g')=regexp_replace(q->>'toPlayerName','[[:space:]　]','','g') order by case when roster_source='entry' then 0 else 1 end,id limit 1; end if;
   if nullif(q->>'toHorseName','') is not null then select id into v_horse_id from public.horses where event_id=r.event_id and regexp_replace(name,'[[:space:]　]','','g')=regexp_replace(q->>'toHorseName','[[:space:]　]','','g') order by id limit 1; end if;
 end if;
 if r.request_type='add' and (v_rider_id is null or v_horse_id is null) then raise exception 'add request requires resolvable rider/horse'; end if;
 if v_horse_id is not null then select organization_id into v_org_id from public.horses where id=v_horse_id; end if;
 if r.request_type='withdraw' then
   select start_order into v_order from public.entries where id=v_entry_id;
   update public.entries set start_order=start_order-1,updated_at=now() where event_id=r.event_id and competition_id=coalesce(v_from_comp_id,v_comp_id) and start_order>v_order;
   select coalesce(max(start_order),0)+1 into v_order from public.entries where event_id=r.event_id and competition_id=coalesce(v_from_comp_id,v_comp_id) and id<>v_entry_id;
   update public.entries set status='withdrawn',start_order=v_order,updated_at=now() where id=v_entry_id; v_new_id:=v_entry_id;
 elsif r.request_type='change' and coalesce(r.treated_as_withdraw_add,false)=false then
   update public.entries set competition_id=v_comp_id,rider_id=coalesce(v_rider_id,rider_id),horse_id=coalesce(v_horse_id,horse_id),organization_id=coalesce(v_org_id,organization_id),source='reception_change',updated_at=now() where id=v_entry_id returning id into v_new_id;
 else
   if r.request_type='change' then update public.entries set status='withdrawn',updated_at=now() where id=v_entry_id; end if;
   if p_start_order is null and (select coalesce(official,false) from public.competitions where id=v_comp_id) then p_start_order:=1; end if;
   if p_start_order is null then select coalesce(max(start_order),0)+1 into v_order from public.entries where event_id=r.event_id and competition_id=v_comp_id and lower(coalesce(status,'active')) not in ('withdrawn','wd'); else v_order:=greatest(1,p_start_order); update public.entries set start_order=start_order+1,updated_at=now() where event_id=r.event_id and competition_id=v_comp_id and start_order>=v_order; end if;
   insert into public.entries(event_id,competition_id,rider_id,horse_id,organization_id,start_order,status,source,request_note,created_at,updated_at) values(r.event_id,v_comp_id,v_rider_id,v_horse_id,v_org_id,v_order,'active','reception',coalesce(r.note,r.request_note),now(),now()) returning id into v_new_id;
 end if;
 update public.reception_requests set status='reflected',reflected_at=now(),entry_id=coalesce(v_new_id,v_entry_id),target_competition_id=v_comp_id,from_competition_id=v_from_comp_id,to_competition_id=v_comp_id,rider_id=v_rider_id,horse_id=v_horse_id,organization_id=v_org_id where id=r.id;
 return jsonb_build_object('ok',true,'entry_id',coalesce(v_new_id,v_entry_id),'start_order',v_order);
end $function$
