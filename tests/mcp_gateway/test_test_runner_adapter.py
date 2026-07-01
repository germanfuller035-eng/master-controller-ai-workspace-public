from __future__ import annotations

import unittest

from tools.mcp_gateway.adapters.test_runner_local import TestRunnerLocalAdapter
from tools.mcp_gateway.adapter_registry import AdapterRegistry
from tools.mcp_gateway.cancellation import CancellationRegistry
from tools.mcp_gateway.models import GatewayError, GatewayRequest


def runner_request(command, cancellation_token=None, timeout_ms: int = 120000) -> GatewayRequest:
    return GatewayRequest.from_dict(
        {
            "request_id": "req-runner",
            "task_id": "task-runner",
            "actor": "codex",
            "adapter_id": "test_runner_local",
            "action": "run",
            "resource": "validator",
            "environment": "LOCAL_SYNTHETIC",
            "risk": "R1",
            "data_class": "BUSINESS_INTERNAL",
            "input": {"command": command},
            "timeout_ms": timeout_ms,
            "cancellation_token": cancellation_token,
            "evidence_required": True,
        }
    )


class TestRunnerLocalAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.adapter = TestRunnerLocalAdapter(AdapterRegistry().get("test_runner_local"))

    def test_allowlisted_validator_command_allowed(self) -> None:
        result = self.adapter.execute(
            runner_request("python tools/mcp_gateway/validate_mcp_gateway.py"),
            120000,
            CancellationRegistry(),
        )
        self.assertEqual(result.data["returncode"], 0)

    def test_non_allowlisted_command_denied(self) -> None:
        with self.assertRaises(GatewayError):
            self.adapter.execute(runner_request("python tools/unknown.py"), 120000, CancellationRegistry())

    def test_timeout_enforced(self) -> None:
        with self.assertRaises(GatewayError):
            self.adapter.execute(runner_request("python tools/mcp_gateway/validate_mcp_gateway.py"), 1, CancellationRegistry())

    def test_cancellation_before_start_works(self) -> None:
        with self.assertRaises(GatewayError):
            self.adapter.execute(
                runner_request("python tools/mcp_gateway/validate_mcp_gateway.py", cancellation_token={"token_id": "x", "cancelled": True}),
                120000,
                CancellationRegistry(),
            )


if __name__ == "__main__":
    unittest.main()
