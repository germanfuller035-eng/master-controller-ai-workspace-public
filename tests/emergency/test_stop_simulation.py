import json
import unittest
from pathlib import Path

from tools.emergency.simulate_stop import simulate_stop


FIXTURES = Path("tests/fixtures/emergency")


class StopSimulationTests(unittest.TestCase):
    def state(self):
        return json.loads((FIXTURES / "stop_before.json").read_text(encoding="utf-8"))

    def test_matches_expected_fixture(self):
        expected = json.loads((FIXTURES / "stop_after_expected.json").read_text(encoding="utf-8"))
        self.assertEqual(simulate_stop(self.state(), stopped_at="2026-06-26T00:00:00Z"), expected)

    def test_active_r0_analysis_may_checkpoint(self):
        result = simulate_stop(self.state(), stopped_at="2026-06-26T00:00:00Z")
        self.assertEqual(result["workflows"][0]["status"], "CHECKPOINTED_BY_STOP")

    def test_r4_send_and_r5_payment_blocked(self):
        result = simulate_stop(self.state(), stopped_at="2026-06-26T00:00:00Z")
        statuses = {item["id"]: item["status"] for item in result["workflows"]}
        self.assertEqual(statuses["wf-r4"], "CANCELLED_BY_STOP")
        self.assertEqual(statuses["wf-r5"], "CANCELLED_BY_STOP")

    def test_active_approval_revoked(self):
        result = simulate_stop(self.state(), stopped_at="2026-06-26T00:00:00Z")
        self.assertTrue(result["approvals"][0]["revoked"])

    def test_queues_disabled(self):
        result = simulate_stop(self.state(), stopped_at="2026-06-26T00:00:00Z")
        for name in ("outbound", "production_write", "payment", "browser_action"):
            self.assertFalse(result["queues"][name]["enabled"])

    def test_stop_is_idempotent(self):
        once = simulate_stop(self.state(), stopped_at="2026-06-26T00:00:00Z")
        twice = simulate_stop(once, stopped_at="2026-06-26T00:00:00Z")
        self.assertEqual(once, twice)

    def test_stop_report_contains_no_secrets(self):
        state = self.state()
        state["queues"]["outbound"]["items"][0]["token"] = "token = FAKE_TOKEN_VALUE_DO_NOT_USE"
        result = json.dumps(simulate_stop(state, stopped_at="2026-06-26T00:00:00Z"))
        self.assertNotIn("FAKE_TOKEN_VALUE_DO_NOT_USE", result)


if __name__ == "__main__":
    unittest.main()
