from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any

from tools.memory.memory_proposal import MemoryProposalError, validate_memory_proposal
from tools.memory.sensitive_rules import review_sensitive_memory


def curate_memory_proposal(proposal: dict[str, Any], approve: bool = True, owner_approval: bool = False) -> dict[str, Any]:
    try:
        validate_memory_proposal(proposal)
    except MemoryProposalError as exc:
        return _decision(proposal, "REJECT", str(exc))
    sensitive = review_sensitive_memory(proposal, owner_approval=owner_approval)
    if sensitive["status"] == "DENIED":
        return _decision(proposal, "REJECT", sensitive["decision"])
    if sensitive["status"] == "NEEDS_OWNER_APPROVAL":
        return _decision(proposal, "NEEDS_OWNER_APPROVAL", sensitive["decision"])
    if not approve:
        return _decision(proposal, "REJECT", "curator_rejected")
    decision = _decision(proposal, "APPROVE_PROPOSED_RECORD", "curator_approved")
    decision["proposed_record"] = proposed_memory_record(proposal)
    return decision


def proposed_memory_record(proposal: dict[str, Any]) -> dict[str, Any]:
    seed = f"{proposal['proposal_id']}|{proposal['claim']}|{proposal['source_id']}"
    return {
        "memory_id": f"memory_{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:16]}",
        "proposal_id": proposal["proposal_id"],
        "claim": proposal["claim"],
        "source_id": proposal["source_id"],
        "source_date": proposal["source_date"],
        "classification": proposal["classification"],
        "retention": proposal["retention"],
        "record_status": "PROPOSED_NOT_WRITTEN",
        "memory_write": False,
    }


def _decision(proposal: dict[str, Any], decision: str, reason: str) -> dict[str, Any]:
    seed = f"{proposal.get('proposal_id', 'missing')}|{decision}|{reason}"
    return {
        "decision_id": f"memdec_{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:16]}",
        "proposal_id": proposal.get("proposal_id", ""),
        "decision": decision,
        "reviewed_by": "Memory Curator synthetic validator",
        "reviewed_at": datetime.now(timezone.utc).date().isoformat(),
        "reason": reason,
        "memory_write": False,
    }
