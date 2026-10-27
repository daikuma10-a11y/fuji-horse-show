#!/usr/bin/env python3
"""Prepare dated JEF lookup data from the retained archive; no network or DB writes."""
import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from zipfile import ZipFile


class CellText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag == 'br':
            self.parts.append('\n')
        elif tag != 'a':
            raise ValueError('Unexpected source markup')

    def handle_data(self, data):
        self.parts.append(data)


def lines(value):
    if not isinstance(value, str):
        raise ValueError('Source cells must be text')
    parser = CellText()
    parser.feed(value)
    parser.close()
    return ''.join(parser.parts).split('\n')


def prepare_rows(kind, source, dictionary, digest):
    date = source['as_of']
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
        raise ValueError('Missing source date')
    expected_url = 'https://www.equitation-japan.com/index.php?menuindex=' + ('101-102' if kind == 'members' else '102-102')
    if source['source'] != expected_url or dictionary['source'] != expected_url or dictionary['as_of_japan'] != date:
        raise ValueError('Source provenance mismatch')
    rows, records = source['rows'], dictionary['records']
    if len(rows) != source['expected_count'] or len(records) != dictionary['count'] or len(rows) != len(records):
        raise ValueError('Source count mismatch')
    indexed = {r['jef_id']: r for r in records}
    if len(indexed) != len(records):
        raise ValueError('Duplicate dictionary number')
    result, seen = [], set()
    for row in rows:
        cells = row['cell']
        if len(cells) != (12 if kind == 'members' else 9):
            raise ValueError('Unexpected source columns')
        if type(cells[0]) not in (str, int):
            raise ValueError('Invalid number type')
        number = str(cells[0]).strip()
        if not re.fullmatch(r'\d+', number) or number in seen:
            raise ValueError('Invalid or duplicate source number')
        seen.add(number)
        record = indexed.get(number)
        names = [part.strip() for part in lines(cells[1])]
        if not record or len(names) != 2 or names != [record['official_reading'], record['name']]:
            raise ValueError('Source name/reading mismatch')
        if kind == 'members':
            detail = lines(cells[2])
            if len(detail) != 2:
                raise ValueError('Unexpected qualification cell')
            grade = detail[1].strip()
        else:
            grade = '\n'.join(v.strip() for v in lines(cells[5]) if v.strip())
        result.append({
            'import_date': date,
            ('member_no' if kind == 'members' else 'registration_no'): number,
            'name': record['name'],
            ('rider_grade' if kind == 'members' else 'grade'): grade if grade not in ('', '-') else None,
            'raw_data': {
                'official_reading': record['official_reading'],
                'grade_original': grade,
                'source_url': expected_url,
                'source_date': date,
                'source_archive_sha256': digest,
            },
        })
    return result


def prepare(archive, expected_sha256):
    data = Path(archive).read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != expected_sha256:
        raise ValueError('Archive checksum mismatch')
    with ZipFile(archive) as z:
        tables = {}
        for kind, table in [('members', 'jef_rider_master'), ('horses', 'jef_horse_master')]:
            tables[table] = prepare_rows(kind, json.loads(z.read('原本/' + kind + '-raw.json')), json.loads(z.read(kind + '.json')), digest)
    return {'kind': 'jef-master-import-source', 'version': 1, 'archive_sha256': digest,
            'counts': {table: len(rows) for table, rows in tables.items()}, 'tables': tables}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive')
    parser.add_argument('sha256')
    parser.add_argument('output')
    args = parser.parse_args()
    result = prepare(args.archive, args.sha256)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'counts': result['counts'], 'archive_sha256': result['archive_sha256']}, ensure_ascii=False))
