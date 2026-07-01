from __future__ import annotations

import unittest

from tests.runtime.test_runtime_feature_flags import request
from tools.runtime.runtime_adapter import RuntimeAdapter
from tools.runtime.runtime_stop import enforce_stop


class RuntimeStopTests(unittest.TestCase):
    def test_stop_blocks_runtime(self) -> None:
        response = RuntimeAdapter().handle(request(stop_state={"active": True}))
        self.assertEqual(response["status"], "DENIED")
        self.assertEqual(response["error_code"], "STOP_BLOCKED")

    def test_stop_policy_reports_revocation(self) -> None:
        decision = enforce_stop({"state": "STOP_ACTIVE"})
        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["decision"], "STOP_BLOCKED")


if __name__ == "__main__":
    unittest.main()
