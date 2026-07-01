from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from tools.model_router.fallback_policy import FallbackPolicy
from tools.model_router.provider_registry import ProviderRegistry


ROOT = Path(__file__).resolve().parents[2]
ROUTING_RULES_PATH = ROOT / "config" / "models" / "MODEL_ROUTING_RULES.json"

TASK_ALIASES = {
    "critical": "critical",
    "high_risk_reasoning": "critical",
    "incident_analysis": "critical",
    "routine": "routine",
    "summary": "routine",
    "draft": "routine",
    "classification": "classification",
    "triage": "classification",
    "coding": "coding",
    "code_change": "coding",
    "code_review_fix": "coding",
    "review": "review",
    "independent_review": "review",
    "second_pass": "review",
}


class ModelRouter:
    def __init__(
        self,
        rules_path: Path | None = None,
        provider_registry: ProviderRegistry | None = None,
        fallback_policy: FallbackPolicy | None = None,
    ) -> None:
        self.rules_path = rules_path or ROUTING_RULES_PATH
        self.rules_data = json.loads(self.rules_path.read_text(encoding="utf-8"))
        self.provider_registry = provider_registry or ProviderRegistry()
        self.fallback_policy = fallback_policy or FallbackPolicy()
        self.rules = self._load_rules()

    def _load_rules(self) -> dict[str, dict[str, Any]]:
        rules: dict[str, dict[str, Any]] = {}
        for rule in self.rules_data.get("rules", []):
            for task_type in rule.get("task_types", []):
                rules[TASK_ALIASES.get(task_type, task_type)] = rule
        return rules

    def route(self, payload: dict[str, Any]) -> dict[str, Any]:
        task_type = self._task_type(payload)
        if task_type not in {"critical", "routine", "classification", "coding", "review"}:
            return {
                "status": "DENIED",
                "decision": "DENY_SAFE_DEFAULT",
                "error_code": "UNKNOWN_TASK_TYPE",
                "task_type": task_type,
                "provider_id": None,
                "model_id": None,
                "deterministic_fallback": False,
            }

        rule = self.rules.get(task_type)
        if not rule:
            return {
                "status": "DENIED",
                "decision": "DENY_SAFE_DEFAULT",
                "error_code": "MISSING_ROUTING_RULE",
                "task_type": task_type,
                "provider_id": None,
                "model_id": None,
                "deterministic_fallback": False,
            }

        previous_provider = payload.get("previous_provider")
        candidates = self._candidate_models(task_type, rule)
        checked: list[dict[str, str]] = []
        for model_id in candidates:
            provider_id = self.provider_registry.provider_for_model(model_id)
            if rule.get("requires_different_provider") and previous_provider and provider_id == previous_provider:
                checked.append({"model_id": model_id, "provider_id": str(provider_id), "status": "SKIPPED_SAME_PROVIDER"})
                continue
            if model_id == "deterministic_fallback_process":
                return self._deterministic_fallback(task_type, checked)
            if self.provider_registry.is_available(provider_id):
                return {
                    "status": "OK",
                    "decision": "ROUTE",
                    "task_type": task_type,
                    "rule_id": rule["id"],
                    "model_id": model_id,
                    "provider_id": provider_id,
                    "route_kind": "DETERMINISTIC_CODE" if model_id == "deterministic_local_classifier" else "SYNTHETIC_PROVIDER_PROFILE",
                    "requires_stop_loss": bool(rule.get("requires_stop_loss")),
                    "deterministic_fallback": model_id == "deterministic_local_classifier",
                    "checked": checked,
                }
            checked.append({"model_id": model_id, "provider_id": str(provider_id), "status": "UNAVAILABLE"})

        return self._deterministic_fallback(task_type, checked)

    def _candidate_models(self, task_type: str, rule: dict[str, Any]) -> list[str]:
        chain = self.fallback_policy.chain_for(task_type)
        preferred = rule.get("preferred_model_id")
        candidates: list[str] = []
        if preferred:
            candidates.append(str(preferred))
        if rule.get("fallback_model_id"):
            candidates.append(str(rule["fallback_model_id"]))
        candidates.extend(chain)
        deduped: list[str] = []
        for model_id in candidates:
            if model_id not in deduped:
                deduped.append(model_id)
        return deduped

    def _deterministic_fallback(self, task_type: str, checked: list[dict[str, str]]) -> dict[str, Any]:
        if not self.fallback_policy.deterministic_available():
            return {
                "status": "DENIED",
                "decision": "NO_PROVIDER_AVAILABLE",
                "error_code": "AI_UNAVAILABLE",
                "task_type": task_type,
                "model_id": None,
                "provider_id": None,
                "deterministic_fallback": False,
                "checked": checked,
            }
        return {
            "status": "OK",
            "decision": "DETERMINISTIC_FALLBACK",
            "task_type": task_type,
            "model_id": "deterministic_fallback_process",
            "provider_id": "deterministic_local_process",
            "route_kind": "DETERMINISTIC_FALLBACK",
            "requires_stop_loss": False,
            "deterministic_fallback": True,
            "checked": checked,
        }

    @staticmethod
    def _task_type(payload: dict[str, Any]) -> str:
        requirement = payload.get("model_requirement", {})
        if isinstance(requirement, dict) and requirement.get("task_type"):
            return TASK_ALIASES.get(str(requirement["task_type"]), str(requirement["task_type"]))
        if payload.get("task_type"):
            return TASK_ALIASES.get(str(payload["task_type"]), str(payload["task_type"]))
        purpose = str(payload.get("purpose", "")).lower()
        for key, canonical in TASK_ALIASES.items():
            if key in purpose:
                return canonical
        return "unknown"
