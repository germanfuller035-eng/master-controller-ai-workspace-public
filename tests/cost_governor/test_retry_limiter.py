from __future__ import annotations

import unittest

from tools.cost_governor.cost_validator import validate
from tools.cost_governor.retry_limiter import RetryLimiter


class RetryLimiterTests(unittest.TestCase):
    def test_retry_budget_enforced(self) -> None:
        decision = RetryLimiter().enforce(1, retry_budget_spent_rub=700)
        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["reason"], "RETRY_BUDGET_EXCEEDED")

    def test_retry_count_greater_than_max_denied(self) -> None:
        decision = RetryLimiter().enforce(3)
        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["reason"], "RETRY_LIMIT_EXCEEDED")

    def test_retry_within_limit_allowed(self) -> None:
        decision = RetryLimiter().enforce(2)
        self.assertTrue(decision["allowed"])

    def test_cost_config_validates(self) -> None:
        status, errors, _loaded = validate()
        self.assertEqual(status, "PASS", errors)


if __name__ == "__main__":
    unittest.main()
