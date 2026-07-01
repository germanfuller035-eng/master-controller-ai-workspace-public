import unittest
from tools.commercial.contact_completeness import measure_contact_completeness
from tests.commercial.common import lead

class ContactCompletenessTests(unittest.TestCase):
    def test_missing_contact_lowers_completeness(self):
        clean = measure_contact_completeness(lead("synthetic_lead_clean.json"))
        missing = measure_contact_completeness(lead("synthetic_lead_missing_contact.json"))
        self.assertGreater(clean["score"], missing["score"])
        self.assertEqual(clean["status"], "COMPLETE")
        self.assertEqual(missing["status"], "PARTIAL")
