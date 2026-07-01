from __future__ import annotations

from typing import Any

from . import ControlledOutboundPolicyError, ensure_synthetic


def check_reply_monitor_gate(state: dict[str, Any] | None = None) -> dict[str, Any]:
    gate_state = state or {
        "synthetic": True,
        "reply_monitor_required": True,
        "real_inbox_access": False,
        "decision": "READY_SYNTHETIC",
    }
    ensure_synthetic(gate_state, "reply monitor gate")
    if gate_state.get("reply_monitor_required") is not True:
        raise ControlledOutboundPolicyError("reply monitor gate must be required")
    if gate_state.get("real_inbox_access") is not False:
        raise ControlledOutboundPolicyError("real inbox access is disabled")
    ready = gate_state.get("decision") == "READY_SYNTHETIC"
    return {
        "synthetic": True,
        "reply_monitor_required": True,
        "real_inbox_access": False,
        "decision": "READY_SYNTHETIC" if ready else "BLOCK",
        "future_activation_allowed": ready,
    }
