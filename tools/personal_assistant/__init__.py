from __future__ import annotations

from typing import Any

from .core import (
    CONFIG_DIR,
    FIXTURE_DIR,
    GENERATED_DIR,
    ROOT,
    SCHEMA_DIR,
    PersonalAssistantPolicyError,
    load_json,
    payload_hash,
    write_json,
    write_text,
)


def pass_result(**fields: Any) -> dict[str, Any]:
    result = {"status": "PASS", "synthetic": True}
    result.update(fields)
    return result
