#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.owner_control.core import GENERATED_DIR, run_stage_gate, write_closeout_reports, write_text

SNAPSHOT_DIRS = [
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


def snapshot_dirs() -> tuple[dict[Path, bytes], set[Path]]:
    snapshot: dict[Path, bytes] = {}
    original: set[Path] = set()
    for directory in SNAPSHOT_DIRS:
        if not directory.exists():
            continue
        for path in directory.rglob("*"):
            if path.is_file():
                original.add(path)
                snapshot[path] = path.read_bytes()
    return snapshot, original


def restore_dirs(snapshot: dict[Path, bytes], original: set[Path]) -> None:
    for directory in SNAPSHOT_DIRS:
        if not directory.exists():
            continue
        for path in sorted(directory.rglob("*"), reverse=True):
            if path.is_file() and path not in original:
                path.unlink()
    for path, data in snapshot.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def run_step(name: str, args: list[str]) -> tuple[str, int, str]:
    result = subprocess.run([sys.executable, *args], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    return name, result.returncode, result.stdout.strip()


def main() -> int:
    snapshot, original = snapshot_dirs()
    steps = [
        ("OWNER_CONTROL_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/owner_control", "-p", "test_*.py"]),
        ("OWNER_CONTROL_VALIDATION_RESULT", ["tools/owner_control/validate_owner_control.py"]),
        ("MULTICHANNEL_BROWSER_VOICE_TEST_RESULT", ["tools/multichannel/run_multichannel_browser_voice_tests.py"]),
        ("DIGITAL_FACTORY_TEST_RESULT", ["tools/digital_presence/run_digital_presence_tests.py"]),
        ("COMMERCIAL_TEST_RESULT", ["tools/commercial/run_commercial_tests.py"]),
        ("KNOWLEDGE_MEMORY_TEST_RESULT", ["tools/knowledge_memory/run_knowledge_memory_tests.py"]),
        ("SANDBOX_OBSERVABILITY_EVALS_TEST_RESULT", ["tools/sandbox_observability_evals/run_sandbox_observability_evals_tests.py"]),
        ("RUNTIME_ROUTER_TEST_RESULT", ["tools/runtime/run_runtime_router_tests.py"]),
        ("MCP_GATEWAY_TEST_RESULT", ["tools/mcp_gateway/run_mcp_gateway_tests.py"]),
        ("MCP_GATEWAY_VALIDATION_RESULT", ["tools/mcp_gateway/validate_mcp_gateway.py"]),
        ("POLICY_SECURITY_TEST_RESULT", ["tools/policy_security/run_all_policy_security_tests.py"]),
        ("POLICY_SECURITY_VALIDATION_RESULT", ["tools/policies/validate_policy_security.py"]),
        ("FOUNDATION_VALIDATION_RESULT", ["tools/foundation/validate_foundation.py"]),
    ]
    results = [run_step(name, args) for name, args in steps]
    restore_dirs(snapshot, original)
    gate = run_stage_gate()
    stage_status = gate["status"]
    overall = "PASS" if stage_status == "PASS" and all(code == 0 for _, code, _ in results) else "FAIL"
    lines = [
        "# Owner Control Test Results",
        "",
        "SESSION_NAME=WEB_COMMAND_CENTER_ANDROID_OWNER_CONTROL_V1",
        f"OWNER_CONTROL_TEST_RESULT={overall}",
        f"SESSION_LOCAL_GATE_STATUS={stage_status}",
        f"OWNER_CONTROL_SYNTHETIC_GATE={stage_status}",
    ]
    for name, code, output in results:
        lines.extend([f"{name}={'PASS' if code == 0 else 'FAIL'}", "", "~~~", output[-4000:] if output else "(no output)", "~~~", ""])
    write_text(GENERATED_DIR / "OWNER_CONTROL_TEST_RESULTS.md", "\n".join(lines))
    validation = "PASS" if any(name == "OWNER_CONTROL_VALIDATION_RESULT" and code == 0 for name, code, _ in results) else "FAIL"
    write_closeout_reports(test_status=overall, validation_status=validation, stage_status=stage_status)
    print(f"OWNER_CONTROL_TEST_RESULT={overall}")
    print(f"SESSION_LOCAL_GATE_STATUS={stage_status}")
    for name, code, _ in results:
        print(f"{name}={'PASS' if code == 0 else 'FAIL'}")
    return 0 if overall == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
