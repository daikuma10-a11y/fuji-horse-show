begin;
create table public.fhs_winter_withdraw_restorations (
 request_id uuid primary key references public.reception_requests(id),
 event_id uuid not null check(event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'),
 entry_id uuid not null references public.entries(id),
 previous_status text not null,
 restored_order integer,
 reason text not null check(length(btrim(reason)) between 1 and 300),
 created_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id)
);
alter table public.fhs_winter_withdraw_restorations enable row level security;
create policy winter_restore_admin_read on public.fhs_winter_withdraw_restorations for select to authenticated using ((select auth.jwt()->'app_metadata'->>'role')='admin');
revoke all on public.fhs_winter_withdraw_restorations from public,anon,authenticated;
grant select on public.fhs_winter_withdraw_restorations to authenticated;
create or replace function fhs_winter_internal.restore_withdraw(p_request_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';q public.reception_requests%rowtype;e public.entries%rowtype;a public.fhs_winter_withdraw_restorations%rowtype;pos integer;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部管理者権限が必要です';end if;
 if p_request_id is null or length(btrim(coalesce(p_reason,''))) not between 1 and 300 then raise exception '棄権と取消理由を確認してください';end if;
 select * into q from public.reception_requests where id=p_request_id and event_id=ev for update;
 if not found or q.request_type<>'withdraw' or coalesce(q.fee_amount,0)<>0 then raise exception 'Winterの0円の棄権申請を選択してください';end if;
 select * into a from public.fhs_winter_withdraw_restorations where request_id=q.id;
 if found then
  if a.reason<>btrim(p_reason) then raise exception '同じ棄権の取消理由が一致しません';end if;
  return jsonb_build_object('requestId',a.request_id,'entryId',a.entry_id,'restoredOrder',a.restored_order,'cancelledAt',a.created_at);
 end if;
 if q.status not in ('pending','reflected') then raise exception 'この棄権は取り消せません';end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-order:'||q.from_competition_id::text,0));
 select * into e from public.entries where id=q.original_entry_id and event_id=ev for update;
 if not found or e.competition_id<>q.from_competition_id or e.rider_id<>q.rider_id or e.horse_id<>q.horse_id then raise exception '元の人馬が変更されています。最新の出番を確認してください';end if;
 if exists(select 1 from public.reception_requests x where x.event_id=ev and x.id<>q.id and x.original_entry_id=e.id and x.status='pending') then raise exception '未反映の別申請があります。先に確認してください';end if;
 if q.status='reflected' then
  if lower(e.status) not in ('wd','withdrawn') then raise exception '棄権後の出番が変更されています';end if;
  if exists(select 1 from public.reception_requests x where x.event_id=ev and x.id<>q.id and x.status='reflected' and (x.original_entry_id=e.id or x.entry_id=e.id) and x.reflected_at>q.reflected_at) then raise exception '棄権後の申請があります。最新の出番を確認してください';end if;
  select coalesce(max(start_order),0)+1 into pos from public.entries where event_id=ev and competition_id=e.competition_id and lower(status) not in ('wd','withdrawn');
  update public.entries set status='active',start_order=pos,updated_at=now() where id=e.id and event_id=ev;
 else
  if lower(e.status) in ('wd','withdrawn') then raise exception '出番は既に棄権しています。反映済みの棄権を確認してください';end if;
 end if;
 insert into public.fhs_winter_withdraw_restorations(request_id,event_id,entry_id,previous_status,restored_order,reason,created_by) values(q.id,ev,e.id,q.status,pos,btrim(p_reason),auth.uid()) returning * into a;
 update public.reception_requests set status='cancelled' where id=q.id and event_id=ev;
 return jsonb_build_object('requestId',q.id,'entryId',e.id,'restoredOrder',pos,'cancelledAt',a.created_at);
end;$$;
revoke all on function fhs_winter_internal.restore_withdraw(uuid,text) from public,anon;
grant execute on function fhs_winter_internal.restore_withdraw(uuid,text) to authenticated;
create or replace function public.restore_winter_withdraw(p_request_id uuid,p_reason text) returns jsonb language sql security invoker set search_path='' as $$ select fhs_winter_internal.restore_withdraw(p_request_id,p_reason); $$;
revoke all on function public.restore_winter_withdraw(uuid,text) from public,anon;
grant execute on function public.restore_winter_withdraw(uuid,text) to authenticated;
commit;
