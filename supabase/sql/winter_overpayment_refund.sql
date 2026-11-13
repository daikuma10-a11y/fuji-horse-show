-- A negative amount in the existing append-only Winter cash ledger records money returned.
-- The ordinary payment function still requires positive amounts.
begin;
alter table public.fhs_winter_extra_payments drop constraint fhs_winter_extra_payments_amount_check,
 add constraint fhs_winter_extra_payments_amount_check check(amount between -2147483647 and 2147483647 and amount<>0);
create function fhs_winter_internal.record_refund(p_id uuid,p_organization_id uuid,p_amount integer,p_payment_method text,p_note text,p_reverses_id uuid,p_expected_remaining bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 prior public.fhs_winter_extra_payments%rowtype;
 account jsonb; remaining bigint;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '返金の記録には本部ログインが必要です';end if;
 if p_id is null or p_organization_id is null or p_amount is null or p_amount<1 or p_payment_method is null or p_payment_method not in ('cash_at_venue','bank_transfer') or p_note is null or length(btrim(p_note)) not between 1 and 500 then raise exception '返金額・方法・理由を入力してください';end if;
 perform pg_advisory_xact_lock(hashtextextended('winter-payment:'||p_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended('winter-refund:'||p_organization_id::text,0));
 select * into prior from public.fhs_winter_extra_payments where id=p_id;
 if found then
  if prior.event_id<>ev or prior.organization_key<>p_organization_id or prior.amount<>-p_amount or prior.payment_method<>p_payment_method or prior.note<>btrim(p_note) or prior.reverses_id is distinct from p_reverses_id then raise exception '記録番号が別の内容に使われています';end if;
  return p_id;
 end if;
 if not exists(select 1 from public.organizations where id=p_organization_id and event_id=ev) then raise exception 'Winterの団体を選択してください';end if;
 if p_reverses_id is null then
  account:=fhs_winter_internal.settlement_account(p_organization_id)->'account';
  remaining:=(account->>'remaining')::bigint;
  if remaining is null or remaining is distinct from p_expected_remaining or remaining>=0 or p_amount > -remaining then raise exception '最新の過入金額を確認してください。過入金額を超える返金は記録できません';end if;
 else
  select * into prior from public.fhs_winter_extra_payments where event_id=ev and id=p_reverses_id and organization_key=p_organization_id for update;
  if not found or prior.amount<>-p_amount or prior.reverses_id is not null or prior.payment_method<>p_payment_method or exists(select 1 from public.fhs_winter_extra_payments where reverses_id=p_reverses_id) then raise exception '取消対象の返金記録を確認してください';end if;
 end if;
 insert into public.fhs_winter_extra_payments(id,event_id,organization_key,amount,payment_method,note,reverses_id,created_by)
 values(p_id,ev,p_organization_id,-p_amount,p_payment_method,btrim(p_note),p_reverses_id,auth.uid());
 return p_id;
end;$$;
revoke all on function fhs_winter_internal.record_refund(uuid,uuid,integer,text,text,uuid,bigint) from public,anon,authenticated;
grant execute on function fhs_winter_internal.record_refund(uuid,uuid,integer,text,text,uuid,bigint) to authenticated;
create function public.record_winter_refund(p_id uuid,p_organization_id uuid,p_amount integer,p_payment_method text,p_note text,p_reverses_id uuid,p_expected_remaining bigint)
returns uuid language sql security invoker set search_path='' as $$select fhs_winter_internal.record_refund(p_id,p_organization_id,p_amount,p_payment_method,p_note,p_reverses_id,p_expected_remaining);$$;
revoke all on function public.record_winter_refund(uuid,uuid,integer,text,text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.record_winter_refund(uuid,uuid,integer,text,text,uuid,bigint) to authenticated;

-- Keep deployed tournament terms and destination, and versions of unaffected accounts.
do $upgrade$
declare original text:=pg_get_functiondef('fhs_winter_internal.settlement_account(uuid)'::regprocedure);
 marker text:='version:=encode(extensions.digest(a::text,';
 addition text:=$patch$select coalesce(sum(case when reverses_id is null then -amount else amount end),0) into refund_total from public.fhs_winter_extra_payments where event_id=ev and organization_key=p_org and amount<0;
 if refund_total>0 then a:=a||jsonb_build_object('refundTotal',refund_total);end if;
 $patch$;
begin
 if strpos(original,marker)=0 or strpos(original,'payment bigint;')=0 or strpos(original,'into payment from public.fhs_winter_extra_payments')=0 then raise exception '精算集計の定義が更新されています。適用前に照合してください';end if;
 execute replace(replace(original,'payment bigint;','payment bigint;refund_total bigint;'),marker,addition||marker);
end;
$upgrade$;
commit;
