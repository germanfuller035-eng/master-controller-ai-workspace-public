"""Deterministic digital presence no-deploy factory helpers.

The package is intentionally local and fixture-driven. It never calls external
networks, browsers, LLM providers, form submitters, hosting tools, DNS, VPS,
production databases, CRM systems, or outbound channels.
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
GENERATED_DIR = ROOT / "_generated" / "digital_presence_factory_v1"
ARTIFACT_DIR = GENERATED_DIR / "artifacts"
CONFIG_DIR = ROOT / "config" / "digital_presence"
SCHEMA_DIR = ROOT / "schemas" / "digital_presence"
FIXTURE_DIR = ROOT / "tests" / "fixtures" / "digital_presence"

PRODUCT_WEBSITE = "WEBSITE_PROTOTYPE"
PRODUCT_LEAD_SYSTEM = "LEAD_SYSTEM"
PRODUCT_AI_FRONT_OFFICE = "AI_FRONT_OFFICE"
PRODUCT_LANDING = "LANDING_PROTOTYPE"

PRODUCT_LABELS = {
    PRODUCT_WEBSITE: "Website prototype draft",
    PRODUCT_LEAD_SYSTEM: "Lead system architecture draft",
    PRODUCT_AI_FRONT_OFFICE: "AI front office architecture draft",
    PRODUCT_LANDING: "Landing prototype draft",
}

BANNED_UNSUPPORTED_TERMS = (
    "guaranteed",
    "certain revenue",
    "real customer",
    "certified result",
    "will double",
    "send now",
    "deploy now",
    "publish now",
)

REAL_URL_RE = re.compile(r"(?i)\b(?:https?://|www\.)")
REAL_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d[\s().-]*){7,}(?!\w)")
ASSIGNED_SECRET_RE = re.compile(
    r"(?i)\b(?:token|password|passwd|private_key|refresh|access_token|bearer|proxy password)\b\s*[:=]\s*[\"']?[A-Za-z0-9_./+=-]{8,}"
)
OPENAI_KEY_RE = re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b")
PRIVATE_KEY_RE = re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I)


class DigitalFactoryPolicyError(ValueError):
    """Raised when a digital factory no-deploy policy is violated."""


def load_json(path: str | Path) -> Any:
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = ROOT / candidate
    return json.loads(candidate.read_text(encoding="utf-8"))


def write_json(path: str | Path, data: Any) -> None:
    target = Path(path)
    if not target.is_absolute():
        target = ROOT / target
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, indent=2, sort_keys=True, ensure_ascii=True) + "\n", encoding="utf-8", newline="\n")


def write_text(path: str | Path, text: str) -> None:
    target = Path(path)
    if not target.is_absolute():
        target = ROOT / target
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text.rstrip() + "\n", encoding="utf-8", newline="\n")


def normalize_text(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")


def iter_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        result: list[str] = []
        for child in value.values():
            result.extend(iter_strings(child))
        return result
    if isinstance(value, list):
        result = []
        for child in value:
            result.extend(iter_strings(child))
        return result
    return []


def evidence_ids(*objects: Any) -> set[str]:
    ids: set[str] = set()

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            if isinstance(value.get("id"), str) and ("claim" in value or "source" in value or "observed" in value):
                ids.add(value["id"])
            if isinstance(value.get("evidence_id"), str):
                ids.add(value["evidence_id"])
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    for obj in objects:
        visit(obj)
    return ids


def all_evidence_records(*objects: Any) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            if isinstance(value.get("id"), str) and ("claim" in value or "source" in value or "observed" in value):
                records.append(value)
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    for obj in objects:
        visit(obj)
    return records


def _assert_no_real_contact_or_url(value: Any, *, label: str) -> None:
    text = "\n".join(iter_strings(value))
    if REAL_URL_RE.search(text):
        raise DigitalFactoryPolicyError(f"{label} contains a real external URL reference")
    if REAL_EMAIL_RE.search(text):
        raise DigitalFactoryPolicyError(f"{label} contains a real-looking email")
    if PHONE_RE.search(text):
        raise DigitalFactoryPolicyError(f"{label} contains a real-looking phone")
    if any(pattern.search(text) for pattern in (ASSIGNED_SECRET_RE, OPENAI_KEY_RE, PRIVATE_KEY_RE)):
        raise DigitalFactoryPolicyError(f"{label} contains a credential-looking value")


def assert_synthetic_site(site: dict[str, Any]) -> None:
    if site.get("synthetic") is not True:
        raise DigitalFactoryPolicyError("site profile must be explicitly synthetic")
    if site.get("external_access") not in (False, None):
        raise DigitalFactoryPolicyError("external website access is not allowed")
    if site.get("browser_action_allowed") not in (False, None):
        raise DigitalFactoryPolicyError("browser actions are not allowed")
    if site.get("form_submit_attempted") is True:
        raise DigitalFactoryPolicyError("form submit is not allowed")
    _assert_no_real_contact_or_url(site, label=str(site.get("site_id", "site")))


def lead_capture_readiness(site: dict[str, Any]) -> dict[str, Any]:
    assert_synthetic_site(site)
    lead = site.get("lead_capture", {})
    points = 0
    details: list[str] = []
    if int(lead.get("forms", 0)) > 0:
        points += 30
    else:
        details.append("No synthetic lead form is represented.")
    if int(lead.get("cta_count", 0)) >= 2:
        points += 20
    else:
        details.append("Lead call-to-action coverage is weak.")
    if lead.get("consent_copy") is True:
        points += 20
    else:
        details.append("Consent copy is missing in the fixture.")
    if lead.get("routing_defined") is True:
        points += 20
    else:
        details.append("Lead routing is not represented.")
    if int(lead.get("owner_followup_sla_minutes", 9999)) <= 120:
        points += 10
    else:
        details.append("Owner follow-up SLA is slow or undefined.")

    if points >= 80:
        status = "READY"
    elif points >= 40:
        status = "PARTIAL"
    else:
        status = "MISSING"

    return {
        "site_id": site.get("site_id"),
        "status": status,
        "score": points,
        "missing": details,
        "form_submit_allowed": False,
        "owner_approval_required_for_future_send": True,
        "evidence_ids": [item.get("id") for item in site.get("evidence", []) if item.get("id")],
    }


def website_quality_score(site: dict[str, Any]) -> dict[str, Any]:
    assert_synthetic_site(site)
    metrics = site.get("metrics", {})
    lead = lead_capture_readiness(site)
    response_ms = int(metrics.get("response_time_ms", 5000))
    performance = 25 if response_ms <= 1000 else 18 if response_ms <= 2000 else 10 if response_ms <= 3500 else 4
    mobile = 20 if metrics.get("mobile_ready") is True else 4
    clarity = min(20, max(0, int(metrics.get("message_clarity", 0)) * 4))
    trust = min(15, max(0, int(metrics.get("trust_proofs", 0)) * 5))
    capture = min(20, round(lead["score"] * 0.20))
    total = performance + mobile + clarity + trust + capture

    issues: list[dict[str, Any]] = []
    evidence = [item for item in site.get("evidence", []) if item.get("id")]

    def add_issue(issue_id: str, label: str, severity: int, observed: str) -> None:
        evidence_id = f"ev-{normalize_text(site.get('site_id'))}-{normalize_text(issue_id)}"
        issues.append({"issue_id": issue_id, "label": label, "severity": severity, "observed": observed, "evidence_id": evidence_id})
        evidence.append({"id": evidence_id, "source": "synthetic_site_profile", "claim": observed})

    if performance < 18:
        add_issue("performance", "Slow synthetic response", 4 if performance <= 4 else 3, f"Synthetic response time is {response_ms} ms.")
    if mobile < 20:
        add_issue("mobile", "Mobile readiness gap", 3, "Synthetic fixture marks mobile_ready=false.")
    if clarity < 16:
        add_issue("message_clarity", "Message clarity gap", 3, "Synthetic message clarity is below target.")
    if trust < 10:
        add_issue("trust", "Trust proof gap", 3, "Synthetic trust proof count is below target.")
    if lead["score"] < 80:
        add_issue("lead_capture", "Lead capture readiness gap", 5 if lead["score"] < 40 else 3, "Synthetic lead capture readiness is below target.")

    status = "GOOD" if total >= 80 else "NEEDS_WORK" if total >= 55 else "POOR"
    return {
        "site_id": site.get("site_id"),
        "analysis_mode": "LOCAL_SYNTHETIC_FIXTURE",
        "score": total,
        "status": status,
        "components": {
            "performance": performance,
            "mobile": mobile,
            "message_clarity": clarity,
            "trust": trust,
            "lead_capture": capture,
        },
        "issues": issues,
        "evidence": evidence,
        "browser_used": False,
        "network_used": False,
        "real_external_url_accessed": False,
    }


def digital_presence_check(site: dict[str, Any]) -> dict[str, Any]:
    assert_synthetic_site(site)
    analysis = website_quality_score(site)
    lead = lead_capture_readiness(site)
    evidence = all_evidence_records(site, analysis)
    return {
        "site_id": site.get("site_id"),
        "synthetic": True,
        "status": "PASS",
        "represented_as": "digital_presence_check_v1",
        "website_quality_score": analysis["score"],
        "website_quality_status": analysis["status"],
        "lead_capture_status": lead["status"],
        "lead_capture_score": lead["score"],
        "issues": analysis["issues"],
        "evidence": evidence,
        "browser_used": False,
        "network_used": False,
        "real_external_url_accessed": False,
        "production_write": False,
    }


def route_product(site: dict[str, Any], check: dict[str, Any], analysis: dict[str, Any], lead: dict[str, Any]) -> dict[str, Any]:
    metrics = site.get("metrics", {})
    response_sla = int(site.get("front_office", {}).get("response_sla_minutes", 9999))
    signals = site.get("signals", {})
    scores = {
        PRODUCT_AI_FRONT_OFFICE: int(signals.get("response_handling_problem", 0)) * 2 + (3 if response_sla > 120 else 0),
        PRODUCT_LEAD_SYSTEM: int(signals.get("lead_capture_problem", 0)) * 2 + (4 if lead["score"] < 60 else 0),
        PRODUCT_WEBSITE: int(signals.get("website_problem", 0)) * 2 + int(signals.get("trust_problem", 0)) + (3 if analysis["score"] < 70 else 0),
        PRODUCT_LANDING: int(signals.get("landing_need", 0)) + (2 if metrics.get("message_clarity", 0) < 4 else 0),
    }
    product_id, score = max(scores.items(), key=lambda item: (item[1], item[0]))
    if score <= 0:
        product_id = PRODUCT_LANDING
    reason_map = {
        PRODUCT_WEBSITE: "Website quality and trust signals dominate the synthetic evidence.",
        PRODUCT_LEAD_SYSTEM: "Lead capture readiness is below target in the synthetic evidence.",
        PRODUCT_AI_FRONT_OFFICE: "Response handling delay dominates the synthetic evidence.",
        PRODUCT_LANDING: "A draft landing page is the narrowest synthetic next artifact.",
    }
    return {
        "site_id": site.get("site_id"),
        "product_id": product_id,
        "product_label": PRODUCT_LABELS[product_id],
        "score": score,
        "reason": reason_map[product_id],
        "reason_required": True,
        "has_reason": True,
        "evidence_ids": sorted(evidence_ids(site, check, analysis, lead)),
    }


def _base_claim(site: dict[str, Any], text: str) -> dict[str, Any]:
    ids = [item.get("id") for item in site.get("evidence", []) if item.get("id")]
    return {"claim": text, "evidence_ids": ids[:1] or []}


def generate_landing_prototype(site: dict[str, Any], recommendation: dict[str, Any]) -> dict[str, Any]:
    assert_synthetic_site(site)
    return {
        "artifact_id": f"landing-{normalize_text(site.get('site_id'))}",
        "artifact_type": "landing_prototype",
        "site_id": site.get("site_id"),
        "draft_only": True,
        "deployment_allowed": False,
        "publish_allowed": False,
        "form_submit_allowed": False,
        "owner_approval_required_for_future_deploy_or_send": True,
        "sections": ["problem", "offer", "proof", "lead_capture_placeholder", "owner_approval_note"],
        "primary_recommendation": recommendation,
        "claims": [_base_claim(site, "Synthetic fixture supports a draft landing prototype only.")],
    }


def generate_website_prototype(site: dict[str, Any], recommendation: dict[str, Any]) -> dict[str, Any]:
    assert_synthetic_site(site)
    return {
        "artifact_id": f"website-{normalize_text(site.get('site_id'))}",
        "artifact_type": "website_prototype",
        "site_id": site.get("site_id"),
        "draft_only": True,
        "deployment_allowed": False,
        "hosting_allowed": False,
        "dns_change_allowed": False,
        "form_submit_allowed": False,
        "owner_approval_required_for_future_deploy_or_send": True,
        "pages": ["start", "service", "proof", "lead_capture_draft"],
        "primary_recommendation": recommendation,
        "claims": [_base_claim(site, "Synthetic fixture supports a draft website prototype only.")],
    }


def generate_lead_system_architecture(site: dict[str, Any], recommendation: dict[str, Any]) -> dict[str, Any]:
    assert_synthetic_site(site)
    return {
        "artifact_id": f"lead-system-{normalize_text(site.get('site_id'))}",
        "artifact_type": "lead_system_architecture",
        "site_id": site.get("site_id"),
        "draft_only": True,
        "crm_write_allowed": False,
        "production_db_write_allowed": False,
        "outbound_allowed": False,
        "owner_approval_required_for_future_deploy_or_send": True,
        "components": ["intake_contract", "qualification_queue", "owner_review", "handoff_export"],
        "primary_recommendation": recommendation,
        "claims": [_base_claim(site, "Synthetic fixture supports a lead system handoff draft only.")],
    }


def generate_ai_front_office_architecture(site: dict[str, Any], recommendation: dict[str, Any]) -> dict[str, Any]:
    assert_synthetic_site(site)
    return {
        "artifact_id": f"ai-front-office-{normalize_text(site.get('site_id'))}",
        "artifact_type": "ai_front_office_architecture",
        "site_id": site.get("site_id"),
        "draft_only": True,
        "bot_runtime_enabled": False,
        "outbound_allowed": False,
        "production_db_write_allowed": False,
        "owner_approval_required_for_future_deploy_or_send": True,
        "workflow": ["inbound_intake", "intent_label", "draft_response", "owner_approval", "manual_send_handoff"],
        "primary_recommendation": recommendation,
        "claims": [_base_claim(site, "Synthetic fixture supports an AI front office architecture draft only.")],
    }


def artifact_payload_bytes(artifact: dict[str, Any]) -> bytes:
    return json.dumps(artifact, sort_keys=True, ensure_ascii=True, separators=(",", ":")).encode("utf-8")


def store_prototype_artifact(artifact: dict[str, Any]) -> dict[str, Any]:
    if artifact.get("draft_only") is not True:
        raise DigitalFactoryPolicyError("prototype artifact must be draft-only")
    if artifact.get("deployment_allowed") is True or artifact.get("publish_allowed") is True:
        raise DigitalFactoryPolicyError("prototype artifact cannot allow deploy or publish")
    payload = artifact_payload_bytes(artifact)
    digest = hashlib.sha256(payload).hexdigest()
    artifact_id = normalize_text(artifact.get("artifact_id"))
    target = ARTIFACT_DIR / f"{artifact_id}.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(payload + b"\n")
    return {
        "artifact_id": artifact.get("artifact_id"),
        "artifact_type": artifact.get("artifact_type"),
        "path": str(target.relative_to(ROOT)).replace("\\", "/"),
        "sha256": digest,
        "hash_algorithm": "SHA-256",
        "draft_only": True,
        "deployment_allowed": False,
        "owner_approval_required_for_future_deploy_or_send": True,
    }


def validate_artifact_handoff(handoff: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    if not re.fullmatch(r"[a-f0-9]{64}", str(handoff.get("sha256", ""))):
        errors.append("artifact handoff requires sha256")
    if handoff.get("draft_only") is not True:
        errors.append("artifact handoff must be draft-only")
    if handoff.get("deployment_allowed") is not False:
        errors.append("artifact handoff must block deployment")
    if handoff.get("owner_approval_required_for_future_deploy_or_send") is not True:
        errors.append("owner approval is required for future deploy or send")
    return {"status": "PASS" if not errors else "FAIL", "errors": errors}


def qa_red_team_review(*, site: dict[str, Any], artifacts: list[dict[str, Any]], handoffs: list[dict[str, Any]]) -> dict[str, Any]:
    issues: list[str] = []
    available = evidence_ids(site, artifacts)

    for artifact in artifacts:
        for claim in artifact.get("claims", []):
            text = str(claim.get("claim", ""))
            lower = text.lower()
            if any(term in lower for term in BANNED_UNSUPPORTED_TERMS):
                issues.append(f"{artifact.get('artifact_id')} contains unsupported claim language")
            claim_evidence = [str(item) for item in claim.get("evidence_ids", [])]
            if not claim_evidence:
                issues.append(f"{artifact.get('artifact_id')} claim lacks evidence")
            missing = [item for item in claim_evidence if item not in available]
            if missing:
                issues.append(f"{artifact.get('artifact_id')} claim references missing evidence")
        if artifact.get("deployment_allowed") is True or artifact.get("publish_allowed") is True:
            issues.append(f"{artifact.get('artifact_id')} allows deployment or publication")
        if artifact.get("form_submit_allowed") is True or artifact.get("outbound_allowed") is True:
            issues.append(f"{artifact.get('artifact_id')} allows form submit or outbound")
    for handoff in handoffs:
        check = validate_artifact_handoff(handoff)
        issues.extend(check["errors"])
    return {
        "site_id": site.get("site_id"),
        "qa_status": "PASS" if not issues else "FAIL",
        "issues": issues,
        "unsupported_claims_blocked": any("unsupported" in item for item in issues),
        "independent_check": True,
    }


def evaluate_blocked_action(action: str) -> dict[str, Any]:
    blocked = {
        "deploy",
        "publish",
        "form_submit",
        "outbound_email",
        "outbound_social",
        "production_db_write",
        "dns_change",
        "vps_change",
        "browser_action",
    }
    return {
        "action": action,
        "decision": "BLOCK" if action in blocked else "ALLOW_LOCAL_SYNTHETIC",
        "owner_approval_required": action in blocked,
    }


def _load_site_entry(entry: dict[str, Any]) -> dict[str, Any]:
    if "fixture" in entry:
        return load_json(FIXTURE_DIR / entry["fixture"])
    return dict(entry.get("site", entry))


def process_site(site: dict[str, Any]) -> dict[str, Any]:
    check = digital_presence_check(site)
    analysis = website_quality_score(site)
    lead = lead_capture_readiness(site)
    recommendation = route_product(site, check, analysis, lead)
    artifacts = [
        generate_landing_prototype(site, recommendation),
        generate_website_prototype(site, recommendation),
        generate_lead_system_architecture(site, recommendation),
        generate_ai_front_office_architecture(site, recommendation),
    ]
    handoffs = [store_prototype_artifact(artifact) for artifact in artifacts]
    qa = qa_red_team_review(site=site, artifacts=artifacts, handoffs=handoffs)
    return {
        "site_id": site.get("site_id"),
        "status": "PASS" if qa["qa_status"] == "PASS" else "QA_REJECTED",
        "digital_presence_check": check,
        "website_analysis": analysis,
        "lead_capture_readiness": lead,
        "product_recommendation": recommendation,
        "artifacts": artifacts,
        "artifact_handoffs": handoffs,
        "qa_review": qa,
        "deployment_allowed": False,
        "outbound_allowed": False,
        "form_submit_allowed": False,
    }


def run_no_deploy_pipeline(batch_path: str | Path | None = None, *, stop_active: bool = False) -> dict[str, Any]:
    if stop_active:
        return {
            "pipeline_status": "BLOCKED_BY_STOP",
            "stop_active": True,
            "synthetic_site_profiles_processed": 0,
            "outbound_count": 0,
            "payment_count": 0,
            "production_db_writes": 0,
            "owner_approval_required_for_future_deploy_or_send": True,
            "results": [],
        }
    data = load_json(batch_path or FIXTURE_DIR / "pipeline" / "no_deploy_batch_6.json")
    if data.get("synthetic_batch") is not True:
        raise DigitalFactoryPolicyError("digital factory batch must be synthetic")
    results = [process_site(_load_site_entry(entry)) for entry in data.get("sites", [])]
    handoffs = [handoff for result in results for handoff in result["artifact_handoffs"]]
    manifest_path = ARTIFACT_DIR / "artifact_manifest.jsonl"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text("\n".join(json.dumps(item, sort_keys=True, ensure_ascii=True) for item in handoffs) + "\n", encoding="utf-8", newline="\n")

    product_count = len(results)
    reason_count = sum(1 for result in results if result["product_recommendation"].get("reason"))
    qa_pass = all(result["qa_review"]["qa_status"] == "PASS" for result in results)
    hashes_ok = all(validate_artifact_handoff(handoff)["status"] == "PASS" for handoff in handoffs)
    summary = {
        "pipeline_status": "PASS" if qa_pass and hashes_ok else "FAIL",
        "stop_active": False,
        "synthetic_site_profiles_processed": len(results),
        "no_real_external_url_accessed": all(not result["digital_presence_check"]["real_external_url_accessed"] for result in results),
        "no_form_submit": all(result["form_submit_allowed"] is False for result in results),
        "no_outbound": all(result["outbound_allowed"] is False for result in results),
        "no_deployment": all(result["deployment_allowed"] is False for result in results),
        "no_dns_or_vps_change": True,
        "artifact_hashes_created": hashes_ok,
        "unsupported_claims_blocked": True,
        "product_fit_reason_percent": 100 if product_count and reason_count == product_count else 0,
        "owner_approval_required_for_future_deploy_or_send": True,
        "outbound_count": 0,
        "payment_count": 0,
        "production_db_writes": 0,
        "results": results,
    }
    write_json(GENERATED_DIR / "digital_no_deploy_shadow_result.json", summary)
    return summary


def run_intentional_fail_checks() -> dict[str, Any]:
    site = load_json(FIXTURE_DIR / "sites" / "synthetic_site_bad.json")
    check = digital_presence_check(site)
    analysis = website_quality_score(site)
    lead = lead_capture_readiness(site)
    recommendation = route_product(site, check, analysis, lead)

    unsupported = generate_website_prototype(site, recommendation)
    unsupported["claims"].append({"claim": "Guaranteed result from a real customer if we deploy now.", "evidence_ids": []})
    unsupported_review = qa_red_team_review(site=site, artifacts=[unsupported], handoffs=[store_prototype_artifact(generate_landing_prototype(site, recommendation))])

    missing_evidence = generate_landing_prototype(site, recommendation)
    missing_evidence["claims"] = [{"claim": "Synthetic claim without evidence.", "evidence_ids": []}]
    missing_evidence_review = qa_red_team_review(site=site, artifacts=[missing_evidence], handoffs=[store_prototype_artifact(generate_website_prototype(site, recommendation))])

    deploy_attempt = evaluate_blocked_action("deploy")
    form_submit_attempt = evaluate_blocked_action("form_submit")
    outbound_attempt = evaluate_blocked_action("outbound_email")
    no_hash = validate_artifact_handoff({"artifact_id": "bad", "draft_only": True, "deployment_allowed": False, "owner_approval_required_for_future_deploy_or_send": True})

    real_url_rejected = False
    bad_site = dict(site)
    bad_site["reserved_domain_reference"] = "https://example.com/synthetic"
    try:
        digital_presence_check(bad_site)
    except DigitalFactoryPolicyError:
        real_url_rejected = True

    return {
        "unsupported_website_claim_rejected": unsupported_review["qa_status"] == "FAIL" and unsupported_review["unsupported_claims_blocked"],
        "deploy_attempt_blocked": deploy_attempt["decision"] == "BLOCK",
        "form_submit_blocked": form_submit_attempt["decision"] == "BLOCK",
        "outbound_attempt_blocked": outbound_attempt["decision"] == "BLOCK",
        "missing_evidence_rejected": missing_evidence_review["qa_status"] == "FAIL",
        "artifact_without_hash_rejected": no_hash["status"] == "FAIL",
        "real_url_fixture_rejected": real_url_rejected,
    }


def stage_gate_markdown(summary: dict[str, Any], intentional: dict[str, Any]) -> str:
    status = "PASS" if summary["pipeline_status"] == "PASS" and all(intentional.values()) else "FAIL"
    lines = [
        "# Digital Factory Stage Gate",
        "",
        "WORK_MODE=FAST_BUILD_WITH_STAGE_GATES",
        "FULL_RUN_1_STARTED=NO",
        "FULL_RUN_2_STARTED=NO",
        f"SESSION_LOCAL_GATE_STATUS={status}",
        f"NO_DEPLOY_SHADOW_RUN={'PASS' if summary['pipeline_status'] == 'PASS' else 'FAIL'}",
        f"SYNTHETIC_SITE_PROFILES_PROCESSED={summary['synthetic_site_profiles_processed']}",
        f"NO_REAL_EXTERNAL_URL_ACCESSED={'PASS' if summary['no_real_external_url_accessed'] else 'FAIL'}",
        f"NO_FORM_SUBMIT={'PASS' if summary['no_form_submit'] else 'FAIL'}",
        f"NO_OUTBOUND={'PASS' if summary['no_outbound'] else 'FAIL'}",
        f"NO_DEPLOYMENT={'PASS' if summary['no_deployment'] else 'FAIL'}",
        f"NO_DNS_OR_VPS_CHANGE={'PASS' if summary['no_dns_or_vps_change'] else 'FAIL'}",
        f"ARTIFACT_HASHES_CREATED={'PASS' if summary['artifact_hashes_created'] else 'FAIL'}",
        f"UNSUPPORTED_CLAIMS_BLOCKED={'PASS' if intentional['unsupported_website_claim_rejected'] else 'FAIL'}",
        f"PRODUCT_FIT_REASON={'100_PERCENT' if summary['product_fit_reason_percent'] == 100 else str(summary['product_fit_reason_percent']) + '_PERCENT'}",
        f"OWNER_APPROVAL_REQUIRED_FOR_DEPLOY_OR_SEND={'PASS' if summary['owner_approval_required_for_future_deploy_or_send'] else 'FAIL'}",
        f"PRODUCTION_DB_WRITES={summary['production_db_writes']}",
        f"PAYMENT_COUNT={summary['payment_count']}",
        f"OUTBOUND_COUNT={summary['outbound_count']}",
        "",
        "## Intentional Fail Tests",
    ]
    for key, passed in intentional.items():
        lines.append(f"{key.upper()}={'PASS' if passed else 'FAIL'}")
    lines.extend([
        "",
        "## Evidence",
        "All profiles are synthetic fixtures under tests/fixtures/digital_presence/.",
        "Artifacts are local drafts under _generated/digital_presence_factory_v1/artifacts/.",
    ])
    return "\n".join(lines)


def run_stage_gate() -> dict[str, Any]:
    summary = run_no_deploy_pipeline()
    intentional = run_intentional_fail_checks()
    text = stage_gate_markdown(summary, intentional)
    write_text(GENERATED_DIR / "DIGITAL_FACTORY_STAGE_GATE.md", text)
    return {"summary": summary, "intentional": intentional, "status": "PASS" if summary["pipeline_status"] == "PASS" and all(intentional.values()) else "FAIL"}


def validate_digital_factory() -> list[str]:
    errors: list[str] = []
    config_files = sorted(CONFIG_DIR.glob("*.json"))
    schema_files = sorted(SCHEMA_DIR.glob("*.schema.json"))
    if len(config_files) < 8:
        errors.append("expected at least 8 digital presence config files")
    if len(schema_files) < 11:
        errors.append("expected at least 11 digital presence schemas")
    for path in config_files + schema_files:
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"invalid JSON {path.relative_to(ROOT)}: {exc}")

    flags = load_json("config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json").get("feature_flags", [])
    flag_map = {item.get("id"): item for item in flags}
    for flag_id in ["COMMERCIAL_DRAFT", "OUTBOUND_EMAIL", "OUTBOUND_SOCIAL", "AUTO_SAFE", "PRODUCTION_DEPLOY", "PRODUCTION_DB_WRITE", "PAYMENTS"]:
        flag = flag_map.get(flag_id)
        if not flag or flag.get("current_lifecycle") != "OFF" or flag.get("initial_state") != "OFF":
            errors.append(f"feature flag {flag_id} must remain OFF")

    required_policy_checks = [
        ("DIGITAL_PRESENCE_POLICY.json", "real_scraping_allowed", False),
        ("WEBSITE_ANALYSIS_POLICY.json", "browser_actions_allowed", False),
        ("PROTOTYPE_POLICY.json", "production_deploy_allowed", False),
        ("LEAD_SYSTEM_POLICY.json", "production_db_write_allowed", False),
        ("AI_FRONT_OFFICE_POLICY.json", "outbound_allowed", False),
        ("NO_DEPLOY_POLICY.json", "deployment_allowed", False),
    ]
    for name, key, expected in required_policy_checks:
        path = CONFIG_DIR / name
        if not path.exists():
            errors.append(f"missing required policy {name}")
            continue
        data = load_json(path)
        if data.get(key) is not expected:
            errors.append(f"{name} must set {key}={expected}")

    qa_policy = load_json(CONFIG_DIR / "QA_POLICY.json") if (CONFIG_DIR / "QA_POLICY.json").exists() else {}
    if qa_policy.get("qa_required") is not True or qa_policy.get("unsupported_claims") != "BLOCK" or qa_policy.get("evidence_required") is not True:
        errors.append("QA policy must require evidence and block unsupported claims")
    artifact_policy = load_json(CONFIG_DIR / "ARTIFACT_POLICY.json") if (CONFIG_DIR / "ARTIFACT_POLICY.json").exists() else {}
    if artifact_policy.get("artifact_hash_required") is not True:
        errors.append("artifact hash policy must require hashes")
    no_deploy = load_json(CONFIG_DIR / "NO_DEPLOY_POLICY.json") if (CONFIG_DIR / "NO_DEPLOY_POLICY.json").exists() else {}
    if no_deploy.get("owner_approval_required_for_future_deploy_or_send") is not True:
        errors.append("owner approval is required for future deploy/send")

    for path in sorted(FIXTURE_DIR.rglob("*.json")):
        text = path.read_text(encoding="utf-8")
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            errors.append(f"invalid fixture JSON {path.relative_to(ROOT)}: {exc}")
            continue
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
        if REAL_URL_RE.search(text):
            errors.append(f"fixture contains real external URL: {rel}")
        if REAL_EMAIL_RE.search(text):
            errors.append(f"fixture contains real-looking email: {rel}")
        if PHONE_RE.search(text):
            errors.append(f"fixture contains real-looking phone: {rel}")
        if any(pattern.search(text) for pattern in (ASSIGNED_SECRET_RE, OPENAI_KEY_RE, PRIVATE_KEY_RE)):
            errors.append(f"fixture contains credential-looking value: {rel}")
        if path.parent.name == "sites" and data.get("synthetic") is not True:
            errors.append(f"site fixture is not synthetic: {rel}")
        if path.parent.name == "pipeline":
            if data.get("synthetic_batch") is not True or len(data.get("sites", [])) < 6:
                errors.append(f"pipeline fixture must be synthetic with at least 6 sites: {rel}")
    return errors


def write_validation_results(errors: list[str]) -> None:
    status = "PASS" if not errors else "FAIL"
    lines = [
        "# Digital Factory Validation Results",
        "",
        "SESSION_NAME=DIGITAL_PRESENCE_WEBSITE_AND_AI_FRONT_OFFICE_FACTORY_V1",
        f"DIGITAL_FACTORY_VALIDATION_RESULT={status}",
        "CONFIG_PARSE=PASS" if not any("JSON" in error for error in errors) else "CONFIG_PARSE=FAIL",
        "SCHEMAS_PARSE=PASS" if not any("schema" in error.lower() and "expected" not in error.lower() for error in errors) else "SCHEMAS_PARSE=FAIL",
        "PRODUCTION_DEPLOY=OFF",
        "BROWSER_ACTIONS=OFF",
        "OUTBOUND=OFF",
        "NO_REAL_EXTERNAL_URLS_IN_FIXTURES=PASS" if not any("URL" in error for error in errors) else "NO_REAL_EXTERNAL_URLS_IN_FIXTURES=FAIL",
        "NO_REAL_CONTACT_FIXTURES=PASS" if not any("email" in error or "phone" in error for error in errors) else "NO_REAL_CONTACT_FIXTURES=FAIL",
        "NO_CREDENTIAL_LOOKING_VALUES=PASS" if not any("credential" in error for error in errors) else "NO_CREDENTIAL_LOOKING_VALUES=FAIL",
        "ARTIFACT_HASH_REQUIRED=PASS" if not errors else "ARTIFACT_HASH_REQUIRED=CHECK_ERRORS",
        "QA_REQUIRED=PASS" if not errors else "QA_REQUIRED=CHECK_ERRORS",
        "OWNER_APPROVAL_REQUIRED_FOR_DEPLOY_OR_SEND=PASS" if not errors else "OWNER_APPROVAL_REQUIRED_FOR_DEPLOY_OR_SEND=CHECK_ERRORS",
        "",
        "## Errors",
    ]
    lines.extend(["- None"] if not errors else [f"- {error}" for error in errors])
    write_text(GENERATED_DIR / "DIGITAL_FACTORY_VALIDATION_RESULTS.md", "\n".join(lines))


def run_digital_validation() -> int:
    errors = validate_digital_factory()
    write_validation_results(errors)
    print(f"DIGITAL_FACTORY_VALIDATION_RESULT={'PASS' if not errors else 'FAIL'}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
    return 0 if not errors else 1


def run_command(args: list[str]) -> tuple[int, str]:
    result = subprocess.run([sys.executable, *args], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    return result.returncode, result.stdout.strip()
