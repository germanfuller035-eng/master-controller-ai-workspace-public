"""Local synthetic controlled-outbound contracts.

This package creates draft and shadow results only. It never sends messages,
executes payments, writes CRM records, writes production DB state, or connects
to real inboxes or providers.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = ROOT / "config" / "controlled_outbound"
SCHEMA_DIR = ROOT / "schemas" / "controlled_outbound"
FIXTURE_DIR = ROOT / "tests" / "fixtures" / "controlled_outbound"
GENERATED_DIR = ROOT / "_generated" / "crm_finance_outbound_v1"


class ControlledOutboundPolicyError(ValueError):
    """Raised when a controlled outbound contract is violated."""


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


def canonical_payload_hash(payload: dict[str, Any]) -> str:
    normalized = dict(payload)
    normalized.pop("payload_hash", None)
    raw = json.dumps(normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def ensure_synthetic(data: dict[str, Any], label: str) -> None:
    if data.get("synthetic") is not True:
        raise ControlledOutboundPolicyError(f"{label} must be explicitly synthetic")


def pass_result(**extra: Any) -> dict[str, Any]:
    result = {
        "synthetic": True,
        "status": "PASS",
        "send_allowed": False,
        "outbound_count": 0,
        "payment_count": 0,
        "production_db_writes": 0,
    }
    result.update(extra)
    return result
