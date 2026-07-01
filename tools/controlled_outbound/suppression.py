from __future__ import annotations

from typing import Any

from . import ControlledOutboundPolicyError, ensure_synthetic


def check_suppression(contact: dict[str, Any], suppressed_ids: set[str] | None = None) -> dict[str, Any]:
    ensure_synthetic(contact, "suppression contact")
    suppressed_set = suppressed_ids or set()
    contact_id = str(contact.get("contact_id", ""))
    status = str(contact.get("suppression_status", "")).upper()
    stop_status = str(contact.get("stop_status", "")).upper()
    suppressed = contact_id in suppressed_set or status == "SUPPRESSED" or stop_status == "STOP_ACTIVE"
    return {
        "synthetic": True,
        "contact_id": contact_id,
        "suppressed": suppressed,
        "decision": "BLOCK" if suppressed else "ALLOW",
        "outbound_allowed": not suppressed,
        "payment_allowed": not suppressed,
        "production_db_write_allowed": not suppressed,
    }


def require_not_suppressed(contact: dict[str, Any], suppressed_ids: set[str] | None = None) -> dict[str, Any]:
    result = check_suppression(contact, suppressed_ids)
    if result["suppressed"]:
        raise ControlledOutboundPolicyError("suppression blocks outbound/payment/production write")
    return result
