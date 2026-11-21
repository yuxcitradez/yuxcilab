"""Integration regressions against the app database; use a minted owner session.

Run: python3 -m unittest src/test/test_history_deletion.py
Only temporary fixtures are removed; existing user history is never deleted.
"""
import json
import os
from pathlib import Path
import unittest
import uuid
import requests


class HistoryDeletionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        config = {}
        for line in Path('.env').read_text().splitlines():
            if '=' in line and not line.startswith('#'):
                key, value = line.split('=', 1)
                config[key] = value.strip().strip('"').strip("'")
        session_path = os.environ.get('TEST_AUTH_SESSION_FILE', '~/.cache/lovable-auth/session.json')
        minted = json.loads(Path(session_path).expanduser().read_text())
        cls.uid = minted['session']['user']['id']
        cls.url = config['VITE_SUPABASE_URL'].rstrip('/') + '/rest/v1/'
        cls.http = requests.Session()
        cls.http.headers.update({
            'apikey': config['VITE_SUPABASE_PUBLISHABLE_KEY'],
            'Authorization': 'Bearer ' + minted['session']['access_token'],
            'Prefer': 'return=representation',
        })
        cls.instrument = cls.call('GET', 'instruments?select=id&limit=1').json()[0]['id']
        cls.version = cls.call('GET', 'model_versions?select=id&limit=1').json()[0]['id']

    @classmethod
    def call(cls, method, path, data=None):
        response = cls.http.request(method, cls.url + path, json=data, timeout=60)
        if not response.ok:
            raise AssertionError('Fixture request failed: ' + str(response.status_code))
        return response

    def setUp(self):
        self.datasets = []
        self.runs = []

    def tearDown(self):
        for run in self.runs:
            self.call('PATCH', 'backtest_runs?id=eq.' + run, {'status': 'completed'})
            self.remove('backtest', run)
        for dataset in self.datasets:
            self.remove('dataset', dataset)

    def dataset(self):
        did = str(uuid.uuid4())
        self.call('POST', 'datasets', {
            'id': did, 'user_id': self.uid, 'instrument_id': self.instrument,
            'version': 100000 + uuid.uuid4().int % 1000000000,
            'source_filename': 'deletion-regression-fixture.csv',
        })
        self.datasets.append(did)
        return did

    def run_fixture(self, status='completed', dataset=None):
        rid = str(uuid.uuid4())
        self.call('POST', 'backtest_runs', {
            'id': rid, 'user_id': self.uid, 'model_version_id': self.version,
            'status': status, 'dataset_manifest': [{'id': dataset}] if dataset else [],
        })
        self.runs.append(rid)
        return rid

    def remove(self, kind, identifier):
        return self.http.post(self.url + 'rpc/delete_lab_history',
                              json={'_kind': kind, '_id': identifier}, timeout=60)

    def test_backtest_deletion_cascades_trades(self):
        rid = self.run_fixture()
        self.call('POST', 'backtest_trades', {'run_id': rid, 'user_id': self.uid})
        self.assertTrue(self.remove('backtest', rid).ok)
        self.assertEqual(self.call('GET', 'backtest_runs?id=eq.' + rid).json(), [])
        self.assertEqual(self.call('GET', 'backtest_trades?run_id=eq.' + rid).json(), [])
        self.runs.remove(rid)

    def test_running_backtest_cannot_be_deleted(self):
        rid = self.run_fixture('running')
        self.assertFalse(self.remove('backtest', rid).ok)
        self.assertEqual(len(self.call('GET', 'backtest_runs?id=eq.' + rid).json()), 1)

    def test_referenced_dataset_is_kept(self):
        did = self.dataset()
        self.run_fixture(dataset=did)
        self.assertFalse(self.remove('dataset', did).ok)
        self.assertEqual(len(self.call('GET', 'datasets?id=eq.' + did).json()), 1)

    def test_unused_dataset_deletion_cascades_candles(self):
        did = self.dataset()
        self.call('POST', 'market_bars', {
            'dataset_id': did, 'instrument_id': self.instrument, 'user_id': self.uid,
            'ts_utc': '2026-06-01T00:00:00Z', 'open': 1, 'high': 2, 'low': 0.5, 'close': 1.5,
        })
        self.assertTrue(self.remove('dataset', did).ok)
        self.assertEqual(self.call('GET', 'datasets?id=eq.' + did).json(), [])
        self.assertEqual(self.call('GET', 'market_bars?dataset_id=eq.' + did).json(), [])
        self.datasets.remove(did)

    def test_unsigned_caller_cannot_delete(self):
        did = self.dataset()
        response = requests.post(self.url + 'rpc/delete_lab_history',
                                 headers={'apikey': self.http.headers['apikey']},
                                 json={'_kind': 'dataset', '_id': did}, timeout=60)
        self.assertFalse(response.ok)
        self.assertEqual(len(self.call('GET', 'datasets?id=eq.' + did).json()), 1)


if __name__ == '__main__':
    unittest.main()