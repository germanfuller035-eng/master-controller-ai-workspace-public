from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from tools.mcp_gateway.audit import AuditLogger
from tools.mcp_gateway.gateway import Gateway


def gateway() -> Gateway:
    audit_dir = Path(tempfile.mkdtemp(prefix="mcp-gateway-policy-"))
    return Gateway(audit_logger=AuditLogger(audit_dir / "events.jsonl"))


def request(**overrides):
    payload = {
        "request_id": "req-policy",
        "task_id": "task-policy",
        "actor": "codex",
        "adapter_id": "filesystem_read",
        "action": "read_file",
        "resource": "CURRENT_TASK_CHECKPOINT.md",
        "environment": "LOCAL_SYNTHETIC",
        "risk": "R0",
        "data_class": "BUSINESS_INTERNAL",
        "input": {"feature_flag_state": {"MCP_READ": "LOCAL_SYNTHETIC"}},
        "timeout_ms": 5000,
        "evidence_required": True,
    }
    payload.update(overrides)
    return payload


class GatewayPolicyBridgeTests(unittest.TestCase):
    def test_unknown_adapter_denied(self) -> None:
        response = gateway().handle(request(adapter_id="missing_adapter"))
        self.assertEqual(response["status"], "DENIED")
        self.assertEqual(response["error_code"], "UNKNOWN_ADAPTER")

    def test_unknown_action_denied(self) -> None:
        response = gateway().handle(request(action="missing_action"))
        self.assertEqual(response["status"], "DENIED")
        self.assertEqual(response["policy_decision"]["reason"], "unknown action")

    def test_production_mcp_read_off_denies_production_call(self) -> None:
        response = gateway().handle(request(environment="PRODUCTION", input={}))
        self.assertEqual(response["status"], "DENIED")
        self.assertIn("feature flag", response["error_message_redacted"])

    def test_local_synthetic_fixture_allows_scoped_read_policy(self) -> None:
        response = gateway().handle(request(input={"feature_flag_state": {"MCP_READ": "LOCAL_SYNTHETIC"}}))
        self.assertEqual(response["policy_decision"]["decision"], "ALLOW")

    def test_stop_blocks_browser(self) -> None:
        response = gateway().handle(
            request(
                adapter_id="browser_contract",
                action="browser_action",
                resource="browser",
                risk="R4",
                input={"stop_active": True},
            )
        )
        self.assertEqual(response["status"], "DENIED")
        self.assertEqual(response["policy_decision"]["decision"], "STOP_BLOCKED")

    def test_r4_r5_denied_without_approval(self) -> None:
        r4 = gateway().handle(request(adapter_id="browser_contract", action="browser_action", resource="browser", risk="R4"))
        r5 = gateway().handle(request(action="payment_operation", risk="R5"))
        self.assertEqual(r4["status"], "DENIED")
        self.assertEqual(r4["policy_decision"]["decision"], "REQUIRE_OWNER_APPROVAL")
        self.assertEqual(r5["status"], "DENIED")

    def test_direct_shell_docker_ssh_denied(self) -> None:
        for action in ("unrestricted_shell", "direct_docker_socket", "direct_ssh"):
            with self.subTest(action=action):
                response = gateway().handle(request(action=action, risk="R5"))
                self.assertEqual(response["status"], "DENIED")


if __name__ == "__main__":
    unittest.main()
