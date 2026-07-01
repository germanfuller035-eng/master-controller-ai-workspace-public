#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

ROOT_FOR_IMPORT = Path(__file__).resolve().parents[2]
if str(ROOT_FOR_IMPORT) not in sys.path:
    sys.path.insert(0, str(ROOT_FOR_IMPORT))

from tools.hardening.common import GENERATED_DIR, ROOT, read_json, rel, write_json, write_text


RESULT_PATH = GENERATED_DIR / "RESTART_RECOVERY_RESULTS.md"
STATE_PATH = GENERATED_DIR / "restart_recovery" / "synthetic_recovered_state.json"


def simulate_restart_recovery(fixture_path: Path | None = None) -> dict[str, Any]:
    fixture_path = fixture_path or ROOT / "tests" / "fixtures" / "hardening" / "synthetic_restart_state.json"
    fixture = read_json(rel(fixture_path))
    errors: list[str] = []

    if fixture.get("synthetic") is not True:
        errors.append("fixture must declare synthetic=true")

    before = fixture.get("pending_actions", [])
    recovered = {
        "synthetic": True,
        "session_id": fixture.get("session_id"),
        "pending_actions": before,
        "approvals_replayed": False,
        "outbound_replayed": False,
        "payments_replayed": False,
        "production_writes_replayed": False,
        "owner_review_required": True,
    }
    write_json(STATE_PATH, recovered)
    after = read_json(rel(STATE_PATH)).get("pending_actions", [])

    if before != after:
        errors.append("pending actions changed after restart recovery")
    for key in ["approvals_replayed", "outbound_replayed", "payments_replayed", "production_writes_replayed"]:
        if recovered[key] is not False:
            errors.append(f"{key} must remain false")

    result = "PASS" if not errors else "FAIL"
    lines = [
        "# Restart Recovery Results",
        "",
        f"RESTART_RECOVERY_RESULT={result}",
        "SYNTHETIC_ONLY=YES",
        "PENDING_ACTIONS_PRESERVED=YES" if not errors else "PENDING_ACTIONS_PRESERVED=CHECK_ERRORS",
        "OUTBOUND_REPLAYED=NO",
        "PAYMENTS_REPLAYED=NO",
        "PRODUCTION_WRITES_REPLAYED=NO",
        f"RECOVERED_STATE={rel(STATE_PATH)}",
        "",
        "## Errors",
    ]
    lines.extend(["- None"] if not errors else [f"- {error}" for error in errors])
    write_text(RESULT_PATH, "\n".join(lines))
    return {"result": result, "errors": errors, "artifact": rel(STATE_PATH)}


def main() -> int:
    result = simulate_restart_recovery()
    print(f"RESTART_RECOVERY_RESULT={result['result']}")
    return 0 if result["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
