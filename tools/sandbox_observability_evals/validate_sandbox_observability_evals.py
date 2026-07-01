
#!/usr/bin/env python3
from __future__ import annotations
import json, re
from pathlib import Path
from typing import Any
ROOT = Path(__file__).resolve().parents[2]
RESULT_PATH = ROOT / "_generated" / "sandbox_observability_evals_v1" / "SANDBOX_OBSERVABILITY_EVALS_VALIDATION_RESULTS.md"
CONFIG_DIRS = [ROOT / "config/sandbox", ROOT / "config/observability", ROOT / "config/evals"]
SCHEMA_DIRS = [ROOT / "schemas/sandbox", ROOT / "schemas/observability", ROOT / "schemas/evals"]
FIXTURE_DIRS = [ROOT / "tests/fixtures/evals/golden", ROOT / "tests/fixtures/evals/security"]
PATTERNS = [re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"), re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I), re.compile(r"(?i)\b(?:token|password|passwd|secret|private_key|refresh|access_token|bearer)\b\s*[:=]\s*[\"']?[A-Za-z0-9_./+=-]{8,}")]
def rel(path: Path) -> str: return str(path.relative_to(ROOT)).replace("\\", "/")
def load(path: Path, errors: list[str]) -> Any:
    try: return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc: errors.append(f"invalid JSON in {rel(path)}: {exc}"); return None
def strings(value: Any) -> list[str]:
    if isinstance(value, str): return [value]
    if isinstance(value, list): return [x for item in value for x in strings(item)]
    if isinstance(value, dict): return [x for item in value.values() for x in strings(item)]
    return []
def validate() -> tuple[str, list[str]]:
    errors: list[str] = []; paths = [p for d in CONFIG_DIRS + SCHEMA_DIRS for p in d.glob("*.json")]
    loaded = {rel(p): load(p, errors) for p in paths}
    policy = loaded.get("config/sandbox/SANDBOX_POLICY.json") or {}
    if policy.get("sandbox_enabled") is not False or policy.get("production_enabled") is not False: errors.append("sandbox production must remain disabled")
    denied = set(policy.get("denied_capabilities", []))
    for cap in ["direct_docker_socket", "unrestricted_shell", "production_credentials", "production_db", "provider_credentials"]:
        if cap not in denied: errors.append(f"sandbox denylist missing {cap}")
    if (loaded.get("config/sandbox/SANDBOX_EGRESS_ALLOWLIST.json") or {}).get("default_action") != "DENY": errors.append("egress must deny by default")
    trace = loaded.get("config/observability/TRACE_POLICY.json") or {}
    if trace.get("external_exporter_enabled") is not False or trace.get("otel_collector_installed") is not False: errors.append("external telemetry must remain disabled")
    suites = loaded.get("config/evals/EVAL_SUITES.json") or {}
    if suites.get("external_llm_calls_enabled") is not False: errors.append("real LLM eval calls must remain disabled")
    if suites.get("local_deterministic_only") is not True: errors.append("eval suites must be local deterministic")
    if not loaded.get("config/evals/FALSE_SUCCESS_POLICY.json"): errors.append("false success policy missing")
    if not loaded.get("config/evals/PERMISSION_BOUNDARY_POLICY.json"): errors.append("permission boundary policy missing")
    flags = load(ROOT / "config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json", errors) or {}
    for flag in flags.get("feature_flags", []):
        if flag.get("current_lifecycle") != "OFF" or flag.get("initial_state") != "OFF": errors.append(f"feature flag {flag.get('id')} must remain OFF")
    if (loaded.get("config/sandbox/SANDBOX_LIFECYCLE_POLICY.json") or {}).get("stop_blocks_new_runs") is not True: errors.append("STOP integration missing for sandbox lifecycle")
    seen = set()
    for directory in FIXTURE_DIRS:
        for path in directory.glob("*.jsonl"):
            for line in path.read_text(encoding="utf-8").splitlines():
                record = json.loads(line); case_id = record.get("case_id")
                if case_id in seen: errors.append(f"duplicate eval case id: {case_id}")
                seen.add(case_id)
    for path_rel, data in loaded.items():
        if data is not None and any(pattern.search(text) for text in strings(data) for pattern in PATTERNS): errors.append(f"{path_rel} contains suspicious sensitive-looking value")
    return ("PASS" if not errors else "FAIL"), errors
def write_results() -> int:
    status, errors = validate()
    lines = ["# Sandbox Observability Evals Validation Results", "", "SESSION_NAME=AGENT_SANDBOX_OBSERVABILITY_AND_EVALS_V1", f"SANDBOX_OBSERVABILITY_EVALS_VALIDATION_RESULT={status}", "SANDBOX_VALIDATION_RESULT=PASS" if status == "PASS" else "SANDBOX_VALIDATION_RESULT=CHECK_ERRORS", "OBSERVABILITY_VALIDATION_RESULT=PASS" if status == "PASS" else "OBSERVABILITY_VALIDATION_RESULT=CHECK_ERRORS", "EVALS_VALIDATION_RESULT=PASS" if status == "PASS" else "EVALS_VALIDATION_RESULT=CHECK_ERRORS", "FEATURE_FLAGS_STATUS=ALL_OFF" if status == "PASS" else "FEATURE_FLAGS_STATUS=CHECK_ERRORS", "SANDBOX_STATUS=LOCAL_SYNTHETIC_ONLY" if status == "PASS" else "SANDBOX_STATUS=CHECK_ERRORS", "OTEL_STATUS=CONTRACT_ONLY_NOT_DEPLOYED" if status == "PASS" else "OTEL_STATUS=CHECK_ERRORS", "REAL_LLM_EVALS_STATUS=OFF" if status == "PASS" else "REAL_LLM_EVALS_STATUS=CHECK_ERRORS", "", "## Errors"]
    lines.extend([f"- {e}" for e in errors] if errors else ["- None"])
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True); RESULT_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")
    print(f"SANDBOX_OBSERVABILITY_EVALS_VALIDATION_RESULT={status}")
    for error in errors: print(f"ERROR: {error}")
    return 0 if status == "PASS" else 1
if __name__ == "__main__": raise SystemExit(write_results())
