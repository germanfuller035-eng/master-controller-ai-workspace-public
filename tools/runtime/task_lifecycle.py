from __future__ import annotations


VALID_STATES = {
    "PLANNED",
    "ROUTED",
    "RUNNING",
    "SUSPENDED",
    "RESUMED",
    "STOPPED",
    "CANCELLED",
    "COMPLETED",
    "FAILED",
}

ALLOWED_TRANSITIONS = {
    "PLANNED": {"ROUTED", "CANCELLED", "STOPPED"},
    "ROUTED": {"RUNNING", "SUSPENDED", "CANCELLED", "STOPPED"},
    "RUNNING": {"SUSPENDED", "COMPLETED", "FAILED", "STOPPED"},
    "SUSPENDED": {"RESUMED", "CANCELLED", "STOPPED"},
    "RESUMED": {"RUNNING", "COMPLETED", "FAILED", "STOPPED"},
    "STOPPED": set(),
    "CANCELLED": set(),
    "COMPLETED": set(),
    "FAILED": set(),
}


def validate_state(state: str) -> bool:
    return state in VALID_STATES


def can_transition(current: str, next_state: str) -> bool:
    return next_state in ALLOWED_TRANSITIONS.get(current, set())
