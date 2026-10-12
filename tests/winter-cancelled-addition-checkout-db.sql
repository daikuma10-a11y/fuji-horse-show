-- Uses this session's explicitly identified browser-test request only. All mutations roll back.
begin;
do $$
declare q public.reception_requests%rowtype; e public.entries%rowtype; a jsonb; orphan uuid:=gen_random_uuid();
begin
 select * into q from public.reception_requests where id='2a466910-5802-4f37-8612-51d602c7e221' and event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and status='cancelled' and payload->>'visitorName'='共通マスター実操作検証 20261012';
 if q.id is null then raise exception 'Own browser validation request not found';end if;
 select * into e from public.entries where id=q.entry_id;
 a:=fhs_winter_internal.settlement_account(q.organization_id)->'account';
 if jsonb_array_length(a->'warnings')<>0 or (a->>'extraTotal')::bigint<>0 then raise exception 'Cancelled addition blocks checkout';end if;
 update public.entries set status='active',start_order=11 where id=e.id;
 a:=fhs_winter_internal.settlement_account(q.organization_id)->'account';
 if not exists(select 1 from jsonb_array_elements_text(a->'warnings') w where w like '%料金履歴%') then raise exception 'Active uncovered entry warning was suppressed';end if;
 update public.entries set status='withdrawn',start_order=null where id=e.id;
 update public.reception_requests set request_type='change',payload=q.payload||jsonb_build_object('treatedAsWithdrawAdd',true) where id=q.id;
 a:=fhs_winter_internal.settlement_account(q.organization_id)->'account';
 if jsonb_array_length(a->'warnings')<>0 then raise exception 'Cancelled replacement blocks checkout';end if;
 update public.reception_requests set payload=q.payload||jsonb_build_object('treatedAsWithdrawAdd',false) where id=q.id;
 a:=fhs_winter_internal.settlement_account(q.organization_id)->'account';
 if not exists(select 1 from jsonb_array_elements_text(a->'warnings') w where w like '%料金履歴%') then raise exception 'Uncovered ordinary change warning was suppressed';end if;
 update public.reception_requests set request_type=q.request_type,payload=q.payload where id=q.id;
 insert into public.entries select (jsonb_populate_record(null::public.entries,to_jsonb(e)||jsonb_build_object('id',orphan,'status','withdrawn','start_order',null))).*;
 a:=fhs_winter_internal.settlement_account(q.organization_id)->'account';
 if not exists(select 1 from jsonb_array_elements_text(a->'warnings') w where w like '%料金履歴%') then raise exception 'Unknown removed entry warning was suppressed';end if;
end $$;
rollback;
