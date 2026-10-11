alter table public.entries add column if not exists is_op boolean;
alter table public.entries add column if not exists op_source_snapshot_id uuid references public.startlist_source_snapshot(id);
comment on column public.entries.is_op is 'true: OP先乗りで正式成績から除外、false: 通常出場、null: 未確認';
with pairs as (
  select s.id source_id,s.op_status,e.id entry_id
  from public.startlist_source_snapshot s
  join public.competitions c on c.event_id=s.event_id and c.competition_no=s.competition_no
  join public.entries e on e.event_id=s.event_id and e.competition_id=c.id
  join public.riders r on r.id=e.rider_id
  join public.horses h on h.id=e.horse_id
  join public.organizations o on o.id=e.organization_id
  where s.event_id='2af66251-66a2-4c51-8180-a5badf0584d4'::uuid
    and regexp_replace(r.name,'[[:space:]　]','','g')=regexp_replace(s.rider_name,'[[:space:]　]','','g')
    and regexp_replace(h.name,'[[:space:]　]','','g')=regexp_replace(s.horse_name,'[[:space:]　]','','g')
    and regexp_replace(o.name,'[[:space:]　]','','g')=regexp_replace(s.organization_name,'[[:space:]　]','','g')
), unique_pairs as (
  select source_id,op_status,entry_id
  from (select p.*, count(*) over(partition by source_id) source_count,
         count(*) over(partition by entry_id) entry_count from pairs p) ranked
  where source_count=1 and entry_count=1
)
update public.entries e
set is_op=(p.op_status='ＯＰ'),op_source_snapshot_id=p.source_id,updated_at=now()
from unique_pairs p
where e.id=p.entry_id and e.event_id='2af66251-66a2-4c51-8180-a5badf0584d4'::uuid
  and (p.op_status='ＯＰ' or p.op_status is null)
  and e.is_op is null;
create or replace view public.reception_entries as  SELECT e.id AS entry_id,
    e.event_id,
    c.id AS competition_id,
    c.competition_no,
    c.competition_date,
    c.arena,
    c.name AS competition_name,
    e.start_order,
    e.status,
    e.source,
    e.request_note,
    r.id AS rider_id,
    r.name AS rider_name,
    r.jef_member_no,
    r.jef_rider_no,
    r.is_participant AS rider_pre_registered,
    r.roster_source AS rider_roster_source,
    h.id AS horse_id,
    h.name AS horse_name,
    h.jef_registration_no,
    h.is_participant AS horse_pre_registered,
    h.roster_source AS horse_roster_source,
    o.id AS organization_id,
    o.name AS organization_name,
    e.created_at,
    e.updated_at,
    e.is_op,
    (lower(coalesce(e.status, 'active')) not in ('wd','withdrawn') and e.is_op is false) AS result_eligible
   FROM public.entries e
     JOIN public.competitions c ON c.id = e.competition_id
     JOIN public.riders r ON r.id = e.rider_id
     JOIN public.horses h ON h.id = e.horse_id
     LEFT JOIN public.organizations o ON o.id = e.organization_id;
