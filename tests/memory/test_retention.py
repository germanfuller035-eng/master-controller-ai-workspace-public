from __future__ import annotations

from datetime import date
import unittest

from tools.memory.retention import apply_retention, validate_retention_rule


class RetentionTests(unittest.TestCase):
    def test_retention_rule_applies_review_date(self) -> None:
        rule = {"rule_id": "ret_rule_001", "retention": "REVIEW_30_DAYS", "review_after_days": 30, "action": "REVIEW_NOT_DELETE_AUTOMATICALLY"}
        self.assertEqual(validate_retention_rule(rule)["status"], "PASS")
        result = apply_retention({"memory_id": "memory_ret_001", "retention": "REVIEW_30_DAYS", "created_at": "2026-06-01"}, today=date.fromisoformat("2026-06-26"))
        self.assertEqual(result["review_at"], "2026-07-01")
        self.assertFalse(result["expired"])


if __name__ == "__main__":
    unittest.main()
