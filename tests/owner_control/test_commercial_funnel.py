import unittest

from tools.owner_control.commercial_funnel import commercial_funnel


class CommercialFunnelTests(unittest.TestCase):
    def test_funnel_shows_no_send_state(self):
        result = commercial_funnel()
        self.assertFalse(result["send_allowed"])
        self.assertEqual(result["outbound_count"], 0)
