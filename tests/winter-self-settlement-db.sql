begin;
select set_config('fhs.test_user',(select id::text from auth.users where raw_app_meta_data->>'role'='admin' order by id limit 1),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('fhs.test_user'),'app_metadata',jsonb_build_object('role','admin'))::text,true);
-- Disposable records inside this transaction only.
do $$declare org uuid;token text:=repeat('1',64);id1 uuid:=gen_random_uuid();before jsonb;saved jsonb;after jsonb;initial bigint;old_advance public.settlement_prepayments%rowtype;last uuid;expected bigint;
begin
 select id into org from public.organizations where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' order by id limit 1;
 insert into public.fhs_winter_settlement_devices(token_hash,expires_at) values(token,now()+interval '1 hour');
 before:=public.get_winter_settlement_account(org);
 initial:=(before->'account'->>'initialTotal')::bigint;
 -- Confirmed initial amount only for this fixture; ROLLBACK restores the real record.
 insert into public.settlement_prepayments(event_id,organization_key,paid_amount,note,updated_by)
 values('b571f05e-ed23-4e07-929e-be2b73e601a5',org::text,initial,'検証',current_setting('fhs.test_user')::uuid)
 on conflict(event_id,organization_key) do update set paid_amount=excluded.paid_amount,note=excluded.note;
 update public.reception_requests set status='cancelled' where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and organization_id=org and status='pending';
 before:=public.get_winter_settlement_account(org);
 if jsonb_array_length(before->'account'->'warnings')<>0 then raise exception 'Fixture has unresolved warnings: %',before;end if;
 saved:=public.confirm_winter_settlement(id1,org,before->>'version',case when (before->'account'->>'remaining')::bigint=0 then 'no_payment_due' else 'cash_at_venue' end,'検証者',token);
 if saved->'account' is distinct from before->'account' then raise exception 'Snapshot mismatch';end if;
 if public.confirm_winter_settlement(id1,org,before->>'version',saved->>'payment_method','検証者',token) is distinct from saved then raise exception 'Retry changed snapshot';end if;
 if public.confirm_winter_settlement(gen_random_uuid(),org,before->>'version',saved->>'payment_method','別確認者',token)->>'id'<>id1::text then raise exception 'Same-version confirmation duplicated';end if;
 if (select count(*) from public.fhs_winter_settlement_confirmations where organization_key=org and account_version=before->>'version')<>1 then raise exception 'Confirmation count incorrect';end if;
 after:=public.get_winter_settlement_account(org);
 if before<>after then raise exception 'Confirmation changed financials/paid state';end if;
 select id into last from public.fhs_winter_charge_adjustments where organization_key=org order by sequence desc limit 1;
 perform public.save_winter_charge_adjustment(gen_random_uuid(),org,1000,'確認後訂正',(before->'account'->>'total')::bigint,last);
 after:=public.get_winter_settlement_account(org);
 if after->>'version'=before->>'version' then raise exception 'Correction did not change version';end if;
 if public.confirm_winter_settlement(id1,org,before->>'version',saved->>'payment_method','検証者',token) is distinct from saved then raise exception 'Retry did not preserve old saved snapshot';end if;
 begin perform public.confirm_winter_settlement(gen_random_uuid(),org,repeat('0',64),'cash_at_venue','検証者',token);raise exception 'Stale version accepted';exception when others then if sqlerrm not like '%更新されています%' then raise;end if;end;
 begin perform public.confirm_winter_settlement(gen_random_uuid(),org,after->>'version','cash_at_venue','検証者',repeat('2',64));raise exception 'Invalid token accepted';exception when others then if sqlerrm not like '%有効期限%' then raise;end if;end;
 if after->'account'->>'bankDetails' is distinct from '静岡銀行 御殿場西支店 普通 0110546 フジホースショー事務局 川口 雅美' then raise exception 'Official bank missing';end if;
 if public.confirm_winter_settlement(gen_random_uuid(),org,after->>'version','bank_transfer','検証者',token)->'account'->>'bankDetails' is distinct from after->'account'->>'bankDetails' then raise exception 'Bank snapshot mismatch';end if;
 if (select account from public.fhs_winter_settlement_confirmations where id=id1) is distinct from saved->'account' then raise exception 'Saved snapshot was mutated';end if;
end;$$;
set local role anon;
do $$begin perform public.get_winter_settlement_account(gen_random_uuid());raise exception 'Anonymous financial RPC allowed';exception when insufficient_privilege then null;end;$$;
reset role;
set local role authenticated;
do $$begin perform public.confirm_winter_settlement(gen_random_uuid(),gen_random_uuid(),'v','cash_at_venue','x',repeat('1',64));raise exception 'Direct browser confirmation allowed';exception when insufficient_privilege then null;end;$$;
reset role;
select 'PASS: server-calculated totals, immutable snapshots, idempotent and version-unique saves, correction invalidation, no implicit payment, official bank snapshot, stale/token/anon rejection; ROLLBACK' as result;
rollback;
