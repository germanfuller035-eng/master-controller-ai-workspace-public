"""Local synthetic finance draft contracts.

The package creates draft objects only. It never sends invoices, exports
accounting entries, executes payments, or calls bank/payment/accounting APIs.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = ROOT / "config" / "finance"
SCHEMA_DIR = ROOT / "schemas" / "finance"
FIXTURE_DIR = ROOT / "tests" / "fixtures" / "finance"
GENERATED_DIR = ROOT / "_generated" / "crm_finance_outbound_v1"


class FinancePolicyError(ValueError):
    """Raised when a finance draft contract is violated."""


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
        raise FinancePolicyError(f"{label} must be explicitly synthetic")


def pass_result(**extra: Any) -> dict[str, Any]:
    result = {
        "synthetic": True,
        "status": "PASS",
        "invoice_send_allowed": False,
        "accounting_export_allowed": False,
        "payment_execution_allowed": False,
        "production_db_write_allowed": False,
    }
    result.update(extra)
    return result
