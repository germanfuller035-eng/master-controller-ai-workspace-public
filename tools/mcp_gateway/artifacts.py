from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from tools.mcp_gateway.models import GatewayError
from tools.mcp_gateway.redaction import contains_secret_like_content, redact_text


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_ROOT = ROOT / "_generated" / "mcp_gateway_v1" / "artifacts"
MANIFEST_PATH = ARTIFACT_ROOT / "artifact_manifest.jsonl"


def _safe_relative_path(relative_path: str) -> Path:
    requested = Path(relative_path)
    if requested.is_absolute():
        raise GatewayError("ARTIFACT_PATH_DENIED", "artifact path must be relative", status="DENIED")
    if any(part == ".." for part in requested.parts):
        raise GatewayError("ARTIFACT_PATH_DENIED", "artifact path traversal denied", status="DENIED")
    resolved = (ARTIFACT_ROOT / requested).resolve()
    root = ARTIFACT_ROOT.resolve()
    if not resolved.is_relative_to(root):
        raise GatewayError("ARTIFACT_PATH_DENIED", "artifact path outside root denied", status="DENIED")
    return resolved


def write_artifact(task_id: str, adapter_id: str, relative_path: str, content: str, data_class: str) -> dict[str, Any]:
    if contains_secret_like_content(content):
        raise GatewayError("ARTIFACT_SECRET_CONTENT_DENIED", "artifact content rejected by redaction policy", status="DENIED")
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    path = _safe_relative_path(relative_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    safe_content = redact_text(content)
    path.write_text(safe_content, encoding="utf-8", newline="\n")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    artifact_id = f"artifact_{digest[:16]}"
    record = {
        "artifact_id": artifact_id,
        "task_id": task_id,
        "adapter_id": adapter_id,
        "path": str(path.relative_to(ROOT)).replace("\\", "/"),
        "sha256": digest,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "data_class": data_class,
        "redaction_status": "CHECKED_NO_SECRET_CONTENT",
    }
    with MANIFEST_PATH.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(record, sort_keys=True) + "\n")
    return record
