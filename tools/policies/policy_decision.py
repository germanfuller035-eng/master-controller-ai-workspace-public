#!/usr/bin/env python3
"""Local deterministic policy decision engine for policy/security v1.

This is not an OPA runtime. It loads local JSON contracts and evaluates
synthetic requests without production calls, credentials, adapters, or side
effects beyond an optional in-memory approval ledger.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from tools.policies.payload_hash import PayloadHashError, calculate_payload_hash


ROOT = Path(__file__).resolve().parents[2]
ALLOWED_LIFECYCLES = {
    "OFF",
    "LOCAL_SYNTHETIC",
    "SHADOW",
    "PRODUCTION_READ_ONLY",
    "DRAFT_ONLY",
    "OWNER_APPROVAL_REQUIRED",
    "LIMITED_AUTONOMY",
}
VALID_RISKS = {"R0", "R1", "R2", "R3", "R4", "R5"}
DOC_LOCAL_ACTIONS = {"read_evidence", "search_repo", "classify_data", "local_policy_test", "local_report", "local_draft"}
STOP_BLOCKED_ACTIONS = {
    "outbound_send",
    "publish_external",
    "production_deploy",
    "production_db_write",
    "browser_action",
    "payment_operation",
    "delete_production_data",
    "permission_change",
    "secret_issuance",
    "direct_secret_read",
    "irreversible_action",
}


@dataclass
class SyntheticApprovalLedger:
    used_approval_ids: set[str] = field(default_factory=set)
    used_payload_hashes: set[str] = field(default_factory=set)

    def is_replayed(self, approval: dict[str, Any]) -> bool:
        approval_id = str(approval.get("approval_id", ""))
        payload_hash = str(approval.get("payload_hash", ""))
        return bool(approval_id and approval_id in self.used_approval_ids) or bool(
            payload_hash and payload_hash in self.used_payload_hashes
        )

    def mark_used(self, approval: dict[str, Any]) -> None:
        approval_id = str(approval.get("approval_id", ""))
        payload_hash = str(approval.get("payload_hash", ""))
        if approval_id:
            self.used_approval_ids.add(approval_id)
        if payload_hash:
            self.used_payload_hashes.add(payload_hash)


def load_json(rel_path: str) -> dict[str, Any]:
    return json.loads((ROOT / rel_path).read_text(encoding="utf-8"))


def load_action_map() -> dict[str, dict[str, Any]]:
    data = load_json("config/policies/ACTION_RISK_MAP.json")
    return {item["id"]: item for item in data.get("actions", [])}


def load_capability_matrix() -> dict[str, dict[str, Any]]:
    data = load_json("config/policies/CAPABILITY_MATRIX.json")
    return {item["id"]: item for item in data.get("capabilities", [])}


def parse_time(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def feature_flags_allow(request: dict[str, Any]) -> bool:
    action = request.get("action")
    if action in DOC_LOCAL_ACTIONS:
        return True
    required_flag = request.get("requires_feature_flag")
    if not required_flag:
        return True
    states = request.get("feature_flag_state", {})
    if not isinstance(states, dict):
        return False
    state = states.get(required_flag, "OFF")
    return state in (ALLOWED_LIFECYCLES - {"OFF"})


def expected_payload_hash(request: dict[str, Any], approval: dict[str, Any]) -> str:
    target = request.get("target", request.get("resource"))
    expiry = approval.get("expires_at") or approval.get("expiry") or request.get("expiry")
    payload_material = {
        "actor": request.get("actor"),
        "action": request.get("action"),
        "target": target,
        "payload": request.get("payload", {}),
        "risk": request.get("risk"),
        "expiry": expiry,
        "task_id": request.get("task_id"),
    }
    return calculate_payload_hash(payload_material)


def approval_valid(
    request: dict[str, Any],
    approval: dict[str, Any] | None,
    required_type: str,
    ledger: SyntheticApprovalLedger,
    now: datetime,
    consume: bool,
) -> tuple[bool, str]:
    if not approval:
        return False, "missing approval"
    if approval.get("revoked"):
        return False, "approval revoked"
    if approval.get("single_use") is not True:
        return False, "approval must be single use"
    approval_type = approval.get("approval_type")
    if required_type == "STRONG_OWNER_APPROVAL" and approval_type != "STRONG_OWNER_APPROVAL":
        return False, "strong owner approval required"
    if required_type == "OWNER_APPROVAL" and approval_type not in {"OWNER_APPROVAL", "STRONG_OWNER_APPROVAL"}:
        return False, "owner approval required"

    expires_at = approval.get("expires_at") or approval.get("expiry")
    if not expires_at:
        return False, "approval expiry required"
    try:
        if parse_time(str(expires_at)) <= now:
            return False, "approval expired"
    except ValueError:
        return False, "approval expiry invalid"

    try:
        expected = expected_payload_hash(request, approval)
    except PayloadHashError:
        return False, "approval payload hash cannot be calculated"
    if approval.get("payload_hash") != expected:
        return False, "approval hash mismatch"
    if ledger.is_replayed(approval):
        return False, "approval replay denied"
    if consume:
        ledger.mark_used(approval)
    return True, "approval valid"


def evaluate_policy(
    request: dict[str, Any],
    approval: dict[str, Any] | None = None,
    ledger: SyntheticApprovalLedger | None = None,
    now: datetime | None = None,
    consume_approval: bool = True,
) -> dict[str, Any]:
    ledger = ledger or SyntheticApprovalLedger()
    now = now or datetime.now(timezone.utc)
    action_map = load_action_map()
    capabilities = load_capability_matrix()

    action = request.get("action")
    risk = request.get("risk")
    requested_capability = request.get("requested_capability")
    lifecycle_state = request.get("lifecycle_state", "LOCAL_SYNTHETIC")

    if lifecycle_state not in ALLOWED_LIFECYCLES:
        return {"decision": "DENY", "reason": "unknown lifecycle state"}
    if risk not in VALID_RISKS:
        return {"decision": "DENY", "reason": "unknown risk"}
    if action not in action_map:
        return {"decision": "DENY", "reason": "unknown action"}

    action_entry = action_map[action]
    mapped_capability = action_entry.get("capability")
    if requested_capability not in capabilities:
        return {"decision": "DENY", "reason": "unknown capability"}
    if requested_capability != mapped_capability:
        return {"decision": "DENY", "reason": "capability does not match action"}
    if action_entry.get("decision") == "DENY":
        return {"decision": "DENY", "reason": "capability explicitly denied"}

    cap = capabilities[requested_capability]
    if cap.get("current_lifecycle") == "OFF" and risk in {"R0", "R1"}:
        return {"decision": "DENY", "reason": "capability off"}
    if cap.get("current_lifecycle") not in ALLOWED_LIFECYCLES:
        return {"decision": "DENY", "reason": "unknown capability lifecycle state"}

    flag_states = request.get("feature_flag_state", {})
    if isinstance(flag_states, dict):
        unknown_flag_state = [state for state in flag_states.values() if state not in ALLOWED_LIFECYCLES]
        if unknown_flag_state:
            return {"decision": "DENY", "reason": "unknown feature flag lifecycle state"}
    if not feature_flags_allow(request):
        return {"decision": "DENY", "reason": "feature flag off"}

    stop_active = bool(request.get("stop_active"))
    if stop_active and (risk in {"R4", "R5"} or action in STOP_BLOCKED_ACTIONS):
        return {"decision": "STOP_BLOCKED", "reason": "STOP active"}

    if risk == "R0":
        return {"decision": "ALLOW", "reason": "read-only known action allowed"}
    if risk in {"R1", "R2"}:
        return {"decision": "ALLOW", "reason": "local or journaled action allowed"}
    if risk == "R3":
        return {"decision": "ALLOW", "reason": "policy gate passed"}
    if risk == "R4":
        ok, reason = approval_valid(request, approval, "OWNER_APPROVAL", ledger, now, consume_approval)
        if ok:
            return {"decision": "ALLOW", "reason": reason}
        if reason in {"missing approval", "owner approval required"}:
            return {"decision": "REQUIRE_OWNER_APPROVAL", "reason": reason}
        return {"decision": "DENY", "reason": reason}
    if risk == "R5":
        ok, reason = approval_valid(request, approval, "STRONG_OWNER_APPROVAL", ledger, now, consume_approval)
        if ok:
            return {"decision": "ALLOW", "reason": reason}
        if reason in {"missing approval", "strong owner approval required"}:
            return {"decision": "REQUIRE_STRONG_OWNER_APPROVAL", "reason": reason}
        return {"decision": "DENY", "reason": reason}

    return {"decision": "DENY", "reason": "fail closed"}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Evaluate a local synthetic policy request.")
    parser.add_argument("request", help="JSON request path")
    parser.add_argument("--approval", help="Optional approval JSON path")
    args = parser.parse_args(argv)
    request = json.loads(Path(args.request).read_text(encoding="utf-8"))
    approval = json.loads(Path(args.approval).read_text(encoding="utf-8")) if args.approval else None
    result = evaluate_policy(request, approval=approval)
    print(json.dumps(result, sort_keys=True))
    return 0 if result["decision"] == "ALLOW" else 2


if __name__ == "__main__":
    raise SystemExit(main())
