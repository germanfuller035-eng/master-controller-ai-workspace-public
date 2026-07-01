import unittest

from tools.digital_presence.website_analysis import website_quality_score

from tests.digital_presence.common import site


class WebsiteAnalysisTests(unittest.TestCase):
    def test_bad_synthetic_site_identifies_evidence_backed_issues(self):
        result = website_quality_score(site("synthetic_site_bad.json"))
        self.assertEqual(result["status"], "POOR")
        self.assertLess(result["score"], 55)
        self.assertTrue(result["issues"])
        self.assertTrue(all(issue.get("evidence_id") for issue in result["issues"]))
        self.assertFalse(result["browser_used"])
        self.assertFalse(result["network_used"])


if __name__ == "__main__":
    unittest.main()
