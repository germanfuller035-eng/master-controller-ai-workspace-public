import unittest

from tools.controlled_outbound import FIXTURE_DIR, load_json
from tools.controlled_outbound.suppression import check_suppression


class SuppressionTests(unittest.TestCase):
    def test_suppressed_contact_blocked(self):
        result = check_suppression(load_json(FIXTURE_DIR / "synthetic_suppressed_contact.json"))
        self.assertEqual(result["decision"], "BLOCK")
        self.assertFalse(result["outbound_allowed"])
        self.assertFalse(result["payment_allowed"])
        self.assertFalse(result["production_db_write_allowed"])


if __name__ == "__main__":
    unittest.main()
