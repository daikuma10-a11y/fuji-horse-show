create table public.fhs_winter_meeting_requests (
 request_id uuid primary key references public.reception_requests(id),
 event_id uuid not null default 'b571f05e-ed23-4e07-929e-be2b73e601a5' check(event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'),
 confirmed_at timestamptz not null default now(),confirmed_by uuid not null references auth.users(id)
);
alter table public.fhs_winter_meeting_requests enable row level security;
revoke all on public.fhs_winter_meeting_requests from public,anon,authenticated;
grant select on public.fhs_winter_meeting_requests to authenticated;
create policy winter_meeting_audit_read on public.fhs_winter_meeting_requests for select to authenticated using((select auth.uid()) is not null and (select auth.jwt()->'app_metadata'->>'role')='admin');
-- Meeting-specific confirmation: multiple clubs, all validated and reflected atomically.
create function fhs_winter_internal.confirm_meeting_batch(p_items jsonb,p_expected_total integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;a jsonb;ident uuid;entryid uuid;ids jsonb:='[]';seen uuid[]:='{}';sources uuid[]:='{}';ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';fee integer;total integer:=0;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '打ち合わせ会の確定には本部ログインが必要です';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 or p_expected_total is null or p_expected_total<0 then raise exception '1〜50件の一覧と料金を確認してください';end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-meeting-confirm',0));
 for item in select value from jsonb_array_elements(p_items) order by value#>>'{args,p_id}' loop
  ident:=(item#>>'{args,p_id}')::uuid;
  if ident is null or ident=any(seen) or (item->>'expected_total')::integer is null or (item->>'expected_total')::integer<0 then raise exception '受付番号・個別料金を確認してください';end if;
  seen:=array_append(seen,ident);perform pg_advisory_xact_lock(hashtextextended(ident::text,0));
  if item->>'type' in('change','withdraw') then entryid:=(item#>>'{args,p_entry_id}')::uuid;if entryid is null or entryid=any(sources) then raise exception '同じ出番の変更・棄権が重複しています';end if;sources:=array_append(sources,entryid);end if;
 end loop;
 perform 1 from public.entries where event_id=ev and id=any(sources) order by id for update;
 for item in select value from jsonb_array_elements(p_items) loop
  a:=item->'args';ident:=(a->>'p_id')::uuid;
  case item->>'type'
   when 'add' then perform public.submit_winter_reception_add(ident,(a->>'p_organization_id')::uuid,(a->>'p_competition_id')::uuid,(a->>'p_rider_id')::uuid,(a->>'p_horse_id')::uuid,a->>'p_visitor_name',a->>'p_membership',(a->>'p_is_op')::boolean,(a->>'p_instructor_confirmed')::boolean);
   when 'change' then perform public.submit_winter_reception_change(ident,(a->>'p_entry_id')::uuid,a->'p_before',(a->>'p_competition_id')::uuid,(a->>'p_rider_id')::uuid,(a->>'p_horse_id')::uuid,a->>'p_visitor_name',a->>'p_from_membership',a->>'p_membership',(a->>'p_is_op')::boolean,(a->>'p_from_instructor')::boolean,(a->>'p_instructor')::boolean,(a->>'p_expected_total')::integer);
   when 'withdraw' then perform public.submit_winter_reception_withdraw(ident,(a->>'p_entry_id')::uuid,a->>'p_visitor_name');
   else raise exception '申請種別を確認してください';
  end case;
  select fee_amount into fee from public.reception_requests where id=ident and event_id=ev;
  if fee is null or fee<>(item->>'expected_total')::integer then raise exception '個別の料金が変更されています。確認し直してください';end if;
  total:=total+fee;ids:=ids||jsonb_build_array(ident);
 end loop;
 if total<>p_expected_total then raise exception '合計料金が一致しません';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  ident:=(item#>>'{args,p_id}')::uuid;
  case item->>'type' when 'change' then perform public.reflect_winter_change_request(ident);else perform public.reflect_winter_reception_request(ident);end case;
  if not exists(select 1 from public.reception_requests where id=ident and event_id=ev and status='reflected') then raise exception '出番表への反映を確認できません';end if;
  insert into public.fhs_winter_meeting_requests(request_id,event_id,confirmed_by) values(ident,ev,auth.uid()) on conflict(request_id) do nothing;
 end loop;
 return jsonb_build_object('ids',ids,'total',total);
end;$$;
revoke all on function fhs_winter_internal.confirm_meeting_batch(jsonb,integer) from public,anon,authenticated;
grant execute on function fhs_winter_internal.confirm_meeting_batch(jsonb,integer) to authenticated;
create function public.confirm_winter_meeting_batch(p_items jsonb,p_expected_total integer)
returns jsonb language sql security invoker set search_path='' as $$select fhs_winter_internal.confirm_meeting_batch(p_items,p_expected_total);$$;
revoke all on function public.confirm_winter_meeting_batch(jsonb,integer) from public,anon,authenticated;
grant execute on function public.confirm_winter_meeting_batch(jsonb,integer) to authenticated;
