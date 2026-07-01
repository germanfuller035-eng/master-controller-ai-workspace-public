
from __future__ import annotations
import json
from pathlib import Path
from typing import Any
from tools.sandbox.egress_policy import evaluate_egress
from tools.sandbox.filesystem_policy import evaluate_filesystem_path
from tools.sandbox.resource_limits import validate_resource_limits
from tools.sandbox.sandbox_stop import enforce_sandbox_stop
ROOT = Path(__file__).resolve().parents[2]
POLICY_PATH = ROOT / "config" / "sandbox" / "SANDBOX_POLICY.json"
def load_policy() -> dict[str, Any]:
    return json.loads(POLICY_PATH.read_text(encoding="utf-8"))
def _deny(task_id: str, reason: str) -> dict[str, Any]:
    return {"status": "DENIED", "task_id": task_id, "decision": reason, "production_enabled": False, "evidence_refs": ["config/sandbox/SANDBOX_POLICY.json"]}
def evaluate_sandbox_request(payload: dict[str, Any], assigned_root: str | Path | None = None) -> dict[str, Any]:
    policy, task_id = load_policy(), str(payload.get("task_id", "UNKNOWN_TASK"))
    if payload.get("environment") == "PRODUCTION" and policy.get("sandbox_enabled") is False: return _deny(task_id, "PRODUCTION_SANDBOX_DISABLED")
    if payload.get("environment") != "LOCAL_SYNTHETIC": return _deny(task_id, "LOCAL_SYNTHETIC_ONLY")
    if payload.get("local_synthetic_fixture") is not True: return _deny(task_id, "LOCAL_SYNTHETIC_FIXTURE_REQUIRED")
    stop = enforce_sandbox_stop(payload.get("stop_state"))
    if not stop["allowed"]: return _deny(task_id, stop["decision"])
    denied = set(payload.get("requested_capabilities", [])).intersection(policy.get("denied_capabilities", []))
    if denied: return _deny(task_id, f"CAPABILITY_DENIED:{sorted(denied)[0]}")
    for check in [validate_resource_limits(dict(payload.get("resource_limits", {}))), evaluate_egress(payload.get("egress_target")), evaluate_filesystem_path(str(payload.get("filesystem_path", ".")), assigned_root or ROOT)]:
        if not check["allowed"]: return _deny(task_id, check["reason"])
    return {"status": "LOCAL_SYNTHETIC_ALLOWED", "task_id": task_id, "decision": "ALLOW_LOCAL_SYNTHETIC", "production_enabled": False, "evidence_refs": ["config/sandbox/SANDBOX_POLICY.json"]}
