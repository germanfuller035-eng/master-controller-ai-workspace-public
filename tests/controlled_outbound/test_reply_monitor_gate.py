import unittest

from tools.controlled_outbound.reply_monitor_gate import check_reply_monitor_gate


class ReplyMonitorGateTests(unittest.TestCase):
    def test_reply_monitor_gate_required(self):
        result = check_reply_monitor_gate()
        self.assertTrue(result["reply_monitor_required"])
        self.assertFalse(result["real_inbox_access"])
        self.assertEqual(result["decision"], "READY_SYNTHETIC")


if __name__ == "__main__":
    unittest.main()
