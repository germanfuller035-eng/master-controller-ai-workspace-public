import unittest

from tools.owner_control.today_summary import today_summary


class TodaySummaryTests(unittest.TestCase):
    def test_today_summary_includes_one_main_action(self):
        result = today_summary()
        self.assertEqual(result["main_action_count"], 1)
        self.assertEqual(result["today_main_action_status"], "PASS")
