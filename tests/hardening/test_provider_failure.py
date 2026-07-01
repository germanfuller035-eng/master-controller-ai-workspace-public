from __future__ import annotations

import unittest

from tools.hardening.provider_failure_sim import simulate_provider_failure


class ProviderFailureTest(unittest.TestCase):
    def test_provider_failure_falls_back_without_external_call(self) -> None:
        result = simulate_provider_failure()
        self.assertEqual(result["result"], "PASS")
        self.assertTrue(result["provider_failure_detected"])
        self.assertEqual(result["fallback_used"], "LOCAL_SYNTHETIC")
        self.assertFalse(result["external_request_sent"])
        self.assertFalse(result["paid_provider_called"])


if __name__ == "__main__":
    unittest.main()
