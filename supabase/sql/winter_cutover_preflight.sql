-- Read-only: use before preparing/activating Winter. No rows are modified.
with target as (
 select * from public.events where id='b571f05e-ed23-4e07-929e-be2b73e601a5'::uuid
), expected as (
 select n::text as competition_no from generate_series(1,36) n
 union all select unnest(array['①','②','③','④'])
), actual as (
 select * from public.competitions where event_id='b571f05e-ed23-4e07-929e-be2b73e601a5'::uuid
)
select jsonb_build_object(
 'event',(select to_jsonb(t) from target t),
 'missing_competitions',(select coalesce(jsonb_agg(e.competition_no order by e.competition_no),'[]'::jsonb) from expected e where not exists(select 1 from actual a where a.competition_no::text=e.competition_no)),
 'duplicate_numbers',(select coalesce(jsonb_agg(d),'[]'::jsonb) from (select competition_no,count(*) from actual group by competition_no having count(*)>1) d),
 'fees_requiring_review',(select coalesce(jsonb_agg(jsonb_build_object('number',competition_no,'name',name,'fee',fee)),'[]'::jsonb) from actual where fee is null or fee<=0),
 'counts',jsonb_build_object(
  'competitions',(select count(*) from actual),
  'organizations',(select count(*) from public.organizations where event_id=(select id from target)),
  'riders',(select count(*) from public.riders where event_id=(select id from target)),
  'horses',(select count(*) from public.horses where event_id=(select id from target)),
  'entries',(select count(*) from public.entries where event_id=(select id from target)),
  'requests',(select count(*) from public.reception_requests where event_id=(select id from target))
 )
) as winter_preflight;
