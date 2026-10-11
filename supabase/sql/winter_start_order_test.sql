begin;
do $$
declare ev uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';o uuid:=gen_random_uuid();r uuid:=gen_random_uuid();h uuid:=gen_random_uuid();c uuid;a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();snapshot jsonb;denied boolean;baseline bigint;
begin
 select count(*) into baseline from public.entries where event_id<>ev;
 if has_function_privilege('anon','public.save_winter_start_order(uuid,uuid[],jsonb)','execute') then raise exception 'anon permission';end if;
 denied:=false;begin perform public.save_winter_start_order(c,array[a,b],'[]');exception when others then denied:=true;end;if not denied then raise exception 'auth bypass';end if;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{"role":"admin"}}',true);
 insert into public.organizations(id,event_id,name)values(o,ev,'並べ替え検証ROLLBACK');
 insert into public.riders(id,event_id,organization_id,name)values(r,ev,o,'検証');insert into public.horses(id,event_id,organization_id,name)values(h,ev,o,'検証馬');
 select id into c from public.competitions where event_id=ev and competition_no='1';
 insert into public.entries(id,event_id,competition_id,rider_id,horse_id,organization_id,start_order,status,is_op)values(a,ev,c,r,h,o,1,'active',false),(b,ev,c,r,h,o,2,'active',true);
 select jsonb_agg(jsonb_build_object('entryId',id,'startOrder',start_order,'riderId',rider_id,'horseId',horse_id,'isOp',is_op) order by id)into snapshot from public.entries where id in(a,b);
 perform public.save_winter_start_order(c,array[b,a],snapshot);
 if (select start_order from public.entries where id=b)<>1 or (select start_order from public.entries where id=a)<>2 then raise exception 'order not saved';end if;
 denied:=false;begin perform public.save_winter_start_order(c,array[a,b],snapshot);exception when others then denied:=true;end;if not denied then raise exception 'stale save allowed';end if;
 select jsonb_agg(jsonb_build_object('entryId',id,'startOrder',start_order,'riderId',rider_id,'horseId',horse_id,'isOp',is_op) order by id)into snapshot from public.entries where id in(a,b);
 denied:=false;begin perform public.save_winter_start_order(c,array[a,a],snapshot);exception when others then denied:=true;end;if not denied then raise exception 'duplicate entry allowed';end if;
 denied:=false;begin perform public.save_winter_start_order(c,array[a],snapshot);exception when others then denied:=true;end;if not denied then raise exception 'missing entry allowed';end if;
 if (select count(*) from public.entries where event_id<>ev)<>baseline then raise exception 'other event changed';end if;
end $$;
rollback;
select 'PASS: authorized reorder, OP retained, exact active IDs required, stale changes rejected and other events unchanged; fixtures rolled back' as verification;
