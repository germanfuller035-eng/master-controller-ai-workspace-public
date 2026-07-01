from __future__ import annotations

import unittest

from tools.runtime.runtime_adapter import RuntimeAdapter


def request(**overrides):
    payload = {
        "task_id": "task-runtime",
        "actor": "codex",
        "purpose": "routine summary",
        "risk": "R1",
        "environment": "LOCAL_SYNTHETIC",
        "local_synthetic_fixture": True,
        "budget": {
            "task_budget_rub": 100,
            "monthly_spend_rub": 0,
            "input_tokens": 1000,
            "output_tokens": 500,
            "stop_loss_ack": False,
        },
        "model_requirement": {"task_type": "routine"},
        "tool_scope": {"route": "MCP_GATEWAY", "mcp_gateway_required": True, "direct_tool_call": False, "production_capabilities": 0},
        "limits": {"delegation_depth": 0, "subagents": 0, "interagent_messages": 0, "max_iterations": 1},
    }
    payload.update(overrides)
    return payload


class RuntimeFeatureFlagTests(unittest.TestCase):
    def test_agent_runtime_off_denies_production_runtime(self) -> None:
        response = RuntimeAdapter().handle(request(environment="PRODUCTION", local_synthetic_fixture=False))
        self.assertEqual(response["status"], "DENIED")
        self.assertEqual(response["error_code"], "AGENT_RUNTIME_OFF")

    def test_local_synthetic_fixture_allows_dry_run(self) -> None:
        response = RuntimeAdapter().handle(request())
        self.assertEqual(response["status"], "DRY_RUN_OK")
        self.assertEqual(response["tool_route"], "MCP_GATEWAY_ONLY")

    def test_missing_local_fixture_denied(self) -> None:
        response = RuntimeAdapter().handle(request(local_synthetic_fixture=False))
        self.assertEqual(response["status"], "DENIED")
        self.assertEqual(response["error_code"], "LOCAL_SYNTHETIC_FIXTURE_REQUIRED")


if __name__ == "__main__":
    unittest.main()
