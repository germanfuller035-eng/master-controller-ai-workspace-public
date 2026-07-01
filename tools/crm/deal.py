from __future__ import annotations

from typing import Any

from . import CRMPolicyError, ensure_synthetic, pass_result


REQUIRED_FIELDS = [
    "schema_version",
    "synthetic",
    "deal_id",
    "opportunity_id",
    "stage",
    "close_probability_percent",
    "draft_only",
    "crm_write_allowed",
]


def validate_deal(deal: dict[str, Any]) -> dict[str, Any]:
    ensure_synthetic(deal, "deal")
    missing = [field for field in REQUIRED_FIELDS if field not in deal]
    if missing:
        raise CRMPolicyError("deal missing fields: " + ",".join(missing))
    if deal.get("schema_version") != "crm.deal.v1":
        raise CRMPolicyError("deal schema_version mismatch")
    if deal.get("draft_only") is not True:
        raise CRMPolicyError("deal must be draft-only")
    if deal.get("crm_write_allowed") is not False:
        raise CRMPolicyError("deal must block CRM write")
    probability = float(deal.get("close_probability_percent", -1))
    if probability < 0 or probability > 100:
        raise CRMPolicyError("deal probability must be within 0..100")
    return pass_result(
        deal_id=deal["deal_id"],
        opportunity_id=deal["opportunity_id"],
        draft_only=True,
        no_crm_write=True,
    )
