begin;
-- Everything below is rolled back. Never mark a real club as paid.
select set_config('fhs.test_user',(select id::text from auth.users where raw_app_meta_data->>'role'='admin' order by id limit 1),true);
do $$begin if nullif(current_setting('fhs.test_user',true),'') is null then raise exception 'Admin fixture identity not available';end if;end$$;
insert into public.organizations(id,event_id,name) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','b571f05e-ed23-4e07-929e-be2b73e601a5','精算検証・ロールバック専用');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fhs.test_user'),'app_metadata',jsonb_build_object('role','admin'))::text,true);
set local role authenticated;
insert into public.settlement_prepayments(event_id,organization_key,paid_amount,note,updated_by,updated_at) values('b571f05e-ed23-4e07-929e-be2b73e601a5','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',5000,'検証',current_setting('fhs.test_user')::uuid,'2026-10-11T00:00:00Z');
do $$declare n integer;begin
 update public.settlement_prepayments set paid_amount=4000,updated_at='2026-10-11T00:00:01Z' where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and organization_key='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and updated_at='2026-10-11T00:00:00Z';get diagnostics n=row_count;if n<>1 then raise exception 'Admin update denied';end if;
 update public.settlement_prepayments set paid_amount=3000 where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and organization_key='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and updated_at='2026-10-11T00:00:00Z';get diagnostics n=row_count;if n<>0 then raise exception 'Stale update accepted';end if;
 if (select paid_amount from public.settlement_prepayments where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and organization_key='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')<>4000 then raise exception 'Read-back mismatch';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fhs.test_user'),'app_metadata',jsonb_build_object('role','user'))::text,true);
 if exists(select 1 from public.settlement_prepayments where organization_key='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') then raise exception 'Nonadmin read accepted';end if;
 update public.settlement_prepayments set paid_amount=1 where organization_key='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';get diagnostics n=row_count;if n<>0 then raise exception 'Nonadmin write accepted';end if;
end$$;
rollback;
select 'PASS: admin advance save/read-back, stale update rejected, nonadmin read/write blocked; all fixtures rolled back' as result;
