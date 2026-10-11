create function public.archive_meeting_draft(p_id uuid,p_revision integer)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then
    raise exception '本部管理者の認証が必要です';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fhs-autumn-meeting',0));
  update public.meeting_drafts set status='archived',revision=revision+1,updated_at=now(),updated_by=auth.uid()
    where id=p_id and event_id='2af66251-66a2-4c51-8180-a5badf0584d4'::uuid
      and revision=p_revision and status='draft';
  if not found then raise exception '下書きが更新されています。再読み込みしてください'; end if;
end;
$$;
revoke all on function public.archive_meeting_draft(uuid,integer) from public,anon;
grant execute on function public.archive_meeting_draft(uuid,integer) to authenticated;
