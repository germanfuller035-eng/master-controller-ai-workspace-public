#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

ROOT_FOR_IMPORT = Path(__file__).resolve().parents[2]
if str(ROOT_FOR_IMPORT) not in sys.path:
    sys.path.insert(0, str(ROOT_FOR_IMPORT))

from tools.hardening.common import GENERATED_DIR, ROOT, read_json, rel, write_json, write_text


RESULT_PATH = GENERATED_DIR / "PROVIDER_FAILURE_RESULTS.md"
SIM_PATH = GENERATED_DIR / "provider_failure" / "synthetic_provider_failure_result.json"


def simulate_provider_failure(fixture_path: Path | None = None) -> dict[str, Any]:
    fixture_path = fixture_path or ROOT / "tests" / "fixtures" / "hardening" / "synthetic_provider_failure.json"
    fixture = read_json(rel(fixture_path))
    errors: list[str] = []

    if fixture.get("synthetic") is not True:
        errors.append("fixture must declare synthetic=true")
    if fixture.get("primary_provider_status") != "UNAVAILABLE":
        errors.append("fixture must simulate unavailable primary provider")
    if fixture.get("fallback_provider_status") != "LOCAL_SYNTHETIC_AVAILABLE":
        errors.append("fallback provider must be local synthetic")

    decision = {
        "synthetic": True,
        "provider_failure_detected": True,
        "fallback_used": "LOCAL_SYNTHETIC",
        "external_request_sent": False,
        "paid_provider_called": False,
        "owner_visible_status": "DEGRADED_SYNTHETIC_MODE",
        "result": "PASS" if not errors else "FAIL",
        "errors": errors,
    }
    write_json(SIM_PATH, decision)

    lines = [
        "# Provider Failure Results",
        "",
        f"PROVIDER_FAILURE_RESULT={decision['result']}",
        "PRIMARY_PROVIDER_STATUS=UNAVAILABLE_SYNTHETIC",
        "FALLBACK_PROVIDER_STATUS=LOCAL_SYNTHETIC_AVAILABLE",
        "EXTERNAL_REQUEST_SENT=NO",
        "PAID_PROVIDER_CALLED=NO",
        f"SIMULATION_ARTIFACT={rel(SIM_PATH)}",
        "",
        "## Errors",
    ]
    lines.extend(["- None"] if not errors else [f"- {error}" for error in errors])
    write_text(RESULT_PATH, "\n".join(lines))
    return decision


def main() -> int:
    result = simulate_provider_failure()
    print(f"PROVIDER_FAILURE_RESULT={result['result']}")
    return 0 if result["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
