-- One receipt per confirmed substitution, including zero-fee changes. No direct client access.
create table fhs_winter_internal.horse_substitutions (
  id uuid primary key, input jsonb not null, quote jsonb not null,
  confirmed_at timestamptz not null default clock_timestamp(), confirmed_by uuid not null
);
revoke all on fhs_winter_internal.horse_substitutions from public, anon, authenticated;

-- Resolve the latest saved price and qualification selection for each live start.
create function fhs_winter_internal.substitution_entries(p_old uuid) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',e.id,'competition',e.competition_id,'rider',e.rider_id,'position',e.start_order,
   'billTo',coalesce((i.inputs->>'billingOrganizationId')::uuid,(i.inputs->>'organizationId')::uuid,e.organization_id),
   'oldFee',basis.price,'membership',basis.membership,'instructor',coalesce(basis.instructor,false),'op',e.is_op
 ) order by c.competition_date,c.competition_no,e.start_order,e.id),'[]')
 from public.entries e join public.competitions c on c.id=e.competition_id and c.event_id=e.event_id
 left join public.fhs_winter_initial_entries i on i.id=e.id and i.event_id=e.event_id
 left join lateral (
   select h.price,h.membership,h.instructor from (
     select i.created_at as at,i.entry_fee as price,i.inputs->>'membership' as membership,
       (i.inputs->>'instructorConfirmed')::boolean as instructor where i.id is not null
     union all
     select coalesce(q.reflected_at,q.created_at),
       coalesce((q.payload->>'toEntryFee')::int,(q.payload#>>'{fee,addEntry}')::int),
       coalesce(q.payload#>>'{change,membership}',q.payload#>>'{add,membership}'),
       coalesce((q.payload#>>'{change,instructorConfirmed}')::boolean,(q.payload#>>'{add,instructorConfirmed}')::boolean)
     from public.reception_requests q where q.event_id=e.event_id and q.entry_id=e.id and q.status='reflected' and q.request_type in ('add','change')
     union all
     select s.confirmed_at,(x->>'newFee')::int,x->>'membership',(x->>'instructor')::boolean
     from fhs_winter_internal.horse_substitutions s cross join lateral jsonb_array_elements(s.quote->'entries') x
     where x->>'id'=e.id::text
   ) h order by h.at desc limit 1
 ) basis on true
 where e.event_id='b571f05e-ed23-4e07-929e-be2b73e601a5' and e.horse_id=p_old and lower(e.status) not in('wd','withdrawn')
$$;
revoke all on function fhs_winter_internal.substitution_entries(uuid) from public,anon,authenticated;

create function fhs_winter_internal.horse_substitution(p_old uuid,p_target uuid,p_kind text,p_rows jsonb,p_id uuid,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5';
 old_h public.horses%rowtype; new_h public.horses%rowtype; entity public.fhs_roster_entities%rowtype;
 old_link public.fhs_winter_reception_roster%rowtype; item jsonb; edits jsonb; rows_out jsonb:='[]'; fees jsonb;
 receipt fhs_winter_internal.horse_substitutions%rowtype; inputs jsonb; quote jsonb; choices jsonb; starts jsonb;
 target_id uuid; target_name text; target_jef text; target_counted boolean; cid uuid;
 src public.competitions%rowtype; dst public.competitions%rowtype; rider public.riders%rowtype;
 late boolean:=(now() at time zone 'Asia/Tokyo')::date > date '2026-11-02';
 charged uuid[]:='{}'; service integer; new_fee integer; reg_delta integer; old_count integer;
 line record; bill uuid; account jsonb; last_id uuid; lastpos integer; reason text;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '本部管理者でログインしてください'; end if;
 inputs:=jsonb_build_object('old',p_old,'target',p_target,'kind',p_kind,'rows',p_rows);
 if p_id is not null then
   perform pg_advisory_xact_lock(hashtextextended('winter-substitution:'||p_id::text,0));
   select * into receipt from fhs_winter_internal.horse_substitutions where id=p_id;
   if found then
     if receipt.input is distinct from inputs or receipt.quote is distinct from p_expected then raise exception '前回の確定内容が異なります'; end if;
     return receipt.quote;
   end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('fhs-winter-participants',0));
 select * into old_h from public.horses where id=p_old and event_id=ev for update;
 if not found or old_h.is_participant=false or (old_h.roster_source in ('shared_roster','winter-substituted') and old_h.is_participant is not true) then raise exception '現在参加する元の馬を選び直してください'; end if;
 select * into old_link from public.fhs_winter_reception_roster where horse_id=p_old;
 if p_target is null then
   if p_id is not null or p_expected is not null then raise exception '代わりの馬を選択してください'; end if;
   select coalesce(jsonb_agg(to_jsonb(v) order by v.name,v.id),'[]') into choices from (
     select h.id,h.name,h.jef_registration_no as number,'event' as kind
     from public.horses h where h.event_id=ev and h.organization_id=old_h.organization_id and h.id<>p_old
       and h.is_participant is distinct from false and (h.roster_source is distinct from 'shared_roster' or h.is_participant=true)
     union all
     select ent.id,ent.name,ent.jef_number,'roster'
     from public.fhs_roster_entities ent join public.fhs_roster_affiliations a on a.entity_id=ent.id
     where a.club_id=old_link.club_id and a.ended_at is null and ent.kind='horse' and ent.archived_at is null
       and ent.id<>old_link.entity_id and not exists(
         select 1 from public.fhs_winter_reception_roster m join public.horses h on h.id=m.horse_id
         where m.entity_id=ent.id and m.club_id=a.club_id and h.is_participant=true and h.event_id=ev)
   ) v;
   return jsonb_build_object('choices',choices,'entries',fhs_winter_internal.substitution_entries(p_old));
 end if;
 if p_kind='event' then
   select * into new_h from public.horses where id=p_target and event_id=ev and organization_id=old_h.organization_id for update;
   if not found or new_h.id=p_old or new_h.is_participant=false or (new_h.roster_source='shared_roster' and new_h.is_participant is not true) then raise exception '同じ団体の参加馬を選択してください'; end if;
   target_id:=new_h.id; target_name:=new_h.name; target_jef:=new_h.jef_registration_no; target_counted:=true;
 elsif p_kind='roster' then
   select ent.* into entity from public.fhs_roster_entities ent join public.fhs_roster_affiliations a on a.entity_id=ent.id
     where ent.id=p_target and ent.kind='horse' and ent.archived_at is null and a.ended_at is null and a.club_id=old_link.club_id for share of ent,a;
   if not found or entity.id=old_link.entity_id then raise exception '差し替え先の馬の所属を再確認してください'; end if;
   select h.* into new_h from public.horses h join public.fhs_winter_reception_roster m on m.horse_id=h.id
     where m.club_id=old_link.club_id and m.entity_id=entity.id and h.event_id=ev and h.organization_id=old_h.organization_id for update of h;
   target_id:=new_h.id; target_counted:=coalesce(new_h.is_participant,false);
   if target_counted then raise exception '代わりの馬は参加登録済みです。選び直してください'; end if;
   target_name:=entity.name; target_jef:=entity.jef_number;
 else raise exception '代わりの馬を選択してください'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception '対象の出番を確認してください'; end if;
 -- Same locks as other Winter ordering and finance operations. Lock source and target competitions in order.
 for cid in select id from public.competitions where event_id=ev and (id in
   (select competition_id from public.entries where event_id=ev and horse_id=p_old) or id in
   (select (x->>'competition')::uuid from jsonb_array_elements(p_rows) x)) order by id loop
   perform pg_advisory_xact_lock(hashtextextended('winter-order:'||cid::text,0));
 end loop;
 perform id from public.entries where event_id=ev and horse_id=p_old order by id for update;
 starts:=fhs_winter_internal.substitution_entries(p_old);
 if jsonb_array_length(starts)<>jsonb_array_length(p_rows) then raise exception '元の馬の出番が変わりました。読み直してください'; end if;
 if exists(select 1 from public.reception_requests q where q.event_id=ev and q.status='pending' and
    (q.horse_id=p_old or q.original_entry_id in(select (x->>'id')::uuid from jsonb_array_elements(starts)x))) then
   raise exception '元の馬に未反映の受付があります。申請一覧で先に処理してください';
 end if;
 for item in select value from jsonb_array_elements(starts) loop
   select x into strict edits from jsonb_array_elements(p_rows) x where x->>'id'=item->>'id';
   select * into strict src from public.competitions where event_id=ev and id=(item->>'competition')::uuid;
   select * into strict dst from public.competitions where event_id=ev and id=(edits->>'competition')::uuid for share;
   select * into strict rider from public.riders where event_id=ev and id=(item->>'rider')::uuid for share;
   if dst.official and (nullif(btrim(rider.jef_member_no),'') is null or nullif(btrim(target_jef),'') is null) then raise exception '公認競技は日馬連登録済みの選手・馬を選択してください'; end if;
   if item->>'oldFee' is null then raise exception '元の出番の料金記録を確認できません'; end if;
   new_fee:=public.winter_change_price(dst.id,edits->>'membership',(edits->>'op')::boolean,(edits->>'instructor')::boolean);
   if exists(select 1 from public.entries where event_id=ev and horse_id=target_id and rider_id=rider.id and competition_id=dst.id and lower(status) not in('wd','withdrawn'))
     or exists(select 1 from public.reception_requests where event_id=ev and status='pending' and horse_id=target_id and rider_id=rider.id and target_competition_id=dst.id)
     or exists(select 1 from jsonb_array_elements(rows_out) x where x->>'rider'=rider.id::text and x->>'to'=dst.id::text) then raise exception '変更先に同じ競技・選手・馬が重複します'; end if;
   service:=0;
   if late and not(dst.id=any(charged)) and not(src.competition_no in('①','②','③','④') and dst.competition_no in('①','②','③','④') and src.name like 'フレンドシップ%' and dst.name like 'フレンドシップ%') then
     service:=2000; charged:=array_append(charged,dst.id);
   end if;
   rows_out:=rows_out||jsonb_build_array(item||jsonb_build_object('to',dst.id,'newFee',new_fee,'service',service,
     'beforeOp',item->'op','op',(edits->>'op')::boolean,'membership',edits->>'membership','instructor',(edits->>'instructor')::boolean));
 end loop;
 reg_delta:=case when target_counted then -14000 else 0 end;
 select count(*) into old_count from public.horses where event_id=ev and organization_id=old_h.organization_id and is_participant is distinct from false and (roster_source is distinct from 'shared_roster' or is_participant=true);
 for bill in select org from (
    select (x->>'billTo')::uuid org from jsonb_array_elements(rows_out)x union select old_h.organization_id
 ) affected order by org loop
   perform pg_advisory_xact_lock(hashtextextended('winter-finance:'||bill::text,0));
 end loop;
 select jsonb_agg(to_jsonb(v)||jsonb_build_object(
   'beforeTotal',(snapshot->>'total')::bigint,'afterTotal',(snapshot->>'total')::bigint+v.difference+v.service+v.registration,
   'beforeRemaining',(snapshot->>'remaining')::bigint,'afterRemaining',(snapshot->>'remaining')::bigint+v.difference+v.service+v.registration
 ) order by v."billTo") into fees from (
   select org as "billTo",sum(difference)::int as difference,sum(service_fee)::int as service,sum(registration)::int as registration from (
     select (x->>'billTo')::uuid org,(x->>'newFee')::int-(x->>'oldFee')::int difference,(x->>'service')::int service_fee,0 registration from jsonb_array_elements(rows_out)x
     union all select old_h.organization_id,0,0,reg_delta
   ) amounts group by org
 ) v cross join lateral (select fhs_winter_internal.settlement_account(v."billTo")->'account' as snapshot) a;
 quote:=jsonb_build_object('old',old_h.name,'new',target_name,'number',target_jef,'late',late,'entries',rows_out,
   'billing',fees,'oldCount',old_count,'newCount',old_count+reg_delta/14000,'registration',reg_delta);
 if p_id is null then return quote; end if;
 if p_expected is distinct from quote then raise exception '出番・名簿・料金が変わりました。差額を再確認してください'; end if;
 if p_kind='roster' then
   insert into public.fhs_winter_participants(event_id,entity_id,club_id,name_snapshot,reading_snapshot,jef_number_snapshot,club_name_snapshot)
     select ev,entity.id,old_link.club_id,entity.name,entity.reading,entity.jef_number,c.name from public.fhs_roster_clubs c where c.id=old_link.club_id;
   if target_id is null then
     insert into public.horses(event_id,organization_id,name,jef_registration_no,is_participant,roster_source)
       values(ev,old_h.organization_id,entity.name,entity.jef_number,true,'shared_roster') returning id into target_id;
     insert into public.fhs_winter_reception_roster(entity_id,club_id,horse_id) values(entity.id,old_link.club_id,target_id);
   else
     update public.horses set name=entity.name,jef_registration_no=entity.jef_number,is_participant=true where id=target_id and event_id=ev;
   end if;
 end if;
 for item in select value from jsonb_array_elements(rows_out) loop
   cid:=(item->>'to')::uuid;
   if cid=(item->>'competition')::uuid then lastpos:=(item->>'position')::int;
   else select coalesce(max(start_order),0)+1 into lastpos from public.entries where event_id=ev and competition_id=cid and lower(status) not in ('wd','withdrawn'); end if;
   update public.entries set horse_id=target_id,competition_id=cid,start_order=lastpos,is_op=(item->>'op')::boolean,updated_at=now()
     where id=(item->>'id')::uuid and event_id=ev and horse_id=p_old;
 end loop;
 for cid in select distinct (x->>field)::uuid from jsonb_array_elements(rows_out)x cross join (values('competition'),('to')) v(field)
   where x->>'competition'<>x->>'to' loop
   with ordered as(select id,row_number() over(order by start_order nulls last,created_at,id) n from public.entries where event_id=ev and competition_id=cid and lower(status) not in ('wd','withdrawn'))
   update public.entries e set start_order=o.n,updated_at=now() from ordered o where e.id=o.id and e.start_order is distinct from o.n;
 end loop;
 delete from public.fhs_winter_participants where event_id=ev and entity_id=old_link.entity_id and club_id=old_link.club_id;
 update public.horses set is_participant=false,roster_source=case when roster_source='shared_roster' then roster_source else 'winter-substituted' end where id=p_old and event_id=ev;
 for line in select * from jsonb_to_recordset(fees) as v("billTo" uuid,difference int,service int,registration int) loop
   if line.difference+line.service<>0 then
     account:=fhs_winter_internal.settlement_account(line."billTo")->'account';
     select id into last_id from public.fhs_winter_charge_adjustments where event_id=ev and organization_key=line."billTo" order by sequence desc limit 1;
     reason:=format('馬の差し替え %s → %s（競技料差額 %s円・変更料 %s円）',old_h.name,target_name,line.difference,line.service);
     perform fhs_winter_internal.save_charge_adjustment(gen_random_uuid(),line."billTo",line.difference+line.service,reason,(account->>'total')::bigint,last_id);
   end if;
 end loop;
 for item in select value from jsonb_array_elements(fees) loop
   account:=fhs_winter_internal.settlement_account((item->>'billTo')::uuid)->'account';
   if (account->>'total')::bigint is distinct from (item->>'afterTotal')::bigint
      or (account->>'remaining')::bigint is distinct from (item->>'afterRemaining')::bigint then
     raise exception '確定前後の請求額が一致しません。再確認してください';
   end if;
 end loop;
 insert into fhs_winter_internal.horse_substitutions values(p_id,inputs,quote,clock_timestamp(),auth.uid());
 return quote;
end;$$;
revoke all on function fhs_winter_internal.horse_substitution(uuid,uuid,text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function fhs_winter_internal.horse_substitution(uuid,uuid,text,jsonb,uuid,jsonb) to authenticated;
create function public.winter_horse_substitution(p_old uuid,p_target uuid,p_kind text,p_rows jsonb,p_id uuid,p_expected jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select fhs_winter_internal.horse_substitution(p_old,p_target,p_kind,p_rows,p_id,p_expected)
$$;
revoke all on function public.winter_horse_substitution(uuid,uuid,text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.winter_horse_substitution(uuid,uuid,text,jsonb,uuid,jsonb) to authenticated;

-- A later roster save may encounter an already retired horse with immutable receipts.
-- Keep the existing removal guard for selected participants and active event horses.
do $roster$
declare
  original text:=pg_get_functiondef('public.save_fhs_winter_participants(uuid,uuid[],uuid[])'::regprocedure);
  old_guard text:='m.club_id=p_club_id and not(m.entity_id=any(p_ids)) and (';
  new_guard text:='m.club_id=p_club_id and not(m.entity_id=any(p_ids)) and (m.entity_id=any(actual) or m.horse_id is null or exists(select 1 from public.horses h where h.id=m.horse_id and h.is_participant is distinct from false)) and (';
begin
  if strpos(original,old_guard)=0 then raise exception '参加名簿の保存処理の版を確認してください'; end if;
  execute replace(original,old_guard,new_guard);
end;$roster$;
