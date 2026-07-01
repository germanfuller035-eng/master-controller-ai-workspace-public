from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from tools.mcp_gateway.adapter_registry import AdapterRegistration
from tools.mcp_gateway.models import GatewayRequest
from tools.policies.policy_decision import evaluate_policy


ROOT = Path(__file__).resolve().parents[2]
FEATURE_FLAGS_PATH = ROOT / "config" / "feature_flags" / "AI_SYSTEM_FEATURE_FLAGS.json"

FORBIDDEN_ACTIONS = {
    "unrestricted_shell": ("unrestricted_shell", "unrestricted_shell", "R5"),
    "direct_docker_socket": ("direct_docker_socket", "direct_docker_socket", "R5"),
    "direct_ssh": ("permission_change", "direct_production_filesystem", "R5"),
    "production_db_write": ("production_db_write", "production_db_write", "R4"),
    "outbound_send": ("outbound_send", "outbound_message", "R4"),
    "publish_external": ("publish_external", "outbound_message", "R4"),
    "payment_operation": ("payment_operation", "payment_operation", "R5"),
    "browser_action": ("browser_action", "browser_action", "R4"),
}

ADAPTER_POLICY = {
    "filesystem_read": ("read_evidence", "read_search_analyze_classify", "MCP_READ"),
    "git_read": ("read_evidence", "read_search_analyze_classify", "MCP_READ"),
    "artifact_local": ("local_report", "local_tests_drafts_reports", None),
    "test_runner_local": ("local_policy_test", "local_tests_drafts_reports", None),
    "vps_health_read_contract": ("read_evidence", "read_search_analyze_classify", "MCP_READ"),
    "mysql_read_contract": ("read_evidence", "read_search_analyze_classify", "MCP_READ"),
    "github_read_contract": ("read_evidence", "read_search_analyze_classify", "MCP_READ"),
    "mail_draft_contract": ("local_draft", "local_tests_drafts_reports", None),
    "browser_contract": ("browser_action", "browser_action", None),
}


def load_feature_flag_states() -> dict[str, str]:
    data = json.loads(FEATURE_FLAGS_PATH.read_text(encoding="utf-8"))
    return {item["id"]: item.get("current_lifecycle", "OFF") for item in data.get("feature_flags", [])}


def _fixture_flag_states(request: GatewayRequest) -> dict[str, str]:
    states = load_feature_flag_states()
    override = request.input.get("feature_flag_state", {})
    if isinstance(override, dict):
        states.update({str(key): str(value) for key, value in override.items()})
    return states


class PolicyBridge:
    def authorize(self, request: GatewayRequest, registration: AdapterRegistration | None) -> dict[str, Any]:
        if request.action in FORBIDDEN_ACTIONS:
            action, capability, risk = FORBIDDEN_ACTIONS[request.action]
            policy_request = self._policy_request(request, action, capability, risk, required_flag=None)
            return evaluate_policy(policy_request, approval=request.approval)

        if registration is None:
            return {"decision": "DENY", "reason": "unknown adapter"}
        if request.action not in registration.allowed_actions and not registration.contract_only:
            return {"decision": "DENY", "reason": "unknown action"}
        if registration.production_enabled:
            return {"decision": "DENY", "reason": "production adapter enabled unexpectedly"}
        if registration.lifecycle == "OFF" and request.environment != "OFF":
            action, capability, required_flag = ADAPTER_POLICY.get(request.adapter_id, ("read_evidence", "read_search_analyze_classify", "MCP_READ"))
            flag_denial = self._gateway_feature_flag_denial(request, required_flag)
            if flag_denial:
                return flag_denial
            policy_request = self._policy_request(request, action, capability, request.risk, required_flag)
            decision = evaluate_policy(policy_request, approval=request.approval)
            if decision["decision"] == "ALLOW":
                return {"decision": "DENY", "reason": "adapter lifecycle off"}
            return decision

        action, capability, required_flag = ADAPTER_POLICY.get(request.adapter_id, ("read_evidence", "read_search_analyze_classify", "MCP_READ"))
        flag_denial = self._gateway_feature_flag_denial(request, required_flag)
        if flag_denial:
            return flag_denial
        policy_request = self._policy_request(request, action, capability, request.risk, required_flag)
        return evaluate_policy(policy_request, approval=request.approval)

    def _gateway_feature_flag_denial(self, request: GatewayRequest, required_flag: str | None) -> dict[str, Any] | None:
        if not required_flag:
            return None
        state = _fixture_flag_states(request).get(required_flag, "OFF")
        if request.environment == "PRODUCTION":
            if state != "PRODUCTION_READ_ONLY":
                return {"decision": "DENY", "reason": f"feature flag {required_flag} off for production"}
            return None
        if state == "OFF":
            return {"decision": "DENY", "reason": f"feature flag {required_flag} off"}
        return None

    def _policy_request(
        self,
        request: GatewayRequest,
        action: str,
        capability: str,
        risk: str,
        required_flag: str | None,
    ) -> dict[str, Any]:
        flag_states = _fixture_flag_states(request)
        if request.environment == "PRODUCTION":
            lifecycle_state = "PRODUCTION_READ_ONLY"
        elif request.environment in {"OFF", "LOCAL_SYNTHETIC", "SHADOW", "PRODUCTION_READ_ONLY", "DRAFT_ONLY", "OWNER_APPROVAL_REQUIRED", "LIMITED_AUTONOMY"}:
            lifecycle_state = request.environment
        else:
            lifecycle_state = "LOCAL_SYNTHETIC"
        return {
            "actor": request.actor,
            "action": action,
            "target": request.resource,
            "resource": request.resource,
            "payload": {"adapter_id": request.adapter_id, "action": request.action},
            "risk": risk,
            "task_id": request.task_id,
            "requested_capability": capability,
            "lifecycle_state": lifecycle_state,
            "requires_feature_flag": required_flag,
            "feature_flag_state": flag_states,
            "stop_active": bool(request.input.get("stop_active")),
        }
