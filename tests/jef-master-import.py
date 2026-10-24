import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('jef_import', Path(__file__).parents[1] / 'scripts/jef-master-import-sql.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ImportStatements(unittest.TestCase):
    def row(self):
        return {'import_date': '2026-10-04', 'member_no': '123', 'name': "合成'馬$jef_import$", 'rider_grade': 'B(D)', 'raw_data': {'source_date': '2026-10-04'}}

    def test_safe_literals_and_protected_append_only(self):
        sql = module.sql_for_rows('jef_rider_master', [self.row()])
        self.assertIn("合成''馬$jef_import$", sql)
        self.assertIn('do $jef_import_x$', sql)
        self.assertIn('relrowsecurity', sql)
        self.assertIn('share row exclusive', sql)
        self.assertIn('prior.raw_data is distinct', sql)
        self.assertIn("'B(D)'", sql.replace('"', "'"))
        self.assertNotIn('update public.', sql.lower())
        self.assertNotIn('delete from', sql.lower())

    def test_bad_table_batch_and_duplicate_rejected(self):
        for table, rows in [('invalid; drop table x', [self.row()]), ('jef_rider_master', []), ('jef_rider_master', [self.row()] * 501), ('jef_rider_master', [self.row(), self.row()])]:
            with self.assertRaises(ValueError): module.sql_for_rows(table, rows)


if __name__ == '__main__':
    unittest.main()
