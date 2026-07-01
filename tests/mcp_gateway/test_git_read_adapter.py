from __future__ import annotations

import unittest

from tools.mcp_gateway.adapters.git_read import GitReadAdapter
from tools.mcp_gateway.adapter_registry import AdapterRegistry
from tools.mcp_gateway.cancellation import CancellationRegistry
from tools.mcp_gateway.models import GatewayError, GatewayRequest


def git_request(action: str, **input_overrides) -> GatewayRequest:
    payload = {
        "request_id": f"req-git-{action}",
        "task_id": "task-git",
        "actor": "codex",
        "adapter_id": "git_read",
        "action": action,
        "resource": "repo",
        "environment": "LOCAL_SYNTHETIC",
        "risk": "R0",
        "data_class": "BUSINESS_INTERNAL",
        "input": {"feature_flag_state": {"MCP_READ": "LOCAL_SYNTHETIC"}},
        "timeout_ms": 10000,
        "evidence_required": True,
    }
    payload["input"].update(input_overrides)
    return GatewayRequest.from_dict(payload)


class GitReadAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.adapter = GitReadAdapter(AdapterRegistry().get("git_read"))

    def test_status_log_show_diff_allowed(self) -> None:
        cases = [
            git_request("status"),
            git_request("log", max_count=1),
            git_request("show", ref="HEAD"),
            git_request("diff"),
            git_request("branch_show_current"),
            git_request("rev_parse", ref="HEAD"),
        ]
        for request in cases:
            with self.subTest(action=request.action):
                result = self.adapter.execute(request, 10000, CancellationRegistry())
                self.assertIn("returncode", result.data)

    def test_mutating_commands_denied(self) -> None:
        for action in ("commit", "push", "checkout", "reset", "clean"):
            with self.subTest(action=action):
                with self.assertRaises(GatewayError):
                    self.adapter.execute(git_request(action), 10000, CancellationRegistry())

    def test_shell_injection_argument_denied(self) -> None:
        with self.assertRaises(GatewayError):
            self.adapter.execute(git_request("show", ref="HEAD;echo nope"), 10000, CancellationRegistry())


if __name__ == "__main__":
    unittest.main()
