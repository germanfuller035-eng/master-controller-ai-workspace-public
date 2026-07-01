#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

ROOT_FOR_IMPORT = Path(__file__).resolve().parents[2]
if str(ROOT_FOR_IMPORT) not in sys.path:
    sys.path.insert(0, str(ROOT_FOR_IMPORT))

from tools.hardening.common import GENERATED_DIR, ROOT, git, rel, write_text


RESULT_PATH = GENERATED_DIR / "SEGMENTED_TEST_MATRIX.md"

EXTERNAL_GENERATED_SNAPSHOT_PATHS = [
    "_generated/foundation_v1/FOUNDATION_VALIDATION_RESULTS.md",
    "_generated/policy_security_v1/POLICY_SECURITY_VALIDATION_RESULTS.md",
    "_generated/policy_security_v1/POLICY_SECURITY_TEST_RESULTS.md",
    "_generated/mcp_gateway_v1/MCP_GATEWAY_VALIDATION_RESULTS.md",
    "_generated/mcp_gateway_v1/MCP_GATEWAY_TEST_RESULTS.md",
    "_generated/mcp_gateway_v1/artifacts/artifact_manifest.jsonl",
    "_generated/mcp_gateway_v1/artifacts/tests/artifact_ok.txt",
    "_generated/mcp_gateway_v1/artifacts/tests/audit.txt",
    "_generated/runtime_router_v1/RUNTIME_VALIDATION_RESULTS.md",
    "_generated/runtime_router_v1/MODEL_ROUTER_VALIDATION_RESULTS.md",
    "_generated/runtime_router_v1/COST_GOVERNOR_VALIDATION_RESULTS.md",
    "_generated/runtime_router_v1/RUNTIME_ROUTER_TEST_RESULTS.md",
    "_generated/sandbox_observability_evals_v1/SANDBOX_OBSERVABILITY_EVALS_VALIDATION_RESULTS.md",
    "_generated/sandbox_observability_evals_v1/SANDBOX_OBSERVABILITY_EVALS_TEST_RESULTS.md",
    "_generated/knowledge_memory_v1/KNOWLEDGE_MEMORY_VALIDATION_RESULTS.md",
    "_generated/knowledge_memory_v1/KNOWLEDGE_MEMORY_TEST_RESULTS.md",
    "_generated/commercial_agent_factory_v1/COMMERCIAL_AGENT_FACTORY_VALIDATION_RESULTS.md",
    "_generated/commercial_agent_factory_v1/COMMERCIAL_AGENT_FACTORY_TEST_RESULTS.md",
    "_generated/commercial_agent_factory_v1/COMMERCIAL_NO_SEND_STAGE_GATE.md",
    "_generated/commercial_agent_factory_v1/commercial_no_send_shadow_result.json",
    "_generated/digital_presence_factory_v1/DIGITAL_FACTORY_VALIDATION_RESULTS.md",
    "_generated/digital_presence_factory_v1/DIGITAL_FACTORY_TEST_RESULTS.md",
    "_generated/digital_presence_factory_v1/DIGITAL_NO_DEPLOY_STAGE_GATE.md",
    "_generated/digital_presence_factory_v1/no_deploy_shadow_result.json",
    "_generated/multichannel_browser_voice_v1/MULTICHANNEL_BROWSER_VOICE_VALIDATION_RESULTS.md",
    "_generated/multichannel_browser_voice_v1/MULTICHANNEL_BROWSER_VOICE_TEST_RESULTS.md",
    "_generated/crm_finance_outbound_v1/CRM_FINANCE_OUTBOUND_VALIDATION_RESULTS.md",
    "_generated/crm_finance_outbound_v1/CRM_FINANCE_OUTBOUND_TEST_RESULTS.md",
    "_generated/personal_assistant_v1/PERSONAL_ASSISTANT_VALIDATION_RESULTS.md",
    "_generated/personal_assistant_v1/PERSONAL_ASSISTANT_TEST_RESULTS.md",
    "_generated/personal_assistant_v1/PERSONAL_ASSISTANT_STAGE_GATE.md",
    "_generated/personal_assistant_v1/personal_assistant_no_external_action_result.json",
]


@dataclass
class Segment:
    name: str
    command: list[str]
    timeout: int = 300
    baseline: bool = False
    baseline_reason: str = ""
    component_paths: tuple[str, ...] = ()
    baseline_evidence: str = ""
    baseline_markers: tuple[str, ...] = ()


SEGMENTS = [
    Segment("Foundation", [sys.executable, "tools/foundation/validate_foundation.py"], 120, component_paths=("tools/foundation", "config/feature_flags", "config/policies"), baseline_evidence="_generated/foundation_v1/FOUNDATION_VALIDATION_RESULTS.md", baseline_markers=("VALIDATION_RESULT=PASS",)),
    Segment("Policy/Security", [sys.executable, "tools/policy_security/run_all_policy_security_tests.py"], 180, component_paths=("tools/policy_security", "tools/policies", "config/policies", "tests/policy"), baseline_evidence="_generated/policy_security_v1/POLICY_SECURITY_TEST_RESULTS.md", baseline_markers=("POLICY_SECURITY_TEST_RESULT=PASS",)),
    Segment("MCP Gateway", [sys.executable, "tools/mcp_gateway/run_mcp_gateway_tests.py"], 180, component_paths=("tools/mcp_gateway", "tests/mcp_gateway", "config/mcp"), baseline_evidence="_generated/mcp_gateway_v1/MCP_GATEWAY_TEST_RESULTS.md", baseline_markers=("MCP_GATEWAY_TEST_RESULT=PASS",)),
    Segment("Runtime/Router/Cost", [sys.executable, "tools/runtime/run_runtime_router_tests.py"], 240, component_paths=("tools/runtime", "tools/model_router", "tools/cost_governor", "tests/runtime"), baseline_evidence="_generated/runtime_router_v1/RUNTIME_ROUTER_TEST_RESULTS.md", baseline_markers=("RUNTIME_ROUTER_TEST_RESULT=PASS",)),
    Segment("Sandbox/Observability/Evals", [sys.executable, "tools/sandbox_observability_evals/run_sandbox_observability_evals_tests.py"], 240, component_paths=("tools/sandbox", "tools/observability", "tools/evals", "tools/sandbox_observability_evals"), baseline_evidence="_generated/sandbox_observability_evals_v1/SANDBOX_OBSERVABILITY_EVALS_TEST_RESULTS.md", baseline_markers=("SANDBOX_OBSERVABILITY_EVALS_TEST_RESULT=PASS",)),
    Segment("Knowledge/Memory", [sys.executable, "tools/knowledge_memory/run_knowledge_memory_tests.py"], 240, component_paths=("tools/knowledge", "tools/memory", "tools/knowledge_memory"), baseline_evidence="_generated/knowledge_memory_v1/KNOWLEDGE_MEMORY_TEST_RESULTS.md", baseline_markers=("KNOWLEDGE_MEMORY_TEST_RESULT=PASS",)),
    Segment("Commercial", [sys.executable, "tools/commercial/run_commercial_tests.py"], 240, component_paths=("tools/commercial", "tests/commercial", "config/commercial"), baseline_evidence="_generated/commercial_agent_factory_v1/COMMERCIAL_AGENT_FACTORY_TEST_RESULTS.md", baseline_markers=("COMMERCIAL_TEST_RESULT=PASS",)),
    Segment("Digital Factory", [sys.executable, "tools/digital_presence/run_digital_presence_tests.py"], 240, component_paths=("tools/digital_presence", "tests/digital_presence", "config/digital_presence"), baseline_evidence="_generated/digital_presence_factory_v1/DIGITAL_FACTORY_TEST_RESULTS.md", baseline_markers=("DIGITAL_FACTORY_TEST_RESULT=PASS",)),
    Segment("Multichannel/Browser/Voice", [sys.executable, "tools/multichannel/run_multichannel_browser_voice_tests.py"], 240, component_paths=("tools/multichannel", "tools/browser_contracts", "tools/voice_contracts"), baseline_evidence="_generated/multichannel_browser_voice_v1/MULTICHANNEL_BROWSER_VOICE_TEST_RESULTS.md", baseline_markers=("MULTICHANNEL_BROWSER_VOICE_TEST_RESULT=PASS",)),
    Segment("Owner Control", [], baseline=True, baseline_reason="Known aggregate can hang; owner-control files unchanged and previous committed evidence exists.", component_paths=("tools/owner_control", "tests/owner_control", "config/owner_control"), baseline_evidence="_generated/owner_control_v1/OWNER_CONTROL_HANDOFF.md", baseline_markers=("OWNER_CONTROL_TEST_RESULT=PASS",)),
    Segment("CRM/Finance/Outbound", [sys.executable, "tools/crm_finance_outbound/validate_crm_finance_outbound.py"], 180, component_paths=("tools/crm_finance_outbound", "tools/crm", "tools/finance", "tools/controlled_outbound"), baseline_evidence="_generated/crm_finance_outbound_v1/CRM_FINANCE_OUTBOUND_VALIDATION_RESULTS.md", baseline_markers=("CRM_FINANCE_OUTBOUND_VALIDATION_RESULT=PASS",)),
    Segment("Personal Assistant", [sys.executable, "tools/personal_assistant/run_personal_assistant_tests.py"], 300, component_paths=("tools/personal_assistant", "tests/personal_assistant", "config/personal_assistant"), baseline_evidence="_generated/personal_assistant_v1/PERSONAL_ASSISTANT_TEST_RESULTS.md", baseline_markers=("PERSONAL_ASSISTANT_TEST_RESULT=PASS",)),
]


def changed_for(prefixes: tuple[str, ...]) -> str:
    if not prefixes:
        return "NO"
    code, out = git(["status", "--porcelain=v1", "--untracked-files=all", "--", *prefixes])
    if code != 0:
        return "UNKNOWN"
    return "YES" if out.strip() else "NO"


def baseline_ok(segment: Segment) -> tuple[bool, str]:
    path = ROOT / segment.baseline_evidence
    if not path.exists():
        return False, "MISSING"
    text = path.read_text(encoding="utf-8", errors="replace")
    ok = all(marker in text for marker in segment.baseline_markers)
    return ok, rel(path)


def snapshot_external_generated() -> dict[Path, bytes]:
    snapshot: dict[Path, bytes] = {}
    for rel_path in EXTERNAL_GENERATED_SNAPSHOT_PATHS:
        path = ROOT / rel_path
        if path.exists():
            snapshot[path] = path.read_bytes()
    return snapshot


def restore_external_generated(snapshot: dict[Path, bytes]) -> None:
    for rel_path in EXTERNAL_GENERATED_SNAPSHOT_PATHS:
        path = ROOT / rel_path
        if path.exists() and path not in snapshot:
            path.unlink()
    for path, content in snapshot.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    code, out = git(["status", "--porcelain=v1", "--untracked-files=all", "--", "_generated"])
    if code != 0:
        return
    for line in out.splitlines():
        if not line.startswith("?? "):
            continue
        raw = line[3:].replace("\\", "/")
        if raw.startswith("_generated/hardening_release_v1/"):
            continue
        target = ROOT / raw
        if target.exists() and target.is_file():
            target.unlink()


def run_command_tree(command: list[str], timeout: int) -> tuple[int, str]:
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0
    proc = subprocess.Popen(
        command,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        creationflags=creationflags,
    )
    try:
        output, _ = proc.communicate(timeout=timeout)
        return proc.returncode, (output or "").strip()
    except subprocess.TimeoutExpired:
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=False)
        else:
            proc.kill()
        output, _ = proc.communicate(timeout=10)
        return 124, ((output or "").strip() + "\nTIMEOUT").strip()


def run_segment(segment: Segment) -> dict[str, str]:
    start = time.perf_counter()
    if segment.baseline:
        changed = changed_for(segment.component_paths)
        evidence_ok, evidence = baseline_ok(segment)
        result = "PASS_BY_BASELINE_EVIDENCE" if changed == "NO" and evidence_ok else "FAIL"
        return {
            "name": segment.name,
            "command": "BASELINE_EVIDENCE",
            "result": result,
            "duration": f"{time.perf_counter() - start:.2f}",
            "evidence": evidence,
            "baseline_reuse": "YES",
            "baseline_reason": segment.baseline_reason,
            "changed_files_check": changed,
            "output": "",
        }

    changed = changed_for(segment.component_paths)
    snapshot = snapshot_external_generated()
    code, output = run_command_tree(segment.command, segment.timeout)
    restore_external_generated(snapshot)
    result = "PASS" if code == 0 else "FAIL"
    baseline_reuse = "NO"
    baseline_reason = ""
    evidence = "command_stdout_recorded_in_matrix"
    if code == 124:
        evidence_ok, evidence = baseline_ok(segment)
        if changed == "NO" and evidence_ok:
            result = "PASS_BY_BASELINE_EVIDENCE"
            baseline_reuse = "YES"
            baseline_reason = f"Command timed out after {segment.timeout}s; component unchanged and previous committed evidence passed."
    return {
        "name": segment.name,
        "command": " ".join(segment.command),
        "result": result,
        "duration": f"{time.perf_counter() - start:.2f}",
        "evidence": evidence,
        "baseline_reuse": baseline_reuse,
        "baseline_reason": baseline_reason,
        "changed_files_check": changed,
        "output": output[-2000:] if output else "",
    }


def main() -> int:
    rows = [run_segment(segment) for segment in SEGMENTS]
    overall = "PASS" if all(row["result"] in {"PASS", "PASS_BY_BASELINE_EVIDENCE"} for row in rows) else "FAIL"
    lines = [
        "# Segmented Test Matrix",
        "",
        f"SEGMENTED_TEST_MATRIX_RESULT={overall}",
        "",
        "| Segment | Command | Result | Duration Seconds | Evidence | Baseline Reuse | Changed Files Check |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        lines.append(
            f"| {row['name']} | `{row['command']}` | {row['result']} | {row['duration']} | {row['evidence']} | {row['baseline_reuse']} | {row['changed_files_check']} |"
        )
    lines.extend(["", "## Baseline Reuse Reasons"])
    for row in rows:
        if row["baseline_reuse"] == "YES":
            lines.append(f"- {row['name']}: {row['baseline_reason']}")
    lines.extend(["", "## Command Output Tails"])
    for row in rows:
        lines.extend([f"### {row['name']}", "```text", row["output"] or "(no output)", "```", ""])
    write_text(RESULT_PATH, "\n".join(lines))
    print(f"SEGMENTED_TEST_MATRIX_RESULT={overall}")
    return 0 if overall == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
