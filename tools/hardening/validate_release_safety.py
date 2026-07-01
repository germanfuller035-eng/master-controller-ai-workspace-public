#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

ROOT_FOR_IMPORT = Path(__file__).resolve().parents[2]
if str(ROOT_FOR_IMPORT) not in sys.path:
    sys.path.insert(0, str(ROOT_FOR_IMPORT))

from tools.hardening.common import GENERATED_DIR, read_json, write_text


RESULT_PATH = GENERATED_DIR / "RELEASE_SAFETY_VALIDATION_RESULTS.md"

REQUIRED_OFF_FLAGS = [
    "AGENT_RUNTIME",
    "MCP_READ",
    "MCP_WRITE",
    "MEMORY_WRITE",
    "KNOWLEDGE_INGEST",
    "COMMERCIAL_DRAFT",
    "OUTBOUND_EMAIL",
    "OUTBOUND_SOCIAL",
    "PRODUCTION_DEPLOY",
    "PRODUCTION_DB_WRITE",
    "PAYMENTS",
    "VOICE",
    "AUTO_SAFE",
]

SECRET_VALUE_PATTERNS = [
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I),
    re.compile(r"(?i)\b(?:token|password|passwd|secret|private_key|refresh|access_token|bearer)\b\s*[:=]\s*[\"']?[A-Za-z0-9_./+=-]{8,}"),
    re.compile(r"(?i)\bvless://"),
]


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


def is_off(value: Any) -> bool:
    return value in (False, "OFF", "DENY", "DISABLED", "NOT_INSTALLED", "NOT_INSTALLED_NOT_ENABLED")


def validate_release_safety() -> tuple[str, list[str], dict[str, str]]:
    errors: list[str] = []
    facts: dict[str, str] = {}

    feature_flags = read_json("config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json")
    flag_map = {item.get("id"): item for item in feature_flags.get("feature_flags", [])}
    for flag_id in REQUIRED_OFF_FLAGS:
        item = flag_map.get(flag_id)
        if not item:
            errors.append(f"missing feature flag {flag_id}")
            continue
        current = item.get("current_lifecycle")
        initial = item.get("initial_state")
        facts[f"{flag_id}_STATUS"] = str(current)
        if current != "OFF" or initial != "OFF":
            errors.append(f"feature flag {flag_id} must remain OFF")

    capability = read_json("config/policies/CAPABILITY_MATRIX.json")
    for entry in capability.get("capabilities", []):
        cap_id = entry.get("id")
        if cap_id in {
            "outbound_message",
            "production_deploy",
            "production_db_write",
            "browser_action",
            "payment_operation",
            "direct_docker_socket",
            "unrestricted_shell",
            "direct_mcp_production_tool_access",
        }:
            if entry.get("current_lifecycle") != "OFF" or entry.get("allowed_tools"):
                errors.append(f"capability {cap_id} must be OFF with no allowed tools")
    facts["PRODUCTION_CAPABILITIES"] = "0"

    risk = read_json("config/policies/RISK_MODEL_R0_R5.json")
    if risk.get("default_unknown_action") != "DENY":
        errors.append("risk model must deny unknown actions")
    if set(risk.get("approval_hash_required_for", [])) != {"R4", "R5"}:
        errors.append("risk model must require payload hash for R4/R5")

    approval = read_json("config/policies/APPROVAL_POLICY.json").get("approval_policy", {})
    if approval.get("binds_to_exact_payload_hash") is not True:
        errors.append("approval policy must bind to exact payload hash")
    if approval.get("single_use") is not True or approval.get("expires") is not True:
        errors.append("approval policy must be single-use and expiring")

    stop = read_json("config/policies/STOP_POLICY.json")
    required_stop = {
        "outbound_send",
        "production_deploy",
        "production_db_write",
        "browser_action",
        "payment_operation",
        "direct_secret_read",
    }
    missing_stop = sorted(required_stop - set(stop.get("stop_blocks", [])))
    if missing_stop:
        errors.append(f"STOP policy missing blocks {missing_stop}")

    production = read_json("config/policies/PRODUCTION_BOUNDARIES.json")
    for key in [
        "production_changes_allowed_this_session",
        "vps_changes_allowed_this_session",
        "runtime_install_allowed_this_session",
    ]:
        if production.get(key) is not False:
            errors.append(f"production boundary {key} must be false")

    mcp = read_json("config/mcp/MCP_SERVERS_LOCK.json")
    if mcp.get("mcp_policy", {}).get("production_servers_enabled") is not False:
        errors.append("production MCP servers must be disabled")
    for server in mcp.get("mcp_servers", []):
        if server.get("enabled") or server.get("production_enabled"):
            errors.append(f"MCP server {server.get('id')} must not be enabled")

    runtime = read_json("config/runtime/AGENT_RUNTIME_POLICY.json")
    runtime_checks = {
        "production_enabled": False,
        "memory_enabled": False,
        "runtime_has_direct_docker_socket": False,
        "runtime_has_direct_production_db_write": False,
        "runtime_has_outbound_send_authority": False,
        "runtime_has_payment_authority": False,
    }
    for key, expected in runtime_checks.items():
        if runtime.get(key) is not expected:
            errors.append(f"runtime policy {key} must be {expected}")
    if runtime.get("production_capabilities") != 0:
        errors.append("runtime production_capabilities must be 0")

    commercial = read_json("config/commercial/NO_SEND_POLICY.json")
    if commercial.get("production_enabled") is not False or commercial.get("external_outreach_allowed") is not False:
        errors.append("commercial no-send policy must block production and outreach")
    for key in ["outbound_email", "outbound_social", "auto_safe"]:
        if commercial.get(key) != "OFF":
            errors.append(f"commercial {key} must be OFF")

    outbound = read_json("config/controlled_outbound/CONTROLLED_OUTBOUND_POLICY.json")
    for key in ["OUTBOUND_EMAIL", "OUTBOUND_SOCIAL", "AUTO_SAFE", "PAYMENTS", "PRODUCTION_DB_WRITE"]:
        if outbound.get("safety", {}).get(key) != "OFF":
            errors.append(f"controlled outbound {key} must be OFF")
    for key, value in outbound.get("adapters", {}).items():
        if value is True:
            errors.append(f"controlled outbound adapter {key} must be disabled")

    personal = read_json("config/personal_assistant/NO_EXTERNAL_ACTION_POLICY.json")
    for key, value in personal.get("adapters", {}).items():
        if value is True:
            errors.append(f"personal assistant adapter {key} must be disabled")
    for key in ["calendar_write", "document_send", "government_filing", "legal_submission", "payments", "production_db_write"]:
        if personal.get("safety", {}).get(key) != "OFF":
            errors.append(f"personal assistant {key} must be OFF")

    browser = read_json("config/browser/BROWSER_ACTION_POLICY.json")
    if browser.get("browser_actions") != "OFF" or browser.get("browser_actions_allowed") is not False:
        errors.append("browser actions must be OFF")
    if browser.get("playwright_runtime_enabled") is not False:
        errors.append("browser runtime must be disabled")

    voice = read_json("config/voice/VOICE_POLICY.json")
    if voice.get("voice") != "OFF" or voice.get("voice_enabled") is not False:
        errors.append("voice must be OFF")

    for rel_path in [
        "config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json",
        "config/policies/CAPABILITY_MATRIX.json",
        "config/policies/RISK_MODEL_R0_R5.json",
        "config/policies/APPROVAL_POLICY.json",
        "config/policies/STOP_POLICY.json",
        "config/policies/PRODUCTION_BOUNDARIES.json",
        "config/mcp/MCP_SERVERS_LOCK.json",
        "config/runtime/AGENT_RUNTIME_POLICY.json",
        "config/commercial/NO_SEND_POLICY.json",
        "config/controlled_outbound/CONTROLLED_OUTBOUND_POLICY.json",
        "config/personal_assistant/NO_EXTERNAL_ACTION_POLICY.json",
        "config/browser/BROWSER_ACTION_POLICY.json",
        "config/voice/VOICE_POLICY.json",
    ]:
        data = read_json(rel_path)
        for text in iter_strings(data):
            if any(pattern.search(text) for pattern in SECRET_VALUE_PATTERNS):
                errors.append(f"secret-looking value in {rel_path}")

    result = "PASS" if not errors else "FAIL"
    return result, errors, facts


def write_result() -> int:
    result, errors, facts = validate_release_safety()
    lines = [
        "# Release Safety Validation Results",
        "",
        f"RELEASE_SAFETY_VALIDATION_RESULT={result}",
        "FEATURE_FLAGS_STATUS=ALL_OFF_OR_SAFE" if result == "PASS" else "FEATURE_FLAGS_STATUS=CHECK_ERRORS",
        "PRODUCTION_CAPABILITIES=0",
        "MCP_PRODUCTION_SERVER_ENABLED=NO",
        "OUTBOUND_ENABLED=NO",
        "PAYMENTS_ENABLED=NO",
        "PRODUCTION_DB_WRITE_ENABLED=NO",
        "REAL_BROWSER_ACTION_ENABLED=NO",
        "DIRECT_DOCKER_SOCKET=NO",
        "UNRESTRICTED_SHELL=NO",
        "STOP_POLICY_PRESENT=YES",
        "APPROVAL_POLICY_PRESENT=YES",
        "R4_R5_PAYLOAD_HASH_REQUIRED=YES",
        "SUSPICIOUS_SECRET_LOOKING_VALUES=NO" if result == "PASS" else "SUSPICIOUS_SECRET_LOOKING_VALUES=CHECK_ERRORS",
        "",
        "## Flag Facts",
    ]
    lines.extend(f"- {key}={value}" for key, value in sorted(facts.items()))
    lines.extend(["", "## Errors"])
    lines.extend(["- None"] if not errors else [f"- {error}" for error in errors])
    write_text(RESULT_PATH, "\n".join(lines))
    print(f"RELEASE_SAFETY_VALIDATION_RESULT={result}")
    for error in errors:
        print(f"ERROR: {error}")
    return 0 if result == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(write_result())
