import unittest

from tools.digital_presence.core import evaluate_blocked_action
from tools.digital_presence.no_deploy_pipeline import run_intentional_fail_checks, run_no_deploy_pipeline


class NoDeployPipelineTests(unittest.TestCase):
    def test_no_deploy_pipeline_enforces_stage_gate_fields(self):
        result = run_no_deploy_pipeline()
        self.assertEqual(result["pipeline_status"], "PASS")
        self.assertEqual(result["synthetic_site_profiles_processed"], 6)
        self.assertTrue(result["no_real_external_url_accessed"])
        self.assertTrue(result["no_form_submit"])
        self.assertTrue(result["no_outbound"])
        self.assertTrue(result["no_deployment"])
        self.assertTrue(result["no_dns_or_vps_change"])
        self.assertTrue(result["artifact_hashes_created"])
        self.assertEqual(result["product_fit_reason_percent"], 100)
        self.assertTrue(result["owner_approval_required_for_future_deploy_or_send"])
        self.assertEqual(result["outbound_count"], 0)
        self.assertEqual(result["production_db_writes"], 0)

    def test_blocked_actions_and_stop(self):
        self.assertEqual(run_no_deploy_pipeline(stop_active=True)["pipeline_status"], "BLOCKED_BY_STOP")
        self.assertEqual(evaluate_blocked_action("deploy")["decision"], "BLOCK")
        self.assertEqual(evaluate_blocked_action("form_submit")["decision"], "BLOCK")
        self.assertEqual(evaluate_blocked_action("outbound_email")["decision"], "BLOCK")

    def test_intentional_fail_cases_are_blocked(self):
        checks = run_intentional_fail_checks()
        self.assertTrue(all(checks.values()))


if __name__ == "__main__":
    unittest.main()
