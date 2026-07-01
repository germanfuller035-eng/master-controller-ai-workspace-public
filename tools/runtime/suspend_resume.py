from __future__ import annotations

import json
from typing import Any

from tools.runtime.runtime_stop import is_stop_active
from tools.runtime.task_lifecycle import validate_state


SUSPEND_REQUIRED_FIELDS = {"task_id", "lifecycle_state", "step_index", "retry_count", "budget_spent_rub", "evidence_refs"}
FORBIDDEN_STATE_KEYS = {"provider_credentials", "raw_secret_values", "production_tokens", "persistent_memory"}


def create_suspend_state(
    task_id: str,
    lifecycle_state: str = "SUSPENDED",
    step_index: int = 0,
    retry_count: int = 0,
    budget_spent_rub: float = 0.0,
    evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    state = {
        "task_id": task_id,
        "lifecycle_state": lifecycle_state,
        "step_index": step_index,
        "retry_count": retry_count,
        "budget_spent_rub": budget_spent_rub,
        "evidence_refs": evidence_refs or [],
        "memory_enabled": False,
        "production_capabilities": 0,
    }
    validate_suspend_state(state)
    return state


def validate_suspend_state(state: dict[str, Any]) -> None:
    missing = sorted(SUSPEND_REQUIRED_FIELDS - set(state))
    if missing:
        raise ValueError(f"missing suspend fields: {missing}")
    if not validate_state(str(state["lifecycle_state"])):
        raise ValueError("invalid lifecycle state")
    if FORBIDDEN_STATE_KEYS & set(state):
        raise ValueError("suspend state contains forbidden runtime data")
    json.dumps(state, sort_keys=True)


def serialize_suspend_state(state: dict[str, Any]) -> str:
    validate_suspend_state(state)
    return json.dumps(state, sort_keys=True, separators=(",", ":"))


def deserialize_suspend_state(serialized: str) -> dict[str, Any]:
    state = json.loads(serialized)
    if not isinstance(state, dict):
        raise ValueError("suspend state must deserialize to object")
    validate_suspend_state(state)
    return state


def resume_from_state(serialized: str, stop_state: dict[str, Any] | bool | None = None) -> dict[str, Any]:
    if is_stop_active(stop_state):
        return {"status": "DENIED", "error_code": "STOP_BLOCKED"}
    state = deserialize_suspend_state(serialized)
    if state["lifecycle_state"] not in {"SUSPENDED", "RESUMED", "RUNNING"}:
        return {"status": "DENIED", "error_code": "STATE_NOT_RESUMABLE", "state": state["lifecycle_state"]}
    state["lifecycle_state"] = "RESUMED"
    return {"status": "RESUME_READY", "state": state}
