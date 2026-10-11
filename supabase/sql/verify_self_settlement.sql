begin;
do $$
declare e uuid:='2af66251-66a2-4c51-8180-a5badf0584d4'; a uuid; h text:=encode(gen_random_bytes(32),'hex'); v text; i uuid:=gen_random_uuid(); r jsonb; doc jsonb; before_receipts bigint; before_prepay bigint; rejected boolean:=false;
begin
 select id into a from auth.users where raw_app_meta_data->>'role'='admin' limit 1;
 insert into public.self_settlement_devices(event_id,token_hash,created_by,expires_at) values(e,h,a,now()+interval '10 minutes');
 v:=public.self_settlement_financial_version(e);
 doc:=jsonb_build_object('document',jsonb_build_object('organizationKey','org-verification-only','due',0));
 select count(*) into before_receipts from public.settlement_receipts;
 select count(*) into before_prepay from public.settlement_prepayments;
 begin
  perform public.confirm_self_settlement(h,i,'org-verification-only','検証','no_payment_due','verification','wrong',doc);
 exception when others then rejected:=true; end;
 if not rejected then raise exception 'stale version accepted'; end if;
 r:=public.confirm_self_settlement(h,i,'org-verification-only','検証','no_payment_due','verification',v,doc);
 if r->>'id'<>i::text then raise exception 'confirmation failed'; end if;
 r:=public.confirm_self_settlement(h,i,'org-verification-only','検証','no_payment_due','verification',v,doc);
 if (select count(*) from public.self_settlement_confirmations where id=i)<>1 then raise exception 'duplicate confirmation'; end if;
 if (select count(*) from public.settlement_receipts)<>before_receipts or (select count(*) from public.settlement_prepayments)<>before_prepay then raise exception 'confirmation marked payments'; end if;
 if has_table_privilege('anon','public.self_settlement_confirmations','SELECT') or has_function_privilege('authenticated','public.confirm_self_settlement(text,uuid,text,text,text,text,text,jsonb)','EXECUTE') then raise exception 'privilege leakage'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","app_metadata":{"role":"member"}}',true);
do $$ begin if exists(select 1 from public.self_settlement_confirmations where organization_key='org-verification-only') then raise exception 'nonadmin read allowed'; end if; end $$;
select set_config('request.jwt.claims','{"role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$ begin if not exists(select 1 from public.self_settlement_confirmations where organization_key='org-verification-only') then raise exception 'admin read blocked'; end if; end $$;
reset role;
select 'PASS: stale versions rejected; retries idempotent; payment records unchanged; anonymous privileges denied; member RLS denied; admin RLS allowed; all test rows rolled back' as verification;
rollback;
