
#!/usr/bin/env python3
from __future__ import annotations
import subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
RESULT_PATH = ROOT / "_generated" / "sandbox_observability_evals_v1" / "SANDBOX_OBSERVABILITY_EVALS_TEST_RESULTS.md"
def run_step(name: str, args: list[str]) -> tuple[str, int, str]:
    result = subprocess.run([sys.executable, *args], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    return name, result.returncode, result.stdout.strip()
def main() -> int:
    steps = [
        ("SANDBOX_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/sandbox", "-p", "test_*.py"]),
        ("OBSERVABILITY_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/observability", "-p", "test_*.py"]),
        ("EVALS_UNIT_TEST_RESULT", ["-m", "unittest", "discover", "-s", "tests/evals", "-p", "test_*.py"]),
        ("SANDBOX_VALIDATION_RESULT", ["tools/sandbox/validate_sandbox.py"]),
        ("OBSERVABILITY_VALIDATION_RESULT", ["tools/observability/validate_observability.py"]),
        ("EVALS_VALIDATION_RESULT", ["tools/evals/validate_evals.py"]),
        ("SANDBOX_OBSERVABILITY_EVALS_VALIDATION_RESULT", ["tools/sandbox_observability_evals/validate_sandbox_observability_evals.py"]),
        ("RUNTIME_ROUTER_TEST_RESULT", ["tools/runtime/run_runtime_router_tests.py"]),
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
    overall = "PASS" if all(code == 0 for _, code, _ in results) else "FAIL"
    lines = ["# Sandbox Observability Evals Test Results", "", "SESSION_NAME=AGENT_SANDBOX_OBSERVABILITY_AND_EVALS_V1", f"SANDBOX_OBSERVABILITY_EVALS_TEST_RESULT={overall}"]
    for name, code, output in results:
        lines.extend([f"{name}={'PASS' if code == 0 else 'FAIL'}", "", "```", output[-4000:] if output else "(no output)", "```", ""])
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True); RESULT_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")
    print(f"SANDBOX_OBSERVABILITY_EVALS_TEST_RESULT={overall}")
    for name, code, _ in results: print(f"{name}={'PASS' if code == 0 else 'FAIL'}")
    return 0 if overall == "PASS" else 1
if __name__ == "__main__": raise SystemExit(main())
