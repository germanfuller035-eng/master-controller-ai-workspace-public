from __future__ import annotations

import unittest

from tools.mcp_gateway.adapters.artifact_local import ArtifactLocalAdapter
from tools.mcp_gateway.adapter_registry import AdapterRegistry
from tools.mcp_gateway.cancellation import CancellationRegistry
from tools.mcp_gateway.models import GatewayError, GatewayRequest


def artifact_request(relative_path: str, content: str) -> GatewayRequest:
    return GatewayRequest.from_dict(
        {
            "request_id": "req-artifact",
            "task_id": "task-artifact",
            "actor": "codex",
            "adapter_id": "artifact_local",
            "action": "write_artifact",
            "resource": relative_path,
            "environment": "LOCAL_SYNTHETIC",
            "risk": "R1",
            "data_class": "BUSINESS_INTERNAL",
            "input": {"relative_path": relative_path, "content": content},
            "timeout_ms": 5000,
            "evidence_required": True,
        }
    )


class ArtifactLocalAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.adapter = ArtifactLocalAdapter(AdapterRegistry().get("artifact_local"))

    def test_write_inside_artifact_root_allowed_and_hashed(self) -> None:
        result = self.adapter.execute(artifact_request("tests/artifact_ok.txt", "artifact content"), 5000, CancellationRegistry())
        self.assertTrue(result.artifact_ids)
        self.assertIn("sha256", result.data)
        self.assertTrue(result.data["path"].startswith("_generated/mcp_gateway_v1/artifacts/"))

    def test_write_outside_artifact_root_denied(self) -> None:
        with self.assertRaises(GatewayError):
            self.adapter.execute(artifact_request("../outside.txt", "artifact content"), 5000, CancellationRegistry())

    def test_secret_like_content_rejected(self) -> None:
        with self.assertRaises(GatewayError):
            self.adapter.execute(artifact_request("tests/rejected.txt", "token = FAKE_TOKEN_VALUE_DO_NOT_USE"), 5000, CancellationRegistry())


if __name__ == "__main__":
    unittest.main()
