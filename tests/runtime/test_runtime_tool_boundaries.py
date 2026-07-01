from __future__ import annotations

import unittest

from tests.runtime.test_runtime_feature_flags import request
from tools.runtime.runtime_adapter import RuntimeAdapter
from tools.runtime.runtime_validator import validate


class RuntimeToolBoundaryTests(unittest.TestCase):
    def test_direct_tool_call_denied(self) -> None:
        response = RuntimeAdapter().handle(request(tool_scope={"route": "MCP_GATEWAY", "mcp_gateway_required": True, "direct_tool_call": True, "production_capabilities": 0}))
        self.assertEqual(response["status"], "DENIED")
        self.assertEqual(response["error_code"], "DIRECT_TOOL_CALL_DENIED")

    def test_mcp_gateway_path_required(self) -> None:
        response = RuntimeAdapter().handle(request(tool_scope={"route": "DIRECT", "mcp_gateway_required": False, "direct_tool_call": False, "production_capabilities": 0}))
        self.assertEqual(response["status"], "DENIED")
        self.assertEqual(response["error_code"], "MCP_GATEWAY_REQUIRED")

    def test_production_tool_capability_denied(self) -> None:
        response = RuntimeAdapter().handle(request(tool_scope={"route": "MCP_GATEWAY", "mcp_gateway_required": True, "direct_tool_call": False, "production_capabilities": 1}))
        self.assertEqual(response["status"], "DENIED")
        self.assertEqual(response["error_code"], "PRODUCTION_CAPABILITY_DENIED")

    def test_retry_limit_enforced(self) -> None:
        response = RuntimeAdapter().handle(request(retry_count=3))
        self.assertEqual(response["status"], "DENIED")
        self.assertEqual(response["error_code"], "RETRY_LIMIT_EXCEEDED")

    def test_runtime_config_validates(self) -> None:
        status, errors, _loaded = validate()
        self.assertEqual(status, "PASS", errors)


if __name__ == "__main__":
    unittest.main()
