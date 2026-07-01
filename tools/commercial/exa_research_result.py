from __future__ import annotations

from copy import deepcopy
from typing import Any

from tools.commercial.core import CommercialPolicyError

CONFIDENCE_VALUES = {"low", "medium", "high"}
STATUS_VALUES = {"candidate", "confirmed"}
CONTACT_TYPES = {"email", "phone", "contact_page", "form", "official_social"}
RISK_SEVERITIES = {"low", "medium", "high"}

REQUIRED_TOP_LEVEL_FIELDS = (
    "research_task_id",
    "lead_id",
    "company_name",
    "website",
    "source_type",
    "facts",
    "buying_signals",
    "contact_candidates",
    "risk_flags",
    "recommended_next_action",
    "do_not_contact",
)


def _is_non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _strip_strings(value: Any) -> Any:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        return [_strip_strings(item) for item in value]
    if isinstance(value, dict):
        return {key: _strip_strings(item) for key, item in value.items()}
    return value


def normalize_exa_research_result(result: dict[str, Any]) -> dict[str, Any]:
    """Return a copy with strings stripped and list fields normalized to lists."""

    normalized = _strip_strings(deepcopy(result))
    for field in ("facts", "buying_signals", "contact_candidates", "risk_flags"):
        if normalized.get(field) is None:
            normalized[field] = []
    return normalized


def _require_object(value: Any, path: str, errors: list[str]) -> bool:
    if not isinstance(value, dict):
        errors.append(f"{path} must be an object")
        return False
    return True


def _require_array(value: Any, path: str, errors: list[str]) -> bool:
    if not isinstance(value, list):
        errors.append(f"{path} must be an array")
        return False
    return True


def _validate_confidence_status(item: dict[str, Any], path: str, errors: list[str]) -> None:
    confidence = item.get("confidence")
    status = item.get("status")
    if confidence not in CONFIDENCE_VALUES:
        errors.append(f"{path}.confidence must be one of low, medium, high")
    if status not in STATUS_VALUES:
        errors.append(f"{path}.status must be candidate or confirmed")
    if confidence == "low" and status != "candidate":
        errors.append(f"{path}.status must be candidate when confidence is low")


def _validate_required_fields(item: dict[str, Any], path: str, required: tuple[str, ...], errors: list[str]) -> None:
    for field in required:
        if field not in item:
            errors.append(f"{path}.{field} is required")


def _validate_fact(item: Any, index: int, errors: list[str]) -> None:
    path = f"facts[{index}]"
    if not _require_object(item, path, errors):
        return
    _validate_required_fields(item, path, ("fact_type", "fact_value", "source_url", "source_title", "evidence_snippet", "confidence", "status"), errors)
    if not _is_non_empty_string(item.get("source_url")):
        errors.append(f"{path}.source_url is required and non-empty")
    _validate_confidence_status(item, path, errors)


def _validate_buying_signal(item: Any, index: int, errors: list[str]) -> None:
    path = f"buying_signals[{index}]"
    if not _require_object(item, path, errors):
        return
    _validate_required_fields(
        item,
        path,
        ("signal_type", "signal_description", "source_url", "source_title", "evidence_snippet", "confidence", "score_impact", "status"),
        errors,
    )
    if not _is_non_empty_string(item.get("source_url")):
        errors.append(f"{path}.source_url is required and non-empty")
    if not isinstance(item.get("score_impact"), (int, float)) or isinstance(item.get("score_impact"), bool):
        errors.append(f"{path}.score_impact must be numeric")
    _validate_confidence_status(item, path, errors)


def _validate_contact_candidate(item: Any, index: int, errors: list[str]) -> None:
    path = f"contact_candidates[{index}]"
    if not _require_object(item, path, errors):
        return
    _validate_required_fields(item, path, ("contact_type", "value", "source_url", "source_title", "confidence", "status"), errors)
    if item.get("contact_type") not in CONTACT_TYPES:
        errors.append(f"{path}.contact_type must be one of email, phone, contact_page, form, official_social")
    if not _is_non_empty_string(item.get("source_url")):
        errors.append(f"{path}.source_url is required and non-empty")
    _validate_confidence_status(item, path, errors)


def _validate_risk_flag(item: Any, index: int, errors: list[str]) -> None:
    path = f"risk_flags[{index}]"
    if not _require_object(item, path, errors):
        return
    _validate_required_fields(item, path, ("risk_type", "description", "severity", "source_url"), errors)
    if item.get("severity") not in RISK_SEVERITIES:
        errors.append(f"{path}.severity must be low, medium, or high")


def validate_exa_research_result(result: dict[str, Any]) -> dict[str, Any]:
    normalized = normalize_exa_research_result(result)
    errors: list[str] = []

    if not _require_object(normalized, "exa_research_result", errors):
        return {"valid": False, "errors": errors, "result": normalized}

    for field in REQUIRED_TOP_LEVEL_FIELDS:
        if field not in normalized:
            errors.append(f"{field} is required")

    if normalized.get("source_type") != "public_web_research":
        errors.append("source_type must equal public_web_research")
    if not isinstance(normalized.get("do_not_contact"), bool):
        errors.append("do_not_contact must be boolean")

    if _require_array(normalized.get("facts"), "facts", errors):
        for index, item in enumerate(normalized["facts"]):
            _validate_fact(item, index, errors)
    if _require_array(normalized.get("buying_signals"), "buying_signals", errors):
        for index, item in enumerate(normalized["buying_signals"]):
            _validate_buying_signal(item, index, errors)
    if _require_array(normalized.get("contact_candidates"), "contact_candidates", errors):
        for index, item in enumerate(normalized["contact_candidates"]):
            _validate_contact_candidate(item, index, errors)
    if _require_array(normalized.get("risk_flags"), "risk_flags", errors):
        for index, item in enumerate(normalized["risk_flags"]):
            _validate_risk_flag(item, index, errors)

    return {"valid": not errors, "errors": errors, "result": normalized}


def require_valid_exa_research_result(result: dict[str, Any]) -> dict[str, Any]:
    validation = validate_exa_research_result(result)
    if not validation["valid"]:
        raise CommercialPolicyError("; ".join(validation["errors"]))
    return validation["result"]


def can_route_exa_result_to_outreach(result: dict[str, Any], *, owner_review_approved: bool = False) -> dict[str, Any]:
    validation = validate_exa_research_result(result)
    if not validation["valid"]:
        return {"routable": False, "reason": "VALIDATION_FAILED", "errors": validation["errors"]}

    normalized = validation["result"]
    if normalized.get("do_not_contact") is True:
        return {"routable": False, "reason": "DO_NOT_CONTACT", "errors": []}

    high_risks = [flag for flag in normalized.get("risk_flags", []) if flag.get("severity") == "high"]
    if high_risks and not owner_review_approved:
        return {"routable": False, "reason": "HIGH_RISK_REQUIRES_OWNER_REVIEW", "errors": []}

    return {"routable": True, "reason": "PASS", "errors": []}


validateExaResearchResult = validate_exa_research_result
normalizeExaResearchResult = normalize_exa_research_result
canRouteExaResultToOutreach = can_route_exa_result_to_outreach
