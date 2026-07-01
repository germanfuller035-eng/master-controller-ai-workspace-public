#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
RESULT_PATH = ROOT / "_generated" / "knowledge_memory_v1" / "MEMORY_VALIDATION_RESULTS.md"
CONFIG_DIR = ROOT / "config" / "memory"
SCHEMA_DIR = ROOT / "schemas" / "memory"


def _load(path: Path, errors: list[str]) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"invalid JSON in {path.relative_to(ROOT)}: {exc}")
        return None


def validate() -> tuple[str, list[str]]:
    errors: list[str] = []
    config = {path.name: _load(path, errors) for path in CONFIG_DIR.glob("*.json")}
    for path in SCHEMA_DIR.glob("*.json"):
        _load(path, errors)
    memory = config.get("MEMORY_POLICY.json") or {}
    if memory.get("memory_write_enabled") is not False or memory.get("memory_write_status") != "OFF":
        errors.append("memory write must remain OFF")
    if memory.get("direct_memory_write") != "DENY":
        errors.append("direct memory write must be denied")
    if memory.get("memory_auto_write") != "DENY":
        errors.append("memory auto-write must be denied")
    if memory.get("curator_decision_required") is not True:
        errors.append("curator decision must be required")
    sensitive = config.get("SENSITIVE_MEMORY_POLICY.json") or {}
    if sensitive.get("sensitive_memory_auto_write") != "DENY":
        errors.append("sensitive auto-write must be denied")
    return ("PASS" if not errors else "FAIL"), errors


def main() -> int:
    status, errors = validate()
    lines = [
        "# Memory Validation Results",
        "",
        "SESSION_NAME=KNOWLEDGE_MEMORY_QDRANT_DOCLING_V1",
        f"MEMORY_VALIDATION_RESULT={status}",
        "MEMORY_WRITE_STATUS=OFF" if status == "PASS" else "MEMORY_WRITE_STATUS=CHECK_ERRORS",
        "DIRECT_MEMORY_WRITE_BLOCKED=PASS" if status == "PASS" else "DIRECT_MEMORY_WRITE_BLOCKED=CHECK_ERRORS",
        "SENSITIVE_AUTO_WRITE_BLOCKED=PASS" if status == "PASS" else "SENSITIVE_AUTO_WRITE_BLOCKED=CHECK_ERRORS",
        "",
        "## Errors",
    ]
    lines.extend(f"- {error}" for error in errors) if errors else lines.append("- None")
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")
    print(f"MEMORY_VALIDATION_RESULT={status}")
    for error in errors:
        print(f"ERROR: {error}")
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
