import unittest

from tools.owner_control.cost_panel import cost_panel


class CostPanelTests(unittest.TestCase):
    def test_budget_and_cost_evidence_visible(self):
        result = cost_panel()
        self.assertIn("budget", result)
        self.assertIn("synthetic_spend", result)
        self.assertTrue(result["evidence"])
