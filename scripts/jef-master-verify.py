#!/usr/bin/env python3
"""Print local digests and read-only SQL for complete, ordered JEF source verification."""
import argparse
import hashlib
import json
from pathlib import Path

TABLES = {'jef_rider_master': ('member_no', 'rider_grade'), 'jef_horse_master': ('registration_no', 'grade')}
RAW_KEYS = ['official_reading', 'grade_original', 'source_url', 'source_date', 'source_archive_sha256']


def encoded(value):
    if value is None:
        return b'-1:'
    raw = value.encode('utf-8')
    return str(len(raw)).encode('ascii') + b':' + raw


def verification(doc):
    result = {}
    for table, (number, grade) in TABLES.items():
        rows = sorted(doc['tables'][table], key=lambda r: (r[number].encode('utf-8'), r['import_date']))
        if len(rows) != doc['counts'][table]:
            raise ValueError('Source count mismatch')
        digest = hashlib.sha256()
        for row in rows:
            if set(row['raw_data']) != set(RAW_KEYS):
                raise ValueError('Unexpected source fields')
            for value in [row['import_date'], row[number], row['name'], row[grade], *[row['raw_data'][key] for key in RAW_KEYS]]:
                digest.update(encoded(value))
        fields = ['import_date::text', number, 'name', grade, *[f"raw_data->>'{key}'" for key in RAW_KEYS]]
        parts = [f"case when ({field}) is null then '-1:' else octet_length(({field}))::text || ':' || ({field}) end" for field in fields]
        row_sql = ' || '.join(f'({part})' for part in parts)
        keys_sql = ','.join(f"'{key}'" for key in RAW_KEYS)
        query = f"""select '{table}' as table_name, count(*) as stored_rows,
 encode(sha256(convert_to(coalesce(string_agg({row_sql}, '' order by {number} collate \"C\", import_date), ''), 'UTF8')), 'hex') as source_digest,
 count(*) filter (where raw_data is null or jsonb_typeof(raw_data) <> 'object' or not raw_data ?& array[{keys_sql}] or raw_data - array[{keys_sql}] <> '{{}}'::jsonb) as invalid_raw_fields,
 min(import_date)::text as earliest_source_date, max(import_date)::text as latest_source_date
 from public.{table};"""
        result[table] = {'expected_rows': len(rows), 'expected_digest': digest.hexdigest(), 'read_only_sql': query}
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source')
    parser.add_argument('sha256')
    args = parser.parse_args()
    data = Path(args.source).read_bytes()
    if hashlib.sha256(data).hexdigest() != args.sha256:
        raise ValueError('Source checksum does not match')
    print(json.dumps(verification(json.loads(data)), ensure_ascii=False))
