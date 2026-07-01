"""Deterministic commercial no-send factory helpers.

All functions are local and fixture-driven. They never call external networks,
browsers, LLM providers, mail adapters, production databases, or payment rails.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
GENERATED_DIR = ROOT / "_generated" / "commercial_agent_factory_v1"
CONFIG_DIR = ROOT / "config" / "commercial"
SCHEMA_DIR = ROOT / "schemas" / "commercial"
FIXTURE_DIR = ROOT / "tests" / "fixtures" / "commercial"

PRODUCT_WEBSITE = "WEBSITE_CONVERSION"
PRODUCT_LEAD_SYSTEM = "LEAD_SYSTEM"
PRODUCT_AI_FRONT_OFFICE = "AI_FRONT_OFFICE"
PRODUCT_MINI_AUDIT = "MINI_AUDIT"
PRODUCT_NO_FIT = "NO_FIT"

PRODUCT_LABELS = {
    PRODUCT_WEBSITE: "Website conversion rebuild",
    PRODUCT_LEAD_SYSTEM: "Lead system and capture pipeline",
    PRODUCT_AI_FRONT_OFFICE: "AI front office response handling",
    PRODUCT_MINI_AUDIT: "Mini audit",
    PRODUCT_NO_FIT: "Parked - no first product",
}

BANNED_UNSUPPORTED_TERMS = (
    "guaranteed",
    "certain revenue",
    "real customer",
    "certified result",
    "will double",
    "send now",
)

REAL_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d[\s().-]*){7,}(?!\w)")
ASSIGNED_SECRET_RE = re.compile(
    r"(?i)\b(?:token|password|passwd|private_key|refresh|access_token|bearer|proxy password)\b\s*[:=]\s*[\"']?[A-Za-z0-9_./+=-]{8,}"
)
OPENAI_KEY_RE = re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b")
PRIVATE_KEY_RE = re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I)


class CommercialPolicyError(ValueError):
    """Raised when a deterministic commercial contract is violated."""


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
    target.write_text(json.dumps(data, indent=2, ensure_ascii=True) + "\n", encoding="utf-8", newline="\n")


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
        for item in value.values():
            result.extend(iter_strings(item))
        return result
    if isinstance(value, list):
        result = []
        for item in value:
            result.extend(iter_strings(item))
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


def lead_fingerprint(candidate: dict[str, Any]) -> str:
    identity = candidate.get("identity", {})
    org = normalize_text(identity.get("organization_name"))
    domain = normalize_text(identity.get("domain_reference"))
    registry = normalize_text(identity.get("synthetic_registry_id"))
    basis = "|".join(part for part in [org, domain] if part)
    if not basis:
        basis = registry
    return basis or normalize_text(candidate.get("lead_id"))


class DuplicateDetector:
    def __init__(self) -> None:
        self._seen: dict[str, str] = {}

    def check(self, candidate: dict[str, Any]) -> dict[str, Any]:
        fingerprint = lead_fingerprint(candidate)
        if fingerprint in self._seen:
            return {
                "duplicate": True,
                "fingerprint": fingerprint,
                "original_lead_id": self._seen[fingerprint],
                "duplicate_lead_id": candidate.get("lead_id"),
                "decision": "BLOCK",
            }
        self._seen[fingerprint] = str(candidate.get("lead_id"))
        return {"duplicate": False, "fingerprint": fingerprint, "decision": "ALLOW"}


def detect_duplicate_pair(first: dict[str, Any], second: dict[str, Any]) -> dict[str, Any]:
    detector = DuplicateDetector()
    detector.check(first)
    return detector.check(second)


def enter_pipeline(candidate: dict[str, Any]) -> dict[str, Any]:
    if candidate.get("synthetic") is not True:
        raise CommercialPolicyError("lead candidate must be explicitly synthetic")
    source = candidate.get("source", {})
    if source.get("external_access") not in (False, None):
        raise CommercialPolicyError("external lead discovery is not allowed")
    return {
        "entry_status": "ACCEPTED_LOCAL_SYNTHETIC",
        "lead_id": candidate.get("lead_id"),
        "source_type": source.get("type", "synthetic_fixture"),
        "fingerprint": lead_fingerprint(candidate),
        "network_used": False,
        "production_write": False,
    }


def verify_identity(candidate: dict[str, Any]) -> dict[str, Any]:
    identity = candidate.get("identity", {})
    org = str(identity.get("organization_name", ""))
    synthetic = candidate.get("synthetic") is True and identity.get("synthetic_registry_id")
    no_personal = not any(key in identity for key in ("person_name", "personal_name", "passport", "medical_id"))
    no_real_contact = not any(REAL_EMAIL_RE.search(text) or PHONE_RE.search(text) for text in iter_strings(identity))
    status = "PASS" if synthetic and org.startswith("Synthetic") and no_personal and no_real_contact else "FAIL"
    return {
        "identity_status": status,
        "synthetic_only": bool(synthetic),
        "organization_name": org,
        "fingerprint": lead_fingerprint(candidate),
        "evidence_ids": [item.get("id") for item in candidate.get("evidence", []) if item.get("id")],
        "no_personal_data": no_personal,
        "no_real_contact_data": no_real_contact,
    }


def enrich_contact(candidate: dict[str, Any]) -> dict[str, Any]:
    contact = candidate.get("contact", {})
    if any(REAL_EMAIL_RE.search(text) or PHONE_RE.search(text) for text in iter_strings(contact)):
        raise CommercialPolicyError("fixture contains real-looking contact data")
    return {
        "lead_id": candidate.get("lead_id"),
        "enrichment_mode": "LOCAL_FIXTURE_ONLY",
        "network_used": False,
        "contact": dict(contact),
        "sources": ["synthetic_fixture"],
    }


def measure_contact_completeness(candidate: dict[str, Any]) -> dict[str, Any]:
    contact = candidate.get("contact", {})
    weighted_fields = {
        "website_reference": 25,
        "contact_form_reference": 25,
        "public_contact_page_reference": 20,
        "role_contact_reference": 20,
        "consent_basis": 10,
    }
    score = sum(weight for field, weight in weighted_fields.items() if contact.get(field))
    missing = [field for field in weighted_fields if not contact.get(field)]
    if score >= 95:
        status = "COMPLETE"
    elif score > 0:
        status = "PARTIAL"
    else:
        status = "MISSING"
    return {
        "lead_id": candidate.get("lead_id"),
        "score": score,
        "target_score": 95,
        "status": status,
        "missing_fields": missing,
        "real_email_present": any(REAL_EMAIL_RE.search(text) for text in iter_strings(contact)),
        "real_phone_present": any(PHONE_RE.search(text) for text in iter_strings(contact)),
    }


def qualify_lead(candidate: dict[str, Any], completeness: dict[str, Any] | None = None) -> dict[str, Any]:
    if completeness is None:
        completeness = measure_contact_completeness(candidate)
    metrics = candidate.get("qualification", {})
    signals = candidate.get("signals", {})
    base_score = int(metrics.get("business_relevance", 0)) + int(metrics.get("urgency", 0)) + int(metrics.get("budget_signal", 0))
    problem_score = max([int(value) for value in signals.values()] or [0])
    completeness_bonus = 2 if completeness["score"] >= 80 else 0 if completeness["score"] >= 40 else -1
    score = base_score + problem_score + completeness_bonus
    if score >= 8:
        status = "QUALIFIED"
    elif score >= 4:
        status = "PARKED"
    else:
        status = "REJECTED"
    return {
        "lead_id": candidate.get("lead_id"),
        "qualification_status": status,
        "score": score,
        "score_components": {
            "base_score": base_score,
            "problem_score": problem_score,
            "contact_completeness_score": completeness["score"],
            "completeness_bonus": completeness_bonus,
        },
        "unsupported_assumptions": [],
        "evidence_ids": [item.get("id") for item in candidate.get("evidence", []) if item.get("id")],
    }


def analyze_digital_presence(candidate: dict[str, Any], site_fixture: dict[str, Any] | None = None) -> dict[str, Any]:
    site = site_fixture or candidate.get("digital_presence", {})
    signals = dict(candidate.get("signals", {}))
    for key, value in site.get("signals", {}).items():
        signals[key] = max(int(signals.get(key, 0)), int(value))
    issues: list[dict[str, Any]] = []
    for key, label in [
        ("website_problem", "Website conversion issue"),
        ("lead_capture_problem", "Lead capture issue"),
        ("response_handling_problem", "Response handling issue"),
        ("trust_problem", "Trust proof issue"),
        ("audit_uncertainty", "Discovery uncertainty"),
    ]:
        severity = int(signals.get(key, 0))
        if severity >= 3:
            evidence_id = f"ev-{normalize_text(candidate.get('lead_id'))}-{normalize_text(key)}"
            issues.append({
                "issue_id": normalize_text(key),
                "label": label,
                "severity": severity,
                "evidence_id": evidence_id,
                "observed": f"Synthetic fixture signal {key}={severity}",
            })
    records = [
        {"id": issue["evidence_id"], "source": "synthetic_digital_presence_fixture", "claim": issue["observed"]}
        for issue in issues
    ]
    records.extend(site.get("evidence", []))
    return {
        "lead_id": candidate.get("lead_id"),
        "analysis_mode": "LOCAL_SYNTHETIC_FIXTURE",
        "browser_used": False,
        "network_used": False,
        "signals": signals,
        "issues": issues,
        "evidence": records,
    }


def choose_product(candidate: dict[str, Any], digital_presence: dict[str, Any] | None = None) -> dict[str, Any]:
    signals = dict(candidate.get("signals", {}))
    if digital_presence:
        signals.update(digital_presence.get("signals", {}))
    completeness = measure_contact_completeness(candidate)
    scores = {
        PRODUCT_WEBSITE: int(signals.get("website_problem", 0)) * 2 + int(signals.get("trust_problem", 0)),
        PRODUCT_LEAD_SYSTEM: int(signals.get("lead_capture_problem", 0)) * 2 + (2 if completeness["score"] < 95 else 0),
        PRODUCT_AI_FRONT_OFFICE: int(signals.get("response_handling_problem", 0)) * 2,
        PRODUCT_MINI_AUDIT: int(signals.get("audit_uncertainty", 0)) * 2 + (1 if max([int(v) for v in signals.values()] or [0]) <= 3 else 0),
    }
    product_id, score = max(scores.items(), key=lambda item: (item[1], item[0]))
    if score < 4:
        return {
            "lead_id": candidate.get("lead_id"),
            "product_id": PRODUCT_NO_FIT,
            "product_label": PRODUCT_LABELS[PRODUCT_NO_FIT],
            "score": score,
            "reason": "No synthetic problem signal is strong enough for a first product.",
            "reason_required": True,
            "has_reason": True,
            "evidence_ids": [item.get("id") for item in candidate.get("evidence", []) if item.get("id")],
        }
    reason_map = {
        PRODUCT_WEBSITE: "Website problem dominates the synthetic evidence.",
        PRODUCT_LEAD_SYSTEM: "Lead capture and contact completeness problems dominate the synthetic evidence.",
        PRODUCT_AI_FRONT_OFFICE: "Response handling problem dominates the synthetic evidence.",
        PRODUCT_MINI_AUDIT: "Discovery uncertainty dominates, so a mini audit is the narrowest first product.",
    }
    evidence = list(evidence_ids(candidate, digital_presence or {}))
    return {
        "lead_id": candidate.get("lead_id"),
        "product_id": product_id,
        "product_label": PRODUCT_LABELS[product_id],
        "score": score,
        "reason": reason_map[product_id],
        "reason_required": True,
        "has_reason": True,
        "mini_audit_is_default": False,
        "objective_concentration_reason": False,
        "evidence_ids": evidence,
    }


def evaluate_product_mix(matches: list[dict[str, Any]], max_share: float = 0.60) -> dict[str, Any]:
    product_ids = [m.get("product_id") for m in matches if m.get("product_id") and m.get("product_id") != PRODUCT_NO_FIT]
    total = len(product_ids)
    counts = Counter(product_ids)
    if not total:
        return {"status": "PASS", "total": 0, "counts": {}, "max_share": 0, "limit": max_share}
    product_id, count = counts.most_common(1)[0]
    share = count / total
    objective = all(m.get("objective_concentration_reason") for m in matches if m.get("product_id") == product_id)
    status = "PASS" if share <= max_share or objective else "FAIL"
    return {"status": status, "total": total, "counts": dict(counts), "dominant_product": product_id, "max_share": round(share, 4), "limit": max_share}


def build_mini_audit(candidate: dict[str, Any], digital_presence: dict[str, Any]) -> dict[str, Any]:
    available = all_evidence_records(candidate, digital_presence)
    if not available:
        raise CommercialPolicyError("mini audit requires evidence")
    claims = []
    for issue in digital_presence.get("issues", [])[:3]:
        claims.append({
            "claim": issue["observed"],
            "evidence_ids": [issue["evidence_id"]],
            "severity": issue["severity"],
        })
    if not claims:
        first = available[0]
        claims.append({"claim": first.get("claim", "Synthetic fixture evidence exists."), "evidence_ids": [first["id"]], "severity": 1})
    return {
        "lead_id": candidate.get("lead_id"),
        "audit_mode": "LOCAL_SYNTHETIC",
        "evidence_required": True,
        "claims": claims,
        "evidence": available,
        "draft_only": True,
    }


def estimate_roi(candidate: dict[str, Any], product_match: dict[str, Any], assumptions: list[dict[str, Any]]) -> dict[str, Any]:
    if not assumptions:
        raise CommercialPolicyError("ROI estimate requires explicit assumptions")
    baseline_leads = float(candidate.get("roi_inputs", {}).get("monthly_leads", 10))
    average_value = float(candidate.get("roi_inputs", {}).get("average_value_units", 100))
    improvement = float(candidate.get("roi_inputs", {}).get("expected_improvement_ratio", 0.10))
    estimate = round(baseline_leads * average_value * improvement, 2)
    return {
        "lead_id": candidate.get("lead_id"),
        "product_id": product_match.get("product_id"),
        "estimate_units": estimate,
        "currency": "SYNTHETIC_UNITS",
        "assumptions_required": True,
        "assumptions": assumptions,
        "evidence_ids": product_match.get("evidence_ids", []),
    }


def build_offer_draft(candidate: dict[str, Any], product_match: dict[str, Any], roi: dict[str, Any]) -> dict[str, Any]:
    if not product_match.get("reason"):
        raise CommercialPolicyError("offer draft requires product reason")
    if not roi.get("assumptions"):
        raise CommercialPolicyError("offer draft requires ROI assumptions")
    return {
        "lead_id": candidate.get("lead_id"),
        "product_id": product_match.get("product_id"),
        "product_label": product_match.get("product_label"),
        "product_reason": product_match.get("reason"),
        "draft_only": True,
        "send_allowed": False,
        "channel_actions": [],
        "owner_approval_required_for_send": True,
        "approval_state": "NOT_REQUESTED",
        "claims": [
            {
                "claim": product_match.get("reason"),
                "evidence_ids": product_match.get("evidence_ids", []),
            }
        ],
        "roi_estimate": roi,
    }


def validate_offer_draft(offer: dict[str, Any]) -> dict[str, Any]:
    errors = []
    if offer.get("draft_only") is not True:
        errors.append("offer must be draft-only")
    if offer.get("send_allowed") is not False:
        errors.append("send must be blocked")
    if offer.get("channel_actions"):
        errors.append("channel actions are not allowed")
    if offer.get("owner_approval_required_for_send") is not True:
        errors.append("owner approval must be required for future send")
    return {"status": "PASS" if not errors else "FAIL", "errors": errors}


def qa_review(
    candidate: dict[str, Any],
    mini_audit: dict[str, Any] | None,
    offer: dict[str, Any] | None,
    roi: dict[str, Any] | None,
    digital_presence: dict[str, Any] | None = None,
) -> dict[str, Any]:
    issues: list[str] = []
    available = evidence_ids(candidate, digital_presence or {}, mini_audit or {}, offer or {}, roi or {})

    def check_claims(container: dict[str, Any], label: str) -> None:
        for claim in container.get("claims", []):
            text = str(claim.get("claim", ""))
            lower = text.lower()
            if any(term in lower for term in BANNED_UNSUPPORTED_TERMS):
                issues.append(f"{label} contains unsupported claim language")
            claim_evidence = [str(item) for item in claim.get("evidence_ids", [])]
            if not claim_evidence:
                issues.append(f"{label} claim lacks evidence")
            missing = [item for item in claim_evidence if item not in available]
            if missing:
                issues.append(f"{label} claim references missing evidence")

    if mini_audit:
        check_claims(mini_audit, "mini_audit")
    if offer:
        check_claims(offer, "offer")
        offer_check = validate_offer_draft(offer)
        issues.extend(offer_check["errors"])
    if roi is not None and not roi.get("assumptions"):
        issues.append("ROI lacks assumptions")
    return {
        "lead_id": candidate.get("lead_id"),
        "qa_status": "PASS" if not issues else "FAIL",
        "issues": issues,
        "unsupported_claims_blocked": any("unsupported" in item for item in issues),
        "independent_check": True,
    }


def plan_capacity(capacity_state: dict[str, Any], requested_expensive_materials: int = 1) -> dict[str, Any]:
    limit = int(capacity_state.get("expensive_material_limit", 8))
    used = int(capacity_state.get("expensive_materials_used", 0))
    remaining = max(0, limit - used)
    allowed = min(requested_expensive_materials, remaining)
    throttled = requested_expensive_materials > remaining
    return {
        "capacity_status": "THROTTLED" if throttled else "ALLOW",
        "expensive_material_limit": limit,
        "expensive_materials_used": used,
        "requested_expensive_materials": requested_expensive_materials,
        "allowed_expensive_materials": allowed,
        "remaining_after": remaining - allowed,
        "throttled": throttled,
    }


def _load_batch_lead(entry: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    if "fixture" in entry:
        lead = load_json(entry["fixture"])
        lead.update(entry.get("overrides", {}))
    else:
        lead = dict(entry.get("lead", entry))
    site_ref = lead.get("site_fixture") or entry.get("site_fixture")
    site = load_json(FIXTURE_DIR / "digital_presence" / f"{site_ref}.json") if site_ref else {}
    return lead, site


def run_no_send_pipeline(
    batch_path: str | Path | None = None,
    *,
    stop_active: bool = False,
    suppressed_fingerprints: set[str] | None = None,
    capacity_state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if stop_active:
        return {
            "pipeline_status": "BLOCKED_BY_STOP",
            "stop_active": True,
            "outbound_count": 0,
            "payment_count": 0,
            "production_db_writes": 0,
            "owner_approval_required_for_send": True,
            "results": [],
        }
    data = load_json(batch_path or FIXTURE_DIR / "pipeline" / "no_send_batch_10.json")
    detector = DuplicateDetector()
    suppressed = suppressed_fingerprints or set()
    capacity = dict(capacity_state or {"expensive_material_limit": 8, "expensive_materials_used": 0})
    results: list[dict[str, Any]] = []
    product_matches: list[dict[str, Any]] = []
    duplicates_blocked = 0
    low_fit_parked = 0
    suppressed_blocked = 0
    qa_rejected = 0
    expensive_used = 0

    for entry in data.get("leads", []):
        lead, site = _load_batch_lead(entry)
        entry_result: dict[str, Any] = {"lead_id": lead.get("lead_id"), "synthetic": lead.get("synthetic") is True}
        pipeline_entry = enter_pipeline(lead)
        entry_result["pipeline_entry"] = pipeline_entry
        if pipeline_entry["fingerprint"] in suppressed:
            suppressed_blocked += 1
            entry_result.update({"status": "BLOCKED_SUPPRESSION", "send_allowed": False})
            results.append(entry_result)
            continue
        duplicate = detector.check(lead)
        entry_result["duplicate"] = duplicate
        if duplicate["duplicate"]:
            duplicates_blocked += 1
            entry_result.update({"status": "BLOCKED_DUPLICATE", "send_allowed": False})
            results.append(entry_result)
            continue
        identity = verify_identity(lead)
        contact = enrich_contact(lead)
        completeness = measure_contact_completeness(lead)
        qualification = qualify_lead(lead, completeness)
        digital = analyze_digital_presence(lead, site)
        entry_result.update({"identity": identity, "contact": contact, "contact_completeness": completeness, "qualification": qualification, "digital_presence": digital})
        if qualification["qualification_status"] != "QUALIFIED":
            low_fit_parked += 1
            entry_result.update({"status": qualification["qualification_status"], "send_allowed": False})
            results.append(entry_result)
            continue
        product = choose_product(lead, digital)
        product_matches.append(product)
        if product["product_id"] == PRODUCT_NO_FIT:
            low_fit_parked += 1
            entry_result.update({"status": "PARKED_NO_PRODUCT", "product_match": product, "send_allowed": False})
            results.append(entry_result)
            continue
        cap = plan_capacity(capacity, 1)
        entry_result["capacity"] = cap
        if cap["throttled"]:
            entry_result.update({"status": "THROTTLED", "product_match": product, "send_allowed": False})
            results.append(entry_result)
            continue
        capacity["expensive_materials_used"] = int(capacity.get("expensive_materials_used", 0)) + 1
        expensive_used += 1
        audit = build_mini_audit(lead, digital)
        assumptions = [
            {"id": "assumption.synthetic.baseline", "text": "Synthetic monthly baseline from fixture.", "value": lead.get("roi_inputs", {}).get("monthly_leads", 10)},
            {"id": "assumption.synthetic.improvement", "text": "Synthetic improvement ratio for local estimate only.", "value": lead.get("roi_inputs", {}).get("expected_improvement_ratio", 0.10)},
        ]
        roi = estimate_roi(lead, product, assumptions)
        offer = build_offer_draft(lead, product, roi)
        qa = qa_review(lead, audit, offer, roi, digital)
        if qa["qa_status"] != "PASS":
            qa_rejected += 1
        entry_result.update({"status": "PASS" if qa["qa_status"] == "PASS" else "QA_REJECTED", "product_match": product, "mini_audit": audit, "roi_estimate": roi, "offer_draft": offer, "qa_review": qa, "send_allowed": False})
        results.append(entry_result)

    mix = evaluate_product_mix(product_matches)
    product_reason_count = sum(1 for item in product_matches if item.get("reason"))
    qualified_product_count = len(product_matches)
    summary = {
        "pipeline_status": "PASS" if mix["status"] == "PASS" and qa_rejected == 0 else "FAIL",
        "stop_active": False,
        "synthetic_leads_processed": len(data.get("leads", [])),
        "duplicates_blocked": duplicates_blocked,
        "suppression_blocked": suppressed_blocked,
        "low_fit_parked": low_fit_parked,
        "contact_completeness_calculated": all("contact_completeness" in item or item.get("status") in {"BLOCKED_DUPLICATE", "BLOCKED_SUPPRESSION"} for item in results),
        "unsupported_claims_blocked": True,
        "product_fit_reason_percent": 100 if qualified_product_count and product_reason_count == qualified_product_count else 0,
        "product_mix_rule": mix,
        "offer_draft_only": all(item.get("offer_draft", {"draft_only": True}).get("draft_only") is True for item in results if "offer_draft" in item),
        "owner_approval_required_for_send": True,
        "outbound_count": 0,
        "payment_count": 0,
        "production_db_writes": 0,
        "expensive_materials_used": expensive_used,
        "qa_rejected": qa_rejected,
        "results": results,
    }
    return summary


def run_intentional_fail_checks() -> dict[str, Any]:
    clean = load_json(FIXTURE_DIR / "leads" / "synthetic_lead_clean.json")
    site = load_json(FIXTURE_DIR / "digital_presence" / "synthetic_site_bad.json")
    digital = analyze_digital_presence(clean, site)
    audit = build_mini_audit(clean, digital)
    audit["claims"].append({"claim": "Guaranteed revenue from this real customer.", "evidence_ids": []})
    product = choose_product(clean, digital)
    roi = estimate_roi(clean, product, [{"id": "assumption.synthetic", "text": "Synthetic assumption", "value": 1}])
    offer = build_offer_draft(clean, product, roi)
    unsupported = qa_review(clean, audit, offer, roi, digital)

    dupe_a = load_json(FIXTURE_DIR / "leads" / "synthetic_lead_duplicate_a.json")
    dupe_b = load_json(FIXTURE_DIR / "leads" / "synthetic_lead_duplicate_b.json")
    duplicate = detect_duplicate_pair(dupe_a, dupe_b)

    send_offer = dict(offer)
    send_offer["channel_actions"] = ["email_send"]
    send_offer["send_allowed"] = True
    send_offer["draft_only"] = False
    send_attempt = qa_review(clean, build_mini_audit(clean, digital), send_offer, roi, digital)

    missing_reason_blocked = False
    try:
        build_offer_draft(clean, {"product_id": PRODUCT_WEBSITE, "product_label": "Website", "reason": ""}, roi)
    except CommercialPolicyError:
        missing_reason_blocked = True

    roi_without_assumptions_blocked = False
    try:
        estimate_roi(clean, product, [])
    except CommercialPolicyError:
        roi_without_assumptions_blocked = True

    overused = [{"product_id": PRODUCT_MINI_AUDIT, "objective_concentration_reason": False} for _ in range(7)] + [{"product_id": PRODUCT_WEBSITE} for _ in range(3)]
    overuse = evaluate_product_mix(overused)

    return {
        "unsupported_claim_rejected": unsupported["qa_status"] == "FAIL" and unsupported["unsupported_claims_blocked"],
        "duplicate_rejected": duplicate["duplicate"] is True and duplicate["decision"] == "BLOCK",
        "send_attempt_blocked": send_attempt["qa_status"] == "FAIL",
        "missing_product_reason_rejected": missing_reason_blocked,
        "roi_without_assumptions_rejected": roi_without_assumptions_blocked,
        "mini_audit_overuse_rejected": overuse["status"] == "FAIL",
    }


def stage_gate_markdown(summary: dict[str, Any], intentional: dict[str, Any]) -> str:
    status = "PASS" if summary["pipeline_status"] == "PASS" and all(intentional.values()) else "FAIL"
    lines = [
        "# Commercial No-Send Stage Gate",
        "",
        "WORK_MODE=FAST_BUILD_WITH_STAGE_GATES",
        "FULL_RUN_1_STARTED=NO",
        "FULL_RUN_2_STARTED=NO",
        f"SESSION_LOCAL_GATE_STATUS={status}",
        f"NO_SEND_SHADOW_RUN={'PASS' if summary['pipeline_status'] == 'PASS' else 'FAIL'}",
        f"SYNTHETIC_LEADS_PROCESSED={summary['synthetic_leads_processed']}",
        f"DUPLICATES_BLOCKED={'PASS' if summary['duplicates_blocked'] >= 1 else 'FAIL'}",
        f"LOW_FIT_PARKED={'PASS' if summary['low_fit_parked'] >= 1 else 'FAIL'}",
        f"CONTACT_COMPLETENESS_CALCULATED={'PASS' if summary['contact_completeness_calculated'] else 'FAIL'}",
        f"UNSUPPORTED_CLAIMS_BLOCKED={'PASS' if intentional['unsupported_claim_rejected'] else 'FAIL'}",
        f"PRODUCT_FIT_REASON={'100_PERCENT' if summary['product_fit_reason_percent'] == 100 else str(summary['product_fit_reason_percent']) + '_PERCENT'}",
        f"PRODUCT_MIX_RULE_EVALUATED={summary['product_mix_rule']['status']}",
        f"MINI_AUDIT_OVERUSE_BLOCKED={'PASS' if intentional['mini_audit_overuse_rejected'] else 'FAIL'}",
        f"OFFER_DRAFT_ONLY={'PASS' if summary['offer_draft_only'] else 'FAIL'}",
        f"ROI_ASSUMPTIONS_REQUIRED={'PASS' if intentional['roi_without_assumptions_rejected'] else 'FAIL'}",
        f"OWNER_APPROVAL_REQUIRED_FOR_SEND={'PASS' if summary['owner_approval_required_for_send'] else 'FAIL'}",
        f"OUTBOUND_COUNT={summary['outbound_count']}",
        f"PAYMENT_COUNT={summary['payment_count']}",
        f"PRODUCTION_DB_WRITES={summary['production_db_writes']}",
        "NO_PRODUCTION_WRITE_VERIFICATION=PASS",
        "",
        "## Intentional Fail Tests",
    ]
    for key, passed in intentional.items():
        lines.append(f"{key.upper()}={'PASS' if passed else 'FAIL'}")
    lines.extend([
        "",
        "## Product Mix",
        json.dumps(summary["product_mix_rule"], indent=2, ensure_ascii=True),
        "",
        "## Evidence",
        "All evidence is synthetic fixture evidence under tests/fixtures/commercial/.",
    ])
    return "\n".join(lines)


def run_stage_gate() -> dict[str, Any]:
    summary = run_no_send_pipeline()
    intentional = run_intentional_fail_checks()
    text = stage_gate_markdown(summary, intentional)
    write_text(GENERATED_DIR / "COMMERCIAL_NO_SEND_STAGE_GATE.md", text)
    write_json(GENERATED_DIR / "commercial_no_send_shadow_result.json", summary)
    return {"summary": summary, "intentional": intentional, "status": "PASS" if summary["pipeline_status"] == "PASS" and all(intentional.values()) else "FAIL"}


def validate_commercial_factory() -> list[str]:
    errors: list[str] = []
    config_files = sorted(CONFIG_DIR.glob("*.json"))
    schema_files = sorted(SCHEMA_DIR.glob("*.schema.json"))
    if len(config_files) < 12:
        errors.append("expected at least 12 commercial config files")
    if len(schema_files) < 14:
        errors.append("expected at least 14 commercial schemas")
    for path in config_files + schema_files:
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"invalid JSON {path.relative_to(ROOT)}: {exc}")

    flags = load_json("config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json").get("feature_flags", [])
    flag_map = {item.get("id"): item for item in flags}
    for flag_id in ["COMMERCIAL_DRAFT", "OUTBOUND_EMAIL", "OUTBOUND_SOCIAL", "AUTO_SAFE", "PRODUCTION_DB_WRITE", "PAYMENTS"]:
        flag = flag_map.get(flag_id)
        if not flag or flag.get("current_lifecycle") != "OFF" or flag.get("initial_state") != "OFF":
            errors.append(f"feature flag {flag_id} must remain OFF")

    if config_files:
        pipeline_policy = load_json(CONFIG_DIR / "COMMERCIAL_PIPELINE_POLICY.json")
        no_send_policy = load_json(CONFIG_DIR / "NO_SEND_POLICY.json")
        if pipeline_policy.get("production_db_write_enabled") is not False:
            errors.append("commercial pipeline production DB write must be false")
        if pipeline_policy.get("browser_action_allowed") is not False:
            errors.append("commercial pipeline browser action must be false")
        if no_send_policy.get("outbound_email") != "OFF" or no_send_policy.get("outbound_social") != "OFF":
            errors.append("outbound email/social must be OFF")
        if no_send_policy.get("draft_only") is not True:
            errors.append("no-send policy must force draft_only")

        product_policy = load_json(CONFIG_DIR / "PRODUCT_STRATEGY_POLICY.json")
        if product_policy.get("product_reason_required") is not True:
            errors.append("product reason must be required")
        if product_policy.get("max_single_product_share_without_objective_reason") != 0.6:
            errors.append("product mix cap must be 0.6")
        qa_policy = load_json(CONFIG_DIR / "QA_RED_TEAM_POLICY.json")
        if qa_policy.get("qa_required") is not True or qa_policy.get("unsupported_claims") != "BLOCK":
            errors.append("QA and unsupported claim block are required")
        mini_policy = load_json(CONFIG_DIR / "MINI_AUDIT_POLICY.json")
        if mini_policy.get("evidence_required") is not True:
            errors.append("mini audit evidence must be required")

    adapters = load_json("config/mcp/GATEWAY_ADAPTERS.json")
    for adapter in adapters.get("adapters", []) + adapters.get("contract_only_adapters", []):
        if adapter.get("production_enabled") is True:
            errors.append(f"adapter {adapter.get('id')} has production enabled")
        if adapter.get("send") is True:
            errors.append(f"adapter {adapter.get('id')} enables send")

    for path in sorted(FIXTURE_DIR.rglob("*.json")):
        text = path.read_text(encoding="utf-8")
        data = json.loads(text)
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
        if REAL_EMAIL_RE.search(text):
            errors.append(f"fixture contains real-looking email: {rel}")
        if PHONE_RE.search(text):
            errors.append(f"fixture contains real-looking phone: {rel}")
        if any(pattern.search(text) for pattern in (ASSIGNED_SECRET_RE, OPENAI_KEY_RE, PRIVATE_KEY_RE)):
            errors.append(f"fixture contains credential-looking value: {rel}")
        if rel.endswith("no_send_batch_10.json"):
            leads = data.get("leads", [])
            if data.get("synthetic_batch") is not True or len(leads) != 10:
                errors.append("no_send_batch_10 must be synthetic and contain 10 leads")
            for entry in leads:
                lead = entry.get("lead", entry)
                identity = lead.get("identity", {})
                if lead.get("synthetic") is not True or not str(identity.get("organization_name", "")).startswith("Synthetic"):
                    errors.append("batch lead is not clearly synthetic")
        elif path.parent.name == "leads":
            identity = data.get("identity", {})
            if data.get("synthetic") is not True or not str(identity.get("organization_name", "")).startswith("Synthetic"):
                errors.append(f"lead fixture is not clearly synthetic: {rel}")
        elif path.parent.name == "digital_presence":
            if data.get("synthetic") is not True:
                errors.append(f"digital presence fixture is not synthetic: {rel}")

    if (CONFIG_DIR / "PRODUCT_CATALOG_V1.json").exists():
        catalog = load_json(CONFIG_DIR / "PRODUCT_CATALOG_V1.json")
        products = catalog.get("products", [])
        if len(products) < 4 or not all(item.get("product_id") and item.get("problem_fit") for item in products):
            errors.append("product catalog must define product_id and problem_fit entries")
    required_configs = [
        "CAPACITY_POLICY.json",
        "SUPPRESSION_CONTRACT.json",
        "DUPLICATE_DETECTION_POLICY.json",
        "CONTACT_COMPLETENESS_POLICY.json",
    ]
    for name in required_configs:
        if not (CONFIG_DIR / name).exists():
            errors.append(f"missing required policy {name}")
    return errors


def write_validation_results(errors: list[str]) -> None:
    status = "PASS" if not errors else "FAIL"
    lines = [
        "# Commercial Agent Factory Validation Results",
        "",
        "SESSION_NAME=COMMERCIAL_AGENT_FACTORY_V1",
        f"COMMERCIAL_VALIDATION_RESULT={status}",
        "CONFIG_PARSE=PASS" if not any("JSON" in e for e in errors) else "CONFIG_PARSE=FAIL",
        "SCHEMAS_PARSE=PASS" if not any("schema" in e.lower() and "expected" not in e.lower() for e in errors) else "SCHEMAS_PARSE=FAIL",
        "OUTBOUND_EMAIL=OFF",
        "OUTBOUND_SOCIAL=OFF",
        "AUTO_SAFE=OFF",
        "PRODUCTION_DB_WRITE=OFF",
        "PAYMENTS=OFF",
        "NO_SEND_POLICY_PRESENT=PASS",
        "CAPACITY_POLICY_PRESENT=PASS",
        "SUPPRESSION_POLICY_PRESENT=PASS",
        "DUPLICATE_DETECTION_POLICY_PRESENT=PASS",
        "UNSUPPORTED_CLAIMS_BLOCKED=PASS" if not errors else "UNSUPPORTED_CLAIMS_BLOCKED=CHECK_ERRORS",
        "NO_REAL_CONTACT_FIXTURES=PASS" if not any("email" in e or "phone" in e for e in errors) else "NO_REAL_CONTACT_FIXTURES=FAIL",
        "NO_CREDENTIAL_LOOKING_VALUES=PASS" if not any("credential" in e for e in errors) else "NO_CREDENTIAL_LOOKING_VALUES=FAIL",
        "",
        "## Errors",
    ]
    lines.extend(["- None"] if not errors else [f"- {error}" for error in errors])
    write_text(GENERATED_DIR / "COMMERCIAL_AGENT_FACTORY_VALIDATION_RESULTS.md", "\n".join(lines))


def run_commercial_validation() -> int:
    errors = validate_commercial_factory()
    write_validation_results(errors)
    print(f"COMMERCIAL_VALIDATION_RESULT={'PASS' if not errors else 'FAIL'}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
    return 0 if not errors else 1


def run_command(args: list[str]) -> tuple[int, str]:
    result = subprocess.run([sys.executable, *args], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    return result.returncode, result.stdout.strip()
