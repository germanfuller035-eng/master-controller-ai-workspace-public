#!/usr/bin/env python3
"""Validate the foundation v1 registry skeleton.

This script uses only the Python standard library. It validates the local
architecture registries; it does not install, start, connect, or deploy
runtime infrastructure.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
RESULT_PATH = ROOT / "_generated" / "foundation_v1" / "FOUNDATION_VALIDATION_RESULTS.md"

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
ENTRY_FIELDS = {
    "id",
    "purpose",
    "owner",
    "status",
    "allowed_lifecycle",
    "current_lifecycle",
    "allowed_tools",
    "denied_capabilities",
    "data_classes",
    "risk_max",
    "approval_requirement",
    "tests_required",
    "rollback_note",
    "review_date",
    "source_provenance",
}
JSON_REGISTRIES = {
    ".claude/agents/AGENTS_LOCK.json": "agents",
    ".claude/skills/SKILLS_LOCK.json": "skills",
    "config/components/COMPONENTS_LOCK.json": "components",
    "config/mcp/MCP_SERVERS_LOCK.json": "mcp_servers",
    "config/models/MODEL_REGISTRY.json": "models",
    "config/policies/CAPABILITY_MATRIX.json": "capabilities",
    "config/policies/RISK_MODEL_R0_R5.json": "risks",
    "config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json": "feature_flags",
}
SCHEMAS = [
    "schemas/foundation/agent_lock.schema.json",
    "schemas/foundation/skill_lock.schema.json",
    "schemas/foundation/component_lock.schema.json",
    "schemas/foundation/mcp_server_lock.schema.json",
    "schemas/foundation/model_registry.schema.json",
    "schemas/foundation/capability_matrix.schema.json",
    "schemas/foundation/feature_flags.schema.json",
    "schemas/foundation/risk_model.schema.json",
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
FORBIDDEN_ENABLED_IDS = {
    "outbound",
    "payment",
    "payments",
    "production_deploy",
    "production_db_write",
    "mcp_write",
}
SECRET_VALUE_PATTERNS = [
    re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I),
    re.compile(r"\bsk-[A-Za-z0-9_\-]{20,}\b"),
    re.compile(r"(?i)\b(?:password|passwd|token|secret|private_key|refresh|access_token|bearer|vless)\b\s*[:=]\s*\S{6,}"),
]


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
        strings: list[str] = []
        for item in value:
            strings.extend(iter_strings(item))
        return strings
    if isinstance(value, dict):
        strings = []
        for item in value.values():
            strings.extend(iter_strings(item))
        return strings
    return []


def validate_entry(rel_path: str, entry: dict[str, Any], component_ids: set[str], errors: list[str]) -> None:
    missing = sorted(ENTRY_FIELDS - set(entry))
    if missing:
        errors.append(f"{rel_path}:{entry.get('id', '<unknown>')} missing fields {missing}")

    current = entry.get("current_lifecycle")
    if current not in ALLOWED_LIFECYCLES:
        errors.append(f"{rel_path}:{entry.get('id')} unknown current_lifecycle {current!r}")

    allowed = entry.get("allowed_lifecycle", [])
    if not isinstance(allowed, list) or not allowed:
        errors.append(f"{rel_path}:{entry.get('id')} allowed_lifecycle must be a non-empty list")
    else:
        unknown = sorted(set(allowed) - ALLOWED_LIFECYCLES)
        if unknown:
            errors.append(f"{rel_path}:{entry.get('id')} unknown allowed lifecycle states {unknown}")
        if current and current not in allowed:
            errors.append(f"{rel_path}:{entry.get('id')} current_lifecycle not allowed")

    risk = entry.get("risk_max")
    if risk not in VALID_RISKS:
        errors.append(f"{rel_path}:{entry.get('id')} invalid risk_max {risk!r}")

    approval = str(entry.get("approval_requirement", "")).lower()
    if risk == "R3" and "policy" not in approval:
        errors.append(f"{rel_path}:{entry.get('id')} R3 entry lacks policy gate approval wording")
    if risk == "R4" and "owner approval" not in approval:
        errors.append(f"{rel_path}:{entry.get('id')} R4 entry lacks owner approval wording")
    if risk == "R5" and "strong owner approval" not in approval:
        errors.append(f"{rel_path}:{entry.get('id')} R5 entry lacks strong owner approval wording")

    denied = entry.get("denied_capabilities", [])
    if not isinstance(denied, list) or not denied:
        errors.append(f"{rel_path}:{entry.get('id')} denied_capabilities must be explicit")

    allowed_tools = set(entry.get("allowed_tools", []))
    forbidden_tools = sorted(allowed_tools & FORBIDDEN_ALLOWED_TOOLS)
    if forbidden_tools:
        errors.append(f"{rel_path}:{entry.get('id')} forbidden tools allowed {forbidden_tools}")

    component_id = entry.get("component_id")
    if component_id and component_id not in component_ids:
        errors.append(f"{rel_path}:{entry.get('id')} references missing component {component_id!r}")

    entry_id = str(entry.get("id", "")).lower()
    enabled = bool(entry.get("enabled") or entry.get("runtime_enabled") or entry.get("production_enabled"))
    if enabled and any(fragment in entry_id for fragment in FORBIDDEN_ENABLED_IDS):
        errors.append(f"{rel_path}:{entry.get('id')} forbidden capability is enabled")

    if "AGENT" in rel_path.upper():
        if entry.get("memory_enabled") is not False:
            errors.append(f"{rel_path}:{entry.get('id')} agent memory must be disabled by default")
        if entry.get("runtime_enabled") is not False:
            errors.append(f"{rel_path}:{entry.get('id')} agent runtime must be disabled by default")
        if entry.get("production_capabilities", 0) != 0:
            errors.append(f"{rel_path}:{entry.get('id')} agent production_capabilities must be 0")

    for text in iter_strings(entry):
        for pattern in SECRET_VALUE_PATTERNS:
            if pattern.search(text):
                errors.append(f"{rel_path}:{entry.get('id')} contains secret-looking value")


def main() -> int:
    errors: list[str] = []
    data_by_path: dict[str, Any] = {}

    for schema in SCHEMAS:
        load_json(schema, errors)

    for rel_path in JSON_REGISTRIES:
        data = load_json(rel_path, errors)
        if data is not None:
            data_by_path[rel_path] = data

    component_ids: set[str] = set()
    component_data = data_by_path.get("config/components/COMPONENTS_LOCK.json", {})
    for component in component_data.get("components", []):
        component_ids.add(component.get("id", ""))

    total_entries = 0
    for rel_path, array_key in JSON_REGISTRIES.items():
        data = data_by_path.get(rel_path)
        if data is None:
            continue
        entries = data.get(array_key)
        if not isinstance(entries, list) or not entries:
            errors.append(f"{rel_path} must contain non-empty {array_key} array")
            continue
        seen: set[str] = set()
        for entry in entries:
            if not isinstance(entry, dict):
                errors.append(f"{rel_path} contains non-object entry")
                continue
            entry_id = entry.get("id")
            if entry_id in seen:
                errors.append(f"{rel_path} duplicate id {entry_id}")
            seen.add(entry_id)
            total_entries += 1
            validate_entry(rel_path, entry, component_ids, errors)

    feature_flags = data_by_path.get("config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json", {}).get("feature_flags", [])
    for flag in feature_flags:
        if flag.get("initial_state") != "OFF" or flag.get("current_lifecycle") != "OFF":
            errors.append(f"feature flag {flag.get('id')} must default OFF")

    mcp_servers = data_by_path.get("config/mcp/MCP_SERVERS_LOCK.json", {}).get("mcp_servers", [])
    for server in mcp_servers:
        if server.get("enabled") or server.get("production_enabled"):
            errors.append(f"MCP server {server.get('id')} must not be enabled")

    status = "PASS" if not errors else "FAIL"
    lines = [
        "# Foundation Validation Results",
        "",
        "SESSION=AI_SYSTEM_FOUNDATION_AND_OWNER_UX_ARCHITECTURE_V1",
        f"VALIDATION_RESULT={status}",
        f"JSON_REGISTRIES={len(JSON_REGISTRIES)}",
        f"SCHEMAS={len(SCHEMAS)}",
        f"ENTRIES_CHECKED={total_entries}",
        "FEATURE_FLAGS_DEFAULT_OFF=YES" if status == "PASS" else "FEATURE_FLAGS_DEFAULT_OFF=CHECK_ERRORS",
        "PRODUCTION_WRITES_ENABLED=NO" if status == "PASS" else "PRODUCTION_WRITES_ENABLED=CHECK_ERRORS",
        "OUTBOUND_ENABLED=NO" if status == "PASS" else "OUTBOUND_ENABLED=CHECK_ERRORS",
        "PAYMENTS_ENABLED=NO" if status == "PASS" else "PAYMENTS_ENABLED=CHECK_ERRORS",
        "MCP_PRODUCTION_SERVER_ENABLED=NO" if status == "PASS" else "MCP_PRODUCTION_SERVER_ENABLED=CHECK_ERRORS",
        "AGENT_MEMORY_ENABLED_BY_DEFAULT=NO" if status == "PASS" else "AGENT_MEMORY_ENABLED_BY_DEFAULT=CHECK_ERRORS",
        "SECRET_LOOKING_VALUES=NO" if status == "PASS" else "SECRET_LOOKING_VALUES=CHECK_ERRORS",
        "",
        "## Errors",
    ]
    if errors:
        lines.extend(f"- {error}" for error in errors)
    else:
        lines.append("- None")
    lines.append("")

    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with RESULT_PATH.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(lines).rstrip() + "\n")

    print(f"VALIDATION_RESULT={status}")
    print(f"ENTRIES_CHECKED={total_entries}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
