"""Local synthetic CRM contracts.

This package is fixture-driven and never writes to CRM, production databases,
mailboxes, inboxes, payment systems, or external services.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = ROOT / "config" / "crm"
SCHEMA_DIR = ROOT / "schemas" / "crm"
FIXTURE_DIR = ROOT / "tests" / "fixtures" / "crm"
GENERATED_DIR = ROOT / "_generated" / "crm_finance_outbound_v1"

REAL_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d[\s().-]*){7,}(?!\w)")


class CRMPolicyError(ValueError):
    """Raised when a local CRM contract is violated."""


def load_json(path: str | Path) -> Any:
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = ROOT / candidate
    return json.loads(candidate.read_text(encoding="utf-8"))


def write_text(path: str | Path, text: str) -> None:
    target = Path(path)
    if not target.is_absolute():
        target = ROOT / target
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text.rstrip() + "\n", encoding="utf-8", newline="\n")


def iter_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        result: list[str] = []
        for child in value.values():
            result.extend(iter_strings(child))
        return result
    if isinstance(value, list):
        result = []
        for child in value:
            result.extend(iter_strings(child))
        return result
    return []


def ensure_synthetic(data: dict[str, Any], label: str) -> None:
    if data.get("synthetic") is not True:
        raise CRMPolicyError(f"{label} must be explicitly synthetic")


def reject_real_contact_values(data: dict[str, Any], label: str) -> None:
    text = "\n".join(iter_strings(data))
    if REAL_EMAIL_RE.search(text):
        raise CRMPolicyError(f"{label} contains a real-looking email")
    if PHONE_RE.search(text):
        raise CRMPolicyError(f"{label} contains a real-looking phone")


def pass_result(**extra: Any) -> dict[str, Any]:
    result = {
        "synthetic": True,
        "status": "PASS",
        "crm_write_allowed": False,
        "production_db_write_allowed": False,
    }
    result.update(extra)
    return result
