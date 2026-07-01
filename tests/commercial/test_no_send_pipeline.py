import unittest
from tools.commercial.core import FIXTURE_DIR, lead_fingerprint, load_json
from tools.commercial.no_send_pipeline import run_no_send_pipeline, run_intentional_fail_checks

class NoSendPipelineTests(unittest.TestCase):
    def test_no_send_pipeline_blocks_outbound_and_requires_approval(self):
        result = run_no_send_pipeline()
        self.assertEqual(result["pipeline_status"], "PASS")
        self.assertEqual(result["synthetic_leads_processed"], 10)
        self.assertGreaterEqual(result["duplicates_blocked"], 1)
        self.assertGreaterEqual(result["low_fit_parked"], 1)
        self.assertEqual(result["outbound_count"], 0)
        self.assertEqual(result["payment_count"], 0)
        self.assertEqual(result["production_db_writes"], 0)
        self.assertTrue(result["owner_approval_required_for_send"])
        self.assertEqual(result["product_fit_reason_percent"], 100)

    def test_stop_and_suppression_block_pipeline(self):
        self.assertEqual(run_no_send_pipeline(stop_active=True)["pipeline_status"], "BLOCKED_BY_STOP")
        batch = load_json(FIXTURE_DIR / "pipeline" / "no_send_batch_10.json")
        fp = lead_fingerprint(batch["leads"][0]["lead"])
        result = run_no_send_pipeline(suppressed_fingerprints={fp})
        self.assertGreaterEqual(result["suppression_blocked"], 1)

    def test_intentional_fail_cases_are_blocked(self):
        checks = run_intentional_fail_checks()
        self.assertTrue(all(checks.values()))
