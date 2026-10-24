#!/usr/bin/env python3
"""Generate one bounded, idempotent JEF source batch; execute only on the approved backend."""
import argparse
import hashlib
import json
from pathlib import Path

TABLES = {'jef_rider_master': ('member_no', 'rider_grade'), 'jef_horse_master': ('registration_no', 'grade')}


def sql_for_rows(table, rows):
    if table not in TABLES or not 1 <= len(rows) <= 500:
        raise ValueError('Invalid table or batch size')
    number, grade = TABLES[table]
    if len({(r['import_date'], r[number]) for r in rows}) != len(rows):
        raise ValueError('Duplicate source key')
    # Standard-conforming SQL literals; all table/column identifiers come from the whitelist.
    payload = json.dumps(rows, ensure_ascii=False, separators=(',', ':')).replace("'", "''")
    marker = '$jef_import$'
    while marker in payload:
        marker = marker[:-1] + '_x$'
    return f"""begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local standard_conforming_strings = on;
lock table public.{table} in share row exclusive mode;
do {marker}
declare row_data jsonb; prior record;
begin
 if not (select relrowsecurity from pg_class where oid='public.{table}'::regclass)
 or has_table_privilege('anon','public.{table}','SELECT')
 or has_table_privilege('anon','public.{table}','INSERT')
 or has_table_privilege('authenticated','public.{table}','INSERT') then
  raise exception 'JEF master access protection must be verified before import';
 end if;
 for row_data in select value from jsonb_array_elements('{payload}'::jsonb) loop
  if row_data->>'{number}' !~ '^\\d+$' or coalesce(row_data->>'name','')=''
   or row_data->>'import_date' is distinct from row_data->'raw_data'->>'source_date' then
   raise exception 'Invalid JEF source row';
  end if;
  select name,{grade},raw_data into prior from public.{table}
   where import_date=(row_data->>'import_date')::date and {number}=row_data->>'{number}';
  if found then
   if prior.name is distinct from row_data->>'name'
    or prior.{grade} is distinct from row_data->>'{grade}'
    or prior.raw_data is distinct from row_data->'raw_data' then
    raise exception 'Conflicting dated JEF record; existing data was not overwritten';
   end if;
  else
   insert into public.{table}(import_date,{number},name,{grade},raw_data)
    values ((row_data->>'import_date')::date,row_data->>'{number}',row_data->>'name',row_data->>'{grade}',row_data->'raw_data');
  end if;
 end loop;
end {marker};
commit;
select '{table}' as table_name, count(*) as stored_rows from public.{table};
"""


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source')
    parser.add_argument('sha256')
    parser.add_argument('table', choices=list(TABLES))
    parser.add_argument('offset', type=int)
    parser.add_argument('limit', type=int)
    args = parser.parse_args()
    data = Path(args.source).read_bytes()
    if hashlib.sha256(data).hexdigest() != args.sha256 or args.offset < 0 or not 1 <= args.limit <= 500:
        raise ValueError('Source checksum or batch parameters do not match')
    doc = json.loads(data)
    rows = doc['tables'][args.table]
    if doc['counts'][args.table] != len(rows):
        raise ValueError('Source count mismatch')
    print(sql_for_rows(args.table, rows[args.offset:args.offset + args.limit]))
