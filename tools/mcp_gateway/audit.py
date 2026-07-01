from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from tools.mcp_gateway.models import GatewayRequest, GatewayResponse
from tools.mcp_gateway.redaction import redact_data


ROOT = Path(__file__).resolve().parents[2]
AUDIT_ROOT = ROOT / "_generated" / "mcp_gateway_v1" / "synthetic_audit"
EVENT_LOG = AUDIT_ROOT / "events.jsonl"
ZERO_HASH = "0" * 64


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class AuditLogger:
    def __init__(self, event_log: Path | None = None) -> None:
        self.event_log = event_log or EVENT_LOG

    def _read_events(self) -> list[dict[str, Any]]:
        if not self.event_log.exists():
            return []
        events = []
        for line in self.event_log.read_text(encoding="utf-8").splitlines():
            if line.strip():
                events.append(json.loads(line))
        return events

    def emit(self, request: GatewayRequest, response: GatewayResponse) -> str:
        self.event_log.parent.mkdir(parents=True, exist_ok=True)
        events = self._read_events()
        previous_hash = events[-1]["current_hash"] if events else ZERO_HASH
        safe_request = redact_data(request.safe_dict())
        payload_hash = _sha256_text(_canonical(safe_request))
        event = {
            "sequence": len(events) + 1,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "request_id": request.request_id,
            "task_id": request.task_id,
            "actor": request.actor,
            "adapter_id": request.adapter_id,
            "action": request.action,
            "resource": request.resource,
            "risk": request.risk,
            "policy_decision": redact_data(response.policy_decision),
            "result": response.status,
            "artifact_ids": response.artifact_ids,
            "payload_hash": payload_hash,
            "previous_hash": previous_hash,
        }
        event["current_hash"] = _sha256_text(previous_hash + _canonical(event))
        with self.event_log.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(event, sort_keys=True) + "\n")
        return event["current_hash"][:16]


def verify_audit_chain(event_log: Path = EVENT_LOG) -> bool:
    if not event_log.exists():
        return True
    previous_hash = ZERO_HASH
    for line in event_log.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        event = json.loads(line)
        current_hash = event.get("current_hash")
        if event.get("previous_hash") != previous_hash:
            return False
        material = dict(event)
        material.pop("current_hash", None)
        expected = _sha256_text(previous_hash + _canonical(material))
        if current_hash != expected:
            return False
        previous_hash = current_hash
    return True
