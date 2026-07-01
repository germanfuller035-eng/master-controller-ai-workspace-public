
from __future__ import annotations
from typing import Any
def stop_active(stop_state: dict[str, Any] | bool | None) -> bool:
    if isinstance(stop_state, bool): return stop_state
    return bool(stop_state and (stop_state.get("active") or stop_state.get("stop_active") or stop_state.get("state") == "STOP_ACTIVE"))
def enforce_sandbox_stop(stop_state: dict[str, Any] | bool | None) -> dict[str, Any]:
    return {"allowed": False, "decision": "STOP_BLOCKED", "action": "PAUSE_CANCEL_CLEANUP"} if stop_active(stop_state) else {"allowed": True, "decision": "STOP_INACTIVE"}
