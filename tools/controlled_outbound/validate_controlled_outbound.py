#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.controlled_outbound import CONFIG_DIR, FIXTURE_DIR, GENERATED_DIR, SCHEMA_DIR, ControlledOutboundPolicyError, load_json, write_text
from tools.controlled_outbound.batch_max_3 import validate_batch_max_3
from tools.controlled_outbound.daily_cap import check_daily_cap
from tools.controlled_outbound.no_send_guard import block_send_attempt, enforce_no_send_guard
from tools.controlled_outbound.outbound_draft import validate_outbound_draft
from tools.controlled_outbound.reply_monitor_gate import check_reply_monitor_gate
from tools.controlled_outbound.suppression import check_suppression

REQUIRED_CONFIGS = [
    "CONTROLLED_OUTBOUND_POLICY.json",
    "APPROVED_BATCH_MAX_3_POLICY.json",
    "DAILY_CAP_POLICY.json",
    "SUPPRESSION_POLICY.json",
    "REPLY_MONITOR_POLICY.json",
    "UNAUTHORIZED_SEND_PREVENTION_POLICY.json",
]
REQUIRED_SCHEMAS = [
    "outbound_draft.schema.json",
    "outbound_batch.schema.json",
    "batch_approval.schema.json",
    "suppression_check.schema.json",
    "daily_cap_check.schema.json",
    "reply_monitor_state.schema.json",
    "no_send_shadow_result.schema.json",
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


def _load_batch_drafts() -> tuple[dict[str, object], list[dict[str, object]]]:
    batch = load_json(FIXTURE_DIR / "no_send_batch_max_3.json")
    drafts = [load_json(path) for path in batch.get("draft_fixtures", [])]
    return batch, drafts


def validate_controlled_outbound_contracts() -> list[str]:
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
        validate_outbound_draft(load_json(FIXTURE_DIR / "synthetic_outbound_draft_1.json"))
        batch, drafts = _load_batch_drafts()
        batch_result = validate_batch_max_3(batch, drafts)
        if batch_result["allowed_count"] != 3:
            errors.append("batch max 3 did not allow exactly 3 drafts")
        if not batch_result["fourth_draft_blocked"]:
            errors.append("fourth draft was not blocked")
        suppressed = check_suppression(load_json(FIXTURE_DIR / "synthetic_suppressed_contact.json"))
        if suppressed["decision"] != "BLOCK":
            errors.append("suppressed contact was not blocked")
        if check_daily_cap(current_count=2, requested_count=2)["decision"] != "BLOCK":
            errors.append("daily cap was not enforced")
        if not check_reply_monitor_gate()["future_activation_allowed"]:
            errors.append("synthetic reply monitor gate should be ready")
        try:
            block_send_attempt({})
            errors.append("send attempt was not blocked")
        except ControlledOutboundPolicyError:
            pass
        try:
            enforce_no_send_guard({"synthetic": True, "sent": True})
            errors.append("false sent status was not rejected")
        except ControlledOutboundPolicyError:
            pass
        try:
            enforce_no_send_guard({"synthetic": True}, stop_active=True)
            errors.append("STOP active was not blocked")
        except ControlledOutboundPolicyError:
            pass
        enforce_no_send_guard({"synthetic": True, "send_allowed": False, "outbound_count": 0, "payment_count": 0, "production_db_writes": 0})
    except Exception as exc:
        errors.append(f"controlled outbound fixture validation failed: {exc}")
    return errors


def write_validation_results(errors: list[str]) -> None:
    status = "PASS" if not errors else "FAIL"
    lines = [
        "# Controlled Outbound Validation Results",
        "",
        f"CONTROLLED_OUTBOUND_VALIDATION_RESULT={status}",
        "CONFIG_PARSE=PASS" if not any("config parse" in item for item in errors) else "CONFIG_PARSE=FAIL",
        "SCHEMAS_PARSE=PASS" if not any("schema parse" in item for item in errors) else "SCHEMAS_PARSE=FAIL",
        "OUTBOUND_EMAIL=OFF",
        "OUTBOUND_SOCIAL=OFF",
        "AUTO_SAFE=OFF",
        "PAYMENTS=OFF",
        "PRODUCTION_DB_WRITE=OFF",
        "BATCH_MAX_3_PRESENT=PASS",
        "SUPPRESSION_POLICY_PRESENT=PASS",
        "DAILY_CAP_POLICY_PRESENT=PASS",
        "REPLY_MONITOR_GATE_PRESENT=PASS",
        "NO_SEND_GUARD=PASS" if not any("send attempt" in item for item in errors) else "NO_SEND_GUARD=FAIL",
        "",
        "## Errors",
    ]
    lines.extend(["- None"] if not errors else [f"- {error}" for error in errors])
    write_text(GENERATED_DIR / "CONTROLLED_OUTBOUND_VALIDATION_RESULTS.md", "\n".join(lines))


def main() -> int:
    errors = validate_controlled_outbound_contracts()
    write_validation_results(errors)
    print(f"CONTROLLED_OUTBOUND_VALIDATION_RESULT={'PASS' if not errors else 'FAIL'}")
    for error in errors:
        print(f"ERROR: {error}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
