begin;
-- One transaction: either every pending request is saved, or none is saved.
create or replace function public.submit_winter_reception_batch(p_items jsonb,p_expected_total integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5'; item jsonb; a jsonb; ident uuid; entry_ident uuid;
 ids jsonb:='[]'; seen uuid[]:='{}'; originals uuid[]:='{}'; org uuid; row_org uuid; total integer:=0; n integer:=0; result uuid;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部ログインが必要です'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' then raise exception '受付一覧を確認してください'; end if;
 if jsonb_array_length(p_items) not between 1 and 50 or p_expected_total is null or p_expected_total<0 then raise exception '受付件数と合計金額を確認してください'; end if;
 -- Lock all request IDs in a consistent order, including retries.
 for item in select value from jsonb_array_elements(p_items) order by value#>>'{args,p_id}' loop
   ident:=(item#>>'{args,p_id}')::uuid;
   if ident is null or ident=any(seen) then raise exception '受付番号が重複しています'; end if;
   seen:=array_append(seen,ident); perform pg_advisory_xact_lock(hashtextextended(ident::text,0));
   if item->>'type' in ('change','withdraw') then
     entry_ident:=(item#>>'{args,p_entry_id}')::uuid;
     if entry_ident is null or entry_ident=any(originals) then raise exception '同じ出番の変更・棄権は一度に1件ずつ確定してください'; end if;
     originals:=array_append(originals,entry_ident);
   end if;
 end loop;
 perform 1 from public.entries where event_id=ev and id=any(originals) order by id for update;
 for item in select value from jsonb_array_elements(p_items) loop
   n:=n+1; a:=item->'args';
   begin
     case item->>'type'
       when 'add' then result:=public.submit_winter_reception_add((a->>'p_id')::uuid,(a->>'p_organization_id')::uuid,(a->>'p_competition_id')::uuid,(a->>'p_rider_id')::uuid,(a->>'p_horse_id')::uuid,a->>'p_visitor_name',a->>'p_membership',(a->>'p_is_op')::boolean,(a->>'p_instructor_confirmed')::boolean);
       when 'change' then result:=public.submit_winter_reception_change((a->>'p_id')::uuid,(a->>'p_entry_id')::uuid,a->'p_before',(a->>'p_competition_id')::uuid,(a->>'p_rider_id')::uuid,(a->>'p_horse_id')::uuid,a->>'p_visitor_name',a->>'p_from_membership',a->>'p_membership',(a->>'p_is_op')::boolean,(a->>'p_from_instructor')::boolean,(a->>'p_instructor')::boolean,(a->>'p_expected_total')::integer);
       when 'withdraw' then result:=public.submit_winter_reception_withdraw((a->>'p_id')::uuid,(a->>'p_entry_id')::uuid,a->>'p_visitor_name');
       else raise exception '申請の種類を確認してください';
     end case;
     select organization_id into row_org from public.reception_requests where id=result and event_id=ev;
     if row_org is null or (org is not null and org<>row_org) then raise exception '団体ごとにまとめて確定してください'; end if;
     org:=row_org;
     select total+fee_amount into total from public.reception_requests where id=result and event_id=ev;
     ids:=ids||jsonb_build_array(result);
   exception when others then raise exception '%件目：%',n,sqlerrm;
   end;
 end loop;
 if total is distinct from p_expected_total then raise exception '料金が変更されています。入力内容と最新料金を確認し直してください'; end if;
 return jsonb_build_object('ids',ids,'total',total);
end; $$;
revoke all on function public.submit_winter_reception_batch(jsonb,integer) from public,anon;
grant execute on function public.submit_winter_reception_batch(jsonb,integer) to authenticated;
commit;
