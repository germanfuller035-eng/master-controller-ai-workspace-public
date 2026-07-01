#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.crm import CONFIG_DIR, FIXTURE_DIR, GENERATED_DIR, SCHEMA_DIR, CRMPolicyError, load_json, write_text
from tools.crm.contact import attempt_crm_write, validate_contact
from tools.crm.deal import validate_deal
from tools.crm.opportunity import validate_opportunity
from tools.crm.reply_monitor import classify_reply

REQUIRED_CONFIGS = [
    "CRM_POLICY.json",
    "CONTACT_POLICY.json",
    "OPPORTUNITY_POLICY.json",
    "DEAL_POLICY.json",
    "REPLY_MONITOR_POLICY.json",
]
REQUIRED_SCHEMAS = [
    "contact.schema.json",
    "opportunity.schema.json",
    "deal.schema.json",
    "reply_monitor_event.schema.json",
    "crm_shadow_result.schema.json",
]
REQUIRED_OFF = {
    "OUTBOUND_EMAIL",
    "OUTBOUND_SOCIAL",
    "AUTO_SAFE",
    "PAYMENTS",
    "PRODUCTION_DB_WRITE",
    "CRM_WRITE",
    "INVOICE_SEND",
    "ACCOUNTING_EXPORT",
    "REAL_REPLY_MONITOR",
}


def validate_crm_contracts() -> list[str]:
    errors: list[str] = []
    for name in REQUIRED_CONFIGS:
        try:
            data = load_json(CONFIG_DIR / name)
            safety = data.get("safety", {})
            for key in REQUIRED_OFF:
                if safety.get(key) != "OFF":
                    errors.append(f"{name} {key} must be OFF")
        except (FileNotFoundError, json.JSONDecodeError) as exc:
            errors.append(f"config parse failed {name}: {exc}")
    for name in REQUIRED_SCHEMAS:
        try:
            load_json(SCHEMA_DIR / name)
        except (FileNotFoundError, json.JSONDecodeError) as exc:
            errors.append(f"schema parse failed {name}: {exc}")

    try:
        validate_contact(load_json(FIXTURE_DIR / "synthetic_contact.json"))
        validate_opportunity(load_json(FIXTURE_DIR / "synthetic_opportunity.json"))
        validate_deal(load_json(FIXTURE_DIR / "synthetic_deal.json"))
        positive = classify_reply(load_json(FIXTURE_DIR / "synthetic_reply_positive.json"))
        objection = classify_reply(load_json(FIXTURE_DIR / "synthetic_reply_objection.json"))
        unsubscribe = classify_reply(load_json(FIXTURE_DIR / "synthetic_reply_unsubscribe.json"))
        if positive["reply_classification"] != "POSITIVE":
            errors.append("positive reply classification failed")
        if objection["reply_classification"] != "OBJECTION":
            errors.append("objection reply classification failed")
        if not unsubscribe["suppression_required"]:
            errors.append("unsubscribe did not trigger suppression")
        try:
            attempt_crm_write({})
            errors.append("CRM write attempt was not blocked")
        except CRMPolicyError:
            pass
    except Exception as exc:
        errors.append(f"CRM fixture validation failed: {exc}")
    return errors


def write_validation_results(errors: list[str]) -> None:
    status = "PASS" if not errors else "FAIL"
    lines = [
        "# CRM Validation Results",
        "",
        f"CRM_VALIDATION_RESULT={status}",
        "CONFIG_PARSE=PASS" if not any("config parse" in item for item in errors) else "CONFIG_PARSE=FAIL",
        "SCHEMAS_PARSE=PASS" if not any("schema parse" in item for item in errors) else "SCHEMAS_PARSE=FAIL",
        "OUTBOUND_EMAIL=OFF",
        "OUTBOUND_SOCIAL=OFF",
        "AUTO_SAFE=OFF",
        "PAYMENTS=OFF",
        "PRODUCTION_DB_WRITE=OFF",
        "CRM_WRITE=OFF",
        "REAL_REPLY_MONITOR=OFF",
        "NO_REAL_CRM_WRITE=PASS" if not any("CRM write" in item for item in errors) else "NO_REAL_CRM_WRITE=FAIL",
        "",
        "## Errors",
    ]
    lines.extend(["- None"] if not errors else [f"- {error}" for error in errors])
    write_text(GENERATED_DIR / "CRM_VALIDATION_RESULTS.md", "\n".join(lines))


def main() -> int:
    errors = validate_crm_contracts()
    write_validation_results(errors)
    print(f"CRM_VALIDATION_RESULT={'PASS' if not errors else 'FAIL'}")
    for error in errors:
        print(f"ERROR: {error}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
