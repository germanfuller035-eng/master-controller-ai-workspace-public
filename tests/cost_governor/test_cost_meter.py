from __future__ import annotations

import unittest

from tools.cost_governor.cost_meter import CostMeter


class CostMeterTests(unittest.TestCase):
    def test_cost_estimate_deterministic(self) -> None:
        meter = CostMeter()
        first = meter.estimate("cheap_routine_model_class", 1000, 500, retry_count=1)
        second = meter.estimate("cheap_routine_model_class", 1000, 500, retry_count=1)
        self.assertEqual(first, second)
        self.assertEqual(first["estimated_rub"], 0.8)

    def test_report_contains_cost_fields(self) -> None:
        report = CostMeter().estimate("critical_best_model_class", 1000, 1000)
        self.assertIn("estimated_rub", report)
        self.assertIn("input_tokens", report)
        self.assertIn("output_tokens", report)


if __name__ == "__main__":
    unittest.main()
