from __future__ import annotations

from typing import Any

from . import CRMPolicyError, ensure_synthetic, pass_result


def classify_reply(reply: dict[str, Any]) -> dict[str, Any]:
    ensure_synthetic(reply, "reply monitor event")
    if reply.get("schema_version") != "crm.reply_monitor_event.v1":
        raise CRMPolicyError("reply schema_version mismatch")
    if reply.get("source") != "synthetic_reply_fixture":
        raise CRMPolicyError("reply monitor must use synthetic fixture source")
    if reply.get("real_inbox_access") is not False:
        raise CRMPolicyError("real inbox access is disabled")
    body = str(reply.get("body", "")).lower()
    if "stop" in body or "unsubscribe" in body:
        classification = "UNSUBSCRIBE"
        suppression_required = True
    elif any(term in body for term in ("concern", "budget", "timing", "not now", "objection")):
        classification = "OBJECTION"
        suppression_required = False
    elif any(term in body for term in ("interested", "yes", "next step", "positive")):
        classification = "POSITIVE"
        suppression_required = False
    else:
        classification = "UNKNOWN"
        suppression_required = False
    return pass_result(
        reply_id=reply.get("reply_id"),
        contact_id=reply.get("contact_id"),
        reply_classification=classification,
        suppression_required=suppression_required,
        real_inbox_access=False,
    )
