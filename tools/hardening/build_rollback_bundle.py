#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

ROOT_FOR_IMPORT = Path(__file__).resolve().parents[2]
if str(ROOT_FOR_IMPORT) not in sys.path:
    sys.path.insert(0, str(ROOT_FOR_IMPORT))

from tools.hardening.common import BASE_HEAD, GENERATED_DIR, git, rel, write_json, write_text


BUNDLE_DIR = GENERATED_DIR / "rollback_bundle"
RESULT_PATH = GENERATED_DIR / "ROLLBACK_BUNDLE_RESULTS.md"


def build_rollback_bundle() -> dict[str, Any]:
    errors: list[str] = []
    BUNDLE_DIR.mkdir(parents=True, exist_ok=True)

    code, commits = git(["log", "--oneline", "--decorate", "--max-count=30"])
    if code != 0 or not commits:
        errors.append("git log failed")
        commits = ""
    write_text(BUNDLE_DIR / "COMMIT_LIST.md", "# Commit List\n\n```text\n" + commits + "\n```")

    evidence_files = sorted(GENERATED_DIR.glob("*.md"))
    evidence_lines = ["# Evidence Index", ""]
    for path in evidence_files:
        evidence_lines.append(f"- {rel(path)}")
    write_text(BUNDLE_DIR / "EVIDENCE_INDEX.md", "\n".join(evidence_lines))

    rollback_docs = [
        "_generated/session_0/SESSION_0_ROLLBACK.md",
        "_generated/ux_redesign/ROLLBACK.md",
        "_generated/foundation_v1/FOUNDATION_ROLLBACK.md",
        "_generated/policy_security_v1/POLICY_SECURITY_ROLLBACK.md",
        "_generated/mcp_gateway_v1/MCP_GATEWAY_ROLLBACK.md",
        "_generated/runtime_router_v1/RUNTIME_ROUTER_ROLLBACK.md",
        "_generated/sandbox_observability_evals_v1/SANDBOX_OBSERVABILITY_EVALS_ROLLBACK.md",
        "_generated/knowledge_memory_v1/KNOWLEDGE_MEMORY_ROLLBACK.md",
        "_generated/commercial_agent_factory_v1/COMMERCIAL_AGENT_FACTORY_ROLLBACK.md",
        "_generated/digital_presence_factory_v1/DIGITAL_FACTORY_ROLLBACK.md",
        "_generated/multichannel_browser_voice_v1/MULTICHANNEL_BROWSER_VOICE_ROLLBACK.md",
        "_generated/owner_control_v1/OWNER_CONTROL_ROLLBACK.md",
        "_generated/crm_finance_outbound_v1/CRM_FINANCE_OUTBOUND_ROLLBACK.md",
        "_generated/personal_assistant_v1/PERSONAL_ASSISTANT_ROLLBACK.md",
    ]
    rollback_lines = ["# Rollback Docs", ""]
    for doc in rollback_docs:
        rollback_lines.append(f"- {doc}")
    write_text(BUNDLE_DIR / "ROLLBACK_DOCS.md", "\n".join(rollback_lines))

    manifest = {
        "result": "PASS" if not errors else "FAIL",
        "base_head": BASE_HEAD,
        "commit_list": rel(BUNDLE_DIR / "COMMIT_LIST.md"),
        "evidence_index": rel(BUNDLE_DIR / "EVIDENCE_INDEX.md"),
        "rollback_docs": rel(BUNDLE_DIR / "ROLLBACK_DOCS.md"),
        "release_tag_created": False,
        "merge_done": False,
        "deploy_done": False,
        "errors": errors,
    }
    write_json(BUNDLE_DIR / "ROLLBACK_MANIFEST.json", manifest)

    lines = [
        "# Rollback Bundle Results",
        "",
        f"ROLLBACK_BUNDLE_RESULT={manifest['result']}",
        f"ROLLBACK_BUNDLE={rel(BUNDLE_DIR)}",
        "COMMIT_LIST_PRESENT=YES",
        "EVIDENCE_INDEX_PRESENT=YES",
        "ROLLBACK_DOCS_PRESENT=YES",
        "RELEASE_TAG_CREATED=NO",
        "MERGE_DONE=NO",
        "DEPLOY_DONE=NO",
        "",
        "## Errors",
    ]
    lines.extend(["- None"] if not errors else [f"- {error}" for error in errors])
    write_text(RESULT_PATH, "\n".join(lines))
    return manifest


def main() -> int:
    result = build_rollback_bundle()
    print(f"ROLLBACK_BUNDLE_RESULT={result['result']}")
    return 0 if result["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
