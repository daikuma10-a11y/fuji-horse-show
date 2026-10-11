begin;
select set_config('fhs.test_user',(select id::text from auth.users where raw_app_meta_data->>'role'='admin' order by id limit 1),true);
do $$begin if nullif(current_setting('fhs.test_user',true),'') is null then raise exception 'No admin fixture identity';end if;end$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fhs.test_user'),'app_metadata',jsonb_build_object('role','admin'))::text,true);
set local role authenticated;
do $$declare ident uuid; stamp timestamptz; newstamp timestamptz;begin
 ident:=public.save_fhs_roster_entity('rider','編集検証・ロールバック専用','ヘンシュウケンショウ','','編集検証団体・ロールバック専用');
 select updated_at into stamp from public.fhs_roster_entities where id=ident;
 perform public.save_fhs_roster_entity('rider','編集検証・修正後','ヨミシュウセイ','','編集検証団体・ロールバック専用',ident,stamp,false);
 if not exists(select 1 from public.fhs_roster_entities where id=ident and name='編集検証・修正後' and reading='ヨミシュウセイ') then raise exception 'Edit read-back failed';end if;
 select updated_at into newstamp from public.fhs_roster_entities where id=ident;
 begin
 perform public.save_fhs_roster_entity('rider','古い更新','','','編集検証団体・ロールバック専用',ident,stamp,false);
 raise exception 'Stale edit accepted';
 exception when others then if sqlerrm not like '%別の操作で名簿が更新%' then raise;end if;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fhs.test_user'),'app_metadata',jsonb_build_object('role','user'))::text,true);
 begin
 perform public.save_fhs_roster_entity('rider','非管理者編集','','','編集検証団体・ロールバック専用',ident,newstamp,false);
 raise exception 'Nonadmin edit accepted';
 exception when others then if sqlerrm not like '%本部ログインが必要%' then raise;end if;end;
end$$;
rollback;
select 'PASS: admin create/edit/readback; stale/nonadmin edit blocked; all fixtures rolled back' as result;
