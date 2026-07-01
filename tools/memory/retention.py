from __future__ import annotations

from datetime import date, timedelta
from typing import Any

ALLOWED_RETENTION = {"SHORT": 7, "STANDARD": 365, "REVIEW_30_DAYS": 30, "UNTIL_SOURCE_EXPIRES": 30}


def validate_retention_rule(rule: dict[str, Any]) -> dict[str, Any]:
    retention = rule.get("retention")
    if retention not in ALLOWED_RETENTION:
        raise ValueError("unknown_retention")
    if int(rule.get("review_after_days", 0)) <= 0:
        raise ValueError("review_after_days_required")
    return {"status": "PASS", "rule_id": rule.get("rule_id")}


def apply_retention(record: dict[str, Any], today: date | None = None) -> dict[str, Any]:
    current = today or date.today()
    retention = record.get("retention", "REVIEW_30_DAYS")
    days = ALLOWED_RETENTION.get(retention)
    if days is None:
        raise ValueError("unknown_retention")
    created_at = date.fromisoformat(str(record.get("created_at", current.isoformat())))
    review_at = created_at + timedelta(days=days)
    return {
        "memory_id": record.get("memory_id"),
        "retention": retention,
        "review_at": review_at.isoformat(),
        "action": "REVIEW_NOT_DELETE_AUTOMATICALLY",
        "expired": current >= review_at,
    }
