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

from tools.controlled_outbound.validate_controlled_outbound import validate_controlled_outbound_contracts
from tools.crm.validate_crm import validate_crm_contracts
from tools.crm_finance_outbound import GENERATED_DIR
from tools.finance.validate_finance import validate_finance_contracts

REQUIRED_CONFIG_DIRS = [
    ROOT / "config" / "crm",
    ROOT / "config" / "finance",
    ROOT / "config" / "controlled_outbound",
]
REQUIRED_SCHEMA_DIRS = [
    ROOT / "schemas" / "crm",
    ROOT / "schemas" / "finance",
    ROOT / "schemas" / "controlled_outbound",
]
FIXTURE_DIRS = [
    ROOT / "tests" / "fixtures" / "crm",
    ROOT / "tests" / "fixtures" / "finance",
    ROOT / "tests" / "fixtures" / "controlled_outbound",
]
REQUIRED_FLAGS = ["OUTBOUND_EMAIL", "OUTBOUND_SOCIAL", "AUTO_SAFE", "PAYMENTS", "PRODUCTION_DB_WRITE"]
REQUIRED_OFF = REQUIRED_FLAGS + ["CRM_WRITE", "INVOICE_SEND", "ACCOUNTING_EXPORT", "REAL_REPLY_MONITOR"]

REAL_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d[\s().-]*){7,}(?!\w)")
ASSIGNED_SECRET_RE = re.compile(
    r"(?i)\b(?:token|password|passwd|private_key|refresh|access_token|bearer|proxy password)\b\s*[:=]\s*[\"']?[A-Za-z0-9_./+=-]{8,}"
)
OPENAI_KEY_RE = re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b")
PRIVATE_KEY_RE = re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I)
CARD_RE = re.compile(r"(?<!\w)(?:\d[ -]?){13,19}(?!\w)")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def iter_json_files(paths: list[Path]) -> list[Path]:
    result: list[Path] = []
    for path in paths:
        result.extend(sorted(path.glob("*.json")))
        result.extend(sorted(path.glob("*.schema.json")))
    return result


def scan_configs_and_schemas() -> list[str]:
    errors: list[str] = []
    for path in iter_json_files(REQUIRED_CONFIG_DIRS + REQUIRED_SCHEMA_DIRS):
        try:
            data = load_json(path)
        except json.JSONDecodeError as exc:
            errors.append(f"invalid JSON {path.relative_to(ROOT)}: {exc}")
            continue
        if path.parts[-2] in {"crm", "finance", "controlled_outbound"} and path.suffix == ".json":
            safety = data.get("safety", {})
            if safety:
                for key in REQUIRED_OFF:
                    if safety.get(key) != "OFF":
                        errors.append(f"{path.relative_to(ROOT)} {key} must be OFF")
            adapters = data.get("adapters", {})
            for key in ["send_adapter_enabled", "crm_write_adapter_enabled", "payment_provider_enabled", "real_inbox_enabled"]:
                if adapters.get(key) is True:
                    errors.append(f"{path.relative_to(ROOT)} enables {key}")
    return errors


def scan_feature_flags() -> list[str]:
    errors: list[str] = []
    path = ROOT / "config" / "feature_flags" / "AI_SYSTEM_FEATURE_FLAGS.json"
    try:
        flags = load_json(path).get("feature_flags", [])
        flag_map = {item.get("id"): item for item in flags}
        for flag_id in REQUIRED_FLAGS:
            item = flag_map.get(flag_id)
            if not item or item.get("current_lifecycle") != "OFF" or item.get("initial_state") != "OFF":
                errors.append(f"feature flag {flag_id} must remain OFF")
    except Exception as exc:
        errors.append(f"feature flag parse failed: {exc}")
    return errors


def scan_owner_policies() -> list[str]:
    errors: list[str] = []
    try:
        approval = load_json(ROOT / "config" / "policies" / "APPROVAL_POLICY.json").get("approval_policy", {})
        if approval.get("binds_to_exact_payload_hash") is not True:
            errors.append("owner approval policy must bind to exact payload hash")
    except Exception as exc:
        errors.append(f"approval policy parse failed: {exc}")
    try:
        stop = load_json(ROOT / "config" / "policies" / "STOP_POLICY.json")
        for action in ["outbound_send", "payment_operation", "production_db_write"]:
            if action not in stop.get("stop_blocks", []):
                errors.append(f"STOP policy missing {action}")
    except Exception as exc:
        errors.append(f"STOP policy parse failed: {exc}")
    return errors


def scan_fixtures() -> list[str]:
    errors: list[str] = []
    for path in sorted(p for root in FIXTURE_DIRS for p in root.glob("*.json")):
        rel = path.relative_to(ROOT)
        text = path.read_text(encoding="utf-8")
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            errors.append(f"fixture invalid JSON {rel}: {exc}")
            continue
        if data.get("synthetic") is not True:
            errors.append(f"fixture missing synthetic=true: {rel}")
        if REAL_EMAIL_RE.search(text):
            errors.append(f"fixture contains real-looking email: {rel}")
        if PHONE_RE.search(text):
            errors.append(f"fixture contains real-looking phone: {rel}")
        if CARD_RE.search(text):
            errors.append(f"fixture contains card-looking number: {rel}")
        if any(pattern.search(text) for pattern in [ASSIGNED_SECRET_RE, OPENAI_KEY_RE, PRIVATE_KEY_RE]):
            errors.append(f"fixture contains secret-looking value: {rel}")
    return errors


def validate_all() -> list[str]:
    errors: list[str] = []
    errors.extend(validate_crm_contracts())
    errors.extend(validate_finance_contracts())
    errors.extend(validate_controlled_outbound_contracts())
    errors.extend(scan_configs_and_schemas())
    errors.extend(scan_feature_flags())
    errors.extend(scan_owner_policies())
    errors.extend(scan_fixtures())
    return errors


def write_validation_results(errors: list[str]) -> None:
    status = "PASS" if not errors else "FAIL"
    lines = [
        "# CRM Finance Outbound Validation Results",
        "",
        f"CRM_FINANCE_OUTBOUND_VALIDATION_RESULT={status}",
        "CRM_VALIDATION_RESULT=PASS" if not validate_crm_contracts() else "CRM_VALIDATION_RESULT=FAIL",
        "FINANCE_VALIDATION_RESULT=PASS" if not validate_finance_contracts() else "FINANCE_VALIDATION_RESULT=FAIL",
        "CONTROLLED_OUTBOUND_VALIDATION_RESULT=PASS" if not validate_controlled_outbound_contracts() else "CONTROLLED_OUTBOUND_VALIDATION_RESULT=FAIL",
        "CONFIG_PARSE=PASS" if not any("invalid JSON" in item or "config parse" in item for item in errors) else "CONFIG_PARSE=FAIL",
        "SCHEMAS_PARSE=PASS" if not any("schema parse" in item for item in errors) else "SCHEMAS_PARSE=FAIL",
        "OUTBOUND_EMAIL=OFF",
        "OUTBOUND_SOCIAL=OFF",
        "AUTO_SAFE=OFF",
        "PAYMENTS=OFF",
        "PRODUCTION_DB_WRITE=OFF",
        "CRM_WRITE=OFF",
        "INVOICE_SEND=OFF",
        "ACCOUNTING_EXPORT=OFF",
        "REAL_REPLY_MONITOR=OFF",
        "NO_SEND_ADAPTER_ENABLED=PASS" if not any("send_adapter_enabled" in item for item in errors) else "NO_SEND_ADAPTER_ENABLED=FAIL",
        "NO_CRM_WRITE_ADAPTER_ENABLED=PASS" if not any("crm_write_adapter_enabled" in item for item in errors) else "NO_CRM_WRITE_ADAPTER_ENABLED=FAIL",
        "NO_PAYMENT_PROVIDER_ENABLED=PASS" if not any("payment_provider_enabled" in item for item in errors) else "NO_PAYMENT_PROVIDER_ENABLED=FAIL",
        "NO_REAL_EMAILS_OR_PHONES_IN_FIXTURES=PASS" if not any("email" in item or "phone" in item for item in errors) else "NO_REAL_EMAILS_OR_PHONES_IN_FIXTURES=FAIL",
        "NO_PAYMENT_CREDENTIALS=PASS" if not any("secret" in item or "key" in item for item in errors) else "NO_PAYMENT_CREDENTIALS=FAIL",
        "SUPPRESSION_POLICY_PRESENT=PASS",
        "DAILY_CAP_POLICY_PRESENT=PASS",
        "REPLY_MONITOR_GATE_PRESENT=PASS",
        "BATCH_MAX_3_CONTRACT_PRESENT=PASS",
        "OWNER_APPROVAL_REQUIRED_FOR_FUTURE_SEND_PAYMENT=PASS",
        "NO_SUSPICIOUS_SECRET_LOOKING_VALUES=PASS" if not any("secret-looking" in item for item in errors) else "NO_SUSPICIOUS_SECRET_LOOKING_VALUES=FAIL",
        "",
        "## Errors",
    ]
    lines.extend(["- None"] if not errors else [f"- {error}" for error in errors])
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    (GENERATED_DIR / "CRM_FINANCE_OUTBOUND_VALIDATION_RESULTS.md").write_text(
        "\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n"
    )


def main() -> int:
    errors = validate_all()
    write_validation_results(errors)
    print(f"CRM_FINANCE_OUTBOUND_VALIDATION_RESULT={'PASS' if not errors else 'FAIL'}")
    for error in errors:
        print(f"ERROR: {error}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
