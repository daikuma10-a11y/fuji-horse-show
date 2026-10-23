import copy
import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('jef_source', Path(__file__).parents[1] / 'scripts/prepare-jef-master.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SourcePreparation(unittest.TestCase):
    def fixture(self, kind='members', grade='B(D)'):
        url = 'https://www.equitation-japan.com/index.php?menuindex=' + ('101-102' if kind == 'members' else '102-102')
        cells = [123, 'ゴウセイ<br><a href="/synthetic"> 合成&amp;確認 </a>', '合成地域<br>' + grade] + ['-'] * 9
        if kind == 'horses':
            cells = cells[:9]
            cells[5] = grade + '<br />'
        source = {'source': url, 'as_of': '2026-10-04', 'expected_count': 1, 'rows': [{'cell': cells}]}
        dictionary = {'source': url, 'as_of_japan': '2026-10-04', 'count': 1, 'records': [{'jef_id': '123', 'name': '合成&確認', 'official_reading': 'ゴウセイ'}]}
        return source, dictionary

    def test_source_and_limited_grade_preserved(self):
        source, dictionary = self.fixture()
        before = copy.deepcopy(source)
        row = module.prepare_rows('members', source, dictionary, 'synthetic-sha')[0]
        self.assertEqual(row['member_no'], '123')
        self.assertEqual(row['rider_grade'], 'B(D)')
        self.assertEqual(row['raw_data']['source_date'], '2026-10-04')
        self.assertEqual(row['raw_data']['official_reading'], 'ゴウセイ')
        self.assertEqual(source, before)

    def test_empty_grade_is_unknown(self):
        for kind, grade, key in [('members', '-', 'rider_grade'), ('horses', '', 'grade')]:
            with self.subTest(kind=kind):
                source, dictionary = self.fixture(kind, grade)
                row = module.prepare_rows(kind, source, dictionary, 'synthetic-sha')[0]
                self.assertIsNone(row[key])
                self.assertEqual(row['raw_data']['grade_original'], grade)

    def test_mismatches_and_duplicates_stop(self):
        for fault in ['number', 'name', 'count', 'date', 'markup', 'duplicate']:
            with self.subTest(fault=fault):
                source, dictionary = self.fixture()
                if fault == 'number': source['rows'][0]['cell'][0] = '456'
                if fault == 'name': dictionary['records'][0]['name'] = '別名'
                if fault == 'count': source['expected_count'] = 2
                if fault == 'date': dictionary['as_of_japan'] = '2026-10-05'
                if fault == 'markup': source['rows'][0]['cell'][1] += '<script>unexpected</script>'
                if fault == 'duplicate':
                    source['rows'] *= 2
                    dictionary['records'] *= 2
                    source['expected_count'] = dictionary['count'] = 2
                with self.assertRaises(ValueError): module.prepare_rows('members', source, dictionary, 'synthetic-sha')

    def test_archive_hash_checked_before_parsing(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'source.zip'
            path.write_bytes(b'synthetic-not-a-zip')
            with self.assertRaisesRegex(ValueError, 'checksum'): module.prepare(path, 'incorrect')


if __name__ == '__main__':
    unittest.main()
