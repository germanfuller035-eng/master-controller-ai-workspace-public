import unittest

from tools.controlled_outbound import FIXTURE_DIR, load_json
from tools.controlled_outbound.outbound_draft import validate_outbound_draft


class OutboundDraftTests(unittest.TestCase):
    def test_outbound_draft_created_but_not_sent_with_hash(self):
        result = validate_outbound_draft(load_json(FIXTURE_DIR / "synthetic_outbound_draft_1.json"))
        self.assertEqual(result["status"], "PASS")
        self.assertFalse(result["send_allowed"])
        self.assertFalse(result["sent"])
        self.assertEqual(result["outbound_count"], 0)
        self.assertEqual(len(result["payload_hash"]), 64)


if __name__ == "__main__":
    unittest.main()
