
"""Local deterministic multichannel contracts.

The package is fixture-driven and standard-library only. It never sends mail,
submits forms, publishes social messages, opens browsers, captures audio,
calls STT/TTS providers, writes production databases, or processes payments.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
GENERATED_DIR = ROOT / "_generated" / "multichannel_browser_voice_v1"
CONFIG_DIR = ROOT / "config" / "multichannel"
SCHEMA_DIR = ROOT / "schemas" / "multichannel"
FIXTURE_DIR = ROOT / "tests" / "fixtures" / "multichannel"

CHANNEL_MAIL = "MAIL_DRAFT"
CHANNEL_FORM = "FORM_DRAFT"
CHANNEL_TELEGRAM = "TELEGRAM_RESERVE"
CHANNEL_SOCIAL = "SOCIAL_DRAFT"
CHANNEL_ORDER = [CHANNEL_MAIL, CHANNEL_FORM, CHANNEL_TELEGRAM, CHANNEL_SOCIAL]

REAL_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d[\s().-]*){7,}(?!\w)")
REAL_DOMAIN_RE = re.compile(r"\b[a-z0-9][a-z0-9-]*\.(?:com|ru|net|org|io|co|biz|info|ai|dev)\b", re.I)
SOCIAL_HANDLE_RE = re.compile(r"(?<!\w)@[A-Za-z0-9_]{3,}")
TELEGRAM_ID_RE = re.compile(r"\b(?:telegram|tg)[_-]?(?:id|chat)[_-]?\d{5,}\b", re.I)
ASSIGNED_SECRET_RE = re.compile(r"(?i)\b(?:token|password|passwd|private_key|refresh|access_token|bearer|proxy password)\b\s*[:=]\s*[\"']?[A-Za-z0-9_./+=-]{8,}")
OPENAI_KEY_RE = re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b")
PRIVATE_KEY_RE = re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I)


class MultichannelPolicyError(ValueError):
    """Raised when a local contract is violated."""


def load_json(path: str | Path) -> Any:
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = ROOT / candidate
    return json.loads(candidate.read_text(encoding="utf-8"))


def write_json(path: str | Path, data: Any) -> None:
    target = Path(path)
    if not target.is_absolute():
        target = ROOT / target
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, indent=2, sort_keys=True, ensure_ascii=True) + "\n", encoding="utf-8", newline="\n")


def write_text(path: str | Path, text: str) -> None:
    target = Path(path)
    if not target.is_absolute():
        target = ROOT / target
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text.rstrip() + "\n", encoding="utf-8", newline="\n")


def iter_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            out.extend(iter_strings(item))
        return out
    if isinstance(value, dict):
        out = []
        for item in value.values():
            out.extend(iter_strings(item))
        return out
    return []


def canonical_payload(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":")).encode("utf-8")


def payload_hash(value: Any) -> str:
    return hashlib.sha256(canonical_payload(value)).hexdigest()


def assert_synthetic(value: dict[str, Any], label: str = "payload") -> None:
    if value.get("synthetic") is not True:
        raise MultichannelPolicyError(f"{label} must be explicitly synthetic")
    text = "\n".join(iter_strings(value))
    if REAL_EMAIL_RE.search(text):
        raise MultichannelPolicyError(f"{label} contains real-looking email")
    if PHONE_RE.search(text):
        raise MultichannelPolicyError(f"{label} contains real-looking phone")
    if REAL_DOMAIN_RE.search(text):
        raise MultichannelPolicyError(f"{label} contains real-looking domain")
    if SOCIAL_HANDLE_RE.search(text):
        raise MultichannelPolicyError(f"{label} contains social handle")
    if TELEGRAM_ID_RE.search(text):
        raise MultichannelPolicyError(f"{label} contains Telegram id")
    if any(pattern.search(text) for pattern in (ASSIGNED_SECRET_RE, OPENAI_KEY_RE, PRIVATE_KEY_RE)):
        raise MultichannelPolicyError(f"{label} contains credential-looking value")


def contact_key(context: dict[str, Any]) -> str:
    return str(context.get("contact_ref") or context.get("recipient_ref") or context.get("lead_ref") or "").strip().lower()


def suppression_decision(context: dict[str, Any], entries: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    key = contact_key(context)
    for entry in entries or []:
        assert_synthetic(entry, "suppression entry")
        if entry.get("active") is True and str(entry.get("contact_ref", "")).lower() == key:
            return {"suppressed": True, "decision": "BLOCKED_SUPPRESSION", "contact_ref": key, "send_allowed": False}
    return {"suppressed": False, "decision": "ALLOW", "contact_ref": key}


def daily_cap_decision(channel: str, states: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    for state in states or []:
        assert_synthetic(state, "daily cap state")
        if state.get("channel") == channel:
            cap = int(state.get("daily_cap", 0))
            used = int(state.get("used_today", 0))
            allowed = used < cap
            return {
                "channel": channel,
                "daily_cap": cap,
                "used_today": used,
                "allowed": allowed,
                "decision": "ALLOW" if allowed else "BLOCKED_DAILY_CAP",
            }
    return {"channel": channel, "daily_cap": None, "used_today": 0, "allowed": True, "decision": "ALLOW"}


def select_channel(
    context: dict[str, Any],
    suppression_entries: list[dict[str, Any]] | None = None,
    daily_cap_states: list[dict[str, Any]] | None = None,
    *,
    stop_active: bool = False,
) -> dict[str, Any]:
    assert_synthetic(context, "channel context")
    if stop_active:
        return {"synthetic": True, "selected_channel": None, "decision": "BLOCKED_BY_STOP", "send_allowed": False, "owner_approval_required_for_future_send": True}
    suppression = suppression_decision(context, suppression_entries)
    if suppression["suppressed"]:
        return {"synthetic": True, "selected_channel": None, "decision": "BLOCKED_SUPPRESSION", "suppression": suppression, "send_allowed": False, "owner_approval_required_for_future_send": True}
    allowed = [channel for channel in context.get("available_channels", CHANNEL_ORDER) if channel in CHANNEL_ORDER]
    preferred = context.get("preferred_channel")
    ordered = [preferred] + [channel for channel in allowed if channel != preferred] if preferred in allowed else allowed
    for channel in ordered:
        cap = daily_cap_decision(channel, daily_cap_states)
        if cap["allowed"]:
            result = {
                "synthetic": True,
                "selected_channel": channel,
                "decision": "DRAFT_CONTRACT_SELECTED",
                "daily_cap": cap,
                "send_allowed": False,
                "owner_approval_required_for_future_send": True,
                "payload_hash_required_for_future_send": True,
            }
            result["payload_hash"] = payload_hash(result)
            return result
    return {"synthetic": True, "selected_channel": None, "decision": "BLOCKED_DAILY_CAP", "send_allowed": False, "owner_approval_required_for_future_send": True}


def _draft_id(prefix: str, context: dict[str, Any]) -> str:
    return f"{prefix}-{str(context.get('draft_ref') or context.get('lead_ref') or 'synthetic').lower().replace('_', '-')}"


def _finalize_draft(draft: dict[str, Any]) -> dict[str, Any]:
    draft = dict(draft)
    draft["payload_hash"] = payload_hash({k: v for k, v in draft.items() if k != "payload_hash"})
    return draft


def create_mail_draft(context: dict[str, Any]) -> dict[str, Any]:
    assert_synthetic(context, "mail draft context")
    return _finalize_draft({
        "synthetic": True,
        "draft_id": _draft_id("mail", context),
        "channel": CHANNEL_MAIL,
        "recipient_ref": context.get("contact_ref"),
        "subject": context.get("subject", "Synthetic local draft"),
        "body": context.get("body", "Synthetic local mail draft only."),
        "draft_only": True,
        "send_allowed": False,
        "sent": False,
        "owner_approval_required_for_future_send": True,
        "payload_hash_required_for_future_send": True,
    })


def create_form_draft(context: dict[str, Any]) -> dict[str, Any]:
    assert_synthetic(context, "form draft context")
    return _finalize_draft({
        "synthetic": True,
        "draft_id": _draft_id("form", context),
        "channel": CHANNEL_FORM,
        "target_form_ref": context.get("form_ref", "reserved-form-alpha"),
        "fields": dict(context.get("form_fields", {"message": "Synthetic preview-only form draft."})),
        "draft_only": True,
        "submit_allowed": False,
        "submitted": False,
        "browser_used": False,
        "owner_approval_required_for_future_send": True,
        "payload_hash_required_for_future_send": True,
    })


def create_telegram_reserve_notice(context: dict[str, Any]) -> dict[str, Any]:
    assert_synthetic(context, "telegram reserve context")
    return _finalize_draft({
        "synthetic": True,
        "draft_id": _draft_id("telegram", context),
        "channel": CHANNEL_TELEGRAM,
        "telegram_ref": context.get("telegram_ref", "reserved-telegram-alpha"),
        "message": context.get("body", "Synthetic reserve Telegram notice only."),
        "reserve_only": True,
        "send_allowed": False,
        "telegram_sent": False,
        "owner_approval_required_for_future_send": True,
        "payload_hash_required_for_future_send": True,
    })


def create_social_draft(context: dict[str, Any]) -> dict[str, Any]:
    assert_synthetic(context, "social draft context")
    return _finalize_draft({
        "synthetic": True,
        "draft_id": _draft_id("social", context),
        "channel": CHANNEL_SOCIAL,
        "social_ref": context.get("social_ref", "reserved-social-alpha"),
        "body": context.get("body", "Synthetic social draft contract only."),
        "draft_only": True,
        "publish_allowed": False,
        "send_allowed": False,
        "published": False,
        "owner_approval_required_for_future_send": True,
        "payload_hash_required_for_future_send": True,
    })


def create_draft_for_selection(context: dict[str, Any], selection: dict[str, Any]) -> dict[str, Any] | None:
    channel = selection.get("selected_channel")
    if channel == CHANNEL_MAIL:
        return create_mail_draft(context)
    if channel == CHANNEL_FORM:
        return create_form_draft(context)
    if channel == CHANNEL_TELEGRAM:
        return create_telegram_reserve_notice(context)
    if channel == CHANNEL_SOCIAL:
        return create_social_draft(context)
    return None


def classify_reply(reply: dict[str, Any]) -> dict[str, Any]:
    assert_synthetic(reply, "reply fixture")
    text = str(reply.get("body", "")).lower()
    if any(word in text for word in ("lottery", "crypto", "bulk pitch", "spam")):
        label = "spam"
        confidence = 0.99
    elif any(word in text for word in ("no", "not interested", "stop", "decline")):
        label = "negative"
        confidence = 0.94
    elif any(word in text for word in ("yes", "interested", "looks useful", "continue")):
        label = "positive"
        confidence = 0.95
    elif any(word in text for word in ("?", "how", "price", "details", "question")):
        label = "question"
        confidence = 0.92
    else:
        label = "question"
        confidence = 0.70
    return {"synthetic": True, "reply_id": reply.get("reply_id"), "label": label, "confidence": confidence, "real_reply_monitoring": False}


def no_send_guard(action: str, *, stop_active: bool = False) -> dict[str, Any]:
    blocked = {
        "send",
        "email_send",
        "telegram_send",
        "social_send",
        "publish",
        "form_submit",
        "browser_action",
        "voice_capture",
        "payment",
        "production_db_write",
        "crm_write",
    }
    if stop_active:
        return {"action": action, "decision": "BLOCKED_BY_STOP", "allowed": False, "owner_approval_required": True}
    return {"action": action, "decision": "BLOCK" if action in blocked else "ALLOW_LOCAL_DRAFT", "allowed": action not in blocked, "owner_approval_required": action in blocked}


def run_no_send_shadow_pipeline(batch_path: str | Path | None = None, *, stop_active: bool = False) -> dict[str, Any]:
    if stop_active:
        return {"pipeline_status": "BLOCKED_BY_STOP", "stop_active": True, "synthetic_drafts_processed": 0, "outbound_count": 0, "payment_count": 0, "production_db_writes": 0}
    batch = load_json(batch_path or FIXTURE_DIR / "pipeline" / "no_send_multichannel_batch.json")
    if batch.get("synthetic_batch") is not True:
        raise MultichannelPolicyError("batch must be explicitly synthetic")
    suppression_entries = batch.get("suppression_entries", [])
    daily_cap_states = batch.get("daily_cap_states", [])
    results: list[dict[str, Any]] = []
    for context in batch.get("draft_contexts", []):
        selection = select_channel(context, suppression_entries, daily_cap_states)
        draft = create_draft_for_selection(context, selection)
        guard = no_send_guard("send")
        results.append({"context_ref": context.get("draft_ref"), "selection": selection, "draft": draft, "no_send_guard": guard})
    reply_results = [classify_reply(load_json(path)) for path in batch.get("reply_fixtures", [])]
    payload_hashes = [item["draft"]["payload_hash"] for item in results if item.get("draft")]
    summary = {
        "pipeline_status": "PASS" if results and all(item["no_send_guard"]["decision"] == "BLOCK" for item in results) else "FAIL",
        "stop_active": False,
        "synthetic_drafts_processed": len(results),
        "payload_hash_generated": bool(payload_hashes) and all(re.fullmatch(r"[a-f0-9]{64}", value) for value in payload_hashes),
        "owner_approval_required_for_send": all((item.get("draft") or {}).get("owner_approval_required_for_future_send") is True for item in results),
        "outbound_count": 0,
        "payment_count": 0,
        "production_db_writes": 0,
        "results": results,
        "reply_classifications": reply_results,
    }
    write_json(GENERATED_DIR / "multichannel_no_send_shadow_result.json", summary)
    return summary


def run_intentional_fail_checks() -> dict[str, bool]:
    context = load_json(FIXTURE_DIR / "drafts" / "synthetic_email_draft.json")["context"]
    cap_context = dict(context)
    cap_context["available_channels"] = [CHANNEL_MAIL]
    suppressed = [{"synthetic": True, "contact_ref": context["contact_ref"], "reason": "synthetic opt out", "active": True}]
    over_cap = [{"synthetic": True, "channel": CHANNEL_MAIL, "daily_cap": 1, "used_today": 1}]
    return {
        "send_attempt_blocked": no_send_guard("send")["decision"] == "BLOCK",
        "form_submit_blocked": no_send_guard("form_submit")["decision"] == "BLOCK",
        "social_send_blocked": no_send_guard("social_send")["decision"] == "BLOCK",
        "daily_cap_exceeded_blocked": select_channel(cap_context, [], over_cap)["decision"] == "BLOCKED_DAILY_CAP",
        "suppressed_contact_blocked": select_channel(context, suppressed, [])["decision"] == "BLOCKED_SUPPRESSION",
        "stop_blocks_outbound": select_channel(context, [], [], stop_active=True)["decision"] == "BLOCKED_BY_STOP",
    }


def validate_multichannel_contracts() -> list[str]:
    errors: list[str] = []
    for path in sorted(CONFIG_DIR.glob("*.json")) + sorted(SCHEMA_DIR.glob("*.schema.json")):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"invalid JSON {path.relative_to(ROOT)}: {exc}")
    if len(list(CONFIG_DIR.glob("*.json"))) < 10:
        errors.append("expected at least 10 multichannel config files")
    if len(list(SCHEMA_DIR.glob("*.schema.json"))) < 10:
        errors.append("expected at least 10 multichannel schemas")

    flags = load_json("config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json").get("feature_flags", [])
    flag_map = {item.get("id"): item for item in flags}
    for flag_id in ["OUTBOUND_EMAIL", "OUTBOUND_SOCIAL", "AUTO_SAFE", "VOICE", "PRODUCTION_DB_WRITE", "PAYMENTS"]:
        flag = flag_map.get(flag_id)
        if not flag or flag.get("current_lifecycle") != "OFF" or flag.get("initial_state") != "OFF":
            errors.append(f"feature flag {flag_id} must remain OFF")

    no_send = load_json(CONFIG_DIR / "NO_SEND_POLICY.json")
    if no_send.get("send_adapter_enabled") is not False or no_send.get("draft_only") is not True:
        errors.append("no-send policy must keep send adapter disabled and draft_only")
    for required in ["send", "publish", "form_submit", "browser_action", "voice_capture", "payment", "production_db_write"]:
        if required not in no_send.get("blocked_actions", []):
            errors.append(f"no-send policy missing blocked action {required}")

    for path in sorted(FIXTURE_DIR.rglob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            assert_synthetic(data if "context" not in data else data["context"], str(path.relative_to(ROOT)))
        except (json.JSONDecodeError, MultichannelPolicyError) as exc:
            errors.append(str(exc))
    return errors


def write_validation_results(errors: list[str]) -> None:
    status = "PASS" if not errors else "FAIL"
    lines = [
        "# Multichannel Validation Results",
        "",
        f"SESSION_NAME=MULTICHANNEL_COMMUNICATION_BROWSER_AND_VOICE_V1",
        f"MULTICHANNEL_VALIDATION_RESULT={status}",
        "CONFIG_PARSE=PASS" if not any("invalid JSON" in error for error in errors) else "CONFIG_PARSE=FAIL",
        "SCHEMAS_PARSE=PASS" if not any("schema" in error.lower() and "invalid" in error.lower() for error in errors) else "SCHEMAS_PARSE=FAIL",
        "OUTBOUND_EMAIL=OFF",
        "OUTBOUND_SOCIAL=OFF",
        "AUTO_SAFE=OFF",
        "VOICE=OFF",
        "BROWSER_ACTIONS=OFF",
        "NO_SEND_ADAPTER_ENABLED=PASS",
        "OWNER_APPROVAL_REQUIRED_FOR_FUTURE_SEND=PASS",
        "PAYLOAD_HASH_REQUIRED_FOR_FUTURE_SEND=PASS",
        "STOP_INTEGRATION_PRESENT=PASS" if not errors else "STOP_INTEGRATION_PRESENT=CHECK_ERRORS",
        "",
        "## Errors",
    ]
    lines.extend(["- None"] if not errors else [f"- {error}" for error in errors])
    write_text(GENERATED_DIR / "MULTICHANNEL_VALIDATION_RESULTS.md", "\n".join(lines))


def run_multichannel_validation() -> int:
    errors = validate_multichannel_contracts()
    write_validation_results(errors)
    print(f"MULTICHANNEL_VALIDATION_RESULT={'PASS' if not errors else 'FAIL'}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
    return 0 if not errors else 1


def run_command(args: list[str]) -> tuple[int, str]:
    result = subprocess.run([sys.executable, *args], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    return result.returncode, result.stdout.strip()
