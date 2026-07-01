from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from tools.mcp_gateway.adapters.filesystem_read import FilesystemReadAdapter
from tools.mcp_gateway.adapter_registry import AdapterRegistry
from tools.mcp_gateway.cancellation import CancellationRegistry
from tools.mcp_gateway.models import GatewayError, GatewayRequest


def fs_request(root: Path, path: str, **input_overrides) -> GatewayRequest:
    data = {
        "request_id": "req-fs",
        "task_id": "task-fs",
        "actor": "codex",
        "adapter_id": "filesystem_read",
        "action": "read_file",
        "resource": path,
        "environment": "LOCAL_SYNTHETIC",
        "risk": "R0",
        "data_class": "BUSINESS_INTERNAL",
        "input": {"assigned_worktree": str(root), "path": path, "feature_flag_state": {"MCP_READ": "LOCAL_SYNTHETIC"}},
        "timeout_ms": 5000,
        "evidence_required": True,
    }
    data["input"].update(input_overrides)
    return GatewayRequest.from_dict(data)


class FilesystemReadAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.adapter = FilesystemReadAdapter(AdapterRegistry().get("filesystem_read"))

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_allowed_file_read_inside_assigned_worktree(self) -> None:
        (self.root / "ok.txt").write_text("hello", encoding="utf-8")
        result = self.adapter.execute(fs_request(self.root, "ok.txt"), 5000, CancellationRegistry())
        self.assertEqual(result.data["text"], "hello")
        self.assertIn("sha256", result.data)

    def test_path_traversal_denied(self) -> None:
        with self.assertRaises(GatewayError):
            self.adapter.execute(fs_request(self.root, "../outside.txt"), 5000, CancellationRegistry())

    def test_absolute_path_outside_root_denied(self) -> None:
        outside = self.root.parent / "outside.txt"
        outside.write_text("outside", encoding="utf-8")
        with self.assertRaises(GatewayError):
            self.adapter.execute(fs_request(self.root, str(outside)), 5000, CancellationRegistry())

    def test_symlink_escape_denied_if_applicable(self) -> None:
        outside = self.root.parent / "outside-link-target.txt"
        outside.write_text("outside", encoding="utf-8")
        link = self.root / "link.txt"
        try:
            os.symlink(outside, link)
        except (OSError, NotImplementedError):
            self.skipTest("symlink creation not available")
        with self.assertRaises(GatewayError):
            self.adapter.execute(fs_request(self.root, "link.txt"), 5000, CancellationRegistry())

    def test_secret_binary_large_and_missing_files_are_safe_errors(self) -> None:
        (self.root / "private_key.pem").write_text("not real", encoding="utf-8")
        (self.root / "binary.bin").write_bytes(b"abc\0def")
        (self.root / "large.txt").write_text("x" * 32, encoding="utf-8")
        for path, code in (
            ("private_key.pem", "FILESYSTEM_SECRET_PATH_DENIED"),
            ("binary.bin", "FILESYSTEM_BINARY_DENIED"),
            ("large.txt", "FILESYSTEM_TOO_LARGE"),
            ("missing.txt", "FILESYSTEM_MISSING"),
        ):
            with self.subTest(path=path):
                try:
                    request = fs_request(self.root, path, max_file_bytes=8)
                    self.adapter.execute(request, 5000, CancellationRegistry())
                except GatewayError as exc:
                    self.assertEqual(exc.code, code)


if __name__ == "__main__":
    unittest.main()
