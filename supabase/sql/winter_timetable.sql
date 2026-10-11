begin;
-- Store a Winter-only metadata envelope while retaining the original competition notes.
create or replace function public.save_winter_timetable(p_competition_id uuid,p_inspection text,p_start text,p_phase text,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5'; current_row jsonb; saved jsonb; note text; envelope jsonb;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '時間の変更には本部ログインが必要です';end if;
 if p_phase is null or p_phase not in('provisional','final') or (p_inspection is not null and p_inspection !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') or (p_start is not null and p_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception '時間は時:分で入力してください';end if;
 select notes into note from public.competitions where id=p_competition_id and event_id=ev for update;
 if not found then raise exception 'Winterの競技を選択してください';end if;
 begin envelope:=note::jsonb; exception when invalid_text_representation then envelope:=null; end;
 if jsonb_typeof(envelope->'winterTimetable')='object' then current_row:=envelope->'winterTimetable';
 else envelope:=jsonb_build_object('originalNotes',note);current_row:=null;end if;
 if current_row is distinct from nullif(p_expected,'null'::jsonb) then raise exception '時間が別の操作で更新されています。読み込み直して確認してください';end if;
 saved:=jsonb_build_object('event_id',ev,'competition_id',p_competition_id,'inspection_time',p_inspection,'start_time',p_start,'phase',p_phase,'updated_at',now());
 update public.competitions set notes=(envelope||jsonb_build_object('winterTimetable',saved))::text where id=p_competition_id and event_id=ev;
 return saved;
end;$$;
revoke all on function public.save_winter_timetable(uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.save_winter_timetable(uuid,text,text,text,jsonb) to authenticated;
commit;
