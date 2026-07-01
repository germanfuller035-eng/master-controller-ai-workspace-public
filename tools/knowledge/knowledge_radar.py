from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any

DENIED_ACTIONS = {"INSTALL_COMPONENT", "WRITE_MEMORY", "CRAWL", "BROWSER_AUTOMATION", "GITHUB_POLL", "EXTERNAL_MONITOR"}


def create_radar_proposal(source_id: str, reason: str, classification: str = "PUBLIC", confidence: float = 0.8) -> dict[str, Any]:
    seed = f"{source_id}|{reason}|{classification}"
    proposal_id = f"radar_{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:16]}"
    return {
        "proposal_id": proposal_id,
        "source_id": source_id,
        "reason": reason,
        "classification": classification,
        "confidence": confidence,
        "created_at": datetime.now(timezone.utc).date().isoformat(),
        "action": "PROPOSE_ONLY",
        "memory_write": False,
        "install_attempted": False,
        "external_network_attempted": False,
    }


def evaluate_radar_action(action: str) -> dict[str, Any]:
    if action in DENIED_ACTIONS:
        return {"status": "DENIED", "decision": "DENY", "reason": f"{action}_NOT_ALLOWED"}
    if action == "PROPOSE_ONLY":
        return {"status": "ALLOWED", "decision": "ALLOW_PROPOSAL_ONLY"}
    return {"status": "DENIED", "decision": "DENY", "reason": "UNKNOWN_ACTION"}
