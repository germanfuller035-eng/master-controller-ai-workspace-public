from __future__ import annotations

from typing import Any

from . import ControlledOutboundPolicyError, pass_result


FORBIDDEN_TRUE_FIELDS = [
    "sent",
    "paid",
    "crm_written",
    "production_db_written",
    "invoice_sent",
    "accounting_exported",
]


def enforce_no_send_guard(result: dict[str, Any], *, stop_active: bool = False) -> dict[str, Any]:
    if stop_active:
        raise ControlledOutboundPolicyError("STOP blocks outbound/payment/production write")
    for field in FORBIDDEN_TRUE_FIELDS:
        if result.get(field) is True:
            raise ControlledOutboundPolicyError(f"false success or forbidden state: {field}")
    for field in ["outbound_count", "payment_count", "production_db_writes"]:
        if int(result.get(field, 0)) != 0:
            raise ControlledOutboundPolicyError(f"{field} must remain 0")
    if result.get("send_allowed") is True:
        raise ControlledOutboundPolicyError("send_allowed=true is forbidden")
    return pass_result(no_send_guard=True, false_sent_paid_written_blocked=True)


def block_send_attempt(_: dict[str, Any] | None = None) -> None:
    raise ControlledOutboundPolicyError("send attempt blocked by no-send guard")
