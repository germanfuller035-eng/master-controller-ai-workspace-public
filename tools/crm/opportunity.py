from __future__ import annotations

from typing import Any

from . import CRMPolicyError, ensure_synthetic, pass_result


REQUIRED_FIELDS = [
    "schema_version",
    "synthetic",
    "opportunity_id",
    "contact_id",
    "stage",
    "estimated_value_units",
    "draft_only",
    "crm_write_allowed",
]


def validate_opportunity(opportunity: dict[str, Any]) -> dict[str, Any]:
    ensure_synthetic(opportunity, "opportunity")
    missing = [field for field in REQUIRED_FIELDS if field not in opportunity]
    if missing:
        raise CRMPolicyError("opportunity missing fields: " + ",".join(missing))
    if opportunity.get("schema_version") != "crm.opportunity.v1":
        raise CRMPolicyError("opportunity schema_version mismatch")
    if opportunity.get("draft_only") is not True:
        raise CRMPolicyError("opportunity must be draft-only")
    if opportunity.get("crm_write_allowed") is not False:
        raise CRMPolicyError("opportunity must block CRM write")
    if float(opportunity.get("estimated_value_units", 0)) < 0:
        raise CRMPolicyError("opportunity value cannot be negative")
    return pass_result(
        opportunity_id=opportunity["opportunity_id"],
        contact_id=opportunity["contact_id"],
        draft_only=True,
        no_crm_write=True,
    )
