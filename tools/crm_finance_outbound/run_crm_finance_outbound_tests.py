#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESULT_PATH = ROOT / "_generated" / "crm_finance_outbound_v1" / "CRM_FINANCE_OUTBOUND_TEST_RESULTS.md"
SNAPSHOT_DIRS = [
    ROOT / "_generated" / "owner_control_v1",
    ROOT / "_generated" / "multichannel_browser_voice_v1",
    ROOT / "_generated" / "digital_presence_factory_v1",
    ROOT / "_generated" / "commercial_agent_factory_v1",
    ROOT / "_generated" / "knowledge_memory_v1",
    ROOT / "_generated" / "sandbox_observability_evals_v1",
    ROOT / "_generated" / "runtime_router_v1",
    ROOT / "_generated" / "mcp_gateway_v1",
    ROOT / "_generated" / "policy_security_v1",
    ROOT / "_generated" / "foundation_v1",
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


def snapshot_external_generated() -> dict[Path, bytes | None]:
    paths: set[Path] = set()
    for directory in SNAPSHOT_DIRS:
        if directory.exists():
            paths.update(path for path in directory.rglob("*") if path.is_file())
    return {path: path.read_bytes() for path in paths}


def restore_external_generated(snapshot: dict[Path, bytes | None]) -> None:
    snapshot_paths = set(snapshot)
    for directory in SNAPSHOT_DIRS:
        if not directory.exists():
            continue
        for path in sorted((item for item in directory.rglob("*") if item.is_file()), reverse=True):
            if path not in snapshot_paths:
                path.unlink()
    for path, content in snapshot.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content or b"")


def main() -> int:
    include_cross_stage = "--local-only" not in sys.argv
    steps = [
        ("CRM_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/crm"]),
        ("FINANCE_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/finance"]),
        ("CONTROLLED_OUTBOUND_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/controlled_outbound"]),
        ("CRM_VALIDATION_RESULT", ["tools/crm/validate_crm.py"]),
        ("FINANCE_VALIDATION_RESULT", ["tools/finance/validate_finance.py"]),
        ("CONTROLLED_OUTBOUND_VALIDATION_RESULT", ["tools/controlled_outbound/validate_controlled_outbound.py"]),
        ("CRM_FINANCE_OUTBOUND_VALIDATION_RESULT", ["tools/crm_finance_outbound/validate_crm_finance_outbound.py"]),
    ]
    if include_cross_stage:
        steps.extend(
            [
                ("OWNER_CONTROL_TEST_RESULT", ["tools/owner_control/run_owner_control_tests.py"]),
                ("MULTICHANNEL_BROWSER_VOICE_TEST_RESULT", ["tools/multichannel/run_multichannel_browser_voice_tests.py"]),
                ("DIGITAL_FACTORY_TEST_RESULT", ["tools/digital_presence/run_digital_presence_tests.py"]),
                ("COMMERCIAL_TEST_RESULT", ["tools/commercial/run_commercial_tests.py"]),
                ("KNOWLEDGE_MEMORY_TEST_RESULT", ["tools/knowledge_memory/run_knowledge_memory_tests.py"]),
                ("SANDBOX_OBSERVABILITY_EVALS_TEST_RESULT", ["tools/sandbox_observability_evals/run_sandbox_observability_evals_tests.py"]),
                ("RUNTIME_ROUTER_TEST_RESULT", ["tools/runtime/run_runtime_router_tests.py"]),
                ("MCP_GATEWAY_VALIDATION_RESULT", ["tools/mcp_gateway/validate_mcp_gateway.py"]),
                ("MCP_GATEWAY_TEST_RESULT", ["tools/mcp_gateway/run_mcp_gateway_tests.py"]),
                ("POLICY_SECURITY_VALIDATION_RESULT", ["tools/policies/validate_policy_security.py"]),
                ("POLICY_SECURITY_TEST_RESULT", ["tools/policy_security/run_all_policy_security_tests.py"]),
                ("FOUNDATION_VALIDATION_RESULT", ["tools/foundation/validate_foundation.py"]),
            ]
        )
    snapshot = snapshot_external_generated()
    results = [run_step(name, args) for name, args in steps]
    restore_external_generated(snapshot)
    overall = "PASS" if all(code == 0 for _, code, _ in results) else "FAIL"
    lines = [
        "# CRM Finance Outbound Test Results",
        "",
        "SESSION_NAME=CRM_FINANCE_ACCOUNTING_AND_CONTROLLED_OUTBOUND_V1",
        f"CRM_FINANCE_OUTBOUND_TEST_RESULT={overall}",
        f"CROSS_STAGE_INCLUDED={'YES' if include_cross_stage else 'NO'}",
    ]
    for name, code, output in results:
        lines.extend([f"{name}={'PASS' if code == 0 else 'FAIL'}", "", "~~~", output[-4000:] if output else "(no output)", "~~~", ""])
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")
    print(f"CRM_FINANCE_OUTBOUND_TEST_RESULT={overall}")
    for name, code, _ in results:
        print(f"{name}={'PASS' if code == 0 else 'FAIL'}")
    return 0 if overall == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
