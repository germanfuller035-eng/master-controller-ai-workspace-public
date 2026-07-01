import unittest
from tools.commercial.lead_intelligence import enter_pipeline
from tests.commercial.common import lead

class LeadIntelligenceTests(unittest.TestCase):
    def test_clean_synthetic_lead_enters_pipeline(self):
        result = enter_pipeline(lead("synthetic_lead_clean.json"))
        self.assertEqual(result["entry_status"], "ACCEPTED_LOCAL_SYNTHETIC")
        self.assertFalse(result["network_used"])
        self.assertFalse(result["production_write"])
