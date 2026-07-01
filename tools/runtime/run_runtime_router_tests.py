#!/usr/bin/env python3
"""Run runtime, model router, cost governor, and dependency validators."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
RESULT_PATH = ROOT / "_generated" / "runtime_router_v1" / "RUNTIME_ROUTER_TEST_RESULTS.md"
SNAPSHOT_PATHS = [
    ROOT / "_generated" / "mcp_gateway_v1" / "MCP_GATEWAY_VALIDATION_RESULTS.md",
    ROOT / "_generated" / "mcp_gateway_v1" / "MCP_GATEWAY_TEST_RESULTS.md",
    ROOT / "_generated" / "mcp_gateway_v1" / "artifacts" / "artifact_manifest.jsonl",
    ROOT / "_generated" / "policy_security_v1" / "POLICY_SECURITY_VALIDATION_RESULTS.md",
    ROOT / "_generated" / "policy_security_v1" / "POLICY_SECURITY_TEST_RESULTS.md",
    ROOT / "_generated" / "foundation_v1" / "FOUNDATION_VALIDATION_RESULTS.md",
]


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


def snapshot_files() -> dict[Path, str | None]:
    return {path: path.read_text(encoding="utf-8") if path.exists() else None for path in SNAPSHOT_PATHS}


def restore_files(snapshot: dict[Path, str | None]) -> None:
    for path, content in snapshot.items():
        if content is None:
            if path.exists():
                path.unlink()
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="\n")


def main() -> int:
    snapshot = snapshot_files()
    steps = [
        ("RUNTIME_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/runtime", "-p", "test_*.py"]),
        ("MODEL_ROUTER_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/model_router", "-p", "test_*.py"]),
        ("COST_GOVERNOR_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/cost_governor", "-p", "test_*.py"]),
        ("RUNTIME_VALIDATION_RESULT", ["tools/runtime/validate_runtime.py"]),
        ("MODEL_ROUTER_VALIDATION_RESULT", ["tools/model_router/validate_model_router.py"]),
        ("COST_GOVERNOR_VALIDATION_RESULT", ["tools/cost_governor/validate_cost_governor.py"]),
        ("MCP_GATEWAY_TEST_RESULT", ["tools/mcp_gateway/run_mcp_gateway_tests.py"]),
        ("MCP_GATEWAY_VALIDATION_RESULT", ["tools/mcp_gateway/validate_mcp_gateway.py"]),
        ("POLICY_SECURITY_VALIDATION_RESULT", ["tools/policies/validate_policy_security.py"]),
        ("POLICY_SECURITY_TEST_RESULT", ["tools/policy_security/run_all_policy_security_tests.py"]),
        ("FOUNDATION_VALIDATION_RESULT", ["tools/foundation/validate_foundation.py"]),
    ]
    results = [run_step(name, args) for name, args in steps]
    restore_files(snapshot)
    overall = "PASS" if all(code == 0 for _, code, _ in results) else "FAIL"
    lines = [
        "# Runtime Router Test Results",
        "",
        "SESSION=VOLTAGENT_RUNTIME_MODEL_ROUTER_AND_COST_GOVERNOR_V1",
        f"RUNTIME_ROUTER_TEST_RESULT={overall}",
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
    print(f"RUNTIME_ROUTER_TEST_RESULT={overall}")
    for name, code, _ in results:
        print(f"{name}={'PASS' if code == 0 else 'FAIL'}")
    return 0 if overall == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
