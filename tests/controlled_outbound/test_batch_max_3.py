import unittest

from tools.controlled_outbound import FIXTURE_DIR, load_json
from tools.controlled_outbound.batch_max_3 import validate_batch_max_3


class BatchMax3Tests(unittest.TestCase):
    def test_batch_allows_three_and_blocks_fourth(self):
        batch = load_json(FIXTURE_DIR / "no_send_batch_max_3.json")
        drafts = [load_json(path) for path in batch["draft_fixtures"]]
        result = validate_batch_max_3(batch, drafts)
        self.assertEqual(result["allowed_count"], 3)
        self.assertEqual(result["blocked_count"], 1)
        self.assertTrue(result["fourth_draft_blocked"])
        self.assertEqual(len(result["batch_payload_hash"]), 64)


if __name__ == "__main__":
    unittest.main()
