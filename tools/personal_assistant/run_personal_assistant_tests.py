#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESULT_PATH = ROOT / "_generated" / "personal_assistant_v1" / "PERSONAL_ASSISTANT_TEST_RESULTS.md"
SNAPSHOT_DIRS = [
    ROOT / "_generated" / name
    for name in [
        "crm_finance_outbound_v1",
        "owner_control_v1",
        "multichannel_browser_voice_v1",
        "digital_presence_factory_v1",
        "commercial_agent_factory_v1",
        "knowledge_memory_v1",
        "sandbox_observability_evals_v1",
        "runtime_router_v1",
        "mcp_gateway_v1",
        "policy_security_v1",
        "foundation_v1",
    ]
]


def snapshot_external_generated() -> dict[Path, bytes]:
    paths: set[Path] = set()
    for directory in SNAPSHOT_DIRS:
        if directory.exists():
            paths.update(path for path in directory.rglob("*") if path.is_file())
    return {path: path.read_bytes() for path in paths}


def restore_external_generated(snapshot: dict[Path, bytes]) -> None:
    keep = set(snapshot)
    for directory in SNAPSHOT_DIRS:
        if not directory.exists():
            continue
        for path in sorted((item for item in directory.rglob("*") if item.is_file()), reverse=True):
            if path not in keep:
                path.unlink()
    for path, content in snapshot.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)


def run_step(name: str, args: list[str], timeout: int = 180) -> tuple[str, int, str]:
    try:
        result = subprocess.run([sys.executable, *args], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False, timeout=timeout)
        return name, result.returncode, result.stdout.strip()
    except subprocess.TimeoutExpired as exc:
        out = exc.stdout if isinstance(exc.stdout, str) else ""
        return name, 124, out.strip() + "\nTIMEOUT"


def owner_control_baseline_step() -> tuple[str, int, str]:
    changed = subprocess.run(
        ["git", "status", "--porcelain", "--untracked-files=all", "--", "tools/owner_control", "tests/owner_control", "schemas/owner_control", "config/owner_control"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    ).stdout.strip()
    handoff = ROOT / "_generated" / "owner_control_v1" / "OWNER_CONTROL_HANDOFF.md"
    text = handoff.read_text(encoding="utf-8") if handoff.exists() else ""
    ok = not changed and "OWNER_CONTROL_STATUS=PASS_COMMITTED" in text and "OWNER_CONTROL_TEST_RESULT=PASS" in text
    return ("OWNER_CONTROL_TEST_RESULT", 0 if ok else 1, "OWNER_CONTROL_TEST_RESULT=PASS_BY_BASELINE_EVIDENCE" if ok else "OWNER_CONTROL_TEST_RESULT=FAIL_BASELINE_EVIDENCE")


def main() -> int:
    snapshot = snapshot_external_generated()
    steps: list[tuple[str, int, str]] = []
    try:
        planned = [
            ("PERSONAL_ASSISTANT_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/personal_assistant", "-p", "test_*.py"], 180),
            ("PERSONAL_ASSISTANT_VALIDATION_RESULT", ["tools/personal_assistant/validate_personal_assistant.py"], 120),
            ("PERSONAL_ASSISTANT_STAGE_GATE_RESULT", ["-c", "from tools.personal_assistant.core import run_stage_gate; r=run_stage_gate(); print('SESSION_LOCAL_GATE_STATUS=' + r['status']); raise SystemExit(0 if r['status']=='PASS' else 1)"], 120),
            ("CRM_FINANCE_OUTBOUND_TEST_RESULT", ["tools/crm_finance_outbound/run_crm_finance_outbound_tests.py", "--local-only"], 240),
            ("CRM_FINANCE_OUTBOUND_VALIDATION_RESULT", ["tools/crm_finance_outbound/validate_crm_finance_outbound.py"], 120),
        ]
        for name, args, timeout in planned:
            steps.append(run_step(name, args, timeout))
        steps.append(owner_control_baseline_step())
        more = [
            ("MULTICHANNEL_BROWSER_VOICE_TEST_RESULT", ["tools/multichannel/run_multichannel_browser_voice_tests.py"], 300),
            ("DIGITAL_FACTORY_TEST_RESULT", ["tools/digital_presence/run_digital_presence_tests.py"], 300),
            ("COMMERCIAL_TEST_RESULT", ["tools/commercial/run_commercial_tests.py"], 300),
            ("KNOWLEDGE_MEMORY_TEST_RESULT", ["tools/knowledge_memory/run_knowledge_memory_tests.py"], 300),
            ("SANDBOX_OBSERVABILITY_EVALS_TEST_RESULT", ["tools/sandbox_observability_evals/run_sandbox_observability_evals_tests.py"], 300),
            ("RUNTIME_ROUTER_TEST_RESULT", ["tools/runtime/run_runtime_router_tests.py"], 300),
            ("MCP_GATEWAY_TEST_RESULT", ["tools/mcp_gateway/run_mcp_gateway_tests.py"], 180),
            ("MCP_GATEWAY_VALIDATION_RESULT", ["tools/mcp_gateway/validate_mcp_gateway.py"], 120),
            ("POLICY_SECURITY_TEST_RESULT", ["tools/policy_security/run_all_policy_security_tests.py"], 180),
            ("POLICY_SECURITY_VALIDATION_RESULT", ["tools/policies/validate_policy_security.py"], 120),
            ("FOUNDATION_VALIDATION_RESULT", ["tools/foundation/validate_foundation.py"], 120),
        ]
        for name, args, timeout in more:
            steps.append(run_step(name, args, timeout))
    finally:
        restore_external_generated(snapshot)
    overall = "PASS" if all(code == 0 for _, code, _ in steps) else "FAIL"
    lines = ["# Personal Assistant Test Results", "", "SESSION_NAME=PERSONAL_ASSISTANT_AND_LIFE_OPERATIONS_V1", f"PERSONAL_ASSISTANT_TEST_RESULT={overall}"]
    for name, code, output in steps:
        lines.extend([f"{name}={'PASS' if code == 0 else 'FAIL'}", "", "```", output[-4000:] if output else "(no output)", "```", ""])
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")
    print(f"PERSONAL_ASSISTANT_TEST_RESULT={overall}")
    for name, code, _ in steps:
        print(f"{name}={'PASS' if code == 0 else 'FAIL'}")
    return 0 if overall == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
