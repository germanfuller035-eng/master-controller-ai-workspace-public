
#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESULT_PATH = ROOT / "_generated" / "multichannel_browser_voice_v1" / "MULTICHANNEL_BROWSER_VOICE_TEST_RESULTS.md"
SNAPSHOT_DIRS = [
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
    existing: dict[Path, bytes] = {}
    all_files: set[Path] = set()
    for directory in SNAPSHOT_DIRS:
        if not directory.exists():
            continue
        for path in directory.rglob("*"):
            if path.is_file():
                all_files.add(path)
                existing[path] = path.read_bytes()
    return existing, all_files


def restore_dirs(snapshot: dict[Path, bytes], original_files: set[Path]) -> None:
    for directory in SNAPSHOT_DIRS:
        if directory.exists():
            for path in sorted(directory.rglob("*"), reverse=True):
                if path.is_file() and path not in original_files:
                    path.unlink()
    for path, data in snapshot.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def run_step(name: str, args: list[str]) -> tuple[str, int, str]:
    result = subprocess.run([sys.executable, *args], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    return name, result.returncode, result.stdout.strip()


def main() -> int:
    snapshot, original_files = snapshot_dirs()
    steps = [
        ("MULTICHANNEL_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/multichannel", "-p", "test_*.py"]),
        ("BROWSER_CONTRACT_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/browser_contracts", "-p", "test_*.py"]),
        ("VOICE_CONTRACT_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/voice_contracts", "-p", "test_*.py"]),
        ("MULTICHANNEL_VALIDATION_RESULT", ["tools/multichannel/validate_multichannel.py"]),
        ("BROWSER_CONTRACT_VALIDATION_RESULT", ["tools/browser_contracts/validate_browser_contracts.py"]),
        ("VOICE_CONTRACT_VALIDATION_RESULT", ["tools/voice_contracts/validate_voice_contracts.py"]),
        ("MULTICHANNEL_BROWSER_VOICE_VALIDATION_RESULT", ["tools/multichannel_browser_voice/validate_multichannel_browser_voice.py"]),
        ("SESSION_LOCAL_GATE_STATUS", ["tools/multichannel_browser_voice/stage_gate.py"]),
        ("DIGITAL_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/digital_presence", "-p", "test_*.py"]),
        ("DIGITAL_FACTORY_VALIDATION_RESULT", ["tools/digital_presence/validate_digital_factory.py"]),
        ("DIGITAL_STAGE_GATE_RESULT", ["-c", "from tools.digital_presence.core import run_stage_gate; r=run_stage_gate(); print('DIGITAL_STAGE_GATE_RESULT=' + r['status']); raise SystemExit(0 if r['status']=='PASS' else 1)"]),
        ("COMMERCIAL_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/commercial", "-p", "test_*.py"]),
        ("COMMERCIAL_VALIDATION_RESULT", ["tools/commercial/validate_commercial_factory.py"]),
        ("COMMERCIAL_STAGE_GATE_RESULT", ["-c", "from tools.commercial.core import run_stage_gate; r=run_stage_gate(); print('COMMERCIAL_STAGE_GATE_RESULT=' + r['status']); raise SystemExit(0 if r['status']=='PASS' else 1)"]),
        ("KNOWLEDGE_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/knowledge", "-p", "test_*.py"]),
        ("MEMORY_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/memory", "-p", "test_*.py"]),
        ("KNOWLEDGE_VALIDATION_RESULT", ["tools/knowledge/validate_knowledge.py"]),
        ("MEMORY_VALIDATION_RESULT", ["tools/memory/validate_memory.py"]),
        ("KNOWLEDGE_MEMORY_VALIDATION_RESULT", ["tools/knowledge_memory/validate_knowledge_memory.py"]),
        ("KNOWLEDGE_MEMORY_STAGE_GATE_RESULT", ["tools/knowledge_memory/stage_gate.py"]),
        ("SANDBOX_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/sandbox", "-p", "test_*.py"]),
        ("OBSERVABILITY_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/observability", "-p", "test_*.py"]),
        ("EVALS_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/evals", "-p", "test_*.py"]),
        ("SANDBOX_VALIDATION_RESULT", ["tools/sandbox/validate_sandbox.py"]),
        ("OBSERVABILITY_VALIDATION_RESULT", ["tools/observability/validate_observability.py"]),
        ("EVALS_VALIDATION_RESULT", ["tools/evals/validate_evals.py"]),
        ("SANDBOX_OBSERVABILITY_EVALS_VALIDATION_RESULT", ["tools/sandbox_observability_evals/validate_sandbox_observability_evals.py"]),
        ("RUNTIME_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/runtime", "-p", "test_*.py"]),
        ("MODEL_ROUTER_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/model_router", "-p", "test_*.py"]),
        ("COST_GOVERNOR_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/cost_governor", "-p", "test_*.py"]),
        ("RUNTIME_VALIDATION_RESULT", ["tools/runtime/validate_runtime.py"]),
        ("MODEL_ROUTER_VALIDATION_RESULT", ["tools/model_router/validate_model_router.py"]),
        ("COST_GOVERNOR_VALIDATION_RESULT", ["tools/cost_governor/validate_cost_governor.py"]),
        ("MCP_GATEWAY_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/mcp_gateway", "-p", "test_*.py"]),
        ("MCP_GATEWAY_VALIDATION_RESULT", ["tools/mcp_gateway/validate_mcp_gateway.py"]),
        ("PAYLOAD_HASH_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/policy", "-p", "test_payload_hash.py"]),
        ("POLICY_DECISION_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/policy", "-p", "test_policy_decision.py"]),
        ("SECRET_SCAN_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/security", "-p", "test_secret_scanner.py"]),
        ("AUDIT_HASH_CHAIN_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/audit", "-p", "test_audit_hash_chain.py"]),
        ("STOP_SIMULATION_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/emergency", "-p", "test_stop_simulation.py"]),
        ("POLICY_SECURITY_VALIDATION_RESULT", ["tools/policies/validate_policy_security.py"]),
        ("FOUNDATION_VALIDATION_RESULT", ["tools/foundation/validate_foundation.py"]),
    ]
    results = [run_step(name, args) for name, args in steps]
    restore_dirs(snapshot, original_files)
    overall = "PASS" if all(code == 0 for _, code, _ in results) else "FAIL"
    lines = [
        "# Multichannel Browser Voice Test Results",
        "",
        "SESSION_NAME=MULTICHANNEL_COMMUNICATION_BROWSER_AND_VOICE_V1",
        f"MULTICHANNEL_BROWSER_VOICE_TEST_RESULT={overall}",
    ]
    for name, code, output in results:
        lines.extend([f"{name}={'PASS' if code == 0 else 'FAIL'}", "", "~~~", output[-4000:] if output else "(no output)", "~~~", ""])
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")
    print(f"MULTICHANNEL_BROWSER_VOICE_TEST_RESULT={overall}")
    for name, code, _ in results:
        print(f"{name}={'PASS' if code == 0 else 'FAIL'}")
    return 0 if overall == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
