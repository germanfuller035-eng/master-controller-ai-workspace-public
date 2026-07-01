from __future__ import annotations

from typing import Any

from tools.commercial.core import CommercialPolicyError
from tools.commercial.exa_research_result import (
    can_route_exa_result_to_outreach,
    validate_exa_research_result,
)

COMPANY_LEVEL_CONTACT_TYPES = {"contact_page", "form", "official_social"}


def _require_valid(payload: dict[str, Any]) -> dict[str, Any]:
    validation = validate_exa_research_result(payload)
    if not validation["valid"]:
        raise CommercialPolicyError("; ".join(validation["errors"]))

    result = validation["result"]
    non_company_contacts = [
        f"contact_candidates[{index}].contact_type"
        for index, candidate in enumerate(result.get("contact_candidates", []))
        if candidate.get("contact_type") not in COMPANY_LEVEL_CONTACT_TYPES
    ]
    if non_company_contacts:
        raise CommercialPolicyError(
            "contact_candidates must be public company-level contact paths only: "
            + ", ".join(non_company_contacts)
        )

    return result


def _is_valid(payload: dict[str, Any]) -> bool:
    try:
        _require_valid(payload)
    except CommercialPolicyError:
        return False
    return True


def _ordered_source_urls(result: dict[str, Any]) -> list[str]:
    source_urls: list[str] = []
    seen: set[str] = set()
    for collection_name in ("facts", "buying_signals", "contact_candidates", "risk_flags"):
        for item in result.get(collection_name, []):
            source_url = item.get("source_url")
            if isinstance(source_url, str) and source_url and source_url not in seen:
                source_urls.append(source_url)
                seen.add(source_url)
    return source_urls


def _has_high_risk(result: dict[str, Any]) -> bool:
    return any(flag.get("severity") == "high" for flag in result.get("risk_flags", []))


def can_send_to_owner_review(payload: dict[str, Any]) -> bool:
    return _is_valid(payload)


def can_route_to_enrichment(payload: dict[str, Any]) -> bool:
    return _is_valid(payload)


def can_route_to_scoring(payload: dict[str, Any]) -> bool:
    return _is_valid(payload)


def can_route_to_outreach(payload: dict[str, Any]) -> tuple[bool, str]:
    try:
        result = _require_valid(payload)
    except CommercialPolicyError:
        return False, "VALIDATION_FAILED"

    route_decision = can_route_exa_result_to_outreach(result)
    if not route_decision["routable"]:
        return False, route_decision["reason"]

    return False, "OWNER_APPROVAL_REQUIRED"


def normalize_exa_research_for_owner_review(payload: dict[str, Any]) -> dict[str, Any]:
    result = _require_valid(payload)
    outreach_allowed, outreach_reason = can_route_to_outreach(result)

    return {
        "review_item_type": "exa_research_result",
        "review_status": "pending_owner_review",
        "research_task_id": result["research_task_id"],
        "lead_id": result["lead_id"],
        "company_name": result["company_name"],
        "website": result["website"],
        "facts_count": len(result.get("facts", [])),
        "buying_signals_count": len(result.get("buying_signals", [])),
        "contact_candidates_count": len(result.get("contact_candidates", [])),
        "risk_flags_count": len(result.get("risk_flags", [])),
        "has_high_risk": _has_high_risk(result),
        "do_not_contact": result["do_not_contact"],
        "recommended_next_action": result["recommended_next_action"],
        "source_urls": _ordered_source_urls(result),
        "outreach_routing": {
            "allowed": outreach_allowed,
            "reason": outreach_reason,
        },
    }


def ingest_exa_research_result(payload: dict[str, Any]) -> dict[str, Any]:
    result = _require_valid(payload)
    owner_review_item = normalize_exa_research_for_owner_review(result)
    outreach_allowed, outreach_reason = can_route_to_outreach(result)

    return {
        "ingestion_status": "accepted_non_production",
        "validation_status": "valid",
        "research_task_id": result["research_task_id"],
        "lead_id": result["lead_id"],
        "owner_review_item": owner_review_item,
        "routing": {
            "owner_review": can_send_to_owner_review(result),
            "enrichment": can_route_to_enrichment(result),
            "scoring": can_route_to_scoring(result),
            "outreach": {
                "allowed": outreach_allowed,
                "reason": outreach_reason,
            },
        },
        "validated_result": result,
    }
