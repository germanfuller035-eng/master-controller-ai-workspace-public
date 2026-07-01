from __future__ import annotations

from typing import Any


def is_stop_active(stop_state: dict[str, Any] | bool | None) -> bool:
    if isinstance(stop_state, bool):
        return stop_state
    if not isinstance(stop_state, dict):
        return False
    state = str(stop_state.get("state") or stop_state.get("status") or "").upper()
    return bool(stop_state.get("active") or state in {"STOP", "STOP_ACTIVE", "ACTIVE"})


def enforce_stop(stop_state: dict[str, Any] | bool | None) -> dict[str, Any]:
    if is_stop_active(stop_state):
        return {
            "allowed": False,
            "decision": "STOP_BLOCKED",
            "reason": "STOP active blocks runtime execution and revokes approvals",
        }
    return {"allowed": True, "decision": "STOP_INACTIVE", "reason": "runtime may continue"}
