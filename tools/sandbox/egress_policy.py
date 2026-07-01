
from __future__ import annotations
import json
from pathlib import Path
from typing import Any
ROOT = Path(__file__).resolve().parents[2]
EGRESS_PATH = ROOT / "config" / "sandbox" / "SANDBOX_EGRESS_ALLOWLIST.json"
def load_egress_policy() -> dict[str, Any]:
    return json.loads(EGRESS_PATH.read_text(encoding="utf-8"))
def evaluate_egress(target: str | None, policy: dict[str, Any] | None = None) -> dict[str, Any]:
    policy = policy or load_egress_policy()
    if not target: return {"allowed": False, "reason": "EGRESS_TARGET_REQUIRED"}
    if any(blocked in target for blocked in policy.get("blocked_targets", [])): return {"allowed": False, "reason": "EGRESS_BLOCKED_TARGET"}
    if target in {item["target"] for item in policy.get("synthetic_allowlist", [])}: return {"allowed": True, "reason": "SYNTHETIC_EGRESS_ALLOWED"}
    return {"allowed": False, "reason": "EGRESS_DENY_BY_DEFAULT"}
