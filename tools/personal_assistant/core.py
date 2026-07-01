from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
GENERATED_DIR = ROOT / "_generated" / "personal_assistant_v1"
CONFIG_DIR = ROOT / "config" / "personal_assistant"
SCHEMA_DIR = ROOT / "schemas" / "personal_assistant"
FIXTURE_DIR = ROOT / "tests" / "fixtures" / "personal_assistant"


class PersonalAssistantPolicyError(ValueError):
    pass


COMMON_REQUIRED_OFF = [
    "calendar_write",
    "document_send",
    "government_filing",
    "legal_submission",
    "medical_processing",
    "payments",
    "production_db_write",
    "external_monitoring",
    "memory_write",
    "outbound_email",
    "outbound_social",
    "auto_safe",
]
SENSITIVE_CLASSES = {"PERSONAL_CONFIDENTIAL", "MILITARY_MEDICAL", "FINANCIAL_CONFIDENTIAL", "FAMILY_CONFIDENTIAL"}
BLOCKED_ACTIONS = {
    "calendar_write",
    "document_send",
    "government_filing",
    "legal_submission",
    "medical_processing",
    "payment",
    "booking",
    "vehicle_transaction",
    "property_transaction",
    "production_db_write",
    "outbound_email",
    "outbound_social",
    "browser_action",
    "external_monitoring",
}
FALSE_SUCCESS_FIELDS = [
    "sent",
    "filed",
    "paid",
    "booked",
    "calendar_written",
    "document_sent",
    "legal_filed",
    "government_filed",
    "vehicle_transaction_completed",
    "property_transaction_completed",
    "production_db_written",
]
FALSE_SUCCESS_STATUSES = {"SENT", "FILED", "PAID", "BOOKED", "WRITTEN", "SUBMITTED", "COMPLETED_EXTERNALLY"}
REAL_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d[\s().-]*){7,}(?!\w)")
REAL_URL_RE = re.compile(r"(?i)\b(?:https?://|www\.)")
CARD_RE = re.compile(r"(?<!\w)(?:\d[ -]?){13,19}(?!\w)")
SECRET_VALUE_RE = re.compile(
    r"(?i)\b(?:token|password|passwd|secret|private_key|refresh|access_token|bearer|proxy password)\b\s*[:=]\s*[\"']?[A-Za-z0-9_./+=-]{8,}"
)
OPENAI_KEY_RE = re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b")
PRIVATE_KEY_RE = re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I)


def load_json(path: str | Path) -> Any:
    p = Path(path)
    if not p.is_absolute():
        p = ROOT / p
    return json.loads(p.read_text(encoding="utf-8"))


def write_json(path: str | Path, data: Any) -> None:
    p = Path(path)
    if not p.is_absolute():
        p = ROOT / p
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2, sort_keys=True, ensure_ascii=True) + "\n", encoding="utf-8", newline="\n")


def write_text(path: str | Path, text: str) -> None:
    p = Path(path)
    if not p.is_absolute():
        p = ROOT / p
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text.rstrip() + "\n", encoding="utf-8", newline="\n")


def payload_hash(data: Any) -> str:
    payload = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def with_payload_hash(data: dict[str, Any]) -> dict[str, Any]:
    result = dict(data)
    result["payload_hash"] = payload_hash({k: v for k, v in result.items() if k != "payload_hash"})
    return result


def iter_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        out: list[str] = []
        for child in value.values():
            out.extend(iter_strings(child))
        return out
    if isinstance(value, list):
        out = []
        for child in value:
            out.extend(iter_strings(child))
        return out
    return []


def assert_no_real_contact_or_secret(value: Any, *, label: str) -> None:
    text = "\n".join(iter_strings(value))
    serialized = json.dumps(value, sort_keys=True, ensure_ascii=True)
    if REAL_URL_RE.search(text):
        raise PersonalAssistantPolicyError(f"{label} contains a real external URL reference")
    if REAL_EMAIL_RE.search(text):
        raise PersonalAssistantPolicyError(f"{label} contains a real-looking email")
    if PHONE_RE.search(text):
        raise PersonalAssistantPolicyError(f"{label} contains a real-looking phone")
    if CARD_RE.search(text):
        raise PersonalAssistantPolicyError(f"{label} contains a card-looking number")
    if any(pattern.search(serialized) for pattern in (SECRET_VALUE_RE, OPENAI_KEY_RE, PRIVATE_KEY_RE)):
        raise PersonalAssistantPolicyError(f"{label} contains a credential-looking value")


def assert_synthetic(payload: dict[str, Any], *, label: str) -> None:
    if payload.get("synthetic") is not True:
        raise PersonalAssistantPolicyError(f"{label} must be explicitly synthetic")
    if payload.get("real_data") is True or payload.get("external_system_accessed") is True:
        raise PersonalAssistantPolicyError(f"{label} cannot contain real data or external access")
    assert_no_real_contact_or_secret(payload, label=label)


def load_fixture(relative: str | Path) -> dict[str, Any]:
    return load_json(FIXTURE_DIR / relative)


def _classes(payload: dict[str, Any]) -> set[str]:
    values = payload.get("data_classes", [])
    if isinstance(values, str):
        return {values}
    if isinstance(values, list):
        return {str(value) for value in values}
    return set()


def _base(kind: str, payload: dict[str, Any], id_key: str = "request_id") -> dict[str, Any]:
    assert_synthetic(payload, label=kind)
    return {
        "kind": kind,
        "source_id": payload.get(id_key) or payload.get("task_id") or f"synthetic_{kind}",
        "synthetic": True,
        "status": "PASS",
        "mode": "LOCAL_SYNTHETIC_ONLY",
        "draft_only": True,
        "external_action_allowed": False,
        "owner_approval_required_for_future_external_action": True,
        "outbound_count": 0,
        "payment_count": 0,
        "production_db_writes": 0,
    }


def review_sensitive_data(payload: dict[str, Any]) -> dict[str, Any]:
    assert_synthetic(payload, label="sensitive_data_review")
    classes = _classes(payload)
    secret_like = payload.get("contains_secret_like_marker") is True
    military_or_medical = "MILITARY_MEDICAL" in classes or payload.get("contains_fake_military_marker") is True or payload.get("contains_fake_medical_marker") is True
    financial = "FINANCIAL_CONFIDENTIAL" in classes
    personal = bool(classes & {"PERSONAL_CONFIDENTIAL", "FAMILY_CONFIDENTIAL"})
    owner_required = bool(secret_like or military_or_medical or financial or personal)
    decision = "REJECT_AND_REDACT" if secret_like else "OWNER_APPROVAL_REQUIRED" if owner_required else "ALLOW_SYNTHETIC_MINIMIZED"
    return with_payload_hash(
        {
            "kind": "sensitive_data_review",
            "source_id": payload.get("request_id", "synthetic_sensitive_review"),
            "synthetic": True,
            "status": "PASS",
            "decision": decision,
            "allowed_for_real_processing": False,
            "owner_approval_required": owner_required,
            "high_risk_gate_required": bool(secret_like or military_or_medical or financial),
            "secret_like_input_rejected": secret_like,
            "redaction_applied": secret_like,
            "redacted_preview": "REDACTED_DO_NOT_USE_SYNTHETIC" if secret_like else "MINIMIZED_SYNTHETIC_SUMMARY_ONLY",
            "military_medical_processing_allowed": False,
            "financial_access_allowed": False,
            "memory_write_allowed": False,
            "external_ai_allowed": False,
        }
    )


def validate_personal_task(payload: dict[str, Any]) -> dict[str, Any]:
    result = _base("personal_task", payload, "task_id")
    result.update(
        {
            "task_id": payload.get("task_id"),
            "title": payload.get("title"),
            "task_contract_valid": bool(payload.get("task_id") and payload.get("title")),
            "data_classes": sorted(_classes(payload)),
            "owner_approval_required": bool(_classes(payload) & SENSITIVE_CLASSES),
            "calendar_write_allowed": False,
            "document_send_allowed": False,
            "payment_allowed": False,
        }
    )
    if not result["task_contract_valid"]:
        raise PersonalAssistantPolicyError("personal task requires task_id and title")
    return with_payload_hash(result)


def create_calendar_reminder_draft(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("calendar_write_attempted") is True:
        raise PersonalAssistantPolicyError("calendar write is blocked")
    result = _base("calendar_reminder_draft", payload)
    result.update({"reminder_title": payload.get("title"), "calendar_write_allowed": False, "calendar_write_blocked": True, "real_calendar_accessed": False})
    return with_payload_hash(result)


def prepare_document_draft(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("send_requested") is True or payload.get("filing_requested") is True:
        raise PersonalAssistantPolicyError("document send or filing is blocked")
    result = _base("document_draft", payload)
    result.update({"document_type": payload.get("document_type", "synthetic_document"), "document_send_allowed": False, "government_filing_allowed": False, "official_document_draft_only": True})
    return with_payload_hash(result)


def create_legal_research_note(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("legal_submission_requested") is True:
        raise PersonalAssistantPolicyError("legal submission is blocked")
    result = _base("legal_research_note", payload)
    result.update({"research_scope": payload.get("research_scope"), "legal_filing_allowed": False, "not_legal_advice": True, "draft_note_only": True})
    return with_payload_hash(result)


def create_finance_asset_snapshot(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("bank_access_requested") is True or payload.get("payment_requested") is True:
        raise PersonalAssistantPolicyError("bank access and payment are blocked")
    result = _base("finance_asset_snapshot", payload)
    result.update({"snapshot_only": True, "bank_access_allowed": False, "payment_allowed": False, "asset_count": len(payload.get("assets", []))})
    return with_payload_hash(result)


def create_automotive_task(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("vehicle_transaction_requested") is True:
        raise PersonalAssistantPolicyError("vehicle transaction is blocked")
    result = _base("automotive_task", payload)
    result.update({"vehicle_transaction_allowed": False, "draft_task_only": True})
    return with_payload_hash(result)


def create_property_task(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("property_transaction_requested") is True:
        raise PersonalAssistantPolicyError("property transaction is blocked")
    result = _base("property_task", payload)
    result.update({"property_transaction_allowed": False, "draft_task_only": True})
    return with_payload_hash(result)


def create_travel_plan_draft(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("booking_requested") is True:
        raise PersonalAssistantPolicyError("travel booking is blocked")
    result = _base("travel_plan_draft", payload)
    result.update({"booking_allowed": False, "travel_plan_draft_only": True})
    return with_payload_hash(result)


def create_family_health_reminder(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("medical_processing_requested") is True:
        raise PersonalAssistantPolicyError("medical processing is blocked")
    result = _base("family_health_reminder", payload)
    result.update({"family_data_synthetic_only": True, "health_reminder_non_medical": payload.get("health_context") == "non_medical_reminder", "medical_processing_allowed": False})
    return with_payload_hash(result)


def create_news_briefing(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("external_monitoring_requested") is True:
        raise PersonalAssistantPolicyError("external monitoring is blocked")
    result = _base("news_briefing", payload)
    result.update({"briefing_mode": "synthetic_knowledge_note", "external_monitoring_allowed": False, "real_scraping_allowed": False, "source_count": len(payload.get("synthetic_sources", []))})
    return with_payload_hash(result)


def evaluate_external_action(action: str, *, stop_active: bool = False) -> dict[str, Any]:
    blocked = action in BLOCKED_ACTIONS or stop_active
    return {"action": action, "decision": "BLOCK" if blocked else "ALLOW_LOCAL_SYNTHETIC", "owner_approval_required": blocked, "stop_active": stop_active}


def block_external_action(action: str, payload: dict[str, Any] | None = None) -> None:
    raise PersonalAssistantPolicyError(f"{action} blocked by Personal Assistant no-external-action guard")


def enforce_no_external_action_guard(result: dict[str, Any], *, stop_active: bool = False) -> dict[str, Any]:
    if stop_active:
        raise PersonalAssistantPolicyError("STOP blocks send, filing, payment, booking, and production write")
    for field in FALSE_SUCCESS_FIELDS:
        if result.get(field) is True:
            raise PersonalAssistantPolicyError(f"false success or forbidden state: {field}")
    status = str(result.get("status", "")).upper()
    if status in FALSE_SUCCESS_STATUSES and result.get("synthetic_external_evidence") is not True:
        raise PersonalAssistantPolicyError(f"false external success status rejected: {status}")
    for field in ["outbound_count", "payment_count", "production_db_writes"]:
        if int(result.get(field, 0)) != 0:
            raise PersonalAssistantPolicyError(f"{field} must remain 0")
    if result.get("external_action_allowed") is True:
        raise PersonalAssistantPolicyError("external_action_allowed=true is forbidden")
    return {"status": "PASS", "no_external_action_guard": True, "false_sent_filed_paid_booked_blocked": True, "outbound_count": 0, "payment_count": 0, "production_db_writes": 0}


def _blocked(call: Callable[[], Any]) -> bool:
    try:
        call()
    except PersonalAssistantPolicyError:
        return True
    return False


def attempt_calendar_write(payload: dict[str, Any] | None = None) -> None:
    block_external_action("calendar_write", payload)


def attempt_document_send(payload: dict[str, Any] | None = None) -> None:
    block_external_action("document_send", payload)


def attempt_government_filing(payload: dict[str, Any] | None = None) -> None:
    block_external_action("government_filing", payload)


def attempt_legal_filing(payload: dict[str, Any] | None = None) -> None:
    block_external_action("legal_submission", payload)


def attempt_payment(payload: dict[str, Any] | None = None) -> None:
    block_external_action("payment", payload)


def attempt_vehicle_transaction(payload: dict[str, Any] | None = None) -> None:
    block_external_action("vehicle_transaction", payload)


def attempt_property_transaction(payload: dict[str, Any] | None = None) -> None:
    block_external_action("property_transaction", payload)


def attempt_booking(payload: dict[str, Any] | None = None) -> None:
    block_external_action("booking", payload)


def run_no_external_action_pipeline(batch_path: str | Path | None = None) -> dict[str, Any]:
    batch = load_json(batch_path or FIXTURE_DIR / "pipeline" / "no_external_action_batch.json")
    if batch.get("synthetic_batch") is not True:
        raise PersonalAssistantPolicyError("pipeline batch must be synthetic")
    f = batch["fixtures"]
    results = {
        "personal_task": validate_personal_task(load_fixture(f["personal_task"])),
        "calendar_reminder": create_calendar_reminder_draft(load_fixture(f["calendar_reminder"])),
        "document_draft": prepare_document_draft(load_fixture(f["document_request"])),
        "legal_research": create_legal_research_note(load_fixture(f["legal_research"])),
        "finance_assets": create_finance_asset_snapshot(load_fixture(f["finance_snapshot"])),
        "automotive": create_automotive_task(load_fixture(f["automotive_task"])),
        "property": create_property_task(load_fixture(f["property_task"])),
        "travel": create_travel_plan_draft(load_fixture(f["travel_plan"])),
        "family_reminder": create_family_health_reminder(load_fixture(f["family_reminder"])),
        "health_reminder": create_family_health_reminder(load_fixture(f["health_reminder"])),
        "news_briefing": create_news_briefing(load_fixture(f["news_briefing"])),
        "sensitive_military": review_sensitive_data(load_fixture(f["sensitive_military"])),
        "sensitive_secret_like": review_sensitive_data(load_fixture(f["secret_like"])),
    }
    guard = enforce_no_external_action_guard({"synthetic": True, "external_action_allowed": False, "outbound_count": 0, "payment_count": 0, "production_db_writes": 0})
    summary = {
        "pipeline_status": "PASS",
        "synthetic": True,
        "calendar_draft_only": results["calendar_reminder"]["draft_only"],
        "calendar_write_blocked": True,
        "document_draft_only": results["document_draft"]["draft_only"],
        "document_send_blocked": True,
        "legal_research_draft_only": results["legal_research"]["draft_note_only"],
        "legal_filing_blocked": True,
        "finance_asset_snapshot_only": results["finance_assets"]["snapshot_only"],
        "payment_blocked": True,
        "automotive_task_draft_only": results["automotive"]["draft_task_only"],
        "vehicle_transaction_blocked": True,
        "property_task_draft_only": results["property"]["draft_task_only"],
        "property_transaction_blocked": True,
        "travel_plan_draft_only": results["travel"]["travel_plan_draft_only"],
        "booking_blocked": True,
        "family_health_reminder_synthetic_only": results["family_reminder"]["family_data_synthetic_only"] and results["health_reminder"]["health_reminder_non_medical"],
        "sensitive_owner_approval_required": results["sensitive_military"]["owner_approval_required"],
        "secret_like_input_rejected": results["sensitive_secret_like"]["secret_like_input_rejected"],
        "news_briefing_synthetic_only": not results["news_briefing"]["external_monitoring_allowed"],
        "no_external_action_guard": guard["no_external_action_guard"],
        "payload_hash_generated": all(len(item.get("payload_hash", "")) == 64 for item in results.values()),
        "outbound_count": 0,
        "payment_count": 0,
        "production_db_writes": 0,
        "results": results,
    }
    write_json(GENERATED_DIR / "personal_assistant_no_external_action_result.json", summary)
    return summary


def run_intentional_fail_checks() -> dict[str, bool]:
    secret_review = review_sensitive_data(load_fixture("sensitive/synthetic_secret_like_input.json"))
    military_review = review_sensitive_data(load_fixture("sensitive/synthetic_fake_military_doc_request.json"))
    checks = {
        "calendar_write_blocked": _blocked(lambda: attempt_calendar_write({})),
        "document_send_blocked": _blocked(lambda: attempt_document_send({})),
        "government_filing_blocked": _blocked(lambda: attempt_government_filing({})),
        "legal_filing_blocked": _blocked(lambda: attempt_legal_filing({})),
        "payment_blocked": _blocked(lambda: attempt_payment({})),
        "booking_blocked": _blocked(lambda: attempt_booking({})),
        "vehicle_transaction_blocked": _blocked(lambda: attempt_vehicle_transaction({})),
        "property_transaction_blocked": _blocked(lambda: attempt_property_transaction({})),
        "stop_blocks_risky_actions": _blocked(lambda: enforce_no_external_action_guard({"synthetic": True}, stop_active=True)),
        "false_sent_status_rejected": _blocked(lambda: enforce_no_external_action_guard({"synthetic": True, "sent": True})),
        "false_filed_status_rejected": _blocked(lambda: enforce_no_external_action_guard({"synthetic": True, "status": "FILED"})),
        "false_paid_status_rejected": _blocked(lambda: enforce_no_external_action_guard({"synthetic": True, "paid": True})),
        "false_booked_status_rejected": _blocked(lambda: enforce_no_external_action_guard({"synthetic": True, "booked": True})),
        "secret_like_input_rejected": secret_review["secret_like_input_rejected"] and secret_review["redaction_applied"],
        "sensitive_owner_approval_required": military_review["owner_approval_required"] and military_review["high_risk_gate_required"],
    }
    clean = {"synthetic": True, "external_action_allowed": False, "outbound_count": 0, "payment_count": 0, "production_db_writes": 0}
    checks["no_external_action_guard"] = enforce_no_external_action_guard(clean)["status"] == "PASS"
    return checks


def stage_gate_markdown(summary: dict[str, Any], checks: dict[str, bool]) -> str:
    status = "PASS" if summary["pipeline_status"] == "PASS" and all(checks.values()) and summary["payload_hash_generated"] else "FAIL"
    fields = [
        ("WORK_MODE", "FAST_BUILD_WITH_STAGE_GATES"),
        ("FULL_RUN_1_STARTED", "NO"),
        ("FULL_RUN_2_STARTED", "NO"),
        ("SESSION_LOCAL_GATE_STATUS", status),
        ("PERSONAL_ASSISTANT_SYNTHETIC_GATE", "PASS" if summary["pipeline_status"] == "PASS" else "FAIL"),
        ("CALENDAR_DRAFT_ONLY", "PASS" if summary["calendar_draft_only"] else "FAIL"),
        ("CALENDAR_WRITE_BLOCKED", "PASS" if checks["calendar_write_blocked"] else "FAIL"),
        ("DOCUMENT_DRAFT_ONLY", "PASS" if summary["document_draft_only"] else "FAIL"),
        ("DOCUMENT_SEND_BLOCKED", "PASS" if checks["document_send_blocked"] else "FAIL"),
        ("LEGAL_RESEARCH_DRAFT_ONLY", "PASS" if summary["legal_research_draft_only"] else "FAIL"),
        ("LEGAL_FILING_BLOCKED", "PASS" if checks["legal_filing_blocked"] else "FAIL"),
        ("FINANCE_ASSET_SNAPSHOT_ONLY", "PASS" if summary["finance_asset_snapshot_only"] else "FAIL"),
        ("PAYMENT_BLOCKED", "PASS" if checks["payment_blocked"] else "FAIL"),
        ("AUTOMOTIVE_TASK_DRAFT_ONLY", "PASS" if summary["automotive_task_draft_only"] else "FAIL"),
        ("VEHICLE_TRANSACTION_BLOCKED", "PASS" if checks["vehicle_transaction_blocked"] else "FAIL"),
        ("PROPERTY_TASK_DRAFT_ONLY", "PASS" if summary["property_task_draft_only"] else "FAIL"),
        ("PROPERTY_TRANSACTION_BLOCKED", "PASS" if checks["property_transaction_blocked"] else "FAIL"),
        ("TRAVEL_PLAN_DRAFT_ONLY", "PASS" if summary["travel_plan_draft_only"] else "FAIL"),
        ("BOOKING_BLOCKED", "PASS" if checks["booking_blocked"] else "FAIL"),
        ("FAMILY_HEALTH_REMINDER_SYNTHETIC_ONLY", "PASS" if summary["family_health_reminder_synthetic_only"] else "FAIL"),
        ("SENSITIVE_OWNER_APPROVAL_REQUIRED", "PASS" if checks["sensitive_owner_approval_required"] else "FAIL"),
        ("SECRET_LIKE_INPUT_REJECTED", "PASS" if checks["secret_like_input_rejected"] else "FAIL"),
        ("NEWS_BRIEFING_SYNTHETIC_ONLY", "PASS" if summary["news_briefing_synthetic_only"] else "FAIL"),
        ("NO_EXTERNAL_ACTION_GUARD", "PASS" if checks["no_external_action_guard"] else "FAIL"),
        ("STOP_BLOCKS_RISKY_ACTIONS", "PASS" if checks["stop_blocks_risky_actions"] else "FAIL"),
        ("OUTBOUND_COUNT", "0"),
        ("PAYMENT_COUNT", "0"),
        ("PRODUCTION_DB_WRITES", "0"),
    ]
    lines = ["# Personal Assistant Stage Gate", ""]
    lines.extend(f"{key}={value}" for key, value in fields)
    lines.extend(["", "## Evidence", "- Local synthetic fixture batch only.", "- No external action adapters enabled.", "- Payload hashes generated for draft objects."])
    return "\n".join(lines)


def run_stage_gate() -> dict[str, Any]:
    summary = run_no_external_action_pipeline()
    checks = run_intentional_fail_checks()
    status = "PASS" if summary["pipeline_status"] == "PASS" and all(checks.values()) and summary["payload_hash_generated"] else "FAIL"
    write_text(GENERATED_DIR / "PERSONAL_ASSISTANT_STAGE_GATE.md", stage_gate_markdown(summary, checks))
    return {"summary": summary, "checks": checks, "status": status}


def git_changed_paths(prefixes: list[str]) -> list[str]:
    result = subprocess.run(["git", "status", "--porcelain", "--untracked-files=all", "--", *prefixes], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    return [line for line in result.stdout.splitlines() if line.strip()]
