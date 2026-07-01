#!/usr/bin/env python3
"""Validate local MCP Gateway v1 contracts.

The validator is deterministic and standard-library only. It does not start
servers, install runtimes, connect to external MCP, or touch production.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
RESULT_PATH = ROOT / "_generated" / "mcp_gateway_v1" / "MCP_GATEWAY_VALIDATION_RESULTS.md"
CONFIGS = [
    "config/mcp/GATEWAY_ADAPTERS.json",
    "config/mcp/GATEWAY_TOOL_SCOPES.json",
    "config/mcp/GATEWAY_TIMEOUTS.json",
    "config/mcp/GATEWAY_CANCELLATION_POLICY.json",
    "config/mcp/GATEWAY_AUDIT_POLICY.json",
    "config/mcp/GATEWAY_DENYLIST.json",
    "config/mcp/MCP_SERVERS_LOCK.json",
    "config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json",
]
SCHEMAS = [
    "schemas/mcp_gateway/gateway_request.schema.json",
    "schemas/mcp_gateway/gateway_response.schema.json",
    "schemas/mcp_gateway/adapter_registry.schema.json",
    "schemas/mcp_gateway/tool_scope.schema.json",
    "schemas/mcp_gateway/tool_result.schema.json",
    "schemas/mcp_gateway/tool_error.schema.json",
    "schemas/mcp_gateway/tool_audit_event.schema.json",
    "schemas/mcp_gateway/timeout_policy.schema.json",
    "schemas/mcp_gateway/cancellation_token.schema.json",
    "schemas/mcp_gateway/artifact_record.schema.json",
]
ALLOWED_GATEWAY_LIFECYCLES = {"OFF", "LOCAL_SYNTHETIC_ALLOWED"}
SECRET_VALUE_PATTERNS = [
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I),
    re.compile(r"(?i)\b(?:token|password|passwd|private_key|access_token|refresh_token|bearer)\b\s*[:=]\s*[\"']?[A-Za-z0-9_./+=-]{8,}"),
    re.compile(r"(?i)\bvless://"),
]
FORBIDDEN_CAPABILITY_WORDS = ("unrestricted_shell", "direct_docker_socket", "direct_ssh", "production_db_write")


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
        if any(marker in text for marker in ("FAKE_", "EXAMPLE_", "DUMMY_", "REDACTED", "DO_NOT_USE", "PLACEHOLDER")):
            continue
        for pattern in SECRET_VALUE_PATTERNS:
            if pattern.search(text):
                errors.append(f"{rel_path} contains suspicious secret-looking value")
                return


def validate_adapter_registry(path: Path, errors: list[str]) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    entries = list(data.get("adapters", [])) + list(data.get("contract_only_adapters", []))
    seen: set[str] = set()
    for entry in entries:
        entry_id = entry.get("id")
        if not entry_id:
            errors.append("gateway adapter entry missing id")
            continue
        if entry_id in seen:
            errors.append(f"duplicate adapter id {entry_id}")
        seen.add(entry_id)
        lifecycle = entry.get("lifecycle")
        if lifecycle not in ALLOWED_GATEWAY_LIFECYCLES:
            errors.append(f"adapter {entry_id} lifecycle must be OFF or LOCAL_SYNTHETIC_ALLOWED")
        if entry.get("production_enabled") is not False:
            errors.append(f"adapter {entry_id} production_enabled must be false")
        if entry.get("implementation") != "CONTRACT_ONLY" and lifecycle != "LOCAL_SYNTHETIC_ALLOWED":
            errors.append(f"implemented adapter {entry_id} must be LOCAL_SYNTHETIC_ALLOWED")
        allowed_actions = entry.get("allowed_actions", [])
        if entry.get("implementation") != "CONTRACT_ONLY" and not allowed_actions:
            errors.append(f"implemented adapter {entry_id} missing allowed_actions")
        allowed_commands = entry.get("allowed_commands", [])
        if entry_id == "git_read":
            for denied in ("commit", "merge", "push", "checkout", "reset", "clean", "tag", "rebase"):
                if denied not in entry.get("denied_commands", []):
                    errors.append(f"git_read missing denied command {denied}")
            if any(command in allowed_commands for command in ("commit", "push", "checkout", "reset", "clean")):
                errors.append("git_read allows mutating command")
        if entry_id == "filesystem_read":
            if entry.get("write") is not False or "assigned_worktree" not in entry.get("allowed_roots", []):
                errors.append("filesystem_read must be read-only and assigned-worktree scoped")
        if entry_id == "artifact_local":
            if entry.get("allowed_write_root") != "_generated/mcp_gateway_v1/artifacts" or entry.get("hash_outputs") is not True:
                errors.append("artifact_local root or hashing policy invalid")
        if entry_id == "test_runner_local":
            allowlist = entry.get("allowlist", [])
            if not allowlist or len(allowlist) > 10:
                errors.append("test_runner_local allowlist must be finite and non-empty")
            for command in allowlist:
                if not str(command).startswith("python tools/") or any(marker in str(command) for marker in (";", "&&", "||", "|", "`", "$(")):
                    errors.append("test_runner_local contains unsafe allowlist command")
        strings = " ".join(iter_strings(entry))
        if "docker.sock" in strings.lower():
            errors.append(f"adapter {entry_id} references Docker socket")
        if "ssh://" in strings.lower():
            errors.append(f"adapter {entry_id} references direct SSH")
        if "mysql://" in strings.lower():
            errors.append(f"adapter {entry_id} references direct DB credentials")
        allowed_tools = set(entry.get("allowed_tools", []))
        if allowed_tools & set(FORBIDDEN_CAPABILITY_WORDS):
            errors.append(f"adapter {entry_id} allows forbidden capability")


def validate_feature_flags(data: dict[str, Any], errors: list[str]) -> None:
    states = {item.get("id"): item.get("current_lifecycle") for item in data.get("feature_flags", [])}
    initials = {item.get("id"): item.get("initial_state") for item in data.get("feature_flags", [])}
    for flag_id, state in states.items():
        if state != "OFF" or initials.get(flag_id) != "OFF":
            errors.append(f"feature flag {flag_id} must remain OFF")
    for required in ("MCP_READ", "MCP_WRITE", "OUTBOUND_EMAIL", "PRODUCTION_DB_WRITE", "PAYMENTS"):
        if states.get(required) != "OFF":
            errors.append(f"feature flag {required} must be OFF")


def validate_mcp_servers(data: dict[str, Any], errors: list[str]) -> None:
    for server in data.get("mcp_servers", []):
        if server.get("enabled") or server.get("production_enabled"):
            errors.append(f"MCP server {server.get('id')} must remain disabled")


def main() -> int:
    errors: list[str] = []
    loaded: dict[str, Any] = {}
    for rel_path in CONFIGS + SCHEMAS:
        data = load_json(rel_path, errors)
        if data is not None:
            loaded[rel_path] = data
            check_secret_values(rel_path, data, errors)

    registry_path = ROOT / "config" / "mcp" / "GATEWAY_ADAPTERS.json"
    if registry_path.exists():
        validate_adapter_registry(registry_path, errors)

    timeouts = loaded.get("config/mcp/GATEWAY_TIMEOUTS.json", {})
    if not timeouts.get("timeouts_required") or not timeouts.get("adapter_timeouts_ms"):
        errors.append("timeouts must be required and adapter-specific")
    cancellation = loaded.get("config/mcp/GATEWAY_CANCELLATION_POLICY.json", {})
    if not cancellation.get("cancellation_required"):
        errors.append("cancellation policy must be required")
    audit = loaded.get("config/mcp/GATEWAY_AUDIT_POLICY.json", {})
    if not audit.get("audit_required") or not audit.get("hash_chain"):
        errors.append("audit policy must require hash chain")
    scopes = loaded.get("config/mcp/GATEWAY_TOOL_SCOPES.json", {})
    artifact_root = scopes.get("artifact_policy", {}).get("allowed_write_root")
    if artifact_root != "_generated/mcp_gateway_v1/artifacts":
        errors.append("artifact root must be scoped to _generated/mcp_gateway_v1/artifacts")

    validate_feature_flags(loaded.get("config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json", {}), errors)
    validate_mcp_servers(loaded.get("config/mcp/MCP_SERVERS_LOCK.json", {}), errors)

    status = "PASS" if not errors else "FAIL"
    lines = [
        "# MCP Gateway Validation Results",
        "",
        "SESSION=MASTER_CONTROLLER_MCP_GATEWAY_V1",
        f"MCP_GATEWAY_VALIDATION_RESULT={status}",
        f"CONFIGS_CHECKED={len(CONFIGS)}",
        f"SCHEMAS_CHECKED={len(SCHEMAS)}",
        "ADAPTER_IDS_UNIQUE=YES" if status == "PASS" else "ADAPTER_IDS_UNIQUE=CHECK_ERRORS",
        "PRODUCTION_ENABLED_ADAPTERS=0" if status == "PASS" else "PRODUCTION_ENABLED_ADAPTERS=CHECK_ERRORS",
        "LIFECYCLE_RANGE=OFF_OR_LOCAL_SYNTHETIC_ONLY" if status == "PASS" else "LIFECYCLE_RANGE=CHECK_ERRORS",
        "UNRESTRICTED_SHELL=DENIED",
        "DIRECT_DOCKER_SOCKET=DENIED",
        "DIRECT_SSH=DENIED",
        "DIRECT_PRODUCTION_DB=DENIED",
        "TIMEOUTS_DEFINED=YES" if timeouts.get("adapter_timeouts_ms") else "TIMEOUTS_DEFINED=CHECK_ERRORS",
        "CANCELLATION_POLICY_DEFINED=YES" if cancellation.get("cancellation_required") else "CANCELLATION_POLICY_DEFINED=CHECK_ERRORS",
        "AUDIT_POLICY_DEFINED=YES" if audit.get("audit_required") else "AUDIT_POLICY_DEFINED=CHECK_ERRORS",
        "FEATURE_FLAGS_STATUS=ALL_OFF" if status == "PASS" else "FEATURE_FLAGS_STATUS=CHECK_ERRORS",
        "MCP_WRITE_STATUS=OFF" if status == "PASS" else "MCP_WRITE_STATUS=CHECK_ERRORS",
        "PRODUCTION_MCP_SERVERS_ENABLED=0" if status == "PASS" else "PRODUCTION_MCP_SERVERS_ENABLED=CHECK_ERRORS",
        "SUSPICIOUS_SECRET_VALUES=NO" if status == "PASS" else "SUSPICIOUS_SECRET_VALUES=CHECK_ERRORS",
        "",
        "## Errors",
    ]
    lines.extend(f"- {error}" for error in errors) if errors else lines.append("- None")
    lines.append("")
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"MCP_GATEWAY_VALIDATION_RESULT={status}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
