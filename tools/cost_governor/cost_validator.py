from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
RESULT_PATH = ROOT / "_generated" / "runtime_router_v1" / "COST_GOVERNOR_VALIDATION_RESULTS.md"
CONFIGS = [
    "config/costs/COST_GOVERNOR_POLICY.json",
    "config/costs/TASK_BUDGET_LIMITS.json",
    "config/costs/RETRY_BUDGET_LIMITS.json",
    "config/costs/COST_METER_SCHEMA.json",
    "config/models/MODEL_COST_LIMITS.json",
    "config/runtime/RETRY_POLICY.json",
]
SCHEMAS = [
    "schemas/costs/cost_governor_policy.schema.json",
    "schemas/costs/task_budget.schema.json",
    "schemas/costs/cost_meter_event.schema.json",
    "schemas/costs/retry_budget.schema.json",
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

    policy = loaded.get("config/costs/COST_GOVERNOR_POLICY.json", {})
    if policy.get("monthly_budget_min_rub") != 10000:
        errors.append("monthly budget minimum must be 10000 RUB equivalent")
    if policy.get("monthly_budget_max_rub") != 30000:
        errors.append("monthly budget maximum must be 30000 RUB equivalent")
    active = int(policy.get("active_monthly_budget_rub", 0))
    if active < 10000 or active > 30000:
        errors.append("active monthly budget must be within 10000-30000 RUB equivalent")
    if policy.get("unlimited_loops") != "DENY":
        errors.append("unlimited loops must be denied")
    if policy.get("stop_loss_required_for_expensive_task") is not True:
        errors.append("expensive task stop-loss must be required")

    retry = loaded.get("config/runtime/RETRY_POLICY.json", {})
    retry_budget = loaded.get("config/costs/RETRY_BUDGET_LIMITS.json", {})
    if int(retry.get("max_retries_per_step", 99)) > 2:
        errors.append("max retries per step must be <= 2")
    if int(retry_budget.get("max_retries_per_step", 99)) > 2:
        errors.append("retry budget max retries per step must be <= 2")
    if not loaded.get("config/models/MODEL_COST_LIMITS.json", {}).get("cost_limits"):
        errors.append("model cost limits missing")

    return ("PASS" if not errors else "FAIL"), errors, loaded


def write_results() -> int:
    status, errors, _loaded = validate()
    lines = [
        "# Cost Governor Validation Results",
        "",
        "SESSION=VOLTAGENT_RUNTIME_MODEL_ROUTER_AND_COST_GOVERNOR_V1",
        f"COST_GOVERNOR_VALIDATION_RESULT={status}",
        f"CONFIGS_CHECKED={len(CONFIGS)}",
        f"SCHEMAS_CHECKED={len(SCHEMAS)}",
        "MONTHLY_BUDGET_RANGE_RUB=10000..30000" if status == "PASS" else "MONTHLY_BUDGET_RANGE_RUB=CHECK_ERRORS",
        "MAX_RETRIES_PER_STEP=2" if status == "PASS" else "MAX_RETRIES_PER_STEP=CHECK_ERRORS",
        "UNLIMITED_LOOPS=DENIED" if status == "PASS" else "UNLIMITED_LOOPS=CHECK_ERRORS",
        "PROVIDER_KEYS_COMMITTED=NO" if status == "PASS" else "PROVIDER_KEYS_COMMITTED=CHECK_ERRORS",
        "",
        "## Errors",
    ]
    lines.extend(f"- {error}" for error in errors) if errors else lines.append("- None")
    lines.append("")
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"COST_GOVERNOR_VALIDATION_RESULT={status}")
    for error in errors:
        print(f"ERROR: {error}")
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(write_results())
