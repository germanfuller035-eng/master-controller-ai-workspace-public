from __future__ import annotations

import unittest

from tools.hardening.common import release_gate_decision


class ReleaseGateTest(unittest.TestCase):
    def test_release_gate_blocks_by_default(self) -> None:
        decision = release_gate_decision()
        self.assertEqual(decision["result"], "BLOCKED_PENDING_OWNER_GATE")
        self.assertIn("merge", decision["blocked"])
        self.assertIn("tag", decision["blocked"])
        self.assertIn("deploy", decision["blocked"])
        self.assertFalse(decision["release_tag_created"])
        self.assertFalse(decision["merge_done"])
        self.assertFalse(decision["deploy_done"])


if __name__ == "__main__":
    unittest.main()
