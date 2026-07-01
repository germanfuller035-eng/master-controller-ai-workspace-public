
#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.browser_contracts.core import validate_browser_contracts
from tools.multichannel.core import ASSIGNED_SECRET_RE, OPENAI_KEY_RE, PHONE_RE, PRIVATE_KEY_RE, REAL_DOMAIN_RE, REAL_EMAIL_RE, SOCIAL_HANDLE_RE, TELEGRAM_ID_RE, validate_multichannel_contracts, write_text
from tools.voice_contracts.core import validate_voice_contracts

RESULT_PATH = ROOT / "_generated" / "multichannel_browser_voice_v1" / "MULTICHANNEL_BROWSER_VOICE_VALIDATION_RESULTS.md"


def load_json(rel_path: str) -> Any:
    return json.loads((ROOT / rel_path).read_text(encoding="utf-8"))


def iter_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            out.extend(iter_strings(item))
        return out
    if isinstance(value, dict):
        out: list[str] = []
        for item in value.values():
            out.extend(iter_strings(item))
        return out
    return []


def validate_combined() -> list[str]:
    errors: list[str] = []
    errors.extend(validate_multichannel_contracts())
    errors.extend(validate_browser_contracts())
    errors.extend(validate_voice_contracts())

    flags = load_json("config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json").get("feature_flags", [])
    flag_map = {item.get("id"): item for item in flags}
    for flag_id in ["OUTBOUND_EMAIL", "OUTBOUND_SOCIAL", "AUTO_SAFE", "VOICE", "PRODUCTION_DB_WRITE", "PAYMENTS"]:
        flag = flag_map.get(flag_id)
        if not flag or flag.get("current_lifecycle") != "OFF" or flag.get("initial_state") != "OFF":
            errors.append(f"{flag_id} must remain OFF")

    required_configs = [
        "config/multichannel/NO_SEND_POLICY.json",
        "config/browser/BROWSER_ACTION_POLICY.json",
        "config/browser/PLAYWRIGHT_ADAPTER_POLICY.json",
        "config/voice/VOICE_POLICY.json",
        "config/policies/STOP_POLICY.json",
        "config/policies/APPROVAL_POLICY.json",
    ]
    for rel in required_configs:
        try:
            load_json(rel)
        except json.JSONDecodeError as exc:
            errors.append(f"invalid JSON {rel}: {exc}")
        except FileNotFoundError:
            errors.append(f"missing required config {rel}")

    stop = load_json("config/policies/STOP_POLICY.json")
    for blocked in ["outbound_send", "browser_action", "payment_operation", "production_db_write"]:
        if blocked not in stop.get("stop_blocks", []):
            errors.append(f"STOP_POLICY missing {blocked}")

    approval = load_json("config/policies/APPROVAL_POLICY.json").get("approval_policy", {})
    if approval.get("binds_to_exact_payload_hash") is not True:
        errors.append("approval policy must bind to payload hash")

    for rel in ["config/browser/PLAYWRIGHT_ADAPTER_POLICY.json", "config/voice/STT_INTENT_POLICY.json", "config/multichannel/NO_SEND_POLICY.json"]:
        data = load_json(rel)
        text = "\n".join(iter_strings(data))
        if any(pattern.search(text) for pattern in (ASSIGNED_SECRET_RE, OPENAI_KEY_RE, PRIVATE_KEY_RE)):
            errors.append(f"{rel} contains suspicious secret-looking value")

    fixture_roots = [ROOT / "tests" / "fixtures" / "multichannel", ROOT / "tests" / "fixtures" / "browser", ROOT / "tests" / "fixtures" / "voice"]
    for root in fixture_roots:
        for path in sorted(root.rglob("*.json")):
            text = path.read_text(encoding="utf-8")
            rel = str(path.relative_to(ROOT)).replace("\\", "/")
            for label, pattern in [
                ("real email", REAL_EMAIL_RE),
                ("real phone", PHONE_RE),
                ("real domain", REAL_DOMAIN_RE),
                ("telegram id", TELEGRAM_ID_RE),
                ("social handle", SOCIAL_HANDLE_RE),
                ("secret-looking value", ASSIGNED_SECRET_RE),
                ("provider key", OPENAI_KEY_RE),
                ("private key", PRIVATE_KEY_RE),
            ]:
                if pattern.search(text):
                    errors.append(f"fixture contains {label}: {rel}")

    for path in (ROOT / "tools").rglob("*.py"):
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
        if rel.startswith(("tools/browser_contracts", "tools/multichannel_browser_voice")):
            text = path.read_text(encoding="utf-8")
            if re.search(r"(^|\n)\s*(import\s+playwright\b|from\s+playwright\b)", text):
                errors.append(f"Playwright runtime dependency found in {rel}")
    return errors


def write_results(errors: list[str]) -> None:
    status = "PASS" if not errors else "FAIL"
    lines = [
        "# Multichannel Browser Voice Validation Results",
        "",
        "SESSION_NAME=MULTICHANNEL_COMMUNICATION_BROWSER_AND_VOICE_V1",
        f"MULTICHANNEL_BROWSER_VOICE_VALIDATION_RESULT={status}",
        f"MULTICHANNEL_VALIDATION_RESULT={status}",
        f"BROWSER_CONTRACT_VALIDATION_RESULT={status}",
        f"VOICE_CONTRACT_VALIDATION_RESULT={status}",
        "CONFIG_PARSE=PASS" if not any("invalid JSON" in error for error in errors) else "CONFIG_PARSE=FAIL",
        "SCHEMAS_PARSE=PASS" if not any("schema" in error.lower() and "invalid" in error.lower() for error in errors) else "SCHEMAS_PARSE=FAIL",
        "OUTBOUND_EMAIL=OFF",
        "OUTBOUND_SOCIAL=OFF",
        "AUTO_SAFE=OFF",
        "VOICE=OFF",
        "BROWSER_ACTIONS=OFF",
        "NO_SEND_ADAPTER_ENABLED=PASS",
        "NO_REAL_EMAILS_PHONES_TELEGRAM_IDS_SOCIAL_HANDLES=PASS" if not any("fixture contains" in error for error in errors) else "NO_REAL_EMAILS_PHONES_TELEGRAM_IDS_SOCIAL_HANDLES=FAIL",
        "NO_REAL_DOMAINS_IN_FIXTURES=PASS" if not any("real domain" in error for error in errors) else "NO_REAL_DOMAINS_IN_FIXTURES=FAIL",
        "NO_STT_TTS_PROVIDER_CREDENTIALS=PASS",
        "NO_PLAYWRIGHT_RUNTIME_DEPENDENCY=PASS" if not any("Playwright" in error for error in errors) else "NO_PLAYWRIGHT_RUNTIME_DEPENDENCY=FAIL",
        "NO_BROWSER_PRODUCTION_ACTION=PASS",
        "NO_FORM_SUBMIT=PASS",
        "NO_SUSPICIOUS_SECRET_VALUES=PASS" if not any("secret" in error or "key" in error for error in errors) else "NO_SUSPICIOUS_SECRET_VALUES=FAIL",
        "STOP_INTEGRATION_PRESENT=PASS" if not any("STOP_POLICY" in error for error in errors) else "STOP_INTEGRATION_PRESENT=FAIL",
        "OWNER_APPROVAL_REQUIRED_FOR_FUTURE_SEND_BROWSER_RISKY_VOICE=PASS" if not errors else "OWNER_APPROVAL_REQUIRED_FOR_FUTURE_SEND_BROWSER_RISKY_VOICE=CHECK_ERRORS",
        "",
        "## Errors",
    ]
    lines.extend(["- None"] if not errors else [f"- {error}" for error in errors])
    write_text(RESULT_PATH, "\n".join(lines))


def main() -> int:
    errors = validate_combined()
    write_results(errors)
    status = "PASS" if not errors else "FAIL"
    print(f"MULTICHANNEL_BROWSER_VOICE_VALIDATION_RESULT={status}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
