import unittest

from tools.owner_control.stop_panel import stop_panel


class StopPanelTests(unittest.TestCase):
    def test_stop_blocks_risky_actions(self):
        result = stop_panel()
        for action in ["outbound_send", "browser_action", "voice_risky_action", "payment_operation", "production_deploy", "production_db_write"]:
            self.assertIn(action, result["blocked_actions"])
