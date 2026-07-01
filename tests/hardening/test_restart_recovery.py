from __future__ import annotations

import unittest

from tools.hardening.restart_recovery_sim import simulate_restart_recovery


class RestartRecoveryTest(unittest.TestCase):
    def test_restart_recovery_preserves_blocked_actions_without_replay(self) -> None:
        result = simulate_restart_recovery()
        self.assertEqual(result["result"], "PASS")
        self.assertEqual(result["errors"], [])


if __name__ == "__main__":
    unittest.main()
