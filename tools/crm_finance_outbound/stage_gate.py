from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.controlled_outbound import ControlledOutboundPolicyError, FIXTURE_DIR as OUTBOUND_FIXTURE_DIR, load_json as load_outbound_json
from tools.controlled_outbound.batch_max_3 import validate_batch_max_3
from tools.controlled_outbound.daily_cap import check_daily_cap
from tools.controlled_outbound.no_send_guard import enforce_no_send_guard
from tools.controlled_outbound.outbound_draft import validate_outbound_draft
from tools.controlled_outbound.reply_monitor_gate import check_reply_monitor_gate
from tools.controlled_outbound.suppression import check_suppression
from tools.crm import FIXTURE_DIR as CRM_FIXTURE_DIR, load_json as load_crm_json
from tools.crm.contact import validate_contact
from tools.crm.deal import validate_deal
from tools.crm.opportunity import validate_opportunity
from tools.crm.reply_monitor import classify_reply
from tools.crm_finance_outbound import GENERATED_DIR
from tools.finance import FIXTURE_DIR as FINANCE_FIXTURE_DIR, FinancePolicyError, load_json as load_finance_json
from tools.finance.accounting_draft import validate_accounting_entry_draft
from tools.finance.invoice_draft import validate_invoice_draft
from tools.finance.payment_preparation import attempt_payment_execution, validate_payment_preparation


def run_stage_gate() -> dict[str, object]:
    contact = validate_contact(load_crm_json(CRM_FIXTURE_DIR / "synthetic_contact.json"))
    opportunity = validate_opportunity(load_crm_json(CRM_FIXTURE_DIR / "synthetic_opportunity.json"))
    deal = validate_deal(load_crm_json(CRM_FIXTURE_DIR / "synthetic_deal.json"))
    reply = classify_reply(load_crm_json(CRM_FIXTURE_DIR / "synthetic_reply_unsubscribe.json"))

    invoice = validate_invoice_draft(load_finance_json(FINANCE_FIXTURE_DIR / "synthetic_invoice_draft.json"))
    accounting = validate_accounting_entry_draft(load_finance_json(FINANCE_FIXTURE_DIR / "synthetic_accounting_entry.json"))
    payment = validate_payment_preparation(load_finance_json(FINANCE_FIXTURE_DIR / "synthetic_payment_preparation.json"))

    batch = load_outbound_json(OUTBOUND_FIXTURE_DIR / "no_send_batch_max_3.json")
    drafts = [load_outbound_json(path) for path in batch["draft_fixtures"]]
    draft_results = [validate_outbound_draft(item) for item in drafts[:3]]
    batch_result = validate_batch_max_3(batch, drafts)
    suppression = check_suppression(load_outbound_json(OUTBOUND_FIXTURE_DIR / "synthetic_suppressed_contact.json"))
    cap = check_daily_cap(current_count=2, requested_count=2)
    reply_gate = check_reply_monitor_gate()
    no_send = enforce_no_send_guard(
        {"synthetic": True, "send_allowed": False, "outbound_count": 0, "payment_count": 0, "production_db_writes": 0}
    )

    payment_blocked = False
    try:
        attempt_payment_execution({})
    except FinancePolicyError:
        payment_blocked = True

    stop_blocked = False
    try:
        enforce_no_send_guard({"synthetic": True}, stop_active=True)
    except ControlledOutboundPolicyError:
        stop_blocked = True

    false_success_blocked = False
    try:
        enforce_no_send_guard({"synthetic": True, "sent": True, "paid": True, "production_db_written": True})
    except ControlledOutboundPolicyError:
        false_success_blocked = True

    payload_hash_generated = all(len(str(item.get("payload_hash", ""))) == 64 for item in [invoice, accounting, payment, *draft_results])
    checks = {
        "CRM_SHADOW_RESULT": contact["status"] == "PASS" and opportunity["status"] == "PASS" and deal["status"] == "PASS" and reply["suppression_required"] is True,
        "INVOICE_DRAFT_ONLY": invoice["draft_only"] is True and invoice["invoice_send_blocked"] is True,
        "ACCOUNTING_DRAFT_ONLY": accounting["draft_only"] is True and accounting["accounting_export_blocked"] is True,
        "PAYMENT_PREPARATION_ONLY": payment["preparation_only"] is True,
        "PAYMENT_EXECUTION_BLOCKED": payment_blocked,
        "BATCH_MAX_3_ENFORCED": batch_result["allowed_count"] == 3,
        "FOURTH_DRAFT_BLOCKED": batch_result["fourth_draft_blocked"] is True,
        "SUPPRESSION_LIST_ENFORCED": suppression["decision"] == "BLOCK",
        "DAILY_CAP_ENFORCED": cap["decision"] == "BLOCK",
        "REPLY_MONITOR_GATE_REQUIRED": reply_gate["reply_monitor_required"] is True,
        "OWNER_APPROVAL_REQUIRED_FOR_SEND_OR_PAYMENT": payment["owner_approval_required_for_future_payment"] is True
        and all(item["owner_approval_required_for_future_send"] is True for item in draft_results),
        "PAYLOAD_HASH_GENERATED": payload_hash_generated,
        "NO_SEND_GUARD": no_send["no_send_guard"] is True,
        "NO_PAYMENT_GUARD": payment_blocked and stop_blocked,
        "NO_PRODUCTION_WRITE_GUARD": stop_blocked and no_send["production_db_writes"] == 0,
        "FALSE_SENT_PAID_WRITTEN_BLOCKED": false_success_blocked,
    }
    status = "PASS" if all(checks.values()) else "FAIL"
    return {
        "status": status,
        "checks": checks,
        "outbound_count": 0,
        "payment_count": 0,
        "production_db_writes": 0,
        "evidence": {
            "contact": contact,
            "opportunity": opportunity,
            "deal": deal,
            "reply": reply,
            "invoice": invoice,
            "accounting": accounting,
            "payment": payment,
            "batch": batch_result,
            "suppression": suppression,
            "daily_cap": cap,
            "reply_gate": reply_gate,
            "no_send": no_send,
        },
    }


def stage_gate_markdown(result: dict[str, object]) -> str:
    checks = result["checks"]
    lines = [
        "# CRM Finance Outbound Stage Gate",
        "",
        "WORK_MODE=FAST_BUILD_WITH_STAGE_GATES",
        "FULL_RUN_1_STARTED=NO",
        "FULL_RUN_2_STARTED=NO",
        f"SESSION_LOCAL_GATE_STATUS={result['status']}",
        f"CONTROLLED_OUTBOUND_SYNTHETIC_GATE={result['status']}",
    ]
    for key in [
        "CRM_SHADOW_RESULT",
        "INVOICE_DRAFT_ONLY",
        "ACCOUNTING_DRAFT_ONLY",
        "PAYMENT_PREPARATION_ONLY",
        "PAYMENT_EXECUTION_BLOCKED",
        "BATCH_MAX_3_ENFORCED",
        "FOURTH_DRAFT_BLOCKED",
        "SUPPRESSION_LIST_ENFORCED",
        "DAILY_CAP_ENFORCED",
        "REPLY_MONITOR_GATE_REQUIRED",
        "OWNER_APPROVAL_REQUIRED_FOR_SEND_OR_PAYMENT",
        "PAYLOAD_HASH_GENERATED",
        "NO_SEND_GUARD",
        "NO_PAYMENT_GUARD",
        "NO_PRODUCTION_WRITE_GUARD",
        "FALSE_SENT_PAID_WRITTEN_BLOCKED",
    ]:
        lines.append(f"{key}={'PASS' if checks[key] else 'FAIL'}")
    lines.extend(
        [
            f"OUTBOUND_COUNT={result['outbound_count']}",
            f"PAYMENT_COUNT={result['payment_count']}",
            f"PRODUCTION_DB_WRITES={result['production_db_writes']}",
            "",
            "## Evidence",
            "- CRM contact/opportunity/deal validated from synthetic fixtures.",
            "- Reply monitor used synthetic unsubscribe fixture and required suppression.",
            "- Invoice, accounting, and payment objects remained draft/preparation only.",
            "- Batch max 3 allowed three drafts and blocked the fourth.",
            "- Suppression, daily cap, reply monitor, STOP, no-send, no-payment, and no-production-write gates were enforced locally.",
        ]
    )
    return "\n".join(lines)


def write_stage_gate() -> dict[str, object]:
    result = run_stage_gate()
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    (GENERATED_DIR / "CRM_FINANCE_OUTBOUND_STAGE_GATE.md").write_text(
        stage_gate_markdown(result).rstrip() + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return result


if __name__ == "__main__":
    gate = write_stage_gate()
    print(f"SESSION_LOCAL_GATE_STATUS={gate['status']}")
    print(f"CONTROLLED_OUTBOUND_SYNTHETIC_GATE={gate['status']}")
    raise SystemExit(0 if gate["status"] == "PASS" else 1)
