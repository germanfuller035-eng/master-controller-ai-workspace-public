from __future__ import annotations


def check_daily_cap(*, current_count: int, requested_count: int, daily_cap: int = 3) -> dict[str, object]:
    projected = current_count + requested_count
    allowed = projected <= daily_cap
    return {
        "synthetic": True,
        "daily_cap": daily_cap,
        "current_count": current_count,
        "requested_count": requested_count,
        "projected_count": projected,
        "decision": "ALLOW" if allowed else "BLOCK",
        "daily_cap_enforced": True,
    }
