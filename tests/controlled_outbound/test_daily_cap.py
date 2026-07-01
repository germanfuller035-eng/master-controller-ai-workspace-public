import unittest

from tools.controlled_outbound.daily_cap import check_daily_cap


class DailyCapTests(unittest.TestCase):
    def test_daily_cap_enforced(self):
        self.assertEqual(check_daily_cap(current_count=0, requested_count=3)["decision"], "ALLOW")
        blocked = check_daily_cap(current_count=2, requested_count=2)
        self.assertEqual(blocked["decision"], "BLOCK")
        self.assertTrue(blocked["daily_cap_enforced"])


if __name__ == "__main__":
    unittest.main()
