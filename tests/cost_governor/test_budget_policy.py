from __future__ import annotations

import unittest

from tools.cost_governor.budget_policy import BudgetPolicy


class BudgetPolicyTests(unittest.TestCase):
    def test_monthly_cap_enforced(self) -> None:
        decision = BudgetPolicy().enforce("routine", {"estimated_rub": 10}, requested_task_budget_rub=100, monthly_spend_rub=19995)
        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["reason"], "MONTHLY_CAP_EXCEEDED")

    def test_task_cap_enforced(self) -> None:
        decision = BudgetPolicy().enforce("routine", {"estimated_rub": 400}, requested_task_budget_rub=500, monthly_spend_rub=0)
        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["reason"], "TASK_CAP_EXCEEDED")

    def test_expensive_task_requires_stop_loss(self) -> None:
        decision = BudgetPolicy().enforce("critical", {"estimated_rub": 10}, requested_task_budget_rub=100, monthly_spend_rub=0, stop_loss_ack=False)
        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["reason"], "STOP_LOSS_REQUIRED")

    def test_expensive_task_allows_with_stop_loss(self) -> None:
        decision = BudgetPolicy().enforce("critical", {"estimated_rub": 10}, requested_task_budget_rub=100, monthly_spend_rub=0, stop_loss_ack=True)
        self.assertTrue(decision["allowed"])

    def test_unlimited_loop_denied(self) -> None:
        decision = BudgetPolicy().enforce("routine", {"estimated_rub": 1}, max_iterations="UNLIMITED")
        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["reason"], "UNLIMITED_LOOP_DENIED")


if __name__ == "__main__":
    unittest.main()
