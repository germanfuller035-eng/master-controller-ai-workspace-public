from __future__ import annotations

from datetime import date
from typing import Any


class TemporalFactValidationError(ValueError):
    pass


REQUIRED_FIELDS = {"fact_id", "subject", "predicate", "value", "valid_from", "source_id", "confidence"}


def _iso_date(value: str) -> bool:
    try:
        date.fromisoformat(value)
        return True
    except ValueError:
        return False


def validate_temporal_fact(fact: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    for field in REQUIRED_FIELDS:
        if fact.get(field) in (None, ""):
            errors.append(f"missing {field}")
    if fact.get("valid_from") and not _iso_date(str(fact["valid_from"])):
        errors.append("invalid_valid_from")
    if fact.get("valid_to") and not _iso_date(str(fact["valid_to"])):
        errors.append("invalid_valid_to")
    try:
        if float(fact.get("confidence", 0)) < 0.5:
            errors.append("confidence_below_threshold")
    except (TypeError, ValueError):
        errors.append("invalid_confidence")
    if errors:
        raise TemporalFactValidationError("; ".join(errors))
    return {"status": "PASS", "fact_id": fact["fact_id"]}


def conflict_key(fact: dict[str, Any]) -> tuple[Any, Any, Any]:
    return (fact.get("subject"), fact.get("predicate"), fact.get("valid_from"))


def detect_temporal_conflicts(facts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: dict[tuple[Any, Any, Any], dict[str, Any]] = {}
    conflicts: list[dict[str, Any]] = []
    for fact in facts:
        validate_temporal_fact(fact)
        key = conflict_key(fact)
        existing = seen.get(key)
        if existing and existing.get("value") != fact.get("value"):
            conflicts.append({
                "conflict_id": f"temporal_conflict_{len(conflicts) + 1}",
                "fact_ids": [existing["fact_id"], fact["fact_id"]],
                "decision": "FLAG_FOR_CURATOR",
            })
        else:
            seen[key] = fact
    return conflicts
