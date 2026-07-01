import unittest
from tools.commercial.digital_presence import analyze_digital_presence
from tests.commercial.common import lead, site

class DigitalPresenceTests(unittest.TestCase):
    def test_bad_site_issue_has_evidence(self):
        result = analyze_digital_presence(lead("synthetic_lead_website_fit.json"), site("synthetic_site_bad.json"))
        self.assertTrue(result["issues"])
        self.assertTrue(all(item["evidence_id"] for item in result["issues"]))
        self.assertFalse(result["browser_used"])
