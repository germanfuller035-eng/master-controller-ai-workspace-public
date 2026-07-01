import unittest
from tools.commercial.qualification import qualify_lead
from tests.commercial.common import lead

class QualificationTests(unittest.TestCase):
    def test_clean_qualifies_and_low_fit_parks_or_rejects(self):
        self.assertEqual(qualify_lead(lead("synthetic_lead_clean.json"))["qualification_status"], "QUALIFIED")
        self.assertIn(qualify_lead(lead("synthetic_lead_low_fit.json"))["qualification_status"], {"PARKED", "REJECTED"})
