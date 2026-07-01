from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


VALID_RISKS = {"R0", "R1", "R2", "R3", "R4", "R5"}
VALID_ENVIRONMENTS = {
    "OFF",
    "LOCAL_SYNTHETIC",
    "SHADOW",
    "PRODUCTION_READ_ONLY",
    "DRAFT_ONLY",
    "OWNER_APPROVAL_REQUIRED",
    "LIMITED_AUTONOMY",
    "PRODUCTION",
}


class GatewayError(Exception):
    def __init__(self, code: str, message: str, status: str = "ERROR") -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


@dataclass(frozen=True)
class GatewayRequest:
    request_id: str
    task_id: str
    actor: str
    adapter_id: str
    action: str
    resource: str
    environment: str
    risk: str
    data_class: str
    input: dict[str, Any]
    timeout_ms: int
    evidence_required: bool
    approval: dict[str, Any] | None = None
    cancellation_token: dict[str, Any] | str | None = None

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "GatewayRequest":
        required = [
            "request_id",
            "task_id",
            "actor",
            "adapter_id",
            "action",
            "resource",
            "environment",
            "risk",
            "data_class",
            "input",
            "timeout_ms",
            "evidence_required",
        ]
        missing = [field for field in required if field not in payload]
        if missing:
            raise GatewayError("INVALID_REQUEST", f"missing required field {missing[0]}", status="DENIED")
        if payload["risk"] not in VALID_RISKS:
            raise GatewayError("INVALID_RISK", "unknown risk", status="DENIED")
        if payload["environment"] not in VALID_ENVIRONMENTS:
            raise GatewayError("INVALID_ENVIRONMENT", "unknown environment", status="DENIED")
        if not isinstance(payload["input"], dict):
            raise GatewayError("INVALID_INPUT", "input must be an object", status="DENIED")
        timeout_ms = int(payload["timeout_ms"])
        if timeout_ms <= 0:
            raise GatewayError("INVALID_TIMEOUT", "timeout_ms must be positive", status="DENIED")
        return cls(
            request_id=str(payload["request_id"]),
            task_id=str(payload["task_id"]),
            actor=str(payload["actor"]),
            adapter_id=str(payload["adapter_id"]),
            action=str(payload["action"]),
            resource=str(payload["resource"]),
            environment=str(payload["environment"]),
            risk=str(payload["risk"]),
            data_class=str(payload["data_class"]),
            input=dict(payload["input"]),
            timeout_ms=timeout_ms,
            evidence_required=bool(payload["evidence_required"]),
            approval=payload.get("approval"),
            cancellation_token=payload.get("cancellation_token"),
        )

    def safe_dict(self) -> dict[str, Any]:
        return {
            "request_id": self.request_id,
            "task_id": self.task_id,
            "actor": self.actor,
            "adapter_id": self.adapter_id,
            "action": self.action,
            "resource": self.resource,
            "environment": self.environment,
            "risk": self.risk,
            "data_class": self.data_class,
            "input": self.input,
            "timeout_ms": self.timeout_ms,
            "evidence_required": self.evidence_required,
        }


@dataclass
class GatewayResponse:
    request_id: str
    status: str
    policy_decision: dict[str, Any]
    duration_ms: int
    artifact_ids: list[str] = field(default_factory=list)
    audit_event_id: str = ""
    redacted_result: Any = None
    result_ref: str | None = None
    error_code: str | None = None
    error_message_redacted: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "request_id": self.request_id,
            "status": self.status,
            "result_ref": self.result_ref,
            "redacted_result": self.redacted_result,
            "artifact_ids": self.artifact_ids,
            "audit_event_id": self.audit_event_id,
            "policy_decision": self.policy_decision,
            "duration_ms": self.duration_ms,
            "error_code": self.error_code,
            "error_message_redacted": self.error_message_redacted,
        }


@dataclass
class AdapterResult:
    data: Any
    artifact_ids: list[str] = field(default_factory=list)
    result_ref: str | None = None
