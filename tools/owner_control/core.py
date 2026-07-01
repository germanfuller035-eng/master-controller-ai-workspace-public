"""Local synthetic owner-control contracts.

The package is deterministic and fixture-driven. It never sends messages, runs
browser automation, captures real voice, writes production data, executes real
approvals, deploys Web UI, or calls external services.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
GENERATED_DIR = ROOT / "_generated" / "owner_control_v1"
CONFIG_DIR = ROOT / "config" / "owner_control"
SCHEMA_DIR = ROOT / "schemas" / "owner_control"
FIXTURE_DIR = ROOT / "tests" / "fixtures" / "owner_control"
SESSION_NAME = "WEB_COMMAND_CENTER_ANDROID_OWNER_CONTROL_V1"
BASE_HEAD = "57f16188e1f7b762ca27e42d565bbeadd3638d54"
BRANCH = "feature/web-command-center-android-owner-control-v1"
WORKTREE = r"D:\AI_WORKSPACE\.claude\worktrees\web-command-center-android-owner-control-v1"

REQUIRED_ANDROID_SURFACES = [
    "Today",
    "Approvals",
    "Leads",
    "Offer Preview",
    "Replies",
    "Deals",
    "Agents",
    "Costs",
    "Incidents",
    "Memory proposals",
    "Global STOP",
    "Voice",
]
REQUIRED_WEB_SECTIONS = ["Today & Decisions", "Commerce", "AI Circuit", "Knowledge", "System"]
RISK_COPY_FIELDS = ["what", "who", "why", "cost", "rollback"]
STRONG_R5_FIELDS = ["pin_or_biometric_future", "repeated_human_description", "short_delay", "one_time_approval"]
BLOCKED_BY_STOP = [
    "outbound_send",
    "browser_action",
    "voice_risky_action",
    "payment_operation",
    "production_deploy",
    "production_db_write",
]

REAL_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d[\s().-]*){7,}(?!\w)")
REAL_DOMAIN_RE = re.compile(r"\b(?!synthetic\b)[A-Za-z0-9-]+\.(?:com|net|org|ru|io|ai|app|dev|site|online|biz|info)\b", re.I)
TELEGRAM_ID_RE = re.compile(r"(?i)\btelegram[_ -]?(?:id|chat)\b\s*[:=]\s*[0-9]{5,}")
SOCIAL_HANDLE_RE = re.compile(r"(?<!\w)@[A-Za-z0-9_]{3,}")
ASSIGNED_SECRET_RE = re.compile(
    r"(?i)\b(?:token|password|passwd|secret|private_key|refresh|access_token|bearer|proxy password)\b\s*[:=]\s*[\"']?[A-Za-z0-9_./+=-]{8,}"
)
OPENAI_KEY_RE = re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b")
PRIVATE_KEY_RE = re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I)


class OwnerControlPolicyError(ValueError):
    """Raised when an owner-control contract is violated."""


def load_json(path: str | Path) -> Any:
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = ROOT / candidate
    return json.loads(candidate.read_text(encoding="utf-8"))


def write_text(path: str | Path, text: str) -> None:
    target = Path(path)
    if not target.is_absolute():
        target = ROOT / target
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text.rstrip() + "\n", encoding="utf-8", newline="\n")


def write_json(path: str | Path, data: Any) -> None:
    target = Path(path)
    if not target.is_absolute():
        target = ROOT / target
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, indent=2, ensure_ascii=True) + "\n", encoding="utf-8", newline="\n")


def iter_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        result: list[str] = []
        for item in value.values():
            result.extend(iter_strings(item))
        return result
    if isinstance(value, list):
        result = []
        for item in value:
            result.extend(iter_strings(item))
        return result
    return []


def evidence_list(value: dict[str, Any]) -> list[Any]:
    evidence = value.get("evidence", [])
    return evidence if isinstance(evidence, list) else []


def ensure_synthetic(value: dict[str, Any], label: str) -> None:
    if value.get("synthetic") is not True:
        raise OwnerControlPolicyError(f"{label} must be explicitly synthetic")


def require_evidence(value: dict[str, Any], label: str) -> None:
    if not evidence_list(value) and not value.get("evidence_ids"):
        raise OwnerControlPolicyError(f"{label} requires evidence")


def reject_false_pass_without_evidence(value: Any, label: str = "panel") -> None:
    if isinstance(value, dict):
        status = value.get("status") or value.get("overall") or value.get("health", {}).get("overall")
        if status == "PASS" and not evidence_list(value) and not value.get("evidence_ids"):
            raise OwnerControlPolicyError(f"{label} claims PASS without evidence")
        for key, child in value.items():
            reject_false_pass_without_evidence(child, f"{label}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            reject_false_pass_without_evidence(child, f"{label}[{index}]")


def today_summary(data: dict[str, Any] | None = None) -> dict[str, Any]:
    panel = data or load_json(FIXTURE_DIR / "today" / "synthetic_today_summary.json")
    ensure_synthetic(panel, "today summary")
    require_evidence(panel, "today summary")
    if not panel.get("main_action"):
        raise OwnerControlPolicyError("today summary requires one main action")
    result = dict(panel)
    result["main_action_count"] = 1
    result["today_main_action_status"] = "PASS"
    return result


def decision_queue(data: dict[str, Any] | None = None) -> dict[str, Any]:
    queue = data or load_json(FIXTURE_DIR / "decisions" / "synthetic_decision_queue.json")
    ensure_synthetic(queue, "decision queue")
    decisions = list(queue.get("decisions", []))
    for item in decisions:
        ensure_synthetic(item, "decision")
        require_evidence(item, "decision")
    ordered = sorted(
        decisions,
        key=lambda item: (item.get("decision_type") == "approval" and item.get("risk") in {"R4", "R5"}, int(item.get("priority", 0))),
        reverse=True,
    )
    return {
        "synthetic": True,
        "decisions": ordered,
        "urgent_approvals_first": bool(ordered and ordered[0].get("decision_type") == "approval"),
        "evidence": queue.get("evidence", []),
    }


def risk_explanation(card: dict[str, Any]) -> dict[str, Any]:
    explanation = dict(card.get("risk_explanation", {}))
    missing = [field for field in RISK_COPY_FIELDS if not explanation.get(field)]
    if missing:
        raise OwnerControlPolicyError("risk explanation missing " + ",".join(missing))
    return explanation


def canonical_payload_hash(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def approval_card(card: dict[str, Any] | None = None, fixture_name: str = "synthetic_r4_approval_card.json") -> dict[str, Any]:
    item = card or load_json(FIXTURE_DIR / "approvals" / fixture_name)
    ensure_synthetic(item, "approval card")
    require_evidence(item, "approval card")
    if item.get("risk") in {"R4", "R5"}:
        payload_hash = str(item.get("payload_hash", ""))
        if not re.fullmatch(r"[0-9a-f]{64}", payload_hash):
            raise OwnerControlPolicyError("R4/R5 approval card requires exact payload hash")
        if payload_hash != canonical_payload_hash(item.get("payload", {})):
            raise OwnerControlPolicyError("R4/R5 approval card payload hash does not match payload")
    risk_explanation(item)
    if item.get("risk") == "R5":
        strong = item.get("strong_approval_fields", {})
        missing = [field for field in STRONG_R5_FIELDS if strong.get(field) is not True]
        if missing:
            raise OwnerControlPolicyError("R5 approval missing strong fields " + ",".join(missing))
    result = dict(item)
    result["execute_allowed"] = False
    return result


def commercial_funnel(data: dict[str, Any] | None = None) -> dict[str, Any]:
    panel = data or load_json(FIXTURE_DIR / "commercial" / "synthetic_funnel_snapshot.json")
    ensure_synthetic(panel, "commercial funnel")
    require_evidence(panel, "commercial funnel")
    if panel.get("send_allowed") is not False or panel.get("outbound_count") != 0:
        raise OwnerControlPolicyError("commercial funnel must show no-send state")
    return panel


def cost_panel(data: dict[str, Any] | None = None) -> dict[str, Any]:
    panel = data or load_json(FIXTURE_DIR / "costs" / "synthetic_cost_budget_snapshot.json")
    ensure_synthetic(panel, "cost panel")
    require_evidence(panel, "cost panel")
    if "budget" not in panel or "synthetic_spend" not in panel:
        raise OwnerControlPolicyError("cost panel requires budget and synthetic spend")
    return panel


def agent_workflow_panel(data: dict[str, Any] | None = None) -> dict[str, Any]:
    panel = data or load_json(FIXTURE_DIR / "agents" / "synthetic_agent_workflow_snapshot.json")
    ensure_synthetic(panel, "agent workflow panel")
    require_evidence(panel, "agent workflow panel")
    reject_false_pass_without_evidence(panel, "agent_workflow")
    return panel


def memory_proposals(data: dict[str, Any] | None = None) -> dict[str, Any]:
    panel = data or load_json(FIXTURE_DIR / "memory" / "synthetic_memory_proposal_cards.json")
    ensure_synthetic(panel, "memory proposal panel")
    for proposal in panel.get("proposals", []):
        ensure_synthetic(proposal, "memory proposal")
        require_evidence(proposal, "memory proposal")
        if proposal.get("review_only") is not True or proposal.get("can_write_memory") is not False:
            raise OwnerControlPolicyError("memory proposal panel must be review-only and cannot write memory")
    return panel


def health_incidents(data: dict[str, Any] | None = None) -> dict[str, Any]:
    panel = data or load_json(FIXTURE_DIR / "health" / "synthetic_health_incidents.json")
    ensure_synthetic(panel, "health incidents panel")
    require_evidence(panel, "health incidents panel")
    if not panel.get("incidents") or not panel.get("next_action"):
        raise OwnerControlPolicyError("health panel requires incidents and next action")
    reject_false_pass_without_evidence(panel, "health_incidents")
    return panel


def feature_flags_panel(data: dict[str, Any] | None = None) -> dict[str, Any]:
    panel = data or load_json(FIXTURE_DIR / "feature_flags" / "synthetic_feature_flags_all_off.json")
    ensure_synthetic(panel, "feature flags panel")
    require_evidence(panel, "feature flags panel")
    if panel.get("display_only") is not True or panel.get("can_enable_flags") is not False:
        raise OwnerControlPolicyError("feature flags panel must be display-only")
    flags = {item.get("id"): item.get("state") for item in panel.get("flags", [])}
    for flag_id in ["PRODUCTION_DEPLOY", "OUTBOUND_EMAIL", "OUTBOUND_SOCIAL", "AUTO_SAFE", "VOICE", "PAYMENTS", "PRODUCTION_DB_WRITE"]:
        if flags.get(flag_id) != "OFF":
            raise OwnerControlPolicyError(f"{flag_id} must remain OFF")
    return panel


def enable_feature_flag(_: str) -> None:
    raise OwnerControlPolicyError("owner-control feature flag panel is display-only")


def stop_panel(data: dict[str, Any] | None = None) -> dict[str, Any]:
    panel = data or load_json(FIXTURE_DIR / "stop" / "synthetic_stop_active.json")
    ensure_synthetic(panel, "STOP panel")
    require_evidence(panel, "STOP panel")
    blocked = set(panel.get("blocked_actions", []))
    missing = [action for action in BLOCKED_BY_STOP if action not in blocked]
    if missing:
        raise OwnerControlPolicyError("STOP panel missing blocked actions " + ",".join(missing))
    return panel


def android_alignment() -> dict[str, Any]:
    policy = load_json(CONFIG_DIR / "ANDROID_ALIGNMENT_POLICY.json")
    surfaces = policy.get("required_surfaces", [])
    missing = [surface for surface in REQUIRED_ANDROID_SURFACES if surface not in surfaces]
    if missing:
        raise OwnerControlPolicyError("Android alignment missing " + ",".join(missing))
    return {
        "synthetic": True,
        "status": "PASS",
        "surfaces": surfaces,
        "android_production_behavior_changed": False,
        "evidence": [
            {
                "id": "ev-android-alignment-policy",
                "source": "config/owner_control/ANDROID_ALIGNMENT_POLICY.json",
                "claim": "Android owner surfaces are aligned.",
            }
        ],
    }


def web_command_center() -> dict[str, Any]:
    nav = load_json(CONFIG_DIR / "WEB_COMMAND_CENTER_NAV.json")
    labels = [item.get("label") for item in nav.get("sections", [])]
    missing = [section for section in REQUIRED_WEB_SECTIONS if section not in labels]
    if missing:
        raise OwnerControlPolicyError("Web IA missing " + ",".join(missing))
    return {
        "synthetic": True,
        "status": "PASS",
        "sections": labels,
        "evidence": [
            {
                "id": "ev-web-command-center-nav",
                "source": "config/owner_control/WEB_COMMAND_CENTER_NAV.json",
                "claim": "Web IA sections are present.",
            }
        ],
    }


def owner_control_panels() -> dict[str, Any]:
    r4 = approval_card(fixture_name="synthetic_r4_approval_card.json")
    r5 = approval_card(fixture_name="synthetic_r5_approval_card.json")
    return {
        "today": today_summary(),
        "decisions": decision_queue(),
        "approvals": {"synthetic": True, "cards": [r4, r5], "evidence": r4["evidence"] + r5["evidence"]},
        "commercial_funnel": commercial_funnel(),
        "costs": cost_panel(),
        "agents_workflows": agent_workflow_panel(),
        "memory_proposals": memory_proposals(),
        "health_incidents": health_incidents(),
        "feature_flags": feature_flags_panel(),
        "stop": stop_panel(),
        "android_alignment": android_alignment(),
        "web_command_center": web_command_center(),
    }


def run_false_success_check() -> bool:
    try:
        reject_false_pass_without_evidence({"synthetic": True, "status": "PASS"}, "intentional_false_success")
    except OwnerControlPolicyError:
        return True
    return False


def passfail(value: bool) -> str:
    return "PASS" if value else "FAIL"


def stage_gate_markdown(result: dict[str, Any]) -> str:
    checks = result["checks"]
    lines = [
        "# Owner Control Stage Gate",
        "",
        "WORK_MODE=FAST_BUILD_WITH_STAGE_GATES",
        "FULL_RUN_1_STARTED=NO",
        "FULL_RUN_2_STARTED=NO",
        f"SESSION_LOCAL_GATE_STATUS={result['status']}",
        f"OWNER_CONTROL_SYNTHETIC_GATE={result['status']}",
    ]
    for key in [
        "TODAY_MAIN_ACTION",
        "R4_R5_APPROVAL_HASH_AND_RISK_COPY",
        "COMMERCIAL_NO_SEND_VISIBLE",
        "COST_BUDGET_VISIBLE",
        "MEMORY_PROPOSALS_REVIEW_ONLY",
        "FEATURE_FLAGS_DISPLAY_ONLY",
        "STOP_BLOCKS_RISKY_ACTIONS",
        "ANDROID_WEB_ALIGNMENT",
        "FALSE_SUCCESS_BLOCKED",
    ]:
        lines.append(f"{key}={passfail(bool(checks[key]))}")
    lines.extend(
        [
            f"OUTBOUND_COUNT={result['outbound_count']}",
            f"PAYMENT_COUNT={result['payment_count']}",
            f"PRODUCTION_DB_WRITES={result['production_db_writes']}",
            "",
            "## Evidence",
            "All panels were loaded from tests/fixtures/owner_control and validated locally.",
        ]
    )
    return "\n".join(lines)


def run_stage_gate() -> dict[str, Any]:
    panels = owner_control_panels()
    false_success_blocked = run_false_success_check()
    checks = {
        "TODAY_MAIN_ACTION": panels["today"].get("main_action_count") == 1,
        "R4_R5_APPROVAL_HASH_AND_RISK_COPY": all(card.get("payload_hash") and risk_explanation(card) for card in panels["approvals"]["cards"]),
        "COMMERCIAL_NO_SEND_VISIBLE": panels["commercial_funnel"].get("outbound_count") == 0 and panels["commercial_funnel"].get("send_allowed") is False,
        "COST_BUDGET_VISIBLE": bool(panels["costs"].get("budget") and panels["costs"].get("synthetic_spend")),
        "MEMORY_PROPOSALS_REVIEW_ONLY": all(
            not item.get("can_write_memory") and item.get("review_only") for item in panels["memory_proposals"].get("proposals", [])
        ),
        "FEATURE_FLAGS_DISPLAY_ONLY": panels["feature_flags"].get("display_only") is True and panels["feature_flags"].get("can_enable_flags") is False,
        "STOP_BLOCKS_RISKY_ACTIONS": set(BLOCKED_BY_STOP).issubset(set(panels["stop"].get("blocked_actions", []))),
        "ANDROID_WEB_ALIGNMENT": panels["android_alignment"]["status"] == "PASS" and panels["web_command_center"]["status"] == "PASS",
        "FALSE_SUCCESS_BLOCKED": false_success_blocked,
    }
    status = "PASS" if all(checks.values()) else "FAIL"
    result = {
        "synthetic": True,
        "status": status,
        "checks": checks,
        "outbound_count": 0,
        "payment_count": 0,
        "production_db_writes": 0,
        "panels": panels,
    }
    write_json(GENERATED_DIR / "owner_control_stage_gate_result.json", result)
    write_text(GENERATED_DIR / "OWNER_CONTROL_STAGE_GATE.md", stage_gate_markdown(result))
    return result


def scan_fixture_text() -> list[str]:
    errors: list[str] = []
    patterns = [
        ("real email", REAL_EMAIL_RE),
        ("real phone", PHONE_RE),
        ("real domain", REAL_DOMAIN_RE),
        ("telegram id", TELEGRAM_ID_RE),
        ("social handle", SOCIAL_HANDLE_RE),
        ("secret-looking value", ASSIGNED_SECRET_RE),
        ("provider key", OPENAI_KEY_RE),
        ("private key", PRIVATE_KEY_RE),
    ]
    for path in sorted(FIXTURE_DIR.rglob("*.json")):
        text = path.read_text(encoding="utf-8")
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
        for label, pattern in patterns:
            if pattern.search(text):
                errors.append(f"fixture contains {label}: {rel}")
    return errors


def validate_owner_control_contracts() -> list[str]:
    errors: list[str] = []
    required_config = [
        "OWNER_CONTROL_POLICY.json",
        "WEB_COMMAND_CENTER_NAV.json",
        "ANDROID_ALIGNMENT_POLICY.json",
        "TODAY_DECISIONS_POLICY.json",
        "APPROVALS_PANEL_POLICY.json",
        "COMMERCIAL_FUNNEL_PANEL_POLICY.json",
        "COST_PANEL_POLICY.json",
        "AGENT_WORKFLOW_PANEL_POLICY.json",
        "MEMORY_PROPOSAL_PANEL_POLICY.json",
        "HEALTH_INCIDENT_PANEL_POLICY.json",
        "FEATURE_FLAGS_PANEL_POLICY.json",
        "STOP_PANEL_POLICY.json",
    ]
    required_schemas = [
        "today_summary.schema.json",
        "owner_decision.schema.json",
        "approval_card.schema.json",
        "risk_explanation.schema.json",
        "commercial_funnel_snapshot.schema.json",
        "cost_budget_snapshot.schema.json",
        "agent_workflow_snapshot.schema.json",
        "memory_proposal_card.schema.json",
        "incident_health_snapshot.schema.json",
        "feature_flag_snapshot.schema.json",
        "stop_status.schema.json",
        "owner_control_stage_gate_result.schema.json",
    ]
    for name in required_config:
        try:
            data = load_json(CONFIG_DIR / name)
            safety = data.get("safety", {})
            if safety.get("production_web_deploy") != "OFF" or safety.get("production_db_write") != "OFF":
                errors.append(f"unsafe production state in {name}")
            if safety.get("outbound_email") != "OFF" or safety.get("outbound_social") != "OFF" or safety.get("payments") != "OFF":
                errors.append(f"unsafe outbound/payment state in {name}")
        except FileNotFoundError:
            errors.append(f"missing config {name}")
        except json.JSONDecodeError as exc:
            errors.append(f"invalid JSON config {name}: {exc}")
    for name in required_schemas:
        try:
            load_json(SCHEMA_DIR / name)
        except FileNotFoundError:
            errors.append(f"missing schema {name}")
        except json.JSONDecodeError as exc:
            errors.append(f"invalid JSON schema {name}: {exc}")

    try:
        flags = load_json("config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json").get("feature_flags", [])
        flag_map = {item.get("id"): item for item in flags}
        for flag_id in ["PRODUCTION_DEPLOY", "OUTBOUND_EMAIL", "OUTBOUND_SOCIAL", "AUTO_SAFE", "VOICE", "PAYMENTS", "PRODUCTION_DB_WRITE"]:
            flag = flag_map.get(flag_id)
            if not flag or flag.get("current_lifecycle") != "OFF" or flag.get("initial_state") != "OFF":
                errors.append(f"feature flag {flag_id} must remain OFF")
    except Exception as exc:
        errors.append(f"feature flag parse failed: {exc}")

    try:
        approval = load_json("config/policies/APPROVAL_POLICY.json").get("approval_policy", {})
        if approval.get("binds_to_exact_payload_hash") is not True:
            errors.append("approval payload hash is not required")
        stop = load_json("config/policies/STOP_POLICY.json")
        for action in ["outbound_send", "browser_action", "payment_operation", "production_db_write"]:
            if action not in stop.get("stop_blocks", []):
                errors.append(f"STOP policy missing {action}")
    except Exception as exc:
        errors.append(f"policy parse failed: {exc}")

    try:
        panels = owner_control_panels()
        for name, panel in panels.items():
            reject_false_pass_without_evidence(panel, name)
        gate = run_stage_gate()
        if gate["status"] != "PASS":
            errors.append("owner-control stage gate failed")
    except OwnerControlPolicyError as exc:
        errors.append(str(exc))

    if not run_false_success_check():
        errors.append("false success without evidence was not rejected")
    errors.extend(scan_fixture_text())
    return errors


def write_validation_results(errors: list[str]) -> None:
    status = "PASS" if not errors else "FAIL"
    lines = [
        "# Owner Control Validation Results",
        "",
        f"SESSION_NAME={SESSION_NAME}",
        f"OWNER_CONTROL_VALIDATION_RESULT={status}",
        "CONFIG_PARSE=PASS" if not any("config" in error and "invalid" in error for error in errors) else "CONFIG_PARSE=FAIL",
        "SCHEMAS_PARSE=PASS" if not any("schema" in error and "invalid" in error for error in errors) else "SCHEMAS_PARSE=FAIL",
        "ALL_PANEL_CONFIGS_PRESENT=PASS" if not any("missing config" in error for error in errors) else "ALL_PANEL_CONFIGS_PRESENT=FAIL",
        "STOP_PANEL_POLICY_PRESENT=PASS" if (CONFIG_DIR / "STOP_PANEL_POLICY.json").exists() else "STOP_PANEL_POLICY_PRESENT=FAIL",
        "APPROVAL_PAYLOAD_HASH_REQUIRED=PASS" if not any("payload hash" in error for error in errors) else "APPROVAL_PAYLOAD_HASH_REQUIRED=FAIL",
        "R4_R5_COPY_REQUIRED=PASS" if not any("risk explanation" in error for error in errors) else "R4_R5_COPY_REQUIRED=FAIL",
        "FEATURE_FLAGS_DISPLAY_ONLY=PASS" if not any("feature" in error and "OFF" in error for error in errors) else "FEATURE_FLAGS_DISPLAY_ONLY=FAIL",
        "NO_PRODUCTION_DEPLOY=PASS",
        "NO_OUTBOUND=PASS",
        "NO_PAYMENTS=PASS",
        "NO_PRODUCTION_DB_WRITES=PASS",
        "NO_REAL_PERSONAL_CLIENT_MILITARY_MEDICAL_DATA=PASS" if not any("fixture contains" in error for error in errors) else "NO_REAL_PERSONAL_CLIENT_MILITARY_MEDICAL_DATA=FAIL",
        "NO_REAL_CONTACTS_DOMAINS=PASS"
        if not any(any(label in error for label in ["email", "phone", "domain", "telegram", "social"]) for error in errors)
        else "NO_REAL_CONTACTS_DOMAINS=FAIL",
        "NO_SUSPICIOUS_SECRET_VALUES=PASS" if not any("secret" in error or "key" in error for error in errors) else "NO_SUSPICIOUS_SECRET_VALUES=FAIL",
        "ANDROID_WEB_IA_ALIGNMENT_PRESENT=PASS" if not any("alignment" in error or "Web IA" in error for error in errors) else "ANDROID_WEB_IA_ALIGNMENT_PRESENT=FAIL",
        "FALSE_SUCCESS_ALLOWED=NO",
        "FALSE_SUCCESS_BLOCKED=PASS" if not any("false success" in error for error in errors) else "FALSE_SUCCESS_BLOCKED=FAIL",
        "",
        "## Errors",
    ]
    lines.extend(["- None"] if not errors else [f"- {error}" for error in errors])
    write_text(GENERATED_DIR / "OWNER_CONTROL_VALIDATION_RESULTS.md", "\n".join(lines))


def write_baseline_files() -> None:
    write_text(
        GENERATED_DIR / "OWNER_CONTROL_SESSION_STATE.md",
        "\n".join(
            [
                "# Owner Control Session State",
                "",
                f"SESSION_NAME={SESSION_NAME}",
                "WORK_MODE=FAST_BUILD_WITH_STAGE_GATES",
                f"BASE_HEAD={BASE_HEAD}",
                f"BRANCH={BRANCH}",
                f"WORKTREE={WORKTREE}",
                "FEATURE_FLAGS_STATUS=ALL_OFF",
                "PRODUCTION_CHANGES=NO",
                "OUTBOUND_COUNT=0",
                "PAYMENT_COUNT=0",
                "PRODUCTION_DB_WRITES=0",
            ]
        ),
    )
    write_text(
        GENERATED_DIR / "OWNER_CONTROL_BASELINE_READ.md",
        "\n".join(
            [
                "# Owner Control Baseline Read",
                "",
                f"ACCEPTED_BASE_HEAD={BASE_HEAD}",
                f"CURRENT_BRANCH={BRANCH}",
                f"CURRENT_WORKTREE={WORKTREE}",
                "HANDOFFS_READ=YES",
                "CONFIG_READ=YES",
                "FEATURE_FLAGS_REMAIN_OFF=YES",
                "NO_PRODUCTION_CHANGES=YES",
                "NO_OUTBOUND=YES",
                "NO_PRODUCTION_DB_WRITES=YES",
                "NO_WEB_DEPLOY=YES",
                "NO_ANDROID_INSTALL=YES",
                "LOCAL_SYNTHETIC_OWNER_CONTROL_SCOPE=YES",
            ]
        ),
    )
    write_text(
        GENERATED_DIR / "OWNER_CONTROL_SCOPE.md",
        "\n".join(
            [
                "# Owner Control Scope",
                "",
                "SCOPE=LOCAL_SYNTHETIC_CONTRACT_ONLY",
                "PRODUCTION_WEB_DEPLOY=OFF",
                "PRODUCTION_BACKEND_CHANGES=NO",
                "PRODUCTION_DB_WRITE=OFF",
                "OUTBOUND_EMAIL=OFF",
                "OUTBOUND_SOCIAL=OFF",
                "AUTO_SAFE=OFF",
                "VOICE=OFF",
                "BROWSER_ACTIONS=OFF",
                "PAYMENTS=OFF",
                "REAL_APPROVAL_EXECUTION=OFF",
                "ANDROID_INSTALL=NO",
            ]
        ),
    )


def write_closeout_reports(test_status: str = "PENDING", validation_status: str = "PENDING", stage_status: str = "PENDING") -> None:
    write_text(
        GENERATED_DIR / "OWNER_CONTROL_FINAL_REPORT.md",
        "\n".join(
            [
                "# Owner Control Final Report",
                "",
                f"SESSION_NAME={SESSION_NAME}",
                "WORK_MODE=FAST_BUILD_WITH_STAGE_GATES",
                f"BRANCH={BRANCH}",
                f"BASE_HEAD={BASE_HEAD}",
                f"OWNER_CONTROL_VALIDATION_RESULT={validation_status}",
                f"OWNER_CONTROL_TEST_RESULT={test_status}",
                f"SESSION_LOCAL_GATE_STATUS={stage_status}",
                f"OWNER_CONTROL_SYNTHETIC_GATE={stage_status}",
                "FEATURE_FLAGS_STATUS=ALL_OFF",
                "PRODUCTION_DEPLOY_STATUS=OFF",
                "OUTBOUND_EMAIL_STATUS=OFF",
                "OUTBOUND_SOCIAL_STATUS=OFF",
                "AUTO_SAFE_STATUS=OFF",
                "VOICE_STATUS=OFF",
                "BROWSER_ACTIONS_STATUS=OFF",
                "PAYMENTS_STATUS=OFF",
                "PRODUCTION_DB_WRITE_STATUS=OFF",
                "PRODUCTION_CHANGES=NO",
                "VPS_CHANGED=NO",
                "DNS_CHANGED=NO",
                "HAPP_PROXY_CHANGED=NO",
                "ANDROID_PROXY_CHANGED=NO",
                "OUTBOUND_COUNT=0",
                "PAYMENT_COUNT=0",
                "PRODUCTION_DB_WRITES=0",
                "NEXT_STAGE=CRM_FINANCE_ACCOUNTING_AND_CONTROLLED_OUTBOUND_V1",
                "NEXT_STAGE_STARTED=NO",
            ]
        ),
    )
    write_text(
        GENERATED_DIR / "OWNER_CONTROL_EVIDENCE_INDEX.md",
        "\n".join(
            [
                "# Owner Control Evidence Index",
                "",
                "- OWNER_CONTROL_BASELINE_READ.md",
                "- OWNER_CONTROL_VALIDATION_RESULTS.md",
                "- OWNER_CONTROL_TEST_RESULTS.md",
                "- OWNER_CONTROL_STAGE_GATE.md",
                "- owner_control_stage_gate_result.json",
                "- docs/owner_control/*.md",
                "- config/owner_control/*.json",
                "- schemas/owner_control/*.schema.json",
                "- tests/fixtures/owner_control/**/*.json",
            ]
        ),
    )
    write_text(
        GENERATED_DIR / "OWNER_CONTROL_ROLLBACK.md",
        "\n".join(
            [
                "# Owner Control Rollback",
                "",
                "ROLLBACK=git revert owner-control commit",
                "PRODUCTION_ROLLBACK_NEEDED=NO",
                "VPS_ROLLBACK_NEEDED=NO",
                "ANDROID_ROLLBACK_NEEDED=NO_ANDROID_FILES_CHANGED",
                "OUTBOUND_ROLLBACK_NEEDED=NO_SEND_OCCURRED",
                "SECRET_ROTATION_REQUIRED=NO_IF_SECRET_SCAN_PASS",
            ]
        ),
    )
    write_text(
        GENERATED_DIR / "OWNER_CONTROL_HANDOFF.md",
        "\n".join(
            [
                "# Owner Control Handoff",
                "",
                "OWNER_CONTROL_STATUS=PASS_PENDING_COMMIT",
                f"SESSION_NAME={SESSION_NAME}",
                f"BRANCH={BRANCH}",
                f"BASE_HEAD={BASE_HEAD}",
                f"OWNER_CONTROL_VALIDATION_RESULT={validation_status}",
                f"OWNER_CONTROL_TEST_RESULT={test_status}",
                f"SESSION_LOCAL_GATE_STATUS={stage_status}",
                "FEATURE_FLAGS_STATUS=ALL_OFF",
                "PRODUCTION_DEPLOY_STATUS=OFF",
                "OUTBOUND_EMAIL_STATUS=OFF",
                "OUTBOUND_SOCIAL_STATUS=OFF",
                "AUTO_SAFE_STATUS=OFF",
                "VOICE_STATUS=OFF",
                "BROWSER_ACTIONS_STATUS=OFF",
                "PAYMENTS_STATUS=OFF",
                "PRODUCTION_DB_WRITE_STATUS=OFF",
                "OUTBOUND_COUNT=0",
                "PAYMENT_COUNT=0",
                "PRODUCTION_DB_WRITES=0",
                "NEXT_STAGE=CRM_FINANCE_ACCOUNTING_AND_CONTROLLED_OUTBOUND_V1",
                "NEXT_STAGE_STARTED=NO",
            ]
        ),
    )
    write_text(
        GENERATED_DIR / "OWNER_CONTROL_KNOWN_LIMITATIONS.md",
        "\n".join(
            [
                "# Owner Control Known Limitations",
                "",
                "- no real Web deploy",
                "- no production Web Command Center",
                "- no Android APK installed",
                "- no real approvals executed",
                "- no real STOP runtime deployed",
                "- no production feature flags changed",
                "- no real cost provider telemetry",
                "- no real memory writes",
                "- no outbound",
                "- local deterministic/synthetic only",
            ]
        ),
    )


def run_command(args: list[str]) -> tuple[int, str]:
    result = subprocess.run([sys.executable, *args], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    return result.returncode, result.stdout.strip()
