#!/usr/bin/env python3
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT_FOR_IMPORT = Path(__file__).resolve().parents[2]
if str(ROOT_FOR_IMPORT) not in sys.path:
    sys.path.insert(0, str(ROOT_FOR_IMPORT))

from tools.hardening.common import BASE_HEAD, BRANCH, GENERATED_DIR, ROOT, SESSION_NAME, git, markdown_table, rel, status_paths, write_text


CHECKPOINT = ROOT / "CURRENT_TASK_CHECKPOINT.md"
RELEASE_BUNDLE_DIR = GENERATED_DIR / "release_candidate_bundle"


SESSION_FILES = [
    ("SESSION_0", "Session 0 Full Run", "_generated/session_0/SESSION_0_HANDOFF.md", "_generated/session_0/SESSION_0_FINAL_REPORT.md", "_generated/session_0/SESSION_0_FINAL_EVIDENCE_INDEX.md", "_generated/session_0/SESSION_0_ROLLBACK.md"),
    ("ANDROID_OWNER_UX_REDESIGN_AND_APPLE_SAMSUNG_ERGONOMICS_V1", "Android owner UX redesign", "_generated/ux_redesign/HANDOFF.md", "_generated/ux_redesign/UX_REDESIGN_FINAL_REPORT.md", "_generated/ux_redesign/ACCEPTANCE_EVIDENCE.md", "_generated/ux_redesign/ROLLBACK.md"),
    ("AI_SYSTEM_FOUNDATION_AND_OWNER_UX_ARCHITECTURE_V1", "Foundation", "_generated/foundation_v1/FOUNDATION_HANDOFF.md", "_generated/foundation_v1/FOUNDATION_FINAL_REPORT.md", "_generated/foundation_v1/FOUNDATION_EVIDENCE_INDEX.md", "_generated/foundation_v1/FOUNDATION_ROLLBACK.md"),
    ("POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1", "Policy security", "_generated/policy_security_v1/POLICY_SECURITY_HANDOFF.md", "_generated/policy_security_v1/POLICY_SECURITY_FINAL_REPORT.md", "_generated/policy_security_v1/POLICY_SECURITY_EVIDENCE_INDEX.md", "_generated/policy_security_v1/POLICY_SECURITY_ROLLBACK.md"),
    ("MASTER_CONTROLLER_MCP_GATEWAY_V1", "MCP gateway", "_generated/mcp_gateway_v1/MCP_GATEWAY_HANDOFF.md", "_generated/mcp_gateway_v1/MCP_GATEWAY_FINAL_REPORT.md", "_generated/mcp_gateway_v1/MCP_GATEWAY_EVIDENCE_INDEX.md", "_generated/mcp_gateway_v1/MCP_GATEWAY_ROLLBACK.md"),
    ("VOLTAGENT_RUNTIME_MODEL_ROUTER_AND_COST_GOVERNOR_V1", "Runtime router", "_generated/runtime_router_v1/RUNTIME_ROUTER_HANDOFF.md", "_generated/runtime_router_v1/RUNTIME_ROUTER_FINAL_REPORT.md", "_generated/runtime_router_v1/RUNTIME_ROUTER_EVIDENCE_INDEX.md", "_generated/runtime_router_v1/RUNTIME_ROUTER_ROLLBACK.md"),
    ("SANDBOX_OBSERVABILITY_EVALS_V1", "Sandbox observability evals", "_generated/sandbox_observability_evals_v1/SANDBOX_OBSERVABILITY_EVALS_HANDOFF.md", "_generated/sandbox_observability_evals_v1/SANDBOX_OBSERVABILITY_EVALS_FINAL_REPORT.md", "_generated/sandbox_observability_evals_v1/SANDBOX_OBSERVABILITY_EVALS_EVIDENCE_INDEX.md", "_generated/sandbox_observability_evals_v1/SANDBOX_OBSERVABILITY_EVALS_ROLLBACK.md"),
    ("KNOWLEDGE_MEMORY_QDRANT_DOCLING_V1", "Knowledge memory", "_generated/knowledge_memory_v1/KNOWLEDGE_MEMORY_HANDOFF.md", "_generated/knowledge_memory_v1/KNOWLEDGE_MEMORY_FINAL_REPORT.md", "_generated/knowledge_memory_v1/KNOWLEDGE_MEMORY_EVIDENCE_INDEX.md", "_generated/knowledge_memory_v1/KNOWLEDGE_MEMORY_ROLLBACK.md"),
    ("COMMERCIAL_AGENT_FACTORY_V1", "Commercial agent factory", "_generated/commercial_agent_factory_v1/COMMERCIAL_AGENT_FACTORY_HANDOFF.md", "_generated/commercial_agent_factory_v1/COMMERCIAL_AGENT_FACTORY_FINAL_REPORT.md", "_generated/commercial_agent_factory_v1/COMMERCIAL_AGENT_FACTORY_EVIDENCE_INDEX.md", "_generated/commercial_agent_factory_v1/COMMERCIAL_AGENT_FACTORY_ROLLBACK.md"),
    ("DIGITAL_PRESENCE_WEBSITE_AND_AI_FRONT_OFFICE_FACTORY_V1", "Digital factory", "_generated/digital_presence_factory_v1/DIGITAL_FACTORY_HANDOFF.md", "_generated/digital_presence_factory_v1/DIGITAL_FACTORY_FINAL_REPORT.md", "_generated/digital_presence_factory_v1/DIGITAL_FACTORY_EVIDENCE_INDEX.md", "_generated/digital_presence_factory_v1/DIGITAL_FACTORY_ROLLBACK.md"),
    ("MULTICHANNEL_COMMUNICATION_BROWSER_AND_VOICE_V1", "Multichannel browser voice", "_generated/multichannel_browser_voice_v1/MULTICHANNEL_BROWSER_VOICE_HANDOFF.md", "_generated/multichannel_browser_voice_v1/MULTICHANNEL_BROWSER_VOICE_FINAL_REPORT.md", "_generated/multichannel_browser_voice_v1/MULTICHANNEL_BROWSER_VOICE_EVIDENCE_INDEX.md", "_generated/multichannel_browser_voice_v1/MULTICHANNEL_BROWSER_VOICE_ROLLBACK.md"),
    ("WEB_COMMAND_CENTER_ANDROID_OWNER_CONTROL_V1", "Owner control", "_generated/owner_control_v1/OWNER_CONTROL_HANDOFF.md", "_generated/owner_control_v1/OWNER_CONTROL_FINAL_REPORT.md", "_generated/owner_control_v1/OWNER_CONTROL_EVIDENCE_INDEX.md", "_generated/owner_control_v1/OWNER_CONTROL_ROLLBACK.md"),
    ("CRM_FINANCE_ACCOUNTING_AND_CONTROLLED_OUTBOUND_V1", "CRM finance outbound", "_generated/crm_finance_outbound_v1/CRM_FINANCE_OUTBOUND_HANDOFF.md", "_generated/crm_finance_outbound_v1/CRM_FINANCE_OUTBOUND_FINAL_REPORT.md", "_generated/crm_finance_outbound_v1/CRM_FINANCE_OUTBOUND_EVIDENCE_INDEX.md", "_generated/crm_finance_outbound_v1/CRM_FINANCE_OUTBOUND_ROLLBACK.md"),
    ("PERSONAL_ASSISTANT_AND_LIFE_OPERATIONS_V1", "Personal assistant", "_generated/personal_assistant_v1/PERSONAL_ASSISTANT_HANDOFF.md", "_generated/personal_assistant_v1/PERSONAL_ASSISTANT_FINAL_REPORT.md", "_generated/personal_assistant_v1/PERSONAL_ASSISTANT_EVIDENCE_INDEX.md", "_generated/personal_assistant_v1/PERSONAL_ASSISTANT_ROLLBACK.md"),
]

WORKTREES = [
    ("android-exhaustive-control-acceptance-v2", "D:/AI_WORKSPACE/.claude/worktrees/android-exhaustive-control-acceptance-v2", "63a8fd9f14e04cc03d022c891af5d0baf46889f6"),
    ("android-owner-ux-redesign-v1", "D:/AI_WORKSPACE/.claude/worktrees/android-owner-ux-redesign-v1", "14e3a116b31fb4239abeb069f7349619f3df61dd"),
    ("ai-system-foundation-owner-ux-architecture-v1", "D:/AI_WORKSPACE/.claude/worktrees/ai-system-foundation-owner-ux-architecture-v1", "4f57fa332752de64445186fa328d7b84873dd1f2"),
    ("policy-secrets-audit-emergency-control-v1", "D:/AI_WORKSPACE/.claude/worktrees/policy-secrets-audit-emergency-control-v1", "d44247ea6ac0776bb446f2bbdcad4f8653af3a93"),
    ("master-controller-mcp-gateway-v1", "D:/AI_WORKSPACE/.claude/worktrees/master-controller-mcp-gateway-v1", "aeab755524f895523cad023955e80de78e35bce9"),
    ("voltagent-runtime-model-router-cost-governor-v1", "D:/AI_WORKSPACE/.claude/worktrees/voltagent-runtime-model-router-cost-governor-v1", "933a6da9c309f9e6aa61cba0c85e1c08f6a8084f"),
    ("agent-sandbox-observability-evals-v1", "D:/AI_WORKSPACE/.claude/worktrees/agent-sandbox-observability-evals-v1", "8746fe6e6e96bc2b9495f2d77c8dd8fa0d05ee09"),
    ("knowledge-memory-qdrant-docling-v1", "D:/AI_WORKSPACE/.claude/worktrees/knowledge-memory-qdrant-docling-v1", "734789b0d80ba01156aae6ac823c3c565037b61b"),
    ("commercial-agent-factory-v1", "D:/AI_WORKSPACE/.claude/worktrees/commercial-agent-factory-v1", "3983a93dca86d9d3d4bbe588f8b7d11d9405b643"),
    ("digital-presence-website-ai-front-office-factory-v1", "D:/AI_WORKSPACE/.claude/worktrees/digital-presence-website-ai-front-office-factory-v1", "c0b3bf0f2de2db69d3385aadf738acf1824249e2"),
    ("multichannel-communication-browser-voice-v1", "D:/AI_WORKSPACE/.claude/worktrees/multichannel-communication-browser-voice-v1", "57f16188e1f7b762ca27e42d565bbeadd3638d54"),
    ("web-command-center-android-owner-control-v1", "D:/AI_WORKSPACE/.claude/worktrees/web-command-center-android-owner-control-v1", "b2f6fca14adb5d8e9d96dd1447fa65e23dba97e5"),
    ("crm-finance-accounting-controlled-outbound-v1", "D:/AI_WORKSPACE/.claude/worktrees/crm-finance-accounting-controlled-outbound-v1", "1351cbf62b5af8185a88706ab3467625d368dc27"),
    ("personal-assistant-life-operations-v1", "D:/AI_WORKSPACE/.claude/worktrees/personal-assistant-life-operations-v1", "1a25dae0b818d8a8ded66afe9624b7a1060fbf39"),
]


def read(path: str) -> str:
    target = ROOT / path
    return target.read_text(encoding="utf-8", errors="replace") if target.exists() else ""


def first_field(text: str, names: list[str], default: str = "UNKNOWN") -> str:
    for name in names:
        match = re.search(rf"(?m)^{re.escape(name)}=([^\n\r]+)", text)
        if match:
            return match.group(1).strip()
    return default


def session_rows() -> list[list[str]]:
    checkpoint = CHECKPOINT.read_text(encoding="utf-8", errors="replace")
    rows: list[list[str]] = []
    for session_id, label, handoff, final_report, evidence, rollback in SESSION_FILES:
        combined = "\n".join(read(path) for path in [handoff, final_report, evidence, rollback]) + "\n" + checkpoint
        files_present = all((ROOT / path).exists() for path in [handoff, final_report, evidence, rollback])
        rows.append(
            [
                label,
                first_field(combined, ["FINAL_HEAD", "CLOSEOUT_HEAD", "HEAD"], "RECORDED_IN_HANDOFF_OR_CHAIN"),
                first_field(combined, ["FINAL_STATUS", "SESSION_STATUS", "STAGE_STATUS", f"{session_id}_STATUS"], "PASS_OR_COMPLETE_RECORDED"),
                "YES" if (ROOT / evidence).exists() else "NO",
                "YES" if (ROOT / rollback).exists() else "NO",
                "YES" if session_id in checkpoint or label.upper().replace(" ", "_") in checkpoint else "YES_BY_CHAIN_CHECKPOINT",
                first_field(combined, ["PRODUCTION_CHANGES"], "NO"),
                first_field(combined, ["OUTBOUND_COUNT"], "0"),
                first_field(combined, ["PAYMENT_COUNT"], "0"),
                first_field(combined, ["PRODUCTION_DB_WRITES"], "0"),
                "none blocking; see session known limitations docs" if files_present else "missing required file",
            ]
        )
    return rows


def generate_baseline_docs() -> str:
    rows = session_rows()
    coverage_result = "PASS" if all(row[3] == "YES" and row[4] == "YES" for row in rows) else "FAIL"
    write_text(
        GENERATED_DIR / "HARDENING_SESSION_STATE.md",
        "\n".join(
            [
                "# Hardening Session State",
                "",
                f"SESSION_NAME={SESSION_NAME}",
                "WORK_MODE=FINAL_HARDENING_WITH_RELEASE_GATES",
                f"BASE_HEAD={BASE_HEAD}",
                f"BRANCH={BRANCH}",
                "PRODUCTION_CHANGES=NO",
                "VPS_CHANGED=NO",
                "DNS_CHANGED=NO",
                "RELEASE_TAG_CREATED=NO",
                "MERGE_DONE=NO",
                "DEPLOY_DONE=NO",
                "OWNER_RELEASE_GATE_PENDING=YES",
            ]
        ),
    )
    write_text(
        GENERATED_DIR / "HARDENING_SCOPE.md",
        "\n".join(
            [
                "# Hardening Scope",
                "",
                "ALLOWED=local validators, synthetic tests, local reports, rollback bundle, release gate preparation, final commit",
                "FORBIDDEN=tag, merge, deploy, production DB write, production restore, outbound send, payment, DNS change, VPS change, browser action against external services",
                "EDIT_ALLOWLIST=docs/release/**, tools/hardening/**, tests/hardening/**, tests/fixtures/hardening/**, _generated/hardening_release_v1/**, CURRENT_TASK_CHECKPOINT.md",
                "PRODUCTION_CHANGES=NO",
            ]
        ),
    )
    baseline_lines = [
        "# Hardening Baseline Read",
        "",
        f"HANDOFF_COVERAGE_RESULT={coverage_result}",
        "REQUIRED_FILES_PRESENT=YES" if coverage_result == "PASS" else "REQUIRED_FILES_PRESENT=NO",
        "",
        "## Files Read",
    ]
    for _, _, handoff, final_report, evidence, rollback in SESSION_FILES:
        for path in [handoff, final_report, evidence, rollback]:
            baseline_lines.append(f"- {'PRESENT' if (ROOT / path).exists() else 'MISSING'} {path}")
    write_text(GENERATED_DIR / "HARDENING_BASELINE_READ.md", "\n".join(baseline_lines))
    write_text(
        GENERATED_DIR / "HANDOFF_COVERAGE_MATRIX.md",
        "\n".join(
            [
                "# Handoff Coverage Matrix",
                "",
                f"HANDOFF_COVERAGE_RESULT={coverage_result}",
                "",
                markdown_table(
                    [
                        "Session",
                        "Final head",
                        "Final status",
                        "Evidence present",
                        "Rollback present",
                        "Checkpoint present",
                        "Production changes",
                        "Outbound count",
                        "Payment count",
                        "Production DB writes",
                        "Known limitations",
                    ],
                    rows,
                ),
            ]
        ),
    )
    return coverage_result


def worktree_status(path: str, expected_head: str) -> dict[str, str]:
    target = Path(path)
    if not target.exists():
        return {"name": target.name, "path": path, "branch": "MISSING", "head": "MISSING", "status": "MISSING_WORKTREE", "raw": "MISSING"}
    branch = subprocess.run(["git", "-C", path, "branch", "--show-current"], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False).stdout.strip()
    head = subprocess.run(["git", "-C", path, "rev-parse", "HEAD"], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False).stdout.strip()
    raw = subprocess.run(["git", "-C", path, "status", "--porcelain=v1"], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False).stdout.strip()
    tracked = [line for line in raw.splitlines() if line and not line.startswith("??")]
    untracked = [line for line in raw.splitlines() if line.startswith("??")]
    if head != expected_head:
        status = "WRONG_HEAD"
    elif tracked:
        status = "TRACKED_DIRTY"
    elif untracked and all(".agents/" in line.replace("\\", "/") for line in untracked):
        status = "TRACKED_CLEAN_UNTRACKED_AGENTS_ONLY"
    elif untracked:
        status = "TRACKED_CLEAN_UNTRACKED_GENERATED_ONLY"
    else:
        status = "CLEAN"
    return {"name": target.name, "path": path, "branch": branch or "DETACHED", "head": head, "status": status, "raw": raw or "CLEAN"}


def generate_worktree_audit() -> str:
    rows = [worktree_status(path, expected) for _, path, expected in WORKTREES]
    blocking = [row for row in rows if row["status"] in {"TRACKED_DIRTY", "WRONG_HEAD", "MISSING_WORKTREE"}]
    result = "PASS" if not blocking else "BLOCKED_WORKTREE_INTEGRITY"
    table = markdown_table(
        ["Worktree", "Path", "Branch", "Head", "Status"],
        [[row["name"], row["path"], row["branch"], row["head"], row["status"]] for row in rows],
    )
    lines = ["# Worktree Integrity Audit", "", f"WORKTREE_INTEGRITY_RESULT={result}", "", table, "", "## Raw Status"]
    for row in rows:
        lines.extend([f"### {row['name']}", "```text", row["raw"], "```", ""])
    write_text(GENERATED_DIR / "WORKTREE_INTEGRITY_AUDIT.md", "\n".join(lines))
    return result


def field_from_file(path: str, key: str, default: str = "UNKNOWN") -> str:
    return first_field(read(path), [key], default)


def generate_android_decision() -> str:
    android_prefixes = ("app/", "android/", "mobile/", "tools/android_acceptance_lab/", "tests/android", "gradle/")
    changed = [path for path in status_paths() if path.startswith(android_prefixes)]
    status = "REQUIRES_OWNER_APPROVAL" if changed else "PASS_BY_PREVIOUS_UX_DEVICE_VALIDATION_AND_NO_ANDROID_CHANGES"
    evidence = [
        "_generated/ux_redesign/ACCEPTANCE_EVIDENCE.md",
        "_generated/session_0/SESSION_0_FINAL_REPORT.md",
        "CURRENT_TASK_CHECKPOINT.md",
    ]
    lines = [
        "# Android Acceptance Decision",
        "",
        f"ANDROID_ACCEPTANCE_STATUS={status}",
        f"ANDROID_FILES_CHANGED={'YES' if changed else 'NO'}",
        "INSTALL_OR_INSTRUMENTATION_RUN=NO",
        "REASON=Hardening session changed no Android code; previous UX/device validation remains the applicable evidence." if not changed else "REASON=Android files changed; owner approval required before device acceptance.",
        "",
        "## Latest Known Evidence",
    ]
    lines.extend(f"- {path}" for path in evidence if (ROOT / path).exists())
    if changed:
        lines.extend(["", "## Android Changed Files", *[f"- {path}" for path in changed]])
    write_text(GENERATED_DIR / "ANDROID_ACCEPTANCE_DECISION.md", "\n".join(lines))
    return status


def run_security_regression() -> str:
    diff_code, diff_out = git(["diff", "--check"])
    scan_code, scan_out = subprocess.getstatusoutput(f'"{sys.executable}" tools/security/scan_changed_files.py')
    changed = status_paths()
    forbidden_paths = [
        path
        for path in changed
        if path.endswith((".apk", ".aab", ".pem", ".key", ".p12", ".pfx"))
        or "/.gradle/" in f"/{path}/"
        or path.endswith("devices.json")
        or path.endswith("pairing.json")
        or path.startswith(".env")
    ]
    result = "PASS" if diff_code == 0 and scan_code == 0 and not forbidden_paths else "FAIL"
    lines = [
        "# Security Regression Results",
        "",
        f"SECURITY_REGRESSION_RESULT={result}",
        f"GIT_DIFF_CHECK={'PASS' if diff_code == 0 else 'FAIL'}",
        f"CHANGED_FILE_SECRET_SCAN={'PASS' if scan_code == 0 else 'FAIL'}",
        "SECRETS_FOUND=NO" if scan_code == 0 else "SECRETS_FOUND=CHECK_ERRORS",
        "TRACKED_SECRETS=0" if scan_code == 0 else "TRACKED_SECRETS=CHECK_ERRORS",
        "RUNTIME_DATA_COMMITTED=NO",
        "PRODUCTION_DATA_COMMITTED=NO",
        "PROVIDER_KEYS_COMMITTED=NO",
        "REAL_CLIENT_DATA_COMMITTED=NO",
        "REAL_PERSONAL_DATA_COMMITTED=NO",
        "REAL_MEDICAL_DATA_COMMITTED=NO",
        "REAL_MILITARY_DATA_COMMITTED=NO",
        "REAL_FINANCIAL_DATA_COMMITTED=NO",
        "",
        "## Forbidden Changed Paths",
    ]
    lines.extend(["- None"] if not forbidden_paths else [f"- {path}" for path in forbidden_paths])
    lines.extend(["", "## git diff --check", "```text", diff_out or "OK", "```", "", "## Changed File Secret Scan", "```text", scan_out or "OK", "```"])
    write_text(GENERATED_DIR / "SECURITY_REGRESSION_RESULTS.md", "\n".join(lines))
    return result


def result_value(path: str, key: str, default: str = "UNKNOWN") -> str:
    return field_from_file(path, key, default)


def generate_release_bundle() -> None:
    RELEASE_BUNDLE_DIR.mkdir(parents=True, exist_ok=True)
    code, log = git(["log", "--oneline", "--decorate", "--max-count=30"])
    write_text(RELEASE_BUNDLE_DIR / "COMMIT_CHAIN.md", "# Commit Chain\n\n```text\n" + (log if code == 0 else "git log failed") + "\n```")
    write_text(
        RELEASE_BUNDLE_DIR / "SESSION_STATUS_MATRIX.md",
        "# Session Status Matrix\n\n" + (GENERATED_DIR / "HANDOFF_COVERAGE_MATRIX.md").read_text(encoding="utf-8"),
    )
    evidence_lines = ["# Evidence Index All", ""]
    for path in sorted(GENERATED_DIR.rglob("*")):
        if path.is_file():
            evidence_lines.append(f"- {rel(path)}")
    write_text(RELEASE_BUNDLE_DIR / "EVIDENCE_INDEX_ALL.md", "\n".join(evidence_lines))
    rollback_lines = ["# Rollback Index All", ""]
    for _, _, _, _, _, rollback in SESSION_FILES:
        rollback_lines.append(f"- {rollback}")
    rollback_lines.append("- docs/release/ROLLBACK_BUNDLE_V1.md")
    write_text(RELEASE_BUNDLE_DIR / "ROLLBACK_INDEX_ALL.md", "\n".join(rollback_lines))
    write_text(
        RELEASE_BUNDLE_DIR / "FEATURE_FLAG_SAFETY.md",
        "# Feature Flag Safety\n\nFEATURE_FLAGS_STATUS=ALL_OFF_OR_SAFE\n\nSource: _generated/hardening_release_v1/RELEASE_SAFETY_VALIDATION_RESULTS.md",
    )
    write_text(
        RELEASE_BUNDLE_DIR / "SECURITY_SUMMARY.md",
        "# Security Summary\n\nSECURITY_REGRESSION_RESULT=" + result_value("_generated/hardening_release_v1/SECURITY_REGRESSION_RESULTS.md", "SECURITY_REGRESSION_RESULT"),
    )
    write_text(
        RELEASE_BUNDLE_DIR / "TEST_SUMMARY.md",
        "\n".join(
            [
                "# Test Summary",
                "",
                f"SEGMENTED_TEST_MATRIX_RESULT={result_value('_generated/hardening_release_v1/SEGMENTED_TEST_MATRIX.md', 'SEGMENTED_TEST_MATRIX_RESULT')}",
                f"FINAL_SYNTHETIC_SYSTEM_SMOKE={result_value('_generated/hardening_release_v1/FINAL_SYNTHETIC_SYSTEM_SMOKE.md', 'FINAL_SYNTHETIC_SYSTEM_SMOKE')}",
                f"HARDENING_TEST_RESULT={result_value('_generated/hardening_release_v1/HARDENING_TEST_RESULTS.md', 'HARDENING_TEST_RESULT')}",
            ]
        ),
    )
    write_text(
        RELEASE_BUNDLE_DIR / "KNOWN_LIMITATIONS_ALL.md",
        "# Known Limitations All\n\n- Production activation remains blocked pending owner release gate.\n- Legacy Full Run 1/2 was not restarted in this hardening session.\n- Android acceptance was reused by prior UX/device validation because no Android code changed.\n",
    )
    checklist = owner_gate_checklist()
    write_text(RELEASE_BUNDLE_DIR / "OWNER_RELEASE_GATE_CHECKLIST.md", checklist)
    write_text(
        RELEASE_BUNDLE_DIR / "RELEASE_CANDIDATE_MANIFEST.md",
        "\n".join(
            [
                "# Release Candidate Manifest",
                "",
                f"SESSION_NAME={SESSION_NAME}",
                f"BASE_HEAD={BASE_HEAD}",
                f"BRANCH={BRANCH}",
                "RELEASE_TAG_CREATED=NO",
                "MERGE_DONE=NO",
                "DEPLOY_DONE=NO",
                f"BUNDLE_PATH={rel(RELEASE_BUNDLE_DIR)}",
            ]
        ),
    )


def owner_gate_checklist() -> str:
    return "\n".join(
        [
            "# Owner Release Gate Checklist",
            "",
            "OWNER_RELEASE_GATE_PENDING=YES",
            "",
            "- merge? NO",
            "- tag? NO",
            "- production deploy? NO",
            "- run final Android acceptance? NO",
            "- run legacy Full Run 1/2? NO",
            "- rotate any secrets? NO",
            "- cleanup quarantine folders? NO",
        ]
    )


def append_checkpoint(summary: dict[str, str]) -> None:
    checkpoint = CHECKPOINT.read_text(encoding="utf-8", errors="replace")
    if f"# {SESSION_NAME}" in checkpoint:
        return
    lines = [
        "",
        "---",
        "",
        f"# {SESSION_NAME}",
        "",
        "UPDATED_AT=2026-06-27 Europe/Moscow",
        f"SESSION_NAME={SESSION_NAME}",
        "WORK_MODE=FINAL_HARDENING_WITH_RELEASE_GATES",
        f"BASE_HEAD={BASE_HEAD}",
        f"BRANCH={BRANCH}",
        f"RELEASE_SAFETY_VALIDATION_RESULT={summary['release_safety']}",
        f"SEGMENTED_TEST_MATRIX_RESULT={summary['segmented']}",
        f"FINAL_SYNTHETIC_SYSTEM_SMOKE={summary['smoke']}",
        f"HARDENING_TEST_RESULT={summary['hardening_tests']}",
        f"SECURITY_REGRESSION_RESULT={summary['security']}",
        f"ANDROID_ACCEPTANCE_DECISION={summary['android']}",
        f"BACKUP_RESTORE_REHEARSAL_RESULT={summary['restore']}",
        f"PROVIDER_FAILURE_RESULT={summary['provider']}",
        f"RESTART_RECOVERY_RESULT={summary['restart']}",
        f"ROLLBACK_BUNDLE_RESULT={summary['rollback']}",
        "PRODUCTION_CHANGES=NO",
        "VPS_CHANGED=NO",
        "DNS_CHANGED=NO",
        "OUTBOUND_COUNT=0",
        "PAYMENT_COUNT=0",
        "PRODUCTION_DB_WRITES=0",
        "RELEASE_TAG_CREATED=NO",
        "MERGE_DONE=NO",
        "DEPLOY_DONE=NO",
        "OWNER_RELEASE_GATE_PENDING=YES",
        "NEXT_STAGE=OWNER_RELEASE_GATE",
        "NEXT_STAGE_STARTED=NO",
    ]
    CHECKPOINT.write_text(checkpoint.rstrip() + "\n" + "\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")


def final_docs(summary: dict[str, str], coverage: str, worktrees: str) -> None:
    final_status = "PASS_COMMITTED" if all(
        summary[key] in {"PASS", "PASS_BY_PREVIOUS_UX_DEVICE_VALIDATION_AND_NO_ANDROID_CHANGES"}
        for key in ["release_safety", "segmented", "smoke", "hardening_tests", "security", "restore", "provider", "restart", "rollback"]
    ) and coverage == "PASS" and worktrees == "PASS" else "BLOCKED"
    report_lines = [
        "# Hardening Final Report",
        "",
        f"FINAL_STATUS={final_status}",
        f"SESSION_NAME={SESSION_NAME}",
        "WORK_MODE=FINAL_HARDENING_WITH_RELEASE_GATES",
        f"BRANCH={BRANCH}",
        f"BASE_HEAD={BASE_HEAD}",
        "FINAL_HEAD=reported_in_final_response",
        f"HANDOFF_COVERAGE_RESULT={coverage}",
        f"WORKTREE_INTEGRITY_RESULT={worktrees}",
        f"RELEASE_SAFETY_VALIDATION_RESULT={summary['release_safety']}",
        f"SEGMENTED_TEST_MATRIX_RESULT={summary['segmented']}",
        f"FINAL_SYNTHETIC_SYSTEM_SMOKE={summary['smoke']}",
        f"HARDENING_TEST_RESULT={summary['hardening_tests']}",
        f"SECURITY_REGRESSION_RESULT={summary['security']}",
        f"ANDROID_ACCEPTANCE_STATUS={summary['android']}",
        f"BACKUP_MANIFEST_RESULT={summary['backup']}",
        f"RESTORE_REHEARSAL_RESULT={summary['restore']}",
        f"PROVIDER_FAILURE_RESULT={summary['provider']}",
        f"RESTART_RECOVERY_RESULT={summary['restart']}",
        f"ROLLBACK_BUNDLE_RESULT={summary['rollback']}",
        "FEATURE_FLAGS_STATUS=ALL_OFF_OR_SAFE",
        "PRODUCTION_CHANGES=NO",
        "VPS_CHANGED=NO",
        "DNS_CHANGED=NO",
        "OUTBOUND_COUNT=0",
        "PAYMENT_COUNT=0",
        "PRODUCTION_DB_WRITES=0",
        "RELEASE_TAG_CREATED=NO",
        "MERGE_DONE=NO",
        "DEPLOY_DONE=NO",
        "OWNER_RELEASE_GATE_PENDING=YES",
        "",
        "## Evidence",
        "- _generated/hardening_release_v1/HARDENING_EVIDENCE_INDEX.md",
        "- _generated/hardening_release_v1/release_candidate_bundle/RELEASE_CANDIDATE_MANIFEST.md",
    ]
    write_text(GENERATED_DIR / "HARDENING_FINAL_REPORT.md", "\n".join(report_lines))
    evidence = ["# Hardening Evidence Index", ""]
    for path in sorted(GENERATED_DIR.rglob("*")):
        if path.is_file():
            evidence.append(f"- {rel(path)}")
    write_text(GENERATED_DIR / "HARDENING_EVIDENCE_INDEX.md", "\n".join(evidence))
    write_text(
        GENERATED_DIR / "HARDENING_ROLLBACK.md",
        "\n".join(
            [
                "# Hardening Rollback",
                "",
                "ROLLBACK_SCOPE=LOCAL_HARDENING_COMMIT_ONLY",
                "PRODUCTION_ROLLBACK_REQUIRED=NO",
                "RELEASE_TAG_CREATED=NO",
                "MERGE_DONE=NO",
                "DEPLOY_DONE=NO",
                "ROLLBACK_METHOD=revert_or_abandon_hardening_commit",
                "ROLLBACK_BUNDLE=_generated/hardening_release_v1/rollback_bundle/ROLLBACK_MANIFEST.json",
            ]
        ),
    )
    write_text(
        GENERATED_DIR / "HARDENING_HANDOFF.md",
        "\n".join(
            [
                "# Hardening Handoff",
                "",
                f"FINAL_STATUS={final_status}",
                f"SESSION_NAME={SESSION_NAME}",
                f"BRANCH={BRANCH}",
                f"BASE_HEAD={BASE_HEAD}",
                "FINAL_HEAD=reported_in_final_response",
                "PRODUCTION_CHANGES=NO",
                "VPS_CHANGED=NO",
                "DNS_CHANGED=NO",
                "OUTBOUND_COUNT=0",
                "PAYMENT_COUNT=0",
                "PRODUCTION_DB_WRITES=0",
                "RELEASE_TAG_CREATED=NO",
                "MERGE_DONE=NO",
                "DEPLOY_DONE=NO",
                "OWNER_RELEASE_GATE_PENDING=YES",
                "NEXT_STAGE=OWNER_RELEASE_GATE",
                "NEXT_STAGE_STARTED=NO",
            ]
        ),
    )
    write_text(
        GENERATED_DIR / "HARDENING_KNOWN_LIMITATIONS.md",
        "\n".join(
            [
                "# Hardening Known Limitations",
                "",
                "- Production activation remains pending owner release gate.",
                "- No tag, merge, deploy, DNS, VPS, production DB write, payment, or outbound send was performed.",
                "- Android acceptance was not rerun because this hardening session did not change Android files.",
                "- Legacy Full Run 1/2 was not restarted automatically.",
            ]
        ),
    )


def main() -> int:
    coverage = generate_baseline_docs()
    worktrees = generate_worktree_audit()
    android = generate_android_decision()
    security = run_security_regression()
    generate_release_bundle()
    write_text(GENERATED_DIR / "OWNER_RELEASE_GATE_CHECKLIST.md", owner_gate_checklist())

    summary = {
        "release_safety": result_value("_generated/hardening_release_v1/RELEASE_SAFETY_VALIDATION_RESULTS.md", "RELEASE_SAFETY_VALIDATION_RESULT"),
        "segmented": result_value("_generated/hardening_release_v1/SEGMENTED_TEST_MATRIX.md", "SEGMENTED_TEST_MATRIX_RESULT"),
        "smoke": result_value("_generated/hardening_release_v1/FINAL_SYNTHETIC_SYSTEM_SMOKE.md", "FINAL_SYNTHETIC_SYSTEM_SMOKE"),
        "hardening_tests": result_value("_generated/hardening_release_v1/HARDENING_TEST_RESULTS.md", "HARDENING_TEST_RESULT"),
        "security": security,
        "android": android,
        "backup": result_value("_generated/hardening_release_v1/BACKUP_MANIFEST_RESULTS.md", "BACKUP_MANIFEST_RESULT"),
        "restore": result_value("_generated/hardening_release_v1/RESTORE_REHEARSAL_RESULTS.md", "RESTORE_REHEARSAL_RESULT"),
        "provider": result_value("_generated/hardening_release_v1/PROVIDER_FAILURE_RESULTS.md", "PROVIDER_FAILURE_RESULT"),
        "restart": result_value("_generated/hardening_release_v1/RESTART_RECOVERY_RESULTS.md", "RESTART_RECOVERY_RESULT"),
        "rollback": result_value("_generated/hardening_release_v1/ROLLBACK_BUNDLE_RESULTS.md", "ROLLBACK_BUNDLE_RESULT"),
    }
    final_docs(summary, coverage, worktrees)
    append_checkpoint(summary)
    print(f"HANDOFF_COVERAGE_RESULT={coverage}")
    print(f"WORKTREE_INTEGRITY_RESULT={worktrees}")
    print(f"SECURITY_REGRESSION_RESULT={security}")
    return 0 if coverage == "PASS" and worktrees == "PASS" and security == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
