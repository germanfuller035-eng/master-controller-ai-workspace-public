#!/usr/bin/env python3
"""Run the MCP Gateway v1 synthetic suite."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
RESULT_PATH = ROOT / "_generated" / "mcp_gateway_v1" / "MCP_GATEWAY_TEST_RESULTS.md"


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
    steps = [
        ("MCP_GATEWAY_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/mcp_gateway", "-p", "test_*.py"]),
        ("MCP_GATEWAY_VALIDATOR_RESULT", ["tools/mcp_gateway/validate_mcp_gateway.py"]),
    ]
    results = [run_step(name, args) for name, args in steps]
    overall = "PASS" if all(code == 0 for _, code, _ in results) else "FAIL"
    lines = [
        "# MCP Gateway Test Results",
        "",
        "SESSION=MASTER_CONTROLLER_MCP_GATEWAY_V1",
        f"MCP_GATEWAY_TEST_RESULT={overall}",
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
    print(f"MCP_GATEWAY_TEST_RESULT={overall}")
    for name, code, _ in results:
        print(f"{name}={'PASS' if code == 0 else 'FAIL'}")
    return 0 if overall == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
