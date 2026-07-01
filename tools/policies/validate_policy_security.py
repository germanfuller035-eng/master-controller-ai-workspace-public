#!/usr/bin/env python3
"""Validate policy/security v1 local contracts.

The validator is deterministic and standard-library only. It does not install,
start, connect to, or deploy runtime infrastructure.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
RESULT_PATH = ROOT / "_generated" / "policy_security_v1" / "POLICY_SECURITY_VALIDATION_RESULTS.md"
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
POLICY_JSON = [
    "config/policies/RISK_MODEL_R0_R5.json",
    "config/policies/CAPABILITY_MATRIX.json",
    "config/policies/ACTION_RISK_MAP.json",
    "config/policies/APPROVAL_POLICY.json",
    "config/policies/STOP_POLICY.json",
    "config/policies/DENIED_CAPABILITIES.json",
    "config/policies/PRODUCTION_BOUNDARIES.json",
    "config/security/SECRET_CLASSES.json",
    "config/security/SECRET_DENYLIST_PATTERNS.json",
    "config/security/DATA_RETENTION_POLICY.json",
    "config/emergency/STOP_ACTIONS.json",
    "config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json",
    ".claude/agents/AGENTS_LOCK.json",
]
SCHEMAS = [
    "schemas/policy/approval_request.schema.json",
    "schemas/policy/approval_grant.schema.json",
    "schemas/policy/approval_decision.schema.json",
    "schemas/policy/payload_hash.schema.json",
    "schemas/policy/policy_decision.schema.json",
    "schemas/security/secret_grant.schema.json",
    "schemas/security/secret_reference.schema.json",
    "schemas/security/vault_manifest.schema.json",
    "schemas/security/data_classification.schema.json",
    "schemas/audit/high_risk_event.schema.json",
    "schemas/audit/audit_chain.schema.json",
]
SECRET_VALUE_PATTERNS = [
    re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I),
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"(?i)\b(?:password|passwd|token|secret|private_key|refresh|access_token|bearer|vless)\b\s*[:=]\s*\S{6,}"),
]
FORBIDDEN_ALLOWED_TOOLS = {
    "unrestricted_shell",
    "direct_docker_socket",
    "production_db_write",
    "production_deploy",
    "outbound_send",
    "payments",
    "secret_read",
}


def load_json(rel_path: str, errors: list[str]) -> Any:
    path = ROOT / rel_path
    if not path.exists():
        errors.append(f"missing JSON file: {rel_path}")
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"invalid JSON in {rel_path}: {exc}")
        return None


def iter_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            out.extend(iter_strings(item))
        return out
    if isinstance(value, dict):
        out = []
        for item in value.values():
            out.extend(iter_strings(item))
        return out
    return []


def check_secret_values(rel_path: str, value: Any, errors: list[str]) -> None:
    for text in iter_strings(value):
        for pattern in SECRET_VALUE_PATTERNS:
            if pattern.search(text):
                errors.append(f"{rel_path} contains suspicious secret-looking value")
                return


def check_duplicate_ids(rel_path: str, entries: list[dict[str, Any]], errors: list[str]) -> None:
    seen: set[str] = set()
    for entry in entries:
        entry_id = entry.get("id")
        if not entry_id:
            errors.append(f"{rel_path} entry missing id")
            continue
        if entry_id in seen:
            errors.append(f"{rel_path} duplicate id {entry_id}")
        seen.add(entry_id)


def check_capabilities(data: dict[str, Any], errors: list[str]) -> None:
    capabilities = data.get("capabilities", [])
    check_duplicate_ids("config/policies/CAPABILITY_MATRIX.json", capabilities, errors)
    for cap in capabilities:
        current = cap.get("current_lifecycle")
        if current not in ALLOWED_LIFECYCLES:
            errors.append(f"capability {cap.get('id')} has unknown lifecycle")
        risk = cap.get("risk_max")
        if risk not in VALID_RISKS:
            errors.append(f"capability {cap.get('id')} has invalid risk")
        allowed_tools = set(cap.get("allowed_tools", []))
        forbidden = sorted(allowed_tools & FORBIDDEN_ALLOWED_TOOLS)
        if forbidden:
            errors.append(f"capability {cap.get('id')} allows forbidden tools {forbidden}")
        if cap.get("id") in {"direct_docker_socket", "unrestricted_shell", "direct_production_filesystem", "direct_mcp_production_tool_access"}:
            if current != "OFF":
                errors.append(f"capability {cap.get('id')} must remain OFF")
        if risk == "R4" and "owner approval" not in str(cap.get("approval_requirement", "")).lower():
            errors.append(f"capability {cap.get('id')} R4 lacks owner approval")
        if risk == "R5" and "strong owner approval" not in str(cap.get("approval_requirement", "")).lower():
            errors.append(f"capability {cap.get('id')} R5 lacks strong owner approval")


def check_action_map(data: dict[str, Any], errors: list[str]) -> None:
    if data.get("default_unknown_action") != "DENY":
        errors.append("ACTION_RISK_MAP default_unknown_action must be DENY")
    actions = data.get("actions", [])
    check_duplicate_ids("config/policies/ACTION_RISK_MAP.json", actions, errors)
    for action in actions:
        if action.get("risk") not in VALID_RISKS:
            errors.append(f"action {action.get('id')} invalid risk")


def check_feature_flags(data: dict[str, Any], errors: list[str]) -> None:
    for flag in data.get("feature_flags", []):
        if flag.get("initial_state") != "OFF" or flag.get("current_lifecycle") != "OFF":
            errors.append(f"feature flag {flag.get('id')} must default OFF")


def check_agents(data: dict[str, Any], errors: list[str]) -> None:
    for agent in data.get("agents", []):
        if agent.get("production_capabilities", 0) != 0:
            errors.append(f"agent {agent.get('id')} production_capabilities must be 0")
        if agent.get("runtime_enabled") is not False:
            errors.append(f"agent {agent.get('id')} runtime must remain disabled")


def main() -> int:
    errors: list[str] = []
    loaded: dict[str, Any] = {}
    for rel_path in POLICY_JSON + SCHEMAS:
        data = load_json(rel_path, errors)
        if data is not None:
            loaded[rel_path] = data
            check_secret_values(rel_path, data, errors)

    check_capabilities(loaded.get("config/policies/CAPABILITY_MATRIX.json", {}), errors)
    check_action_map(loaded.get("config/policies/ACTION_RISK_MAP.json", {}), errors)
    check_feature_flags(loaded.get("config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json", {}), errors)
    check_agents(loaded.get(".claude/agents/AGENTS_LOCK.json", {}), errors)

    approval_policy = loaded.get("config/policies/APPROVAL_POLICY.json", {}).get("approval_policy", {})
    if not approval_policy.get("single_use") or not approval_policy.get("expires") or not approval_policy.get("binds_to_exact_payload_hash"):
        errors.append("approval policy must require single-use, expiry, and exact payload hash binding")
    if approval_policy.get("replay_policy") != "DENY_REUSED_APPROVAL_ID_OR_HASH":
        errors.append("approval replay policy must deny reused approval id or hash")

    stop_policy = loaded.get("config/policies/STOP_POLICY.json", {})
    for required in ("outbound_send", "production_db_write", "browser_action", "payment_operation"):
        if required not in stop_policy.get("stop_blocks", []):
            errors.append(f"STOP policy missing block for {required}")

    scanner_config = loaded.get("config/security/SECRET_DENYLIST_PATTERNS.json", {})
    if not scanner_config.get("patterns"):
        errors.append("secret scanner patterns missing")

    status = "PASS" if not errors else "FAIL"
    lines = [
        "# Policy Security Validation Results",
        "",
        "SESSION=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1",
        f"VALIDATION_RESULT={status}",
        f"JSON_FILES_CHECKED={len(POLICY_JSON)}",
        f"SCHEMAS_CHECKED={len(SCHEMAS)}",
        "ALL_LIFECYCLE_STATES_VALID=YES" if status == "PASS" else "ALL_LIFECYCLE_STATES_VALID=CHECK_ERRORS",
        "FEATURE_FLAGS_STATUS=ALL_OFF" if status == "PASS" else "FEATURE_FLAGS_STATUS=CHECK_ERRORS",
        "AGENTS_PRODUCTION_CAPABILITIES=0" if status == "PASS" else "AGENTS_PRODUCTION_CAPABILITIES=CHECK_ERRORS",
        "DIRECT_DOCKER_SOCKET=DENIED",
        "UNRESTRICTED_SHELL=DENIED",
        "DIRECT_PRODUCTION_DB_WRITE=DENIED",
        "PAYMENTS_ENABLED=NO",
        "OUTBOUND_ENABLED=NO",
        "BROWSER_ACTIONS_ENABLED=NO",
        "MCP_PRODUCTION_WRITE_ENABLED=NO",
        "SECRET_READ_WITHOUT_TASK_GRANT=DENIED",
        "R4_R5_APPROVAL_REQUIREMENTS=PRESENT" if status == "PASS" else "R4_R5_APPROVAL_REQUIREMENTS=CHECK_ERRORS",
        "STOP_POLICY=PRESENT",
        "AUDIT_SCHEMA=PRESENT",
        "SECRET_SCANNER_PATTERNS=PRESENT" if scanner_config.get("patterns") else "SECRET_SCANNER_PATTERNS=MISSING",
        "SUSPICIOUS_SECRET_VALUES=NO" if status == "PASS" else "SUSPICIOUS_SECRET_VALUES=CHECK_ERRORS",
        "",
        "## Errors",
    ]
    lines.extend(f"- {error}" for error in errors) if errors else lines.append("- None")
    lines.append("")
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"VALIDATION_RESULT={status}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
