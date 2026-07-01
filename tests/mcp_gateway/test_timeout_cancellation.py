from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from tools.mcp_gateway.audit import AuditLogger
from tools.mcp_gateway.cancellation import CancellationRegistry
from tools.mcp_gateway.gateway import Gateway


class TimeoutCancellationTests(unittest.TestCase):
    def test_gateway_cancelled_request_returns_cancelled(self) -> None:
        registry = CancellationRegistry()
        registry.cancel("cancel-me")
        with tempfile.TemporaryDirectory() as temp:
            response = Gateway(audit_logger=AuditLogger(Path(temp) / "events.jsonl"), cancellation=registry).handle(
                {
                    "request_id": "req-cancel",
                    "task_id": "task-cancel",
                    "actor": "codex",
                    "adapter_id": "filesystem_read",
                    "action": "read_file",
                    "resource": "CURRENT_TASK_CHECKPOINT.md",
                    "environment": "LOCAL_SYNTHETIC",
                    "risk": "R0",
                    "data_class": "BUSINESS_INTERNAL",
                    "input": {"feature_flag_state": {"MCP_READ": "LOCAL_SYNTHETIC"}},
                    "timeout_ms": 5000,
                    "cancellation_token": "cancel-me",
                    "evidence_required": True,
                }
            )
        self.assertEqual(response["status"], "CANCELLED")


if __name__ == "__main__":
    unittest.main()
