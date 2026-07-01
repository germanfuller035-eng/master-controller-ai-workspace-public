
#!/usr/bin/env python3
from __future__ import annotations
import json, re
from pathlib import Path
from typing import Any
ROOT = Path(__file__).resolve().parents[2]
CONFIGS = ["config/sandbox/SANDBOX_POLICY.json", "config/sandbox/SANDBOX_RESOURCE_LIMITS.json", "config/sandbox/SANDBOX_EGRESS_ALLOWLIST.json", "config/sandbox/SANDBOX_FILESYSTEM_LIMITS.json", "config/sandbox/SANDBOX_DENYLIST.json", "config/sandbox/SANDBOX_LIFECYCLE_POLICY.json"]
SCHEMAS = [str(path.relative_to(ROOT)).replace("\\", "/") for path in (ROOT / "schemas" / "sandbox").glob("*.schema.json")]
RESULT_PATH = ROOT / "_generated" / "sandbox_observability_evals_v1" / "SANDBOX_VALIDATION_RESULTS.md"
PATTERNS = [re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"), re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I)]
def load_json(rel: str, errors: list[str]) -> Any:
    p = ROOT / rel
    if not p.exists(): errors.append(f"missing JSON file: {rel}"); return None
    try: return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc: errors.append(f"invalid JSON in {rel}: {exc}"); return None
def strings(value: Any) -> list[str]:
    if isinstance(value, str): return [value]
    if isinstance(value, list): return [x for item in value for x in strings(item)]
    if isinstance(value, dict): return [x for item in value.values() for x in strings(item)]
    return []
def validate() -> tuple[str, list[str]]:
    errors: list[str] = []
    loaded = {rel: load_json(rel, errors) for rel in CONFIGS + SCHEMAS}
    policy = loaded.get("config/sandbox/SANDBOX_POLICY.json") or {}
    if policy.get("sandbox_enabled") is not False or policy.get("production_enabled") is not False: errors.append("sandbox production must remain disabled")
    denied = set(policy.get("denied_capabilities", []))
    for cap in ["direct_docker_socket", "unrestricted_shell", "production_credentials", "production_db", "production_filesystem"]:
        if cap not in denied: errors.append(f"missing denied capability: {cap}")
    if (loaded.get("config/sandbox/SANDBOX_EGRESS_ALLOWLIST.json") or {}).get("default_action") != "DENY": errors.append("egress must deny by default")
    if (loaded.get("config/sandbox/SANDBOX_FILESYSTEM_LIMITS.json") or {}).get("production_filesystem_allowed") is not False: errors.append("production filesystem must be disabled")
    if (loaded.get("config/sandbox/SANDBOX_LIFECYCLE_POLICY.json") or {}).get("stop_blocks_new_runs") is not True: errors.append("STOP integration must block new runs")
    for rel, data in loaded.items():
        if data is not None and any(pattern.search(text) for text in strings(data) for pattern in PATTERNS): errors.append(f"{rel} contains sensitive-looking value")
    return ("PASS" if not errors else "FAIL"), errors
def write_results() -> int:
    status, errors = validate()
    lines = ["# Sandbox Validation Results", "", "SESSION_NAME=AGENT_SANDBOX_OBSERVABILITY_AND_EVALS_V1", f"SANDBOX_VALIDATION_RESULT={status}", f"CONFIGS_CHECKED={len(CONFIGS)}", f"SCHEMAS_CHECKED={len(SCHEMAS)}", "SANDBOX_STATUS=LOCAL_SYNTHETIC_ONLY" if status == "PASS" else "SANDBOX_STATUS=CHECK_ERRORS", "DOCKER_SOCKET_STATUS=DENIED" if status == "PASS" else "DOCKER_SOCKET_STATUS=CHECK_ERRORS", "", "## Errors"]
    lines.extend([f"- {e}" for e in errors] if errors else ["- None"])
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True); RESULT_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")
    print(f"SANDBOX_VALIDATION_RESULT={status}")
    for error in errors: print(f"ERROR: {error}")
    return 0 if status == "PASS" else 1
if __name__ == "__main__": raise SystemExit(write_results())
