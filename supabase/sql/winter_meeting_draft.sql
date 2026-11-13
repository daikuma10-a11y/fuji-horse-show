-- Winter-only workflow. Preserve the existing reception, fee and start-order routines.
begin;
create table fhs_winter_internal.meeting_draft (
 id uuid primary key,
 revision integer not null check (revision>0),
 status text not null check (status in ('draft','applied','archived')),
 content jsonb not null,
 updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id)
);
create unique index winter_one_open_meeting on fhs_winter_internal.meeting_draft(status) where status='draft';
alter table fhs_winter_internal.meeting_draft enable row level security;
revoke all on fhs_winter_internal.meeting_draft from public, anon, authenticated;

create function fhs_winter_internal.meeting_draft_action(p_action text,p_id uuid,p_revision integer,p_content jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 d fhs_winter_internal.meeting_draft%rowtype;
 g jsonb; batch jsonb; grp uuid; expected jsonb; ordered uuid[]; row_key text; eid uuid; rid uuid;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部管理者の認証が必要です'; end if;
 if p_action='load' then
  select * into d from fhs_winter_internal.meeting_draft where status='draft';
  if not found then return null;end if;
  return to_jsonb(d);
 end if;
 if p_id is null or p_revision is null or p_action is null or p_action not in ('save','apply','archive') then raise exception '打ち合わせ会の操作を確認してください';end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-meeting-draft',0));
 select * into d from fhs_winter_internal.meeting_draft where id=p_id for update;
 if p_action='save' then
  if jsonb_typeof(p_content->'groups') is distinct from 'array' or jsonb_typeof(p_content->'items') is distinct from 'array'
    or jsonb_typeof(p_content->'orders') is distinct from 'object' or jsonb_typeof(p_content#>'{batch,p_items}') is distinct from 'array'
    or jsonb_array_length(p_content->'items')<>jsonb_array_length(p_content#>'{batch,p_items}') or jsonb_array_length(p_content->'items')>50
    or pg_column_size(p_content)>4000000 then raise exception '下書き内容を確認してください';end if;
  if d.id is not null and d.status='draft' and d.revision=p_revision+1 and d.content=p_content then return to_jsonb(d);end if;
  if d.id is null and p_revision=0 then
   if exists(select 1 from fhs_winter_internal.meeting_draft where status='draft') then raise exception '別の下書きがあります。保存済み下書きを開いてください';end if;
   insert into fhs_winter_internal.meeting_draft values(p_id,1,'draft',p_content,now(),auth.uid()) returning * into d;
  elsif d.status='draft' and d.revision=p_revision then
   update fhs_winter_internal.meeting_draft set revision=revision+1,content=p_content,updated_at=now(),updated_by=auth.uid() where id=p_id returning * into d;
  else raise exception '別の担当者が下書きを更新しました。保存済み下書きを確認してください';
  end if;
  return to_jsonb(d);
 end if;
 if d.status=(case when p_action='apply' then 'applied' else 'archived' end) and d.revision=p_revision+1 then return to_jsonb(d);end if;
 if d.id is null or d.status<>'draft' or d.revision<>p_revision then raise exception '下書きが更新されています。再読み込みしてください';end if;
 if p_action='apply' then
  batch:=d.content->'batch';
  perform pg_advisory_xact_lock(hashtextextended('winter-meeting-confirm',0));
  -- Lock the same competition/entry rows as the production reorder and reflection routines.
  for g in select value from jsonb_array_elements(d.content->'groups') order by value->>'id' loop
   grp:=(g->>'id')::uuid;
   if not exists(select 1 from public.competitions where id=grp and event_id=ev) then raise exception 'Winterの競技を確認してください';end if;
   perform pg_advisory_xact_lock(hashtextextended('winter-order:'||grp::text,0));
   perform 1 from public.entries where competition_id=grp and event_id=ev order by id for update;
   select coalesce(jsonb_agg(jsonb_build_object('entryId',id,'startOrder',start_order,'riderId',rider_id,'horseId',horse_id,'isOp',coalesce(is_op,false)) order by id),'[]') into expected
   from public.entries where event_id=ev and competition_id=grp and lower(status) not in ('wd','withdrawn');
   if expected is distinct from g->'expected' then raise exception '相談中に正式出番表が更新されています。最新の出番表を確認してください';end if;
  end loop;
  if jsonb_array_length(batch->'p_items')>0 then
   perform public.confirm_winter_meeting_batch(batch->'p_items',(batch->>'p_expected_total')::integer);
  end if;
  for g in select value from jsonb_array_elements(d.content->'groups') order by value->>'id' loop
   grp:=(g->>'id')::uuid;ordered:='{}';
   for row_key in select jsonb_array_elements_text(g->'order') loop
    if left(row_key,8)='request:' then
     rid:=substr(row_key,9)::uuid;
     if not exists(select 1 from jsonb_array_elements(batch->'p_items') item where item#>>'{args,p_id}'=rid::text) then raise exception '保留受付番号を確認してください';end if;
     select entry_id into strict eid from public.reception_requests where event_id=ev and id=rid and status='reflected';
    else eid:=row_key::uuid;end if;
    ordered:=array_append(ordered,eid);
   end loop;
   select coalesce(jsonb_agg(jsonb_build_object('entryId',id,'startOrder',start_order,'riderId',rider_id,'horseId',horse_id,'isOp',coalesce(is_op,false)) order by id),'[]') into expected
   from public.entries where event_id=ev and competition_id=grp and lower(status) not in ('wd','withdrawn');
   if cardinality(ordered)>0 then perform public.save_winter_start_order(grp,ordered,expected);
   elsif jsonb_array_length(expected)>0 then raise exception '出番の件数が一致しません';end if;
  end loop;
 end if;
 update fhs_winter_internal.meeting_draft set status=case when p_action='apply' then 'applied' else 'archived' end,
 revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=p_id returning * into d;
 return to_jsonb(d);
end;$$;
revoke all on function fhs_winter_internal.meeting_draft_action(text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function fhs_winter_internal.meeting_draft_action(text,uuid,integer,jsonb) to authenticated;
create function public.winter_meeting_draft(p_action text,p_id uuid,p_revision integer,p_content jsonb)
returns jsonb language sql security invoker set search_path='' as $$select fhs_winter_internal.meeting_draft_action(p_action,p_id,p_revision,p_content);$$;
revoke all on function public.winter_meeting_draft(text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.winter_meeting_draft(text,uuid,integer,jsonb) to authenticated;
commit;
