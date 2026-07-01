from __future__ import annotations

from typing import Any

from . import FinancePolicyError, canonical_payload_hash, ensure_synthetic, pass_result


def build_payment_preparation(data: dict[str, Any], *, stop_active: bool = False) -> dict[str, Any]:
    ensure_synthetic(data, "payment preparation")
    prep = dict(data)
    if prep.get("schema_version") != "finance.payment_preparation.v1":
        raise FinancePolicyError("payment preparation schema_version mismatch")
    if stop_active:
        raise FinancePolicyError("STOP blocks payment preparation activation")
    if prep.get("preparation_only") is not True:
        raise FinancePolicyError("payment object must be preparation-only")
    if prep.get("execution_allowed") is not False:
        raise FinancePolicyError("payment execution must be blocked")
    if prep.get("provider_enabled") is not False:
        raise FinancePolicyError("payment provider must remain disabled")
    if prep.get("owner_approval_required_for_future_payment") is not True:
        raise FinancePolicyError("future payment requires owner approval")
    prep["payload_hash"] = canonical_payload_hash(prep)
    return prep


def validate_payment_preparation(data: dict[str, Any]) -> dict[str, Any]:
    prep = build_payment_preparation(data)
    return pass_result(
        payment_preparation_id=prep["payment_preparation_id"],
        preparation_only=True,
        payment_execution_blocked=True,
        owner_approval_required_for_future_payment=True,
        payload_hash=prep["payload_hash"],
    )


def attempt_payment_execution(_: dict[str, Any]) -> None:
    raise FinancePolicyError("payment execution is disabled for CRM Finance Outbound V1")
