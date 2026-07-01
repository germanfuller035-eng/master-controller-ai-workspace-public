from __future__ import annotations

from typing import Any

from . import CRMPolicyError, ensure_synthetic, pass_result, reject_real_contact_values


REQUIRED_FIELDS = [
    "schema_version",
    "synthetic",
    "contact_id",
    "display_name",
    "organization_name",
    "contact_reference",
    "consent_basis",
    "crm_write_allowed",
]


def validate_contact(contact: dict[str, Any]) -> dict[str, Any]:
    ensure_synthetic(contact, "contact")
    missing = [field for field in REQUIRED_FIELDS if field not in contact]
    if missing:
        raise CRMPolicyError("contact missing fields: " + ",".join(missing))
    reject_real_contact_values(contact, "contact")
    if contact.get("schema_version") != "crm.contact.v1":
        raise CRMPolicyError("contact schema_version mismatch")
    if contact.get("crm_write_allowed") is not False:
        raise CRMPolicyError("contact must block CRM write")
    if contact.get("production_db_write_allowed") is not False:
        raise CRMPolicyError("contact must block production DB write")
    return pass_result(
        contact_id=contact["contact_id"],
        no_crm_write=True,
        suppression_status=contact.get("suppression_status", "UNKNOWN"),
    )


def attempt_crm_write(_: dict[str, Any]) -> None:
    raise CRMPolicyError("real CRM write is disabled for CRM Finance Outbound V1")
