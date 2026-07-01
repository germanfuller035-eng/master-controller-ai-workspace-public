
from __future__ import annotations
import json
from pathlib import Path
from typing import Any
ROOT = Path(__file__).resolve().parents[2]
FILESYSTEM_PATH = ROOT / "config" / "sandbox" / "SANDBOX_FILESYSTEM_LIMITS.json"
def load_filesystem_policy() -> dict[str, Any]:
    return json.loads(FILESYSTEM_PATH.read_text(encoding="utf-8"))
def evaluate_filesystem_path(request_path: str, assigned_root: str | Path, policy: dict[str, Any] | None = None) -> dict[str, Any]:
    policy = policy or load_filesystem_policy()
    if ".." in Path(request_path).parts: return {"allowed": False, "reason": "PATH_TRAVERSAL_DENIED"}
    root = Path(assigned_root).resolve()
    candidate = (root / request_path).resolve() if not Path(request_path).is_absolute() else Path(request_path).resolve()
    try: candidate.relative_to(root)
    except ValueError: return {"allowed": False, "reason": "FILESYSTEM_ESCAPE_DENIED"}
    if policy.get("production_filesystem_allowed") is not False: return {"allowed": False, "reason": "POLICY_MISCONFIGURED"}
    return {"allowed": True, "reason": "FILESYSTEM_SCOPE_OK", "path": str(candidate)}
