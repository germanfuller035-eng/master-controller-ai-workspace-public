from __future__ import annotations

import hashlib
from datetime import date, datetime, timezone
from typing import Any

from tools.memory.sensitive_rules import ALLOWED_CLASSES, has_secret_like_value


class MemoryProposalError(ValueError):
    pass


REQUIRED_FIELDS = {"proposal_id", "proposed_by", "claim", "source_id", "source_date", "confidence", "classification", "retention"}
ALLOWED_RETENTION = {"SHORT", "STANDARD", "REVIEW_30_DAYS", "UNTIL_SOURCE_EXPIRES"}


def make_memory_proposal(claim: str, source_id: str, source_date: str, classification: str = "SYNTHETIC_PUBLIC", confidence: float = 0.9, retention: str = "REVIEW_30_DAYS") -> dict[str, Any]:
    seed = f"{claim}|{source_id}|{source_date}|{classification}"
    proposal_id = f"memprop_{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:16]}"
    proposal = {
        "proposal_id": proposal_id,
        "proposed_by": "local_synthetic_agent",
        "claim": claim,
        "source_id": source_id,
        "source_date": source_date,
        "confidence": confidence,
        "classification": classification,
        "retention": retention,
        "created_at": datetime.now(timezone.utc).date().isoformat(),
    }
    validate_memory_proposal(proposal)
    return proposal


def validate_memory_proposal(proposal: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    for field in REQUIRED_FIELDS:
        if proposal.get(field) in (None, ""):
            errors.append(f"missing {field}")
    try:
        date.fromisoformat(str(proposal.get("source_date", "")))
    except ValueError:
        errors.append("invalid_source_date")
    try:
        if float(proposal.get("confidence", 0)) < 0.5:
            errors.append("confidence_denied")
        elif float(proposal.get("confidence", 0)) < 0.75:
            errors.append("low_confidence_requires_review")
    except (TypeError, ValueError):
        errors.append("invalid_confidence")
    if proposal.get("classification") not in ALLOWED_CLASSES:
        errors.append("unknown_classification")
    if proposal.get("retention") not in ALLOWED_RETENTION:
        errors.append("retention_required")
    if has_secret_like_value(str(proposal.get("claim", ""))):
        errors.append("secret_like_memory_denied")
    if errors:
        raise MemoryProposalError("; ".join(errors))
    return {"status": "PASS", "proposal_id": proposal["proposal_id"]}


def direct_memory_write(_record: dict[str, Any]) -> dict[str, Any]:
    return {"status": "DENIED", "decision": "DIRECT_MEMORY_WRITE_DENIED", "memory_write": False}
