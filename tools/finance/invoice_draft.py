from __future__ import annotations

from typing import Any

from . import FinancePolicyError, canonical_payload_hash, ensure_synthetic, pass_result


def build_invoice_draft(data: dict[str, Any]) -> dict[str, Any]:
    ensure_synthetic(data, "invoice draft")
    draft = dict(data)
    if draft.get("schema_version") != "finance.invoice_draft.v1":
        raise FinancePolicyError("invoice draft schema_version mismatch")
    if draft.get("draft_only") is not True:
        raise FinancePolicyError("invoice must remain draft-only")
    if draft.get("send_allowed") is not False:
        raise FinancePolicyError("invoice send must be blocked")
    if not draft.get("line_items"):
        raise FinancePolicyError("invoice draft requires line items")
    if draft.get("owner_approval_required_for_future_send") is not True:
        raise FinancePolicyError("future invoice send requires owner approval")
    draft["payload_hash"] = canonical_payload_hash(draft)
    return draft


def validate_invoice_draft(data: dict[str, Any]) -> dict[str, Any]:
    draft = build_invoice_draft(data)
    return pass_result(
        invoice_draft_id=draft["invoice_draft_id"],
        draft_only=True,
        invoice_send_blocked=True,
        owner_approval_required_for_future_send=True,
        payload_hash=draft["payload_hash"],
    )


def attempt_invoice_send(_: dict[str, Any]) -> None:
    raise FinancePolicyError("invoice send is disabled for CRM Finance Outbound V1")
