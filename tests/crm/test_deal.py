import unittest

from tools.crm import FIXTURE_DIR, load_json
from tools.crm.deal import validate_deal


class DealTests(unittest.TestCase):
    def test_deal_validates_as_draft_only(self):
        result = validate_deal(load_json(FIXTURE_DIR / "synthetic_deal.json"))
        self.assertEqual(result["status"], "PASS")
        self.assertTrue(result["draft_only"])
        self.assertFalse(result["crm_write_allowed"])


if __name__ == "__main__":
    unittest.main()
