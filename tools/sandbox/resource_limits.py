
from __future__ import annotations
import json
from pathlib import Path
from typing import Any
ROOT = Path(__file__).resolve().parents[2]
LIMITS_PATH = ROOT / "config" / "sandbox" / "SANDBOX_RESOURCE_LIMITS.json"
def load_limits() -> dict[str, Any]:
    return json.loads(LIMITS_PATH.read_text(encoding="utf-8"))
def validate_resource_limits(limits: dict[str, Any], policy: dict[str, Any] | None = None) -> dict[str, Any]:
    policy = policy or load_limits()
    for field in ["timeout_seconds", "cpu_cores", "memory_mb"]:
        if field not in limits: return {"allowed": False, "reason": f"MISSING_{field.upper()}"}
    if int(limits["timeout_seconds"]) <= 0 or int(limits["timeout_seconds"]) > int(policy["max_timeout_seconds"]): return {"allowed": False, "reason": "TIMEOUT_LIMIT_DENIED"}
    if float(limits["cpu_cores"]) <= 0 or float(limits["cpu_cores"]) > float(policy["max_cpu_cores"]): return {"allowed": False, "reason": "CPU_LIMIT_DENIED"}
    if int(limits["memory_mb"]) <= 0 or int(limits["memory_mb"]) > int(policy["max_memory_mb"]): return {"allowed": False, "reason": "MEMORY_LIMIT_DENIED"}
    return {"allowed": True, "reason": "RESOURCE_LIMITS_OK"}
