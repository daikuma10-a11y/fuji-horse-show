begin;
do $test$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 club uuid:=gen_random_uuid(); bill uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 h uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); away uuid:=gen_random_uuid();
 first uuid:=gen_random_uuid(); later uuid:=gen_random_uuid(); correct uuid:=gen_random_uuid(); move uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid();
 target jsonb; q jsonb; receipt jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'app_metadata',jsonb_build_object('role','admin'))::text,true);
 insert into public.organizations(id,event_id,name) values(club,ev,'訂正検証・団体'),(bill,ev,'訂正検証・選手所属');
 insert into public.horses(id,event_id,organization_id,name,is_participant) values(h,ev,club,'検証馬',true);
 insert into public.riders(id,event_id,organization_id,name,is_participant) values(r,ev,club,'同名選手',true),(away,ev,bill,'同名選手',true);
 insert into public.competitions(id,event_id,competition_no,competition_date,name,fee,op_fee,official) values
 (a,ev,'訂正検証A','2026-11-14','検証A',8000,7000,false),(b,ev,'訂正検証B','2026-11-15','検証B',12000,null,false);
 perform fhs_winter_internal.register_winter_initial_entry(first,club,a,r,h,null,false,false,8000);
 perform fhs_winter_internal.register_winter_initial_entry(later,club,a,away,h,null,false,false,8000);
 insert into public.settlement_prepayments(event_id,organization_key,paid_amount,note,updated_by) values(ev,club::text,24000,'検証入金',actor);
 target:=jsonb_build_object('competition',a,'rider',r,'horse',h,'op',true,'instructor',false,'membership',null);
 q:=public.winter_correct_group_entry(club,first,target,null,null);
 if (q->>'fee')::int<>7000 or (q#>>'{accounts,0,delta}')::int<>-1000 then raise exception 'signed price difference'; end if;
 begin perform public.winter_correct_group_entry(club,first,target,correct,q||'{"fee":1}');raise exception 'stale accepted';
 exception when raise_exception then if sqlerrm not like '出番または請求額%' then raise;end if;end;
 perform public.winter_correct_group_entry(club,first,target,correct,q);
 if public.winter_correct_group_entry(club,first,target,correct,q)<>q or not exists(select from public.entries where id=correct and start_order=1 and is_op)
 or not exists(select from public.entries where id=later and start_order=2 and status='active')
 or (fhs_winter_internal.settlement_account(club)#>>'{account,remaining}')::int<>-3000 then raise exception 'retry, position or balance'; end if;
 begin perform public.winter_correct_group_entry(club,correct,target||jsonb_build_object('rider',away),null,null);raise exception 'duplicate accepted';
 exception when raise_exception then if sqlerrm not like '同じ競技%' then raise;end if;end;
 target:=target||jsonb_build_object('competition',b,'rider',away,'op',false);
 q:=public.winter_correct_group_entry(club,correct,target,null,null);
 if jsonb_array_length(q->'accounts')<>2 then raise exception 'wrong payer'; end if;
 perform public.winter_correct_group_entry(club,correct,target,move,q);
 if not exists(select from public.entries where id=move and organization_id=bill and start_order=1 and status='active') or
 (fhs_winter_internal.settlement_account(club)#>>'{account,total}')::int<>14000 or
 (fhs_winter_internal.settlement_account(bill)#>>'{account,total}')::int<>20000 or
 (select paid_amount from public.settlement_prepayments where event_id=ev and organization_key=club::text)<>24000 then raise exception 'move, preserved amount or bill'; end if;
 receipt:=fhs_winter_internal.cancel_initial_entry(move,null,null);
 if (receipt->>'fee')::int<>12000 then raise exception 'subsequent cancellation'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
 begin perform public.winter_correct_group_entry(club,first,target,null,null);raise exception 'nonadmin accepted';
 exception when raise_exception then if sqlerrm not like '本部管理者%' then raise;end if;end;
end;
$test$;
rollback;
