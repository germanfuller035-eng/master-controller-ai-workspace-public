from __future__ import annotations

import time
from typing import Any

from tools.mcp_gateway.adapter_registry import AdapterRegistration, AdapterRegistry
from tools.mcp_gateway.audit import AuditLogger
from tools.mcp_gateway.cancellation import GLOBAL_CANCELLATION_REGISTRY, CancellationRegistry
from tools.mcp_gateway.models import AdapterResult, GatewayError, GatewayRequest, GatewayResponse
from tools.mcp_gateway.policy_bridge import PolicyBridge
from tools.mcp_gateway.redaction import redact_data
from tools.mcp_gateway.timeouts import resolve_timeout_ms


class Gateway:
    def __init__(
        self,
        registry: AdapterRegistry | None = None,
        policy_bridge: PolicyBridge | None = None,
        audit_logger: AuditLogger | None = None,
        cancellation: CancellationRegistry | None = None,
    ) -> None:
        self.registry = registry or AdapterRegistry()
        self.policy_bridge = policy_bridge or PolicyBridge()
        self.audit_logger = audit_logger or AuditLogger()
        self.cancellation = cancellation or GLOBAL_CANCELLATION_REGISTRY

    def handle(self, payload: dict[str, Any]) -> dict[str, Any]:
        started = time.monotonic()
        request_id = str(payload.get("request_id", "UNKNOWN_REQUEST"))
        try:
            request = GatewayRequest.from_dict(payload)
        except GatewayError as exc:
            request = self._synthetic_request(payload, request_id)
            response = self._error_response(request_id, exc, {}, started)
            response.audit_event_id = self.audit_logger.emit(request, response)
            return response.to_dict()

        registration: AdapterRegistration | None = None
        policy_decision: dict[str, Any] = {}
        try:
            self.cancellation.check(request.cancellation_token)
            try:
                registration = self.registry.get(request.adapter_id)
            except GatewayError:
                policy_decision = {"decision": "DENY", "reason": "unknown adapter"}
                response = GatewayResponse(
                    request_id=request.request_id,
                    status="DENIED",
                    policy_decision=policy_decision,
                    duration_ms=self._duration_ms(started),
                    error_code="UNKNOWN_ADAPTER",
                    error_message_redacted="unknown adapter",
                )
                response.audit_event_id = self.audit_logger.emit(request, response)
                return response.to_dict()

            policy_decision = self.policy_bridge.authorize(request, registration)
            if policy_decision.get("decision") != "ALLOW":
                response = GatewayResponse(
                    request_id=request.request_id,
                    status="DENIED",
                    policy_decision=policy_decision,
                    duration_ms=self._duration_ms(started),
                    error_code=str(policy_decision.get("decision", "DENY")),
                    error_message_redacted=str(policy_decision.get("reason", "policy denied")),
                )
                response.audit_event_id = self.audit_logger.emit(request, response)
                return response.to_dict()

            if registration.contract_only:
                raise GatewayError("NOT_IMPLEMENTED", "contract-only adapter is not implemented", status="DENIED")

            timeout_ms = resolve_timeout_ms(request.adapter_id, request.timeout_ms)
            adapter = self.registry.create_adapter(registration)
            self.cancellation.check(request.cancellation_token)
            result: AdapterResult = adapter.execute(request, timeout_ms, self.cancellation)
            self.cancellation.check(request.cancellation_token)
            response = GatewayResponse(
                request_id=request.request_id,
                status="OK",
                redacted_result=redact_data(result.data),
                artifact_ids=result.artifact_ids,
                result_ref=result.result_ref,
                policy_decision=policy_decision,
                duration_ms=self._duration_ms(started),
            )
        except GatewayError as exc:
            response = self._error_response(request.request_id, exc, policy_decision, started)
        except TimeoutError as exc:
            response = self._error_response(request.request_id, GatewayError("TIMEOUT", "gateway timeout", status="TIMEOUT"), policy_decision, started)
        response.audit_event_id = self.audit_logger.emit(request, response)
        return response.to_dict()

    def _error_response(self, request_id: str, exc: GatewayError, policy_decision: dict[str, Any], started: float) -> GatewayResponse:
        return GatewayResponse(
            request_id=request_id,
            status=exc.status,
            policy_decision=policy_decision or {"decision": "DENY", "reason": exc.code},
            duration_ms=self._duration_ms(started),
            error_code=exc.code,
            error_message_redacted=exc.message,
        )

    @staticmethod
    def _duration_ms(started: float) -> int:
        return int((time.monotonic() - started) * 1000)

    @staticmethod
    def _synthetic_request(payload: dict[str, Any], request_id: str) -> GatewayRequest:
        synthetic = {
            "request_id": request_id,
            "task_id": str(payload.get("task_id", "UNKNOWN_TASK")),
            "actor": str(payload.get("actor", "UNKNOWN_ACTOR")),
            "adapter_id": str(payload.get("adapter_id", "UNKNOWN_ADAPTER")),
            "action": str(payload.get("action", "UNKNOWN_ACTION")),
            "resource": str(payload.get("resource", "")),
            "environment": str(payload.get("environment", "LOCAL_SYNTHETIC")) if str(payload.get("environment", "LOCAL_SYNTHETIC")) in {"OFF", "LOCAL_SYNTHETIC", "SHADOW", "PRODUCTION_READ_ONLY", "DRAFT_ONLY", "OWNER_APPROVAL_REQUIRED", "LIMITED_AUTONOMY", "PRODUCTION"} else "LOCAL_SYNTHETIC",
            "risk": str(payload.get("risk", "R0")) if str(payload.get("risk", "R0")) in {"R0", "R1", "R2", "R3", "R4", "R5"} else "R0",
            "data_class": str(payload.get("data_class", "BUSINESS_INTERNAL")),
            "input": payload.get("input", {}) if isinstance(payload.get("input", {}), dict) else {},
            "timeout_ms": int(payload.get("timeout_ms", 1000) or 1000),
            "evidence_required": bool(payload.get("evidence_required", False)),
            "approval": None,
            "cancellation_token": None,
        }
        return GatewayRequest.from_dict(synthetic)
