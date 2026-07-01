#!/usr/bin/env python3
from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT_FOR_IMPORT = Path(__file__).resolve().parents[2]
if str(ROOT_FOR_IMPORT) not in sys.path:
    sys.path.insert(0, str(ROOT_FOR_IMPORT))

from tools.hardening.backup_manifest import build_backup_manifest
from tools.hardening.build_rollback_bundle import build_rollback_bundle
from tools.hardening.common import GENERATED_DIR, run_python, write_text
from tools.hardening.provider_failure_sim import simulate_provider_failure
from tools.hardening.restart_recovery_sim import simulate_restart_recovery
from tools.hardening.restore_rehearsal import run_restore_rehearsal


RESULT_PATH = GENERATED_DIR / "HARDENING_TEST_RESULTS.md"


def main() -> int:
    start = time.perf_counter()
    preflight = {
        "backup_manifest": build_backup_manifest()["result"],
        "restore_rehearsal": run_restore_rehearsal()["result"],
        "provider_failure": simulate_provider_failure()["result"],
        "restart_recovery": simulate_restart_recovery()["result"],
        "rollback_bundle": build_rollback_bundle()["result"],
    }
    code, output = run_python(["-m", "unittest", "discover", "-s", "tests/hardening", "-p", "test_*.py"], timeout=300)
    result = "PASS" if code == 0 and all(value == "PASS" for value in preflight.values()) else "FAIL"
    duration = time.perf_counter() - start

    lines = [
        "# Hardening Test Results",
        "",
        f"HARDENING_TEST_RESULT={result}",
        f"DURATION_SECONDS={duration:.2f}",
    ]
    for key, value in preflight.items():
        lines.append(f"{key.upper()}_RESULT={value}")
    lines.extend(["", "## Unit Test Output", "```text", output[-8000:] if output else "(no output)", "```"])
    write_text(RESULT_PATH, "\n".join(lines))
    print(f"HARDENING_TEST_RESULT={result}")
    return 0 if result == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
