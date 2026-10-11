with pairs as (
  select s.id source_id,s.op_status,e.id entry_id
  from public.startlist_source_snapshot s
  join public.competitions c on c.event_id=s.event_id and c.competition_no=s.competition_no
  join public.entries e on e.event_id=s.event_id and e.competition_id=c.id
  join public.riders r on r.id=e.rider_id
  join public.horses h on h.id=e.horse_id
  join public.organizations o on o.id=e.organization_id
  where s.event_id='2af66251-66a2-4c51-8180-a5badf0584d4'::uuid
    and s.op_status is null
    and regexp_replace(r.name,'[[:space:]　]','','g')=regexp_replace(s.rider_name,'[[:space:]　]','','g')
    and regexp_replace(h.name,'[[:space:]　]','','g')=regexp_replace(s.horse_name,'[[:space:]　]','','g')
    and regexp_replace(o.name,'[[:space:]　]','','g')=regexp_replace(s.organization_name,'[[:space:]　]','','g')
), unique_pairs as (
  select source_id,entry_id from (
    select p.*,count(*) over(partition by source_id) source_matches,
      count(*) over(partition by entry_id) entry_matches
    from pairs p
  ) ranked where source_matches=1 and entry_matches=1
)
update public.entries e set is_op=false,op_source_snapshot_id=p.source_id,updated_at=now()
from unique_pairs p
where e.id=p.entry_id and e.event_id='2af66251-66a2-4c51-8180-a5badf0584d4'::uuid
  and e.is_op is null;