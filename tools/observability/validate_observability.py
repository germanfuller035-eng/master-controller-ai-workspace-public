
#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
CONFIGS = ["config/observability/OBSERVABILITY_EVENT_FIELDS.json", "config/observability/TRACE_POLICY.json", "config/observability/LOG_REDACTION_POLICY.json", "config/observability/METRIC_POLICY.json", "config/observability/INCIDENT_POLICY.json"]
SCHEMAS = [str(path.relative_to(ROOT)).replace("\\", "/") for path in (ROOT / "schemas" / "observability").glob("*.schema.json")]
RESULT_PATH = ROOT / "_generated" / "sandbox_observability_evals_v1" / "OBSERVABILITY_VALIDATION_RESULTS.md"
def load_json(rel: str, errors: list[str]) -> dict:
    p = ROOT / rel
    if not p.exists(): errors.append(f"missing JSON file: {rel}"); return {}
    try: return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc: errors.append(f"invalid JSON in {rel}: {exc}"); return {}
def validate() -> tuple[str, list[str]]:
    errors: list[str] = []; loaded = {rel: load_json(rel, errors) for rel in CONFIGS + SCHEMAS}
    trace = loaded.get("config/observability/TRACE_POLICY.json", {})
    if trace.get("otel_collector_installed") is not False: errors.append("OTel Collector must not be installed")
    if trace.get("external_exporter_enabled") is not False: errors.append("external telemetry exporter must be disabled")
    required = set((loaded.get("config/observability/OBSERVABILITY_EVENT_FIELDS.json", {})).get("required_run_fields", []))
    for field in ["trace_id", "task_id", "workflow_id", "agent_id", "model", "provider", "prompt_version", "tool_calls", "policy_decisions", "approvals", "tokens", "calculated_cost", "duration", "retry_count", "artifacts", "verification", "final_status"]:
        if field not in required: errors.append(f"missing required run field: {field}")
    if (loaded.get("config/observability/LOG_REDACTION_POLICY.json", {})).get("redaction_required") is not True: errors.append("log redaction must be required")
    return ("PASS" if not errors else "FAIL"), errors
def write_results() -> int:
    status, errors = validate()
    lines = ["# Observability Validation Results", "", "SESSION_NAME=AGENT_SANDBOX_OBSERVABILITY_AND_EVALS_V1", f"OBSERVABILITY_VALIDATION_RESULT={status}", f"CONFIGS_CHECKED={len(CONFIGS)}", f"SCHEMAS_CHECKED={len(SCHEMAS)}", "OTEL_STATUS=CONTRACT_ONLY_NOT_DEPLOYED" if status == "PASS" else "OTEL_STATUS=CHECK_ERRORS", "GRAFANA_STACK_STATUS=NOT_DEPLOYED" if status == "PASS" else "GRAFANA_STACK_STATUS=CHECK_ERRORS", "", "## Errors"]
    lines.extend([f"- {e}" for e in errors] if errors else ["- None"])
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True); RESULT_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")
    print(f"OBSERVABILITY_VALIDATION_RESULT={status}")
    for error in errors: print(f"ERROR: {error}")
    return 0 if status == "PASS" else 1
if __name__ == "__main__": raise SystemExit(write_results())
