import unittest
from tools.personal_assistant import PersonalAssistantPolicyError
from tools.personal_assistant.no_external_action_guard import enforce_no_external_action_guard, evaluate_external_action, run_intentional_fail_checks, run_no_external_action_pipeline
class NoExternalActionGuardTests(unittest.TestCase):
    def test_guard_blocks_stop_and_false_success(self):
        with self.assertRaises(PersonalAssistantPolicyError): enforce_no_external_action_guard({"synthetic": True}, stop_active=True)
        with self.assertRaises(PersonalAssistantPolicyError): enforce_no_external_action_guard({"synthetic": True, "sent": True})
        with self.assertRaises(PersonalAssistantPolicyError): enforce_no_external_action_guard({"synthetic": True, "status": "PAID"})
    def test_pipeline_and_blocked_actions(self):
        result = run_no_external_action_pipeline()
        self.assertEqual(result["pipeline_status"], "PASS"); self.assertEqual(result["outbound_count"], 0); self.assertEqual(result["payment_count"], 0); self.assertEqual(result["production_db_writes"], 0)
        self.assertEqual(evaluate_external_action("payment")["decision"], "BLOCK"); self.assertTrue(all(run_intentional_fail_checks().values()))
if __name__ == "__main__": unittest.main()
