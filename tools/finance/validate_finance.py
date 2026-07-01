#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.finance import CONFIG_DIR, FIXTURE_DIR, GENERATED_DIR, SCHEMA_DIR, FinancePolicyError, load_json, write_text
from tools.finance.accounting_draft import attempt_accounting_export, validate_accounting_entry_draft
from tools.finance.invoice_draft import attempt_invoice_send, validate_invoice_draft
from tools.finance.payment_preparation import attempt_payment_execution, validate_payment_preparation

REQUIRED_CONFIGS = [
    "INVOICE_DRAFT_POLICY.json",
    "ACCOUNTING_DRAFT_POLICY.json",
    "PAYMENT_PREPARATION_POLICY.json",
    "FINANCE_APPROVAL_POLICY.json",
]
REQUIRED_SCHEMAS = [
    "invoice_draft.schema.json",
    "accounting_entry_draft.schema.json",
    "payment_preparation.schema.json",
    "payment_approval_request.schema.json",
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


def validate_finance_contracts() -> list[str]:
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
        validate_invoice_draft(load_json(FIXTURE_DIR / "synthetic_invoice_draft.json"))
        validate_accounting_entry_draft(load_json(FIXTURE_DIR / "synthetic_accounting_entry.json"))
        validate_payment_preparation(load_json(FIXTURE_DIR / "synthetic_payment_preparation.json"))
        for fn, label in [
            (attempt_invoice_send, "invoice send"),
            (attempt_accounting_export, "accounting export"),
            (attempt_payment_execution, "payment execution"),
        ]:
            try:
                fn({})
                errors.append(f"{label} attempt was not blocked")
            except FinancePolicyError:
                pass
    except Exception as exc:
        errors.append(f"finance fixture validation failed: {exc}")
    return errors


def write_validation_results(errors: list[str]) -> None:
    status = "PASS" if not errors else "FAIL"
    lines = [
        "# Finance Validation Results",
        "",
        f"FINANCE_VALIDATION_RESULT={status}",
        "CONFIG_PARSE=PASS" if not any("config parse" in item for item in errors) else "CONFIG_PARSE=FAIL",
        "SCHEMAS_PARSE=PASS" if not any("schema parse" in item for item in errors) else "SCHEMAS_PARSE=FAIL",
        "OUTBOUND_EMAIL=OFF",
        "OUTBOUND_SOCIAL=OFF",
        "AUTO_SAFE=OFF",
        "PAYMENTS=OFF",
        "PRODUCTION_DB_WRITE=OFF",
        "INVOICE_SEND=OFF",
        "ACCOUNTING_EXPORT=OFF",
        "PAYMENT_EXECUTION_BLOCKED=PASS" if not any("payment execution" in item for item in errors) else "PAYMENT_EXECUTION_BLOCKED=FAIL",
        "",
        "## Errors",
    ]
    lines.extend(["- None"] if not errors else [f"- {error}" for error in errors])
    write_text(GENERATED_DIR / "FINANCE_VALIDATION_RESULTS.md", "\n".join(lines))


def main() -> int:
    errors = validate_finance_contracts()
    write_validation_results(errors)
    print(f"FINANCE_VALIDATION_RESULT={'PASS' if not errors else 'FAIL'}")
    for error in errors:
        print(f"ERROR: {error}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
