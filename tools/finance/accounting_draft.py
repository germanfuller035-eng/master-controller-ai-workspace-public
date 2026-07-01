from __future__ import annotations

from typing import Any

from . import FinancePolicyError, canonical_payload_hash, ensure_synthetic, pass_result


def _sum_amounts(items: list[dict[str, Any]]) -> float:
    return sum(float(item.get("amount", 0)) for item in items)


def build_accounting_entry_draft(data: dict[str, Any]) -> dict[str, Any]:
    ensure_synthetic(data, "accounting entry draft")
    draft = dict(data)
    if draft.get("schema_version") != "finance.accounting_entry_draft.v1":
        raise FinancePolicyError("accounting entry schema_version mismatch")
    if draft.get("draft_only") is not True:
        raise FinancePolicyError("accounting entry must remain draft-only")
    if draft.get("export_allowed") is not False:
        raise FinancePolicyError("accounting export must be blocked")
    debits = draft.get("debits", [])
    credits = draft.get("credits", [])
    if not debits or not credits:
        raise FinancePolicyError("accounting draft requires debit and credit lines")
    if _sum_amounts(debits) != _sum_amounts(credits):
        raise FinancePolicyError("accounting draft must balance")
    draft["payload_hash"] = canonical_payload_hash(draft)
    return draft


def validate_accounting_entry_draft(data: dict[str, Any]) -> dict[str, Any]:
    draft = build_accounting_entry_draft(data)
    return pass_result(
        accounting_entry_draft_id=draft["accounting_entry_draft_id"],
        draft_only=True,
        accounting_export_blocked=True,
        payload_hash=draft["payload_hash"],
    )


def attempt_accounting_export(_: dict[str, Any]) -> None:
    raise FinancePolicyError("accounting export is disabled for CRM Finance Outbound V1")
