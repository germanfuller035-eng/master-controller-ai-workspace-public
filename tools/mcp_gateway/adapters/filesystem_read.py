from __future__ import annotations

import hashlib
from pathlib import Path

from tools.mcp_gateway.adapters.contracts import BaseAdapter
from tools.mcp_gateway.models import AdapterResult, GatewayError, GatewayRequest
from tools.mcp_gateway.redaction import redact_text, secret_like_path


ROOT = Path(__file__).resolve().parents[3]
MAX_FILE_BYTES = 1_048_576


class FilesystemReadAdapter(BaseAdapter):
    def execute(self, request: GatewayRequest, timeout_ms: int, cancellation) -> AdapterResult:
        cancellation.check(request.cancellation_token)
        if request.action != "read_file":
            raise GatewayError("FILESYSTEM_ACTION_DENIED", "unknown filesystem action", status="DENIED")
        assigned_root = Path(str(request.input.get("assigned_worktree") or ROOT)).resolve()
        resource = str(request.input.get("path") or request.resource)
        path = Path(resource)
        if secret_like_path(resource):
            raise GatewayError("FILESYSTEM_SECRET_PATH_DENIED", "secret-like path denied", status="DENIED")
        target = path.resolve() if path.is_absolute() else (assigned_root / path).resolve()
        if not target.is_relative_to(assigned_root):
            raise GatewayError("FILESYSTEM_SCOPE_DENIED", "path outside assigned worktree denied", status="DENIED")
        if not target.exists():
            raise GatewayError("FILESYSTEM_MISSING", "file does not exist", status="ERROR")
        if not target.is_file():
            raise GatewayError("FILESYSTEM_NOT_FILE", "resource is not a file", status="DENIED")
        size = target.stat().st_size
        if size > int(request.input.get("max_file_bytes", MAX_FILE_BYTES)):
            raise GatewayError("FILESYSTEM_TOO_LARGE", "file too large", status="DENIED")
        chunk = target.read_bytes()[:4096]
        if b"\0" in chunk:
            raise GatewayError("FILESYSTEM_BINARY_DENIED", "binary file denied", status="DENIED")
        text = target.read_text(encoding="utf-8")
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        cancellation.check(request.cancellation_token)
        return AdapterResult(
            data={
                "path": str(target.relative_to(assigned_root)).replace("\\", "/"),
                "sha256": digest,
                "text": redact_text(text),
            }
        )
