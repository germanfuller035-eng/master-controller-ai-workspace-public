import unittest
from tools.browser_contracts.core import validate_browser_evidence, load_json, FIXTURE_DIR

class BrowserEvidenceTests(unittest.TestCase):
    def test_evidence_requires_artifact_hash(self):
        result = validate_browser_evidence(load_json(FIXTURE_DIR / 'synthetic_browser_evidence_record.json'))
        self.assertEqual(result['status'], 'PASS')
