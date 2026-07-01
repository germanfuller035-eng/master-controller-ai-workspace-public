#!/usr/bin/env python3
"""Run the policy/security v1 synthetic suite."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
RESULT_PATH = ROOT / "_generated" / "policy_security_v1" / "POLICY_SECURITY_TEST_RESULTS.md"


def run_step(name: str, args: list[str]) -> tuple[str, int, str]:
    result = subprocess.run(
        [sys.executable, *args],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    return name, result.returncode, result.stdout.strip()


def main() -> int:
    foundation_result_path = ROOT / "_generated" / "foundation_v1" / "FOUNDATION_VALIDATION_RESULTS.md"
    foundation_result_before = foundation_result_path.read_text(encoding="utf-8") if foundation_result_path.exists() else None
    steps = [
        ("PAYLOAD_HASH_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/policy", "-p", "test_payload_hash.py"]),
        ("POLICY_DECISION_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/policy", "-p", "test_policy_decision.py"]),
        ("SECRET_SCAN_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/security", "-p", "test_secret_scanner.py"]),
        ("AUDIT_HASH_CHAIN_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/audit", "-p", "test_audit_hash_chain.py"]),
        ("STOP_SIMULATION_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/emergency", "-p", "test_stop_simulation.py"]),
        ("VALIDATION_RESULT", ["tools/policies/validate_policy_security.py"]),
        ("FOUNDATION_VALIDATION_RESULT", ["tools/foundation/validate_foundation.py"]),
    ]
    results = [run_step(name, args) for name, args in steps]
    if foundation_result_before is not None:
        foundation_result_path.write_text(foundation_result_before, encoding="utf-8", newline="\n")
    overall = "PASS" if all(code == 0 for _, code, _ in results) else "FAIL"

    lines = [
        "# Policy Security Test Results",
        "",
        "SESSION=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1",
        f"POLICY_SECURITY_TEST_RESULT={overall}",
    ]
    for name, code, output in results:
        lines.append(f"{name}={'PASS' if code == 0 else 'FAIL'}")
        lines.append("")
        lines.append("```")
        lines.append(output[-4000:] if output else "(no output)")
        lines.append("```")
        lines.append("")

    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")
    print(f"POLICY_SECURITY_TEST_RESULT={overall}")
    for name, code, _ in results:
        print(f"{name}={'PASS' if code == 0 else 'FAIL'}")
    return 0 if overall == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
