from __future__ import annotations

import unittest

from tools.hardening.restore_rehearsal import run_restore_rehearsal


class RestoreRehearsalTest(unittest.TestCase):
    def test_restore_rehearsal_uses_synthetic_data_only(self) -> None:
        result = run_restore_rehearsal()
        self.assertEqual(result["result"], "PASS")
        self.assertEqual(result["errors"], [])


if __name__ == "__main__":
    unittest.main()
