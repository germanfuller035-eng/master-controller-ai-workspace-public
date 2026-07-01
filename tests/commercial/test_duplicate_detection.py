import unittest
from tools.commercial.duplicate_detection import detect_duplicate_pair
from tests.commercial.common import lead

class DuplicateDetectionTests(unittest.TestCase):
    def test_duplicate_leads_detected(self):
        result = detect_duplicate_pair(lead("synthetic_lead_duplicate_a.json"), lead("synthetic_lead_duplicate_b.json"))
        self.assertTrue(result["duplicate"])
        self.assertEqual(result["decision"], "BLOCK")
