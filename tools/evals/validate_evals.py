
#!/usr/bin/env python3
from __future__ import annotations
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from tools.evals.golden_dataset import load_jsonl
CONFIGS = ["config/evals/EVAL_SUITES.json", "config/evals/GOLDEN_DATASET_REGISTRY.json", "config/evals/PROMPT_REGRESSION_POLICY.json", "config/evals/SECURITY_EVAL_POLICY.json", "config/evals/FALSE_SUCCESS_POLICY.json", "config/evals/PERMISSION_BOUNDARY_POLICY.json"]
SCHEMAS = [str(path.relative_to(ROOT)).replace("\\", "/") for path in (ROOT / "schemas" / "evals").glob("*.schema.json")]
RESULT_PATH = ROOT / "_generated" / "sandbox_observability_evals_v1" / "EVALS_VALIDATION_RESULTS.md"
FIXTURE_DIRS = [ROOT / "tests/fixtures/evals/golden", ROOT / "tests/fixtures/evals/security"]
def load_json(rel: str, errors: list[str]) -> dict:
    p = ROOT / rel
    if not p.exists(): errors.append(f"missing JSON file: {rel}"); return {}
    try: return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc: errors.append(f"invalid JSON in {rel}: {exc}"); return {}
def validate() -> tuple[str, list[str]]:
    errors: list[str] = []; loaded = {rel: load_json(rel, errors) for rel in CONFIGS + SCHEMAS}
    suites = loaded.get("config/evals/EVAL_SUITES.json", {})
    if suites.get("local_deterministic_only") is not True: errors.append("eval suites must be local deterministic")
    if suites.get("external_llm_calls_enabled") is not False: errors.append("external LLM calls must be disabled")
    if (loaded.get("config/evals/FALSE_SUCCESS_POLICY.json", {})).get("pass_requires_evidence") is not True: errors.append("false success policy must require evidence")
    if (loaded.get("config/evals/PERMISSION_BOUNDARY_POLICY.json", {})).get("unknown_capability_policy") != "DENY": errors.append("unknown capability policy must deny")
    seen = set()
    for directory in FIXTURE_DIRS:
        for path in directory.glob("*.jsonl"):
            for record in load_jsonl(path):
                case_id = record.get("case_id")
                if not case_id: errors.append(f"missing case_id in {path}"); continue
                if case_id in seen: errors.append(f"duplicate eval case id: {case_id}")
                seen.add(case_id)
    return ("PASS" if not errors else "FAIL"), errors
def write_results() -> int:
    status, errors = validate()
    lines = ["# Evals Validation Results", "", "SESSION_NAME=AGENT_SANDBOX_OBSERVABILITY_AND_EVALS_V1", f"EVALS_VALIDATION_RESULT={status}", f"CONFIGS_CHECKED={len(CONFIGS)}", f"SCHEMAS_CHECKED={len(SCHEMAS)}", "REAL_LLM_EVALS_STATUS=OFF" if status == "PASS" else "REAL_LLM_EVALS_STATUS=CHECK_ERRORS", "PROMPTFOO_STATUS=NOT_INSTALLED" if status == "PASS" else "PROMPTFOO_STATUS=CHECK_ERRORS", "", "## Errors"]
    lines.extend([f"- {e}" for e in errors] if errors else ["- None"])
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True); RESULT_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")
    print(f"EVALS_VALIDATION_RESULT={status}")
    for error in errors: print(f"ERROR: {error}")
    return 0 if status == "PASS" else 1
if __name__ == "__main__": raise SystemExit(write_results())
