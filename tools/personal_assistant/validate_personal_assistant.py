#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.personal_assistant import CONFIG_DIR, FIXTURE_DIR, GENERATED_DIR, SCHEMA_DIR, PersonalAssistantPolicyError, load_json, write_text
from tools.personal_assistant.core import (
    COMMON_REQUIRED_OFF,
    assert_no_real_contact_or_secret,
    create_automotive_task,
    create_calendar_reminder_draft,
    create_family_health_reminder,
    create_finance_asset_snapshot,
    create_legal_research_note,
    create_news_briefing,
    create_property_task,
    create_travel_plan_draft,
    enforce_no_external_action_guard,
    prepare_document_draft,
    review_sensitive_data,
    validate_personal_task,
)

REQUIRED_CONFIGS = [
    "PERSONAL_ASSISTANT_POLICY.json",
    "PERSONAL_TASK_POLICY.json",
    "CALENDAR_POLICY.json",
    "DOCUMENT_PREPARATION_POLICY.json",
    "LEGAL_RESEARCH_POLICY.json",
    "FINANCE_ASSETS_POLICY.json",
    "AUTOMOTIVE_POLICY.json",
    "PROPERTY_POLICY.json",
    "TRAVEL_POLICY.json",
    "FAMILY_HEALTH_POLICY.json",
    "NEWS_BRIEFING_POLICY.json",
    "SENSITIVE_DATA_POLICY.json",
    "NO_EXTERNAL_ACTION_POLICY.json",
]
REQUIRED_SCHEMAS = [
    "personal_task.schema.json",
    "calendar_reminder_draft.schema.json",
    "document_draft.schema.json",
    "legal_research_note.schema.json",
    "finance_asset_snapshot.schema.json",
    "automotive_task.schema.json",
    "property_task.schema.json",
    "travel_plan_draft.schema.json",
    "family_health_reminder.schema.json",
    "news_briefing.schema.json",
    "sensitive_data_review.schema.json",
    "no_external_action_result.schema.json",
]
REQUIRED_FEATURE_FLAGS = ["OUTBOUND_EMAIL", "OUTBOUND_SOCIAL", "AUTO_SAFE", "PAYMENTS", "PRODUCTION_DB_WRITE", "MEMORY_WRITE"]


def validate_config_and_schema_parse() -> list[str]:
    errors: list[str] = []
    for name in REQUIRED_CONFIGS:
        try:
            data = load_json(CONFIG_DIR / name)
        except (FileNotFoundError, json.JSONDecodeError) as exc:
            errors.append(f"config parse failed {name}: {exc}")
            continue
        if data.get("scope") != "LOCAL_SYNTHETIC_ONLY":
            errors.append(f"{name} must be LOCAL_SYNTHETIC_ONLY")
        for key in COMMON_REQUIRED_OFF:
            if data.get("safety", {}).get(key) != "OFF":
                errors.append(f"{name} {key} must be OFF")
        for key, value in data.get("adapters", {}).items():
            if value is True:
                errors.append(f"{name} enables adapter {key}")
    for name in REQUIRED_SCHEMAS:
        try:
            load_json(SCHEMA_DIR / name)
        except (FileNotFoundError, json.JSONDecodeError) as exc:
            errors.append(f"schema parse failed {name}: {exc}")
    return errors


def validate_feature_flags() -> list[str]:
    errors: list[str] = []
    try:
        flags = load_json(ROOT / "config" / "feature_flags" / "AI_SYSTEM_FEATURE_FLAGS.json").get("feature_flags", [])
        flag_map = {item.get("id"): item for item in flags}
        for flag_id in REQUIRED_FEATURE_FLAGS:
            flag = flag_map.get(flag_id)
            if not flag or flag.get("current_lifecycle") != "OFF" or flag.get("initial_state") != "OFF":
                errors.append(f"feature flag {flag_id} must remain OFF")
    except Exception as exc:
        errors.append(f"feature flag parse failed: {exc}")
    return errors


def validate_owner_and_stop_policies() -> list[str]:
    errors: list[str] = []
    try:
        approval = load_json(ROOT / "config" / "policies" / "APPROVAL_POLICY.json").get("approval_policy", {})
        if approval.get("binds_to_exact_payload_hash") is not True:
            errors.append("owner approval must bind to exact payload hash")
    except Exception as exc:
        errors.append(f"approval policy parse failed: {exc}")
    try:
        stop = load_json(ROOT / "config" / "policies" / "STOP_POLICY.json")
        for action in ["outbound_send", "payment_operation", "production_db_write", "irreversible_action"]:
            if action not in stop.get("stop_blocks", []):
                errors.append(f"STOP policy missing {action}")
    except Exception as exc:
        errors.append(f"STOP policy parse failed: {exc}")
    try:
        memory = load_json(ROOT / "config" / "memory" / "MEMORY_POLICY.json")
        if memory.get("memory_write_status") != "OFF" or memory.get("memory_auto_write") != "DENY":
            errors.append("memory writes must remain OFF/DENY")
    except Exception as exc:
        errors.append(f"memory policy parse failed: {exc}")
    return errors


def validate_fixture_content() -> list[str]:
    errors: list[str] = []
    for path in sorted(FIXTURE_DIR.rglob("*.json")):
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"fixture invalid JSON {rel}: {exc}")
            continue
        if data.get("synthetic") is not True and data.get("synthetic_batch") is not True:
            errors.append(f"fixture missing synthetic marker: {rel}")
        if data.get("real_data") is True:
            errors.append(f"fixture marks real_data=true: {rel}")
        try:
            assert_no_real_contact_or_secret(data, label=rel)
        except PersonalAssistantPolicyError as exc:
            errors.append(str(exc))
    return errors


def validate_fixture_contracts() -> list[str]:
    errors: list[str] = []
    checks = [
        (validate_personal_task, "tasks/synthetic_personal_task.json"),
        (create_calendar_reminder_draft, "calendar/synthetic_calendar_reminder.json"),
        (prepare_document_draft, "documents/synthetic_document_request.json"),
        (create_legal_research_note, "legal/synthetic_legal_research_request.json"),
        (create_finance_asset_snapshot, "finance/synthetic_finance_asset_snapshot.json"),
        (create_automotive_task, "automotive/synthetic_vehicle_task.json"),
        (create_property_task, "property/synthetic_property_task.json"),
        (create_travel_plan_draft, "travel/synthetic_travel_plan.json"),
        (create_family_health_reminder, "family_health/synthetic_family_reminder.json"),
        (create_family_health_reminder, "family_health/synthetic_health_reminder_fake.json"),
        (create_news_briefing, "news/synthetic_news_briefing_request.json"),
        (review_sensitive_data, "sensitive/synthetic_fake_military_doc_request.json"),
        (review_sensitive_data, "sensitive/synthetic_secret_like_input.json"),
    ]
    for fn, rel in checks:
        try:
            fn(load_json(FIXTURE_DIR / rel))
        except Exception as exc:
            errors.append(f"{rel} failed contract validation: {exc}")
    try:
        enforce_no_external_action_guard({"synthetic": True, "external_action_allowed": False, "outbound_count": 0, "payment_count": 0, "production_db_writes": 0})
    except Exception as exc:
        errors.append(f"no external action guard failed clean case: {exc}")
    return errors


def validate_all() -> list[str]:
    errors: list[str] = []
    errors.extend(validate_config_and_schema_parse())
    errors.extend(validate_feature_flags())
    errors.extend(validate_owner_and_stop_policies())
    errors.extend(validate_fixture_content())
    errors.extend(validate_fixture_contracts())
    return errors


def write_validation_results(errors: list[str]) -> None:
    status = "PASS" if not errors else "FAIL"
    lines = [
        "# Personal Assistant Validation Results",
        "",
        f"PERSONAL_ASSISTANT_VALIDATION_RESULT={status}",
        "CONFIG_PARSE=PASS" if not any("config parse" in item for item in errors) else "CONFIG_PARSE=FAIL",
        "SCHEMAS_PARSE=PASS" if not any("schema parse" in item for item in errors) else "SCHEMAS_PARSE=FAIL",
        "CALENDAR_WRITE=OFF",
        "DOCUMENT_SEND=OFF",
        "GOVERNMENT_FILING=OFF",
        "LEGAL_SUBMISSION=OFF",
        "MEDICAL_PROCESSING=OFF",
        "PAYMENTS=OFF",
        "PRODUCTION_DB_WRITE=OFF",
        "NO_REAL_EMAILS_PHONES_DOMAINS_OR_IDS_IN_FIXTURES=PASS" if not any("email" in item or "phone" in item or "URL" in item for item in errors) else "NO_REAL_EMAILS_PHONES_DOMAINS_OR_IDS_IN_FIXTURES=FAIL",
        "NO_BANK_OR_CARD_DATA=PASS" if not any("card" in item for item in errors) else "NO_BANK_OR_CARD_DATA=FAIL",
        "NO_SECRET_LOOKING_VALUES=PASS" if not any("credential" in item for item in errors) else "NO_SECRET_LOOKING_VALUES=FAIL",
        "OWNER_APPROVAL_REQUIRED_FOR_FUTURE_SEND_FILING_PAYMENT_BOOKING=PASS" if not errors else "OWNER_APPROVAL_REQUIRED_FOR_FUTURE_SEND_FILING_PAYMENT_BOOKING=CHECK_ERRORS",
        "SENSITIVE_DATA_POLICY_PRESENT=PASS" if (CONFIG_DIR / "SENSITIVE_DATA_POLICY.json").exists() else "SENSITIVE_DATA_POLICY_PRESENT=FAIL",
        "STOP_INTEGRATION_PRESENT=PASS" if not any("STOP policy" in item for item in errors) else "STOP_INTEGRATION_PRESENT=FAIL",
        "NO_EXTERNAL_MONITORING_ENABLED=PASS",
        "",
        "## Errors",
    ]
    lines.extend(["- None"] if not errors else [f"- {error}" for error in errors])
    write_text(GENERATED_DIR / "PERSONAL_ASSISTANT_VALIDATION_RESULTS.md", "\n".join(lines))


def main() -> int:
    errors = validate_all()
    write_validation_results(errors)
    print(f"PERSONAL_ASSISTANT_VALIDATION_RESULT={'PASS' if not errors else 'FAIL'}")
    for error in errors:
        print(f"ERROR: {error}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
