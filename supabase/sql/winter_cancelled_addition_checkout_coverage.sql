-- Preserve the deployed account function, changing only coverage of cancelled, removed additions.
CREATE OR REPLACE FUNCTION fhs_winter_internal.settlement_account(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ev constant uuid:='b571f05e-ed23-4e07-929e-be2b73e601a5'; org jsonb;initial bigint;horses jsonb;headcount bigint;extra bigint;paid bigint;advance jsonb;instruction jsonb;lines jsonb;corrections jsonb;adjustment bigint;pending bigint;missing bigint;warnings jsonb:='[]';a jsonb;version text;payment bigint;
begin
 select jsonb_build_object('id',id,'event_id',event_id,'name',name) into org from public.organizations where id=p_org and event_id=ev;
 if org is null then raise exception 'Winterの団体を選択してください';end if;
 select coalesce(sum(entry_fee),0) into initial from public.fhs_winter_initial_entries where event_id=ev and coalesce(inputs->>'billingOrganizationId',inputs->>'organizationId')=p_org::text;
 select count(*),coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by id),'[]') into headcount,horses from public.horses where event_id=ev and organization_id=p_org and is_participant is distinct from false and (roster_source is distinct from 'shared_roster' or is_participant=true);
 select jsonb_build_object('paid_amount',paid_amount,'updated_at',updated_at) into advance from public.settlement_prepayments where event_id=ev and organization_key=p_org::text;
 paid:=coalesce((advance->>'paid_amount')::bigint,0);
 select jsonb_build_object('payment_method',payment_method,'bank_details',bank_details,'updated_at',updated_at) into instruction from public.settlement_payment_instructions where event_id=ev and organization_key=p_org::text;
 select coalesce(sum(case when reverses_id is null then amount else -amount end),0) into payment from public.fhs_winter_extra_payments where event_id=ev and organization_key=p_org;
 select coalesce(sum(delta),0),coalesce(jsonb_agg(jsonb_build_object('id',id,'delta',delta,'reason',reason,'before_total',before_total,'after_total',after_total) order by sequence),'[]') into adjustment,corrections from public.fhs_winter_charge_adjustments where event_id=ev and organization_key=p_org;
 select coalesce(sum(fee_amount),0) into extra from public.reception_requests where event_id=ev and organization_id=p_org and status='reflected';
 select extra+coalesce(sum(case when reverses_id is null then fee_amount else -fee_amount end),0) into extra from public.fhs_winter_settlement_only where event_id=ev and organization_key=p_org;
 select count(*) into pending from public.reception_requests where event_id=ev and organization_id=p_org and status='pending';
 select count(*) into missing from public.entries e where e.event_id=ev and e.organization_id=p_org
 and not exists(select 1 from public.fhs_winter_initial_entries i where i.id=e.id and i.event_id=ev)
 and not exists(select 1 from public.reception_requests q where q.entry_id=e.id and q.event_id=ev and q.status='reflected')
 and not (e.status in ('wd','withdrawn') and exists(select 1 from public.reception_requests q where q.entry_id=e.id and q.event_id=ev and q.status='cancelled' and (q.request_type='add' or q.request_type='change' and q.payload->>'treatedAsWithdrawAdd'='true')));
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'action',case q.request_type when 'add' then '追加' when 'change' then '変更' else '棄権' end,
 'competitionLabel',case when bc.id is not null and bc.id<>c.id then bc.name||' → ' else '' end||case when c.competition_no~'^[0-9]+$' then '第'||c.competition_no||'競技 ' else c.competition_no||' ' end||c.name,
 'rider',case when br.id is not null and br.id<>r.id then br.name||' → ' else '' end||r.name,
 'horse',case when bh.id is not null and bh.id<>h.id then bh.name||' → ' else '' end||h.name,'amount',q.fee_amount)
 order by c.competition_date,coalesce(nullif(regexp_replace(c.competition_no,'[^0-9]','','g'),''),'0')::integer,q.id),'[]') into lines
 from public.reception_requests q join public.competitions c on c.id=q.target_competition_id and c.event_id=ev join public.riders r on r.id=q.rider_id and r.event_id=ev join public.horses h on h.id=q.horse_id and h.event_id=ev
 left join public.competitions bc on bc.id=nullif(q.payload->'before'->>'competitionId','')::uuid and bc.event_id=ev
 left join public.riders br on br.id=nullif(q.payload->'before'->>'riderId','')::uuid and br.event_id=ev
 left join public.horses bh on bh.id=nullif(q.payload->'before'->>'horseId','')::uuid and bh.event_id=ev
 where q.event_id=ev and q.organization_id=p_org and q.status='reflected';
 if jsonb_array_length(lines)<>(select count(*) from public.reception_requests where event_id=ev and organization_id=p_org and status='reflected') then raise exception '明細の人馬・競技を確認できません';end if;
 select lines||coalesce(jsonb_agg(jsonb_build_object('id',q.id,'action',case q.action_type when 'change' then '現場変更' when 'withdraw' then '現場棄権' else '現場追加' end||case when q.reverses_id is null then '' else '取消' end,'competitionLabel',case when bc.id is not null and bc.id<>c.id then bc.name||' → ' else '' end||case when c.competition_no~'^[0-9]+$' then '第'||c.competition_no||'競技 ' else c.competition_no||' ' end||c.name,'rider',case when br.id is not null and br.id<>r.id then br.name||' → ' else '' end||r.name,'horse',case when bh.id is not null and bh.id<>h.id then bh.name||' → ' else '' end||h.name,'amount',case when q.reverses_id is null then q.fee_amount else -q.fee_amount end) order by q.created_at,q.id),'[]') into lines
 from public.fhs_winter_settlement_only q join public.competitions c on c.id=(q.inputs->>'competitionId')::uuid and c.event_id=ev join public.riders r on r.id=(q.inputs->>'riderId')::uuid and r.event_id=ev join public.horses h on h.id=(q.inputs->>'horseId')::uuid and h.event_id=ev left join public.competitions bc on bc.id=nullif(q.inputs->'before'->>'competitionId','')::uuid and bc.event_id=ev left join public.riders br on br.id=nullif(q.inputs->'before'->>'riderId','')::uuid and br.event_id=ev left join public.horses bh on bh.id=nullif(q.inputs->'before'->>'horseId','')::uuid and bh.event_id=ev where q.event_id=ev and q.organization_key=p_org;
 if jsonb_array_length(lines)<>(select count(*) from public.reception_requests where event_id=ev and organization_id=p_org and status='reflected')+(select count(*) from public.fhs_winter_settlement_only where event_id=ev and organization_key=p_org) then raise exception '現場登録明細の人馬・競技を確認できません';end if;
 if pending>0 then warnings:=warnings||jsonb_build_array('未反映の申請があります。本部での反映後に再確認してください。');end if;
 if advance is null and initial+headcount*14000>0 then warnings:=warnings||jsonb_build_array('事前入金は未確認です。本部に確認してください。');end if;
 if missing>0 then warnings:=warnings||jsonb_build_array('料金履歴を確認できない出番があります。本部に確認してください。');end if;
 if initial+headcount*14000+extra+adjustment-paid-payment<0 then warnings:=warnings||jsonb_build_array('過入金があります。返金・充当を本部に確認してください。');end if;
 if initial+headcount*14000+extra+adjustment<0 then raise exception '請求額を確認できません';end if;
 a:=jsonb_build_object('organization',org,'normalTotal',initial,'horseRegistration',jsonb_build_object('count',headcount,'unitFee',14000,'total',headcount*14000,'horses',horses),
 'initialTotal',initial+headcount*14000,'extraTotal',extra,'adjustmentTotal',adjustment,'total',initial+headcount*14000+extra+adjustment,
 'advance',advance,'advancePaid',paid,'extraPaid',payment,'remaining',initial+headcount*14000+extra+adjustment-paid-payment,'instruction',instruction,'adjustments',corrections,'lines',lines,'warnings',warnings,'pending',pending);
 version:=encode(extensions.digest(a::text,'sha256'),'hex');
 return jsonb_build_object('account',a,'version',version);
end;$function$

