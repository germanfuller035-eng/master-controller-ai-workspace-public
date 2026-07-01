from __future__ import annotations

from typing import Any

from . import ControlledOutboundPolicyError, canonical_payload_hash, ensure_synthetic, pass_result
from .outbound_draft import build_outbound_draft


MAX_BATCH_SIZE = 3


def validate_batch_max_3(batch: dict[str, Any], drafts: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    ensure_synthetic(batch, "outbound batch")
    if batch.get("schema_version") != "controlled_outbound.outbound_batch.v1":
        raise ControlledOutboundPolicyError("batch schema_version mismatch")
    if batch.get("max_batch_size") != MAX_BATCH_SIZE:
        raise ControlledOutboundPolicyError("batch max size must be 3")
    if batch.get("send_allowed") is not False:
        raise ControlledOutboundPolicyError("batch send must be blocked")
    resolved = [build_outbound_draft(item) for item in (drafts or batch.get("drafts", []))]
    allowed = resolved[:MAX_BATCH_SIZE]
    blocked = resolved[MAX_BATCH_SIZE:]
    decision = "ALLOW" if not blocked else "BLOCK_OVER_LIMIT"
    payload = {
        "batch_id": batch.get("batch_id"),
        "allowed_payload_hashes": [item["payload_hash"] for item in allowed],
        "max_batch_size": MAX_BATCH_SIZE,
    }
    return pass_result(
        batch_id=batch.get("batch_id"),
        decision=decision,
        max_batch_size=MAX_BATCH_SIZE,
        allowed_count=len(allowed),
        blocked_count=len(blocked),
        fourth_draft_blocked=bool(blocked),
        owner_approval_required_for_future_send=True,
        batch_payload_hash=canonical_payload_hash(payload),
    )
