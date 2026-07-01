#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESULT_PATH = ROOT / "_generated" / "commercial_agent_factory_v1" / "COMMERCIAL_AGENT_FACTORY_TEST_RESULTS.md"
SNAPSHOT_PATHS = [
    ROOT / "_generated" / "knowledge_memory_v1" / "KNOWLEDGE_MEMORY_TEST_RESULTS.md",
    ROOT / "_generated" / "knowledge_memory_v1" / "KNOWLEDGE_MEMORY_VALIDATION_RESULTS.md",
    ROOT / "_generated" / "sandbox_observability_evals_v1" / "SANDBOX_OBSERVABILITY_EVALS_TEST_RESULTS.md",
    ROOT / "_generated" / "sandbox_observability_evals_v1" / "SANDBOX_OBSERVABILITY_EVALS_VALIDATION_RESULTS.md",
    ROOT / "_generated" / "runtime_router_v1" / "RUNTIME_ROUTER_TEST_RESULTS.md",
    ROOT / "_generated" / "mcp_gateway_v1" / "MCP_GATEWAY_TEST_RESULTS.md",
    ROOT / "_generated" / "mcp_gateway_v1" / "MCP_GATEWAY_VALIDATION_RESULTS.md",
    ROOT / "_generated" / "mcp_gateway_v1" / "artifacts" / "artifact_manifest.jsonl",
    ROOT / "_generated" / "policy_security_v1" / "POLICY_SECURITY_TEST_RESULTS.md",
    ROOT / "_generated" / "policy_security_v1" / "POLICY_SECURITY_VALIDATION_RESULTS.md",
    ROOT / "_generated" / "foundation_v1" / "FOUNDATION_VALIDATION_RESULTS.md",
]

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

def run_step(name: str, args: list[str]) -> tuple[str, int, str]:
    result = subprocess.run([sys.executable, *args], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    return name, result.returncode, result.stdout.strip()

def main() -> int:
    snapshot = snapshot_files()
    steps = [
        ("COMMERCIAL_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/commercial", "-p", "test_*.py"]),
        ("COMMERCIAL_VALIDATION_RESULT", ["tools/commercial/validate_commercial_factory.py"]),
        ("COMMERCIAL_STAGE_GATE_RESULT", ["-c", "from tools.commercial.core import run_stage_gate; r=run_stage_gate(); print('SESSION_LOCAL_GATE_STATUS=' + r['status']); raise SystemExit(0 if r['status']=='PASS' else 1)"]),
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
    restore_files(snapshot)
    overall = "PASS" if all(code == 0 for _, code, _ in results) else "FAIL"
    lines = ["# Commercial Agent Factory Test Results", "", "SESSION_NAME=COMMERCIAL_AGENT_FACTORY_V1", f"COMMERCIAL_TEST_RESULT={overall}"]
    for name, code, output in results:
        lines.extend([f"{name}={'PASS' if code == 0 else 'FAIL'}", "", "~~~", output[-4000:] if output else "(no output)", "~~~", ""])
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")
    print(f"COMMERCIAL_TEST_RESULT={overall}")
    for name, code, _ in results:
        print(f"{name}={'PASS' if code == 0 else 'FAIL'}")
    return 0 if overall == "PASS" else 1

if __name__ == "__main__":
    raise SystemExit(main())
