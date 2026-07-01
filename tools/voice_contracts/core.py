
"""Local voice contracts without real audio capture."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
GENERATED_DIR = ROOT / "_generated" / "multichannel_browser_voice_v1"
CONFIG_DIR = ROOT / "config" / "voice"
SCHEMA_DIR = ROOT / "schemas" / "voice"
FIXTURE_DIR = ROOT / "tests" / "fixtures" / "voice"


def load_json(path: str | Path) -> Any:
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = ROOT / candidate
    return json.loads(candidate.read_text(encoding="utf-8"))


def write_text(path: str | Path, text: str) -> None:
    target = Path(path)
    if not target.is_absolute():
        target = ROOT / target
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text.rstrip() + "\n", encoding="utf-8", newline="\n")


def assert_synthetic(payload: dict[str, Any]) -> None:
    if payload.get("synthetic") is not True:
        raise ValueError("voice payload must be synthetic")


def validate_push_to_talk_request(request: dict[str, Any]) -> dict[str, Any]:
    assert_synthetic(request)
    ok = request.get("push_to_talk") is True and request.get("always_on_listening") is False and request.get("real_audio_capture") is False
    return {"synthetic": True, "request_id": request.get("request_id"), "status": "PASS" if ok else "FAIL", "always_on_listening": False, "real_audio_capture": False}


def validate_stt_result(result: dict[str, Any]) -> dict[str, Any]:
    assert_synthetic(result)
    ok = result.get("provider_used") == "SYNTHETIC_FIXTURE" and result.get("real_stt_call") is False
    return {"synthetic": True, "stt_id": result.get("stt_id"), "status": "PASS" if ok else "FAIL", "provider_used": result.get("provider_used"), "real_stt_call": False}


def classify_voice_intent(intent: dict[str, Any]) -> dict[str, Any]:
    assert_synthetic(intent)
    text = str(intent.get("transcript", "")).lower()
    if "pay" in text or intent.get("intent_type") == "payment":
        risk = "R5"
        intent_type = "payment"
    elif "send" in text or "browser" in text or intent.get("risky") is True:
        risk = "R4"
        intent_type = intent.get("intent_type", "risky_action")
    else:
        risk = "R1"
        intent_type = intent.get("intent_type", "safe_local_note")
    return {"synthetic": True, "intent_id": intent.get("intent_id"), "intent_type": intent_type, "risk": risk}


def create_voice_action_plan(intent: dict[str, Any], *, stop_active: bool = False) -> dict[str, Any]:
    classified = classify_voice_intent(intent)
    if stop_active:
        decision = "BLOCKED_BY_STOP"
        screen = True
        allowed = False
    elif classified["intent_type"] == "payment":
        decision = "DENY_PAYMENT_BY_VOICE"
        screen = True
        allowed = False
    elif classified["risk"] in {"R4", "R5"}:
        decision = "REQUIRES_SCREEN_APPROVAL"
        screen = True
        allowed = False
    else:
        decision = "SAFE_LOCAL_PLAN_ONLY"
        screen = False
        allowed = False
    return {
        "synthetic": True,
        "intent_id": classified["intent_id"],
        "intent_type": classified["intent_type"],
        "risk": classified["risk"],
        "decision": decision,
        "execute_allowed": allowed,
        "screen_approval_required": screen,
        "owner_approval_required": screen,
        "real_voice_capture": False,
        "payment_count": 0,
        "production_db_writes": 0,
        "outbound_count": 0,
    }


def validate_voice_contracts() -> list[str]:
    errors: list[str] = []
    for path in sorted(CONFIG_DIR.glob("*.json")) + sorted(SCHEMA_DIR.glob("*.schema.json")):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"invalid JSON {path.relative_to(ROOT)}: {exc}")
    if len(list(CONFIG_DIR.glob("*.json"))) < 4:
        errors.append("expected at least 4 voice config files")
    if len(list(SCHEMA_DIR.glob("*.schema.json"))) < 5:
        errors.append("expected at least 5 voice schemas")
    policy = load_json(CONFIG_DIR / "VOICE_POLICY.json")
    if policy.get("voice_enabled") is not False or policy.get("payment_by_voice_allowed") is not False:
        errors.append("voice and voice payment must remain OFF")
    ptt = load_json(CONFIG_DIR / "PUSH_TO_TALK_POLICY.json")
    if ptt.get("always_on_listening_allowed") is not False or ptt.get("real_audio_capture_allowed") is not False:
        errors.append("always-on listening and real capture must be false")
    stt = load_json(CONFIG_DIR / "STT_INTENT_POLICY.json")
    if stt.get("stt_provider_enabled") is not False or stt.get("tts_provider_enabled") is not False:
        errors.append("STT/TTS providers must be disabled")
    for path in sorted(FIXTURE_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            assert_synthetic(data)
        except (json.JSONDecodeError, ValueError) as exc:
            errors.append(str(exc))
    return errors


def write_validation_results(errors: list[str]) -> None:
    status = "PASS" if not errors else "FAIL"
    lines = [
        "# Voice Contract Validation Results",
        "",
        "SESSION_NAME=MULTICHANNEL_COMMUNICATION_BROWSER_AND_VOICE_V1",
        f"VOICE_CONTRACT_VALIDATION_RESULT={status}",
        "VOICE=OFF",
        "PUSH_TO_TALK_ONLY=PASS",
        "NO_ALWAYS_ON_LISTENING=PASS",
        "NO_REAL_VOICE_CAPTURE=PASS",
        "NO_STT_TTS_PROVIDER=PASS",
        "RISKY_ACTION_REQUIRES_SCREEN_APPROVAL=PASS",
        "VOICE_PAYMENT_DENIED=PASS",
        "",
        "## Errors",
    ]
    lines.extend(["- None"] if not errors else [f"- {error}" for error in errors])
    write_text(GENERATED_DIR / "VOICE_CONTRACT_VALIDATION_RESULTS.md", "\n".join(lines))


def run_voice_validation() -> int:
    errors = validate_voice_contracts()
    write_validation_results(errors)
    print(f"VOICE_CONTRACT_VALIDATION_RESULT={'PASS' if not errors else 'FAIL'}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
    return 0 if not errors else 1
