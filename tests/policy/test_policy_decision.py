import unittest

from tools.policies.payload_hash import calculate_payload_hash
from tools.policies.policy_decision import SyntheticApprovalLedger, evaluate_policy


def request(**overrides):
    data = {
        "actor": "owner",
        "action": "read_evidence",
        "resource": "repo://docs",
        "target": "repo://docs",
        "environment": "local",
        "data_class": "BUSINESS_INTERNAL",
        "requested_capability": "read_search_analyze_classify",
        "risk": "R0",
        "feature_flag_state": {},
        "lifecycle_state": "LOCAL_SYNTHETIC",
        "payload": {},
        "task_id": "task-policy",
    }
    data.update(overrides)
    return data


def approval_for(req, approval_type="OWNER_APPROVAL", approval_id="approval-1", expires_at="2099-01-01T00:00:00Z"):
    material = {
        "actor": req["actor"],
        "action": req["action"],
        "target": req["target"],
        "payload": req.get("payload", {}),
        "risk": req["risk"],
        "expiry": expires_at,
        "task_id": req["task_id"],
    }
    return {
        "approval_id": approval_id,
        "approved_by": "owner",
        "approval_type": approval_type,
        "payload_hash": calculate_payload_hash(material),
        "granted_at": "2026-06-26T00:00:00Z",
        "expires_at": expires_at,
        "single_use": True,
        "revoked": False,
    }


class PolicyDecisionTests(unittest.TestCase):
    def test_r0_read_allowed(self):
        self.assertEqual(evaluate_policy(request())["decision"], "ALLOW")

    def test_unknown_action_denied(self):
        self.assertEqual(evaluate_policy(request(action="unknown_action"))["decision"], "DENY")

    def test_outbound_send_requires_r4_approval(self):
        req = request(action="outbound_send", requested_capability="outbound_message", risk="R4", payload={"recipient": "lead@example.test"})
        self.assertEqual(evaluate_policy(req)["decision"], "REQUIRE_OWNER_APPROVAL")

    def test_payment_requires_r5_strong_approval(self):
        req = request(action="payment_operation", requested_capability="payment_operation", risk="R5", payload={"amount": 25})
        weak = approval_for(req, approval_type="OWNER_APPROVAL")
        self.assertEqual(evaluate_policy(req, approval=weak)["decision"], "REQUIRE_STRONG_OWNER_APPROVAL")

    def test_production_db_write_denied_without_approval(self):
        req = request(action="production_db_write", requested_capability="production_db_write", risk="R4", payload={"row": "synthetic"})
        self.assertEqual(evaluate_policy(req)["decision"], "REQUIRE_OWNER_APPROVAL")

    def test_feature_off_blocks_runtime(self):
        req = request(
            action="low_risk_internal_change",
            requested_capability="low_risk_internal_change",
            risk="R3",
            requires_feature_flag="AGENT_RUNTIME",
            feature_flag_state={"AGENT_RUNTIME": "OFF"},
        )
        self.assertEqual(evaluate_policy(req)["decision"], "DENY")

    def test_approval_hash_mismatch_denied(self):
        req = request(action="outbound_send", requested_capability="outbound_message", risk="R4", payload={"recipient": "lead@example.test"})
        grant = approval_for(req)
        grant["payload_hash"] = "f" * 64
        result = evaluate_policy(req, approval=grant)
        self.assertEqual(result["decision"], "DENY")
        self.assertIn("hash mismatch", result["reason"])

    def test_replay_denied(self):
        req = request(action="outbound_send", requested_capability="outbound_message", risk="R4", payload={"recipient": "lead@example.test"})
        grant = approval_for(req)
        ledger = SyntheticApprovalLedger()
        self.assertEqual(evaluate_policy(req, approval=grant, ledger=ledger)["decision"], "ALLOW")
        self.assertEqual(evaluate_policy(req, approval=grant, ledger=ledger)["decision"], "DENY")

    def test_expired_approval_denied(self):
        req = request(action="outbound_send", requested_capability="outbound_message", risk="R4", payload={"recipient": "lead@example.test"})
        grant = approval_for(req, expires_at="2000-01-01T00:00:00Z")
        self.assertEqual(evaluate_policy(req, approval=grant)["decision"], "DENY")

    def test_stop_blocks_r4_r5_browser_outbound_payment(self):
        cases = [
            ("outbound_send", "outbound_message", "R4"),
            ("browser_action", "browser_action", "R4"),
            ("payment_operation", "payment_operation", "R5"),
        ]
        for action, capability, risk in cases:
            req = request(action=action, requested_capability=capability, risk=risk, stop_active=True)
            self.assertEqual(evaluate_policy(req)["decision"], "STOP_BLOCKED")

    def test_direct_docker_socket_denied(self):
        req = request(action="direct_docker_socket", requested_capability="direct_docker_socket", risk="R5")
        self.assertEqual(evaluate_policy(req)["decision"], "DENY")

    def test_unrestricted_shell_denied(self):
        req = request(action="unrestricted_shell", requested_capability="unrestricted_shell", risk="R5")
        self.assertEqual(evaluate_policy(req)["decision"], "DENY")


if __name__ == "__main__":
    unittest.main()
