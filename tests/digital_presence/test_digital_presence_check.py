import unittest

from tools.digital_presence.digital_presence_check import digital_presence_check

from tests.digital_presence.common import site


class DigitalPresenceCheckTests(unittest.TestCase):
    def test_good_synthetic_site_scores_well(self):
        result = digital_presence_check(site("synthetic_site_good.json"))
        self.assertEqual(result["status"], "PASS")
        self.assertGreaterEqual(result["website_quality_score"], 90)
        self.assertEqual(result["lead_capture_status"], "READY")
        self.assertFalse(result["browser_used"])
        self.assertFalse(result["real_external_url_accessed"])

    def test_no_lead_capture_is_detected(self):
        result = digital_presence_check(site("synthetic_site_no_lead_capture.json"))
        self.assertEqual(result["lead_capture_status"], "MISSING")
        self.assertLess(result["lead_capture_score"], 40)


if __name__ == "__main__":
    unittest.main()
