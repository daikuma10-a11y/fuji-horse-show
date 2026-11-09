-- Extend only the inspection allowlist. Keep the deployed routine and its grants.
do $migration$
declare
 original text := pg_get_functiondef('public.save_winter_timetable(uuid,text,text,text,jsonb)'::regprocedure);
 previous text := $old$p_inspection not in('オープン','組み換え時間')$old$;
 updated text := $new$p_inspection not in('オープン','組み換え時間','前競技と同時')$new$;
begin
 if strpos(original,previous)=0 then raise exception 'Winterタイムテーブル保存処理の版を確認してください'; end if;
 execute replace(original,previous,updated);
end;$migration$;
