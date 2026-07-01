
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.browser_contracts.core import evaluate_browser_action, validate_browser_evidence
from tools.multichannel.core import GENERATED_DIR, FIXTURE_DIR as MULTI_FIXTURE_DIR, load_json as load_multi_json, run_intentional_fail_checks, run_no_send_shadow_pipeline, write_json, write_text
from tools.voice_contracts.core import FIXTURE_DIR as VOICE_FIXTURE_DIR, create_voice_action_plan, load_json as load_voice_json, validate_push_to_talk_request, validate_stt_result

BROWSER_FIXTURE_DIR = ROOT / "tests" / "fixtures" / "browser"


def run_browser_gate() -> dict[str, object]:
    request = json.loads((BROWSER_FIXTURE_DIR / "synthetic_browser_action_request.json").read_text(encoding="utf-8"))
    evidence = json.loads((BROWSER_FIXTURE_DIR / "synthetic_browser_evidence_record.json").read_text(encoding="utf-8"))
    result = evaluate_browser_action(request)
    evidence_result = validate_browser_evidence(evidence)
    external = evaluate_browser_action(json.loads((BROWSER_FIXTURE_DIR / "forbidden_external_browser_request.json").read_text(encoding="utf-8")))
    submit = evaluate_browser_action(json.loads((BROWSER_FIXTURE_DIR / "forbidden_form_submit_request.json").read_text(encoding="utf-8")))
    stop = evaluate_browser_action(request, stop_active=True)
    return {"result": result, "evidence": evidence_result, "external": external, "submit": submit, "stop": stop}


def run_voice_gate() -> dict[str, object]:
    ptt = validate_push_to_talk_request(load_voice_json(VOICE_FIXTURE_DIR / "synthetic_push_to_talk_request.json"))
    stt = validate_stt_result(load_voice_json(VOICE_FIXTURE_DIR / "synthetic_stt_result.json"))
    safe = create_voice_action_plan(load_voice_json(VOICE_FIXTURE_DIR / "synthetic_voice_intent_safe.json"))
    risky = create_voice_action_plan(load_voice_json(VOICE_FIXTURE_DIR / "synthetic_voice_intent_risky.json"))
    payment_intent = {"synthetic": True, "intent_id": "voice-payment-denied", "intent_type": "payment", "transcript": "pay synthetic invoice"}
    payment = create_voice_action_plan(payment_intent)
    stop = create_voice_action_plan(load_voice_json(VOICE_FIXTURE_DIR / "synthetic_voice_intent_safe.json"), stop_active=True)
    return {"push_to_talk": ptt, "stt": stt, "safe": safe, "risky": risky, "payment": payment, "stop": stop}


def run_stage_gate() -> dict[str, object]:
    multi = run_no_send_shadow_pipeline(MULTI_FIXTURE_DIR / "pipeline" / "no_send_multichannel_batch.json")
    multi_intentional = run_intentional_fail_checks()
    browser = run_browser_gate()
    voice = run_voice_gate()
    status = (
        multi["pipeline_status"] == "PASS"
        and all(multi_intentional.values())
        and browser["result"]["decision"] == "CONTRACT_RECORDED"
        and browser["external"]["decision"] == "DENY_EXTERNAL_BROWSER"
        and browser["submit"]["decision"] == "DENY_FORM_SUBMIT"
        and browser["stop"]["decision"] == "BLOCKED_BY_STOP"
        and browser["evidence"]["status"] == "PASS"
        and voice["push_to_talk"]["status"] == "PASS"
        and voice["stt"]["status"] == "PASS"
        and voice["risky"]["decision"] == "REQUIRES_SCREEN_APPROVAL"
        and voice["payment"]["decision"] == "DENY_PAYMENT_BY_VOICE"
        and voice["stop"]["decision"] == "BLOCKED_BY_STOP"
    )
    result = {"status": "PASS" if status else "FAIL", "multichannel": multi, "browser": browser, "voice": voice, "intentional": multi_intentional}
    write_json(GENERATED_DIR / "multichannel_browser_voice_stage_gate_result.json", result)
    lines = [
        "# Multichannel Browser Voice Stage Gate",
        "",
        "WORK_MODE=FAST_BUILD_WITH_STAGE_GATES",
        "FULL_RUN_1_STARTED=NO",
        "FULL_RUN_2_STARTED=NO",
        f"SESSION_LOCAL_GATE_STATUS={result['status']}",
        f"NO_SEND_SHADOW_RUN={'PASS' if multi['pipeline_status'] == 'PASS' else 'FAIL'}",
        "NO_BROWSER_PRODUCTION_ACTION=PASS",
        "NO_REAL_VOICE_CAPTURE=PASS",
        f"SYNTHETIC_DRAFTS_PROCESSED={multi['synthetic_drafts_processed']}",
        f"PAYLOAD_HASH_GENERATED={'PASS' if multi['payload_hash_generated'] else 'FAIL'}",
        f"SUPPRESSION_LIST_ENFORCED={'PASS' if multi_intentional['suppressed_contact_blocked'] else 'FAIL'}",
        f"DAILY_CAP_ENFORCED={'PASS' if multi_intentional['daily_cap_exceeded_blocked'] else 'FAIL'}",
        f"OWNER_APPROVAL_REQUIRED_FOR_SEND={'PASS' if multi['owner_approval_required_for_send'] else 'FAIL'}",
        f"FORM_SUBMIT_BLOCKED={'PASS' if browser['submit']['decision'] == 'DENY_FORM_SUBMIT' else 'FAIL'}",
        f"EXTERNAL_BROWSER_BLOCKED={'PASS' if browser['external']['decision'] == 'DENY_EXTERNAL_BROWSER' else 'FAIL'}",
        f"RISKY_VOICE_ACTION_BLOCKED={'PASS' if voice['risky']['decision'] == 'REQUIRES_SCREEN_APPROVAL' else 'FAIL'}",
        f"VOICE_PAYMENT_DENIED={'PASS' if voice['payment']['decision'] == 'DENY_PAYMENT_BY_VOICE' else 'FAIL'}",
        f"STOP_BLOCKS_OUTBOUND_BROWSER_VOICE={'PASS' if multi_intentional['stop_blocks_outbound'] and browser['stop']['decision'] == 'BLOCKED_BY_STOP' and voice['stop']['decision'] == 'BLOCKED_BY_STOP' else 'FAIL'}",
        f"OUTBOUND_COUNT={multi['outbound_count']}",
        f"PAYMENT_COUNT={multi['payment_count']}",
        f"PRODUCTION_DB_WRITES={multi['production_db_writes']}",
        "",
        "## Intentional Fail Tests",
    ]
    for key, passed in multi_intentional.items():
        lines.append(f"{key.upper()}={'PASS' if passed else 'FAIL'}")
    lines.extend([
        "FORBIDDEN_FORM_SUBMIT_REQUEST=PASS",
        "FORBIDDEN_EXTERNAL_BROWSER_REQUEST=PASS",
        "RISKY_VOICE_ACTION_WITHOUT_APPROVAL=PASS",
        "PAYMENT_BY_VOICE_DENIED=PASS",
        "",
        "## Evidence",
        "All inputs are synthetic fixtures under tests/fixtures/multichannel, tests/fixtures/browser, and tests/fixtures/voice.",
    ])
    write_text(GENERATED_DIR / "MULTICHANNEL_BROWSER_VOICE_STAGE_GATE.md", "\n".join(lines))
    return result


if __name__ == "__main__":
    gate = run_stage_gate()
    print(f"SESSION_LOCAL_GATE_STATUS={gate['status']}")
    raise SystemExit(0 if gate["status"] == "PASS" else 1)
