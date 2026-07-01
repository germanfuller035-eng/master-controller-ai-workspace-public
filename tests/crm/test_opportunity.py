import unittest

from tools.crm import FIXTURE_DIR, load_json
from tools.crm.opportunity import validate_opportunity


class OpportunityTests(unittest.TestCase):
    def test_opportunity_validates_as_draft_only(self):
        result = validate_opportunity(load_json(FIXTURE_DIR / "synthetic_opportunity.json"))
        self.assertEqual(result["status"], "PASS")
        self.assertTrue(result["draft_only"])
        self.assertFalse(result["crm_write_allowed"])


if __name__ == "__main__":
    unittest.main()
