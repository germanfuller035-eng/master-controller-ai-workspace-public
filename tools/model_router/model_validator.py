from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
RESULT_PATH = ROOT / "_generated" / "runtime_router_v1" / "MODEL_ROUTER_VALIDATION_RESULTS.md"
CONFIGS = [
    "config/models/MODEL_REGISTRY.json",
    "config/models/MODEL_ROUTING_RULES.json",
    "config/models/PROVIDER_REGISTRY.json",
    "config/models/MODEL_COST_LIMITS.json",
    "config/models/MODEL_FALLBACK_POLICY.json",
]
SCHEMAS = [
    "schemas/models/model_registry.schema.json",
    "schemas/models/model_routing_rule.schema.json",
    "schemas/models/provider_registry.schema.json",
    "schemas/models/model_cost_limit.schema.json",
    "schemas/models/model_fallback_policy.schema.json",
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

    registry = loaded.get("config/models/MODEL_REGISTRY.json", {})
    providers = loaded.get("config/models/PROVIDER_REGISTRY.json", {})
    rules = loaded.get("config/models/MODEL_ROUTING_RULES.json", {})
    fallback = loaded.get("config/models/MODEL_FALLBACK_POLICY.json", {})
    costs = loaded.get("config/models/MODEL_COST_LIMITS.json", {})

    if registry.get("credential_policy", {}).get("credentials_committed") is not False:
        errors.append("model registry must not commit credentials")
    if registry.get("credential_policy", {}).get("live_providers_enabled") is not False:
        errors.append("live providers must remain disabled")
    provider_ids = {item.get("id") for item in providers.get("providers", [])}
    for provider in providers.get("providers", []):
        if provider.get("production_enabled") is not False:
            errors.append(f"provider {provider.get('id')} production_enabled must be false")
        if provider.get("external_network") is not False:
            errors.append(f"provider {provider.get('id')} external_network must be false in this session")
        if provider.get("credential_status") not in {"none_required", "none_committed"}:
            errors.append(f"provider {provider.get('id')} credential status must be none")
    for model in registry.get("models", []):
        if model.get("provider_id") not in provider_ids:
            errors.append(f"model {model.get('id')} references missing provider {model.get('provider_id')}")
        if model.get("credential_status") not in {"none_required", "none_committed"}:
            errors.append(f"model {model.get('id')} credential status must be none")

    rule_task_types = {task for rule in rules.get("rules", []) for task in rule.get("task_types", [])}
    for required in ("critical", "routine", "classification", "coding", "review"):
        if required not in rule_task_types:
            errors.append(f"missing routing rule for {required}")
    if rules.get("default_unknown_task_policy") != "DENY_SAFE_DEFAULT":
        errors.append("unknown task policy must deny or safe default")
    if fallback.get("ai_unavailable_policy") != "CONTINUE_DETERMINISTIC_WHERE_POSSIBLE":
        errors.append("AI unavailable policy must preserve deterministic fallback")
    if fallback.get("no_unlimited_fallback_loops") is not True:
        errors.append("fallback policy must deny unlimited loops")
    if not costs.get("cost_limits"):
        errors.append("model cost limits missing")

    return ("PASS" if not errors else "FAIL"), errors, loaded


def write_results() -> int:
    status, errors, loaded = validate()
    lines = [
        "# Model Router Validation Results",
        "",
        "SESSION=VOLTAGENT_RUNTIME_MODEL_ROUTER_AND_COST_GOVERNOR_V1",
        f"MODEL_ROUTER_VALIDATION_RESULT={status}",
        f"CONFIGS_CHECKED={len(CONFIGS)}",
        f"SCHEMAS_CHECKED={len(SCHEMAS)}",
        "LIVE_PROVIDERS_ENABLED=NO" if status == "PASS" else "LIVE_PROVIDERS_ENABLED=CHECK_ERRORS",
        "PROVIDER_CREDENTIALS_COMMITTED=NO" if status == "PASS" else "PROVIDER_CREDENTIALS_COMMITTED=CHECK_ERRORS",
        "PRODUCTION_PROVIDERS_ENABLED=0" if status == "PASS" else "PRODUCTION_PROVIDERS_ENABLED=CHECK_ERRORS",
        "DETERMINISTIC_FALLBACK_STATUS=CONFIGURED" if loaded.get("config/models/MODEL_FALLBACK_POLICY.json", {}).get("ai_unavailable_policy") else "DETERMINISTIC_FALLBACK_STATUS=CHECK_ERRORS",
        "",
        "## Errors",
    ]
    lines.extend(f"- {error}" for error in errors) if errors else lines.append("- None")
    lines.append("")
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"MODEL_ROUTER_VALIDATION_RESULT={status}")
    for error in errors:
        print(f"ERROR: {error}")
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(write_results())
