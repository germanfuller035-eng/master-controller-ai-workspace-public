from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from tools.cost_governor.budget_policy import BudgetPolicy
from tools.cost_governor.cost_meter import CostMeter
from tools.cost_governor.retry_limiter import RetryLimiter
from tools.model_router.model_router import ModelRouter
from tools.model_router.provider_registry import ProviderRegistry
from tools.runtime.runtime_stop import enforce_stop
from tools.runtime.stateless_agent import StatelessAgent


ROOT = Path(__file__).resolve().parents[2]
FEATURE_FLAGS_PATH = ROOT / "config" / "feature_flags" / "AI_SYSTEM_FEATURE_FLAGS.json"
RUNTIME_POLICY_PATH = ROOT / "config" / "runtime" / "AGENT_RUNTIME_POLICY.json"
EXECUTION_LIMITS_PATH = ROOT / "config" / "runtime" / "AGENT_EXECUTION_LIMITS.json"


class RuntimeErrorResponse(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class RuntimeRequest:
    task_id: str
    actor: str
    purpose: str
    risk: str
    budget: dict[str, Any]
    model_requirement: dict[str, Any]
    tool_scope: dict[str, Any]
    environment: str
    local_synthetic_fixture: bool
    retry_count: int
    stop_state: dict[str, Any] | bool | None
    limits: dict[str, Any]
    provider_status: dict[str, Any]

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "RuntimeRequest":
        required = ["task_id", "actor", "purpose", "risk", "budget", "model_requirement", "tool_scope"]
        missing = [field for field in required if field not in payload]
        if missing:
            raise RuntimeErrorResponse("INVALID_REQUEST", f"missing required field {missing[0]}")
        if payload["risk"] not in {"R0", "R1", "R2", "R3", "R4", "R5"}:
            raise RuntimeErrorResponse("INVALID_RISK", "unknown risk")
        if not isinstance(payload["budget"], dict):
            raise RuntimeErrorResponse("INVALID_BUDGET", "budget must be an object")
        if not isinstance(payload["model_requirement"], dict):
            raise RuntimeErrorResponse("INVALID_MODEL_REQUIREMENT", "model_requirement must be an object")
        if not isinstance(payload["tool_scope"], dict):
            raise RuntimeErrorResponse("INVALID_TOOL_SCOPE", "tool_scope must be an object")
        return cls(
            task_id=str(payload["task_id"]),
            actor=str(payload["actor"]),
            purpose=str(payload["purpose"]),
            risk=str(payload["risk"]),
            budget=dict(payload["budget"]),
            model_requirement=dict(payload["model_requirement"]),
            tool_scope=dict(payload["tool_scope"]),
            environment=str(payload.get("environment", "PRODUCTION")),
            local_synthetic_fixture=bool(payload.get("local_synthetic_fixture", False)),
            retry_count=int(payload.get("retry_count", 0)),
            stop_state=payload.get("stop_state") if "stop_state" in payload else payload.get("stop_active", False),
            limits=dict(payload.get("limits", {})),
            provider_status=dict(payload.get("provider_status", {})),
        )


class RuntimeAdapter:
    def __init__(
        self,
        router: ModelRouter | None = None,
        cost_meter: CostMeter | None = None,
        budget_policy: BudgetPolicy | None = None,
        retry_limiter: RetryLimiter | None = None,
    ) -> None:
        self.runtime_policy = json.loads(RUNTIME_POLICY_PATH.read_text(encoding="utf-8"))
        self.execution_limits = json.loads(EXECUTION_LIMITS_PATH.read_text(encoding="utf-8"))
        self.router = router
        self.cost_meter = cost_meter or CostMeter()
        self.budget_policy = budget_policy or BudgetPolicy()
        self.retry_limiter = retry_limiter or RetryLimiter()

    def handle(self, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            request = RuntimeRequest.from_dict(payload)
            denial = self._first_denial(request)
            if denial:
                return self._denied(request.task_id, denial["code"], denial["message"])

            provider_registry = ProviderRegistry(provider_status=request.provider_status)
            router = self.router or ModelRouter(provider_registry=provider_registry)
            route = router.route(
                {
                    "task_type": request.model_requirement.get("task_type"),
                    "purpose": request.purpose,
                    "model_requirement": request.model_requirement,
                    "previous_provider": request.model_requirement.get("previous_provider"),
                }
            )
            if route.get("status") != "OK":
                return self._denied(request.task_id, str(route.get("error_code", "ROUTING_DENIED")), str(route.get("decision", "routing denied")))

            input_tokens = int(request.budget.get("input_tokens", 0))
            output_tokens = int(request.budget.get("output_tokens", 0))
            estimate = self.cost_meter.estimate(str(route["model_id"]), input_tokens, output_tokens, request.retry_count)
            retry_decision = self.retry_limiter.enforce(
                request.retry_count,
                float(request.budget.get("retry_budget_spent_rub", 0.0)),
                request.limits.get("loop_policy"),
            )
            if not retry_decision["allowed"]:
                return self._denied(request.task_id, retry_decision["reason"], "retry limit denied")

            budget_decision = self.budget_policy.enforce(
                str(route["task_type"]),
                estimate,
                request.budget.get("task_budget_rub"),
                float(request.budget.get("monthly_spend_rub", 0.0)),
                bool(request.budget.get("stop_loss_ack", False)),
                request.limits.get("max_iterations", 1),
            )
            if not budget_decision["allowed"]:
                return self._denied(request.task_id, budget_decision["reason"], "cost governor denied")

            agent_result = StatelessAgent(memory_enabled=False).execute(payload)
            if agent_result["status"] != "STATELESS_OK":
                return self._denied(request.task_id, str(agent_result["error_code"]), "stateless agent policy denied")

            return {
                "status": "DRY_RUN_OK",
                "task_id": request.task_id,
                "environment": request.environment,
                "model_choice": route,
                "cost_estimate": estimate,
                "budget_decision": budget_decision,
                "retry_decision": retry_decision,
                "retry_count": request.retry_count,
                "memory_enabled": False,
                "production_capabilities": 0,
                "tool_route": "MCP_GATEWAY_ONLY",
                "evidence_refs": [
                    "config/runtime/AGENT_RUNTIME_POLICY.json",
                    "config/models/MODEL_ROUTING_RULES.json",
                    "config/costs/COST_GOVERNOR_POLICY.json",
                ],
            }
        except RuntimeErrorResponse as exc:
            return self._denied(str(payload.get("task_id", "UNKNOWN_TASK")), exc.code, exc.message)

    def _first_denial(self, request: RuntimeRequest) -> dict[str, str] | None:
        flag_state = self._agent_runtime_flag_state()
        if request.environment != "LOCAL_SYNTHETIC":
            return {"code": "AGENT_RUNTIME_OFF", "message": f"AGENT_RUNTIME is {flag_state}; production runtime denied"}
        if not request.local_synthetic_fixture:
            return {"code": "LOCAL_SYNTHETIC_FIXTURE_REQUIRED", "message": "explicit LOCAL_SYNTHETIC fixture required"}
        stop_decision = enforce_stop(request.stop_state)
        if not stop_decision["allowed"]:
            return {"code": "STOP_BLOCKED", "message": stop_decision["reason"]}
        if request.tool_scope.get("direct_tool_call") is True:
            return {"code": "DIRECT_TOOL_CALL_DENIED", "message": "runtime tools must route through MCP Gateway"}
        if request.tool_scope.get("mcp_gateway_required") is not True or request.tool_scope.get("route") != "MCP_GATEWAY":
            return {"code": "MCP_GATEWAY_REQUIRED", "message": "MCP Gateway path is required"}
        if int(request.tool_scope.get("production_capabilities", 0)) != 0:
            return {"code": "PRODUCTION_CAPABILITY_DENIED", "message": "production capabilities must be 0"}
        if request.tool_scope.get("outbound") or request.tool_scope.get("payments") or request.tool_scope.get("production_db_write"):
            return {"code": "PRODUCTION_TOOL_DENIED", "message": "production tools, outbound, payments, and DB writes are denied"}
        if request.limits.get("delegation_depth", 0) > self.execution_limits["max_delegation_depth"]:
            return {"code": "DELEGATION_DEPTH_EXCEEDED", "message": "max delegation depth exceeded"}
        if request.limits.get("subagents", 0) > self.execution_limits["max_subagents_per_task"]:
            return {"code": "SUBAGENT_LIMIT_EXCEEDED", "message": "max subagents per task exceeded"}
        if request.limits.get("interagent_messages", 0) > self.execution_limits["max_interagent_messages"]:
            return {"code": "INTERAGENT_MESSAGE_LIMIT_EXCEEDED", "message": "max interagent messages exceeded"}
        if request.limits.get("memory_enabled") is True or request.limits.get("persistent_memory_write") is True:
            return {"code": "MEMORY_WRITE_DENIED", "message": "persistent memory is disabled by default"}
        return None

    @staticmethod
    def _agent_runtime_flag_state() -> str:
        data = json.loads(FEATURE_FLAGS_PATH.read_text(encoding="utf-8"))
        for flag in data.get("feature_flags", []):
            if flag.get("id") == "AGENT_RUNTIME":
                return str(flag.get("current_lifecycle"))
        return "MISSING"

    @staticmethod
    def _denied(task_id: str, code: str, message: str) -> dict[str, Any]:
        return {
            "status": "DENIED",
            "task_id": task_id,
            "error_code": code,
            "error_message": message,
            "memory_enabled": False,
            "production_capabilities": 0,
            "evidence_refs": ["config/runtime/AGENT_RUNTIME_POLICY.json"],
        }
