begin;
create or replace function public.save_winter_start_order(p_competition_id uuid,p_entry_ids uuid[],p_expected jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5'; snapshot jsonb; actual uuid[]; ident uuid; pos integer:=0;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '出番表の保存には本部ログインが必要です';end if;
 if not exists(select 1 from public.competitions where id=p_competition_id and event_id=ev) then raise exception 'Winterの競技を選択してください';end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-order:'||p_competition_id::text,0));
 perform 1 from public.entries where event_id=ev and competition_id=p_competition_id and lower(status) not in('wd','withdrawn') order by id for update;
 select coalesce(jsonb_agg(jsonb_build_object('entryId',id,'startOrder',start_order,'riderId',rider_id,'horseId',horse_id,'isOp',coalesce(is_op,false)) order by id),'[]'),coalesce(array_agg(id order by id),'{}') into snapshot,actual
 from public.entries where event_id=ev and competition_id=p_competition_id and lower(status) not in('wd','withdrawn');
 if snapshot is distinct from p_expected then raise exception '出番表が別の操作で更新されています。最新の表を読み込んで確認してください';end if;
 if p_entry_ids is null or cardinality(p_entry_ids)=0 or cardinality(p_entry_ids)<>cardinality(actual) or cardinality(p_entry_ids)<>(select count(distinct x) from unnest(p_entry_ids) x) or exists(select 1 from unnest(p_entry_ids) x where x is null or not(x=any(actual))) then raise exception '出番の人馬が一致しません。最新の表を確認してください';end if;
 foreach ident in array p_entry_ids loop
  pos:=pos+1;update public.entries set start_order=pos,updated_at=now() where id=ident and event_id=ev and competition_id=p_competition_id;
 end loop;
 return jsonb_build_object('ids',to_jsonb(p_entry_ids),'savedAt',now());
end;$$;
revoke all on function public.save_winter_start_order(uuid,uuid[],jsonb) from public,anon;
grant execute on function public.save_winter_start_order(uuid,uuid[],jsonb) to authenticated;
commit;
