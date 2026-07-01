from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from tools.mcp_gateway import validate_mcp_gateway


class McpGatewayValidatorTests(unittest.TestCase):
    def test_current_config_validates(self) -> None:
        self.assertEqual(validate_mcp_gateway.main(), 0)

    def test_duplicate_adapter_id_fails_in_fixture(self) -> None:
        data = json.loads((validate_mcp_gateway.ROOT / "config/mcp/GATEWAY_ADAPTERS.json").read_text(encoding="utf-8"))
        data["adapters"].append(dict(data["adapters"][0]))
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "registry.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            errors: list[str] = []
            validate_mcp_gateway.validate_adapter_registry(path, errors)
        self.assertTrue(any("duplicate adapter id" in error for error in errors))

    def test_production_enabled_and_unrestricted_shell_fail_in_fixture(self) -> None:
        data = json.loads((validate_mcp_gateway.ROOT / "config/mcp/GATEWAY_ADAPTERS.json").read_text(encoding="utf-8"))
        data["adapters"][0]["production_enabled"] = True
        data["adapters"][0]["allowed_tools"] = ["unrestricted_shell"]
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "registry.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            errors: list[str] = []
            validate_mcp_gateway.validate_adapter_registry(path, errors)
        self.assertTrue(any("production_enabled" in error for error in errors))
        self.assertTrue(any("forbidden capability" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
