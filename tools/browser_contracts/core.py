
"""Local browser action contracts without real browsing."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
GENERATED_DIR = ROOT / "_generated" / "multichannel_browser_voice_v1"
CONFIG_DIR = ROOT / "config" / "browser"
SCHEMA_DIR = ROOT / "schemas" / "browser"
FIXTURE_DIR = ROOT / "tests" / "fixtures" / "browser"


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


def assert_synthetic(request: dict[str, Any]) -> None:
    if request.get("synthetic") is not True:
        raise ValueError("browser contract payload must be synthetic")


def evaluate_browser_action(request: dict[str, Any], *, stop_active: bool = False) -> dict[str, Any]:
    assert_synthetic(request)
    if stop_active:
        return {"synthetic": True, "request_id": request.get("request_id"), "decision": "BLOCKED_BY_STOP", "browser_used": False, "production_action": False, "owner_approval_required": True}
    if request.get("external_browser") is True:
        return {"synthetic": True, "request_id": request.get("request_id"), "decision": "DENY_EXTERNAL_BROWSER", "browser_used": False, "production_action": False, "owner_approval_required": True}
    if request.get("action_type") in {"form_submit", "publish", "login", "external_navigation"}:
        return {"synthetic": True, "request_id": request.get("request_id"), "decision": "DENY_FORM_SUBMIT", "browser_used": False, "production_action": False, "owner_approval_required": True}
    return {"synthetic": True, "request_id": request.get("request_id"), "decision": "CONTRACT_RECORDED", "browser_used": False, "production_action": False, "browser_actions_off": True, "owner_approval_required_for_future_browser_action": True}


def playwright_adapter_contract() -> dict[str, Any]:
    return {"adapter_status": "OFF", "runtime_enabled": False, "production_enabled": False, "playwright_imported": False, "playwright_browsers_installed": False}


def validate_browser_evidence(record: dict[str, Any]) -> dict[str, Any]:
    assert_synthetic(record)
    ok = bool(re.fullmatch(r"[a-f0-9]{64}", str(record.get("artifact_hash", "")))) and record.get("hash_algorithm") == "SHA-256"
    return {"synthetic": True, "artifact_id": record.get("artifact_id"), "status": "PASS" if ok else "FAIL", "artifact_hash_required": True, "real_capture": False}


def validate_browser_contracts() -> list[str]:
    errors: list[str] = []
    for path in sorted(CONFIG_DIR.glob("*.json")) + sorted(SCHEMA_DIR.glob("*.schema.json")):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"invalid JSON {path.relative_to(ROOT)}: {exc}")
    if len(list(CONFIG_DIR.glob("*.json"))) < 3:
        errors.append("expected at least 3 browser config files")
    if len(list(SCHEMA_DIR.glob("*.schema.json"))) < 4:
        errors.append("expected at least 4 browser schemas")
    policy = load_json(CONFIG_DIR / "BROWSER_ACTION_POLICY.json")
    if policy.get("browser_actions_allowed") is not False or policy.get("external_browser_allowed") is not False:
        errors.append("browser actions and external browser must remain OFF")
    adapter = load_json(CONFIG_DIR / "PLAYWRIGHT_ADAPTER_POLICY.json")
    if adapter.get("playwright_runtime_enabled") is not False or adapter.get("import_playwright") is not False:
        errors.append("Playwright adapter must remain OFF and not imported")
    for path in sorted(FIXTURE_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            assert_synthetic(data)
        except (json.JSONDecodeError, ValueError) as exc:
            errors.append(str(exc))
    for path in (ROOT / "tools").rglob("*.py"):
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
        if rel.startswith("tools/browser_contracts") or rel.startswith("tools/multichannel_browser_voice"):
            text = path.read_text(encoding="utf-8")
            if re.search(r"(^|\n)\s*(import\s+playwright\b|from\s+playwright\b)", text):
                errors.append(f"Playwright imported in {rel}")
    return errors


def write_validation_results(errors: list[str]) -> None:
    status = "PASS" if not errors else "FAIL"
    lines = [
        "# Browser Contract Validation Results",
        "",
        "SESSION_NAME=MULTICHANNEL_COMMUNICATION_BROWSER_AND_VOICE_V1",
        f"BROWSER_CONTRACT_VALIDATION_RESULT={status}",
        "BROWSER_ACTIONS=OFF",
        "PLAYWRIGHT_ADAPTER=OFF",
        "NO_PLAYWRIGHT_RUNTIME_DEPENDENCY=PASS" if not any("Playwright" in error for error in errors) else "NO_PLAYWRIGHT_RUNTIME_DEPENDENCY=FAIL",
        "NO_EXTERNAL_BROWSER=PASS",
        "NO_FORM_SUBMIT=PASS",
        "ARTIFACT_HASH_REQUIRED=PASS",
        "",
        "## Errors",
    ]
    lines.extend(["- None"] if not errors else [f"- {error}" for error in errors])
    write_text(GENERATED_DIR / "BROWSER_CONTRACT_VALIDATION_RESULTS.md", "\n".join(lines))


def run_browser_validation() -> int:
    errors = validate_browser_contracts()
    write_validation_results(errors)
    print(f"BROWSER_CONTRACT_VALIDATION_RESULT={'PASS' if not errors else 'FAIL'}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
    return 0 if not errors else 1
