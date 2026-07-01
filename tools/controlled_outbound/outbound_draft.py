from __future__ import annotations

from typing import Any

from . import ControlledOutboundPolicyError, canonical_payload_hash, ensure_synthetic, pass_result


def build_outbound_draft(data: dict[str, Any]) -> dict[str, Any]:
    ensure_synthetic(data, "outbound draft")
    draft = dict(data)
    if draft.get("schema_version") != "controlled_outbound.outbound_draft.v1":
        raise ControlledOutboundPolicyError("outbound draft schema_version mismatch")
    if draft.get("draft_only") is not True:
        raise ControlledOutboundPolicyError("outbound item must remain draft-only")
    if draft.get("send_allowed") is not False:
        raise ControlledOutboundPolicyError("send must be blocked")
    if draft.get("sent") is True:
        raise ControlledOutboundPolicyError("sent=true is forbidden")
    if draft.get("owner_approval_required_for_future_send") is not True:
        raise ControlledOutboundPolicyError("future send requires owner approval")
    draft["payload_hash"] = canonical_payload_hash(draft)
    return draft


def validate_outbound_draft(data: dict[str, Any]) -> dict[str, Any]:
    draft = build_outbound_draft(data)
    return pass_result(
        draft_id=draft["draft_id"],
        contact_id=draft["contact_id"],
        draft_only=True,
        sent=False,
        owner_approval_required_for_future_send=True,
        payload_hash=draft["payload_hash"],
    )
