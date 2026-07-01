import unittest

from tools.controlled_outbound import ControlledOutboundPolicyError
from tools.controlled_outbound.no_send_guard import block_send_attempt, enforce_no_send_guard


class NoSendGuardTests(unittest.TestCase):
    def test_send_attempt_blocked(self):
        with self.assertRaises(ControlledOutboundPolicyError):
            block_send_attempt({})

    def test_stop_blocks_outbound(self):
        with self.assertRaises(ControlledOutboundPolicyError):
            enforce_no_send_guard({"synthetic": True}, stop_active=True)

    def test_false_sent_status_without_evidence_rejected(self):
        with self.assertRaises(ControlledOutboundPolicyError):
            enforce_no_send_guard({"synthetic": True, "sent": True})

    def test_clean_shadow_result_passes(self):
        result = enforce_no_send_guard(
            {"synthetic": True, "send_allowed": False, "outbound_count": 0, "payment_count": 0, "production_db_writes": 0}
        )
        self.assertEqual(result["status"], "PASS")
        self.assertTrue(result["false_sent_paid_written_blocked"])


if __name__ == "__main__":
    unittest.main()
