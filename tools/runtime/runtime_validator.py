from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
RESULT_PATH = ROOT / "_generated" / "runtime_router_v1" / "RUNTIME_VALIDATION_RESULTS.md"
CONFIGS = [
    "config/runtime/RUNTIME_ADAPTERS.json",
    "config/runtime/AGENT_RUNTIME_POLICY.json",
    "config/runtime/AGENT_EXECUTION_LIMITS.json",
    "config/runtime/RETRY_POLICY.json",
    "config/runtime/SUSPEND_RESUME_POLICY.json",
    "config/runtime/RUNTIME_STOP_POLICY.json",
    "config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json",
    "config/policies/STOP_POLICY.json",
    "config/mcp/GATEWAY_ADAPTERS.json",
    "config/mcp/GATEWAY_TOOL_SCOPES.json",
]
SCHEMAS = [
    "schemas/runtime/runtime_request.schema.json",
    "schemas/runtime/runtime_response.schema.json",
    "schemas/runtime/agent_task.schema.json",
    "schemas/runtime/agent_execution_plan.schema.json",
    "schemas/runtime/runtime_event.schema.json",
    "schemas/runtime/suspend_resume_state.schema.json",
    "schemas/runtime/retry_policy.schema.json",
    "schemas/runtime/runtime_stop_state.schema.json",
]
SECRET_PATTERNS = [
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I),
    re.compile(r"(?i)\b(?:token|password|passwd|private_key|access_token|refresh_token|bearer)\b\s*[:=]\s*[\"']?[A-Za-z0-9_./+=-]{8,}"),
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


def validate() -> tuple[str, list[str], dict[str, Any]]:
    errors: list[str] = []
    loaded: dict[str, Any] = {}
    for rel_path in CONFIGS + SCHEMAS:
        data = load_json(rel_path, errors)
        if data is not None:
            loaded[rel_path] = data
            for text in iter_strings(data):
                if any(pattern.search(text) for pattern in SECRET_PATTERNS):
                    errors.append(f"{rel_path} contains suspicious credential-looking value")
                    break

    feature_flags = loaded.get("config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json", {}).get("feature_flags", [])
    states = {flag.get("id"): flag for flag in feature_flags}
    if states.get("AGENT_RUNTIME", {}).get("current_lifecycle") != "OFF":
        errors.append("AGENT_RUNTIME must remain OFF")
    for flag in feature_flags:
        if flag.get("current_lifecycle") != "OFF" or flag.get("initial_state") != "OFF":
            errors.append(f"feature flag {flag.get('id')} must remain OFF")

    runtime_policy = loaded.get("config/runtime/AGENT_RUNTIME_POLICY.json", {})
    if runtime_policy.get("production_enabled") is not False:
        errors.append("runtime production_enabled must be false")
    if runtime_policy.get("memory_enabled") is not False:
        errors.append("runtime memory_enabled must be false")
    if runtime_policy.get("production_capabilities") != 0:
        errors.append("runtime production_capabilities must be 0")
    if runtime_policy.get("tool_calls_route") != "MCP_GATEWAY_ONLY":
        errors.append("runtime must route tool calls only through MCP Gateway")
    if runtime_policy.get("stop_blocks_runtime") is not True:
        errors.append("STOP must block runtime")

    adapters = loaded.get("config/runtime/RUNTIME_ADAPTERS.json", {}).get("adapters", [])
    for adapter in adapters:
        if adapter.get("enabled") is not False or adapter.get("production_enabled") is not False:
            errors.append(f"runtime adapter {adapter.get('id')} must remain disabled")
        if adapter.get("production_capabilities") != 0:
            errors.append(f"runtime adapter {adapter.get('id')} production capabilities must be 0")
        if adapter.get("memory_enabled") is not False:
            errors.append(f"runtime adapter {adapter.get('id')} memory must be false")
        if adapter.get("direct_tool_bypass_allowed") is not False:
            errors.append(f"runtime adapter {adapter.get('id')} direct tool bypass must be denied")

    limits = loaded.get("config/runtime/AGENT_EXECUTION_LIMITS.json", {})
    if limits.get("max_delegation_depth") != 1:
        errors.append("max delegation depth must be 1")
    if int(limits.get("max_subagents_per_task", 99)) > 3:
        errors.append("max subagents per task must be <= 3")
    if int(limits.get("max_interagent_messages", 99)) > 8:
        errors.append("max interagent messages must be <= 8")
    if limits.get("memory_enabled") is not False:
        errors.append("execution memory must be false")
    if limits.get("production_capabilities") != 0:
        errors.append("execution production capabilities must be 0")

    retry = loaded.get("config/runtime/RETRY_POLICY.json", {})
    if int(retry.get("max_retries_per_step", 99)) > 2:
        errors.append("max retries per step must be <= 2")
    if retry.get("unlimited_loop_policy") != "DENY":
        errors.append("unlimited retry loops must be denied")

    suspend = loaded.get("config/runtime/SUSPEND_RESUME_POLICY.json", {})
    if suspend.get("state_must_be_serializable") is not True:
        errors.append("suspend/resume state must be serializable")
    if suspend.get("memory_enabled") is not False:
        errors.append("suspend/resume memory must be false")

    stop = loaded.get("config/runtime/RUNTIME_STOP_POLICY.json", {})
    if stop.get("stop_blocks_runtime_execution") is not True:
        errors.append("runtime STOP policy must block execution")

    return ("PASS" if not errors else "FAIL"), errors, loaded


def write_results() -> int:
    status, errors, _loaded = validate()
    lines = [
        "# Runtime Validation Results",
        "",
        "SESSION=VOLTAGENT_RUNTIME_MODEL_ROUTER_AND_COST_GOVERNOR_V1",
        f"RUNTIME_VALIDATION_RESULT={status}",
        f"CONFIGS_CHECKED={len(CONFIGS)}",
        f"SCHEMAS_CHECKED={len(SCHEMAS)}",
        "AGENT_RUNTIME_STATUS=PRODUCTION_OFF_LOCAL_SYNTHETIC_ONLY" if status == "PASS" else "AGENT_RUNTIME_STATUS=CHECK_ERRORS",
        "FEATURE_FLAGS_STATUS=ALL_OFF" if status == "PASS" else "FEATURE_FLAGS_STATUS=CHECK_ERRORS",
        "PRODUCTION_CAPABILITIES=0" if status == "PASS" else "PRODUCTION_CAPABILITIES=CHECK_ERRORS",
        "MEMORY_STATUS=DISABLED_BY_DEFAULT" if status == "PASS" else "MEMORY_STATUS=CHECK_ERRORS",
        "MCP_GATEWAY_REQUIRED=YES" if status == "PASS" else "MCP_GATEWAY_REQUIRED=CHECK_ERRORS",
        "MAX_DELEGATION_DEPTH=1" if status == "PASS" else "MAX_DELEGATION_DEPTH=CHECK_ERRORS",
        "MAX_SUBAGENTS_PER_TASK=3" if status == "PASS" else "MAX_SUBAGENTS_PER_TASK=CHECK_ERRORS",
        "MAX_INTERAGENT_MESSAGES=8" if status == "PASS" else "MAX_INTERAGENT_MESSAGES=CHECK_ERRORS",
        "MAX_RETRIES_PER_STEP=2" if status == "PASS" else "MAX_RETRIES_PER_STEP=CHECK_ERRORS",
        "",
        "## Errors",
    ]
    lines.extend(f"- {error}" for error in errors) if errors else lines.append("- None")
    lines.append("")
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"RUNTIME_VALIDATION_RESULT={status}")
    for error in errors:
        print(f"ERROR: {error}")
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(write_results())
