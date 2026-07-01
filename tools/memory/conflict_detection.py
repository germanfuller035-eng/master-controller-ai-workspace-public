from __future__ import annotations

import hashlib
from typing import Any


def detect_memory_conflicts(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: dict[tuple[Any, Any], dict[str, Any]] = {}
    conflicts: list[dict[str, Any]] = []
    for record in records:
        key = (record.get("subject"), record.get("key"))
        existing = seen.get(key)
        if existing and existing.get("value") != record.get("value"):
            seed = f"{existing.get('memory_id')}|{record.get('memory_id')}"
            conflicts.append({
                "conflict_id": f"memconf_{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:16]}",
                "subject": record.get("subject"),
                "key": record.get("key"),
                "record_ids": [existing.get("memory_id"), record.get("memory_id")],
                "decision": "FLAG_FOR_CURATOR",
            })
        else:
            seen[key] = record
    return conflicts
