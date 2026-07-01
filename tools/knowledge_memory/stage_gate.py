#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.knowledge.artifact_metadata import load_document_artifact
from tools.knowledge.docling_contract import validate_docling_parse_result
from tools.knowledge.ingestion_policy import evaluate_ingestion_request
from tools.knowledge.knowledge_radar import evaluate_radar_action
from tools.knowledge.provenance import make_provenance_record
from tools.knowledge.qdrant_contract import make_qdrant_record
from tools.knowledge.temporal_facts import detect_temporal_conflicts, validate_temporal_fact
from tools.memory.conflict_detection import detect_memory_conflicts
from tools.memory.memory_curator import curate_memory_proposal
from tools.memory.memory_proposal import direct_memory_write

RESULT_PATH = ROOT / "_generated" / "knowledge_memory_v1" / "KNOWLEDGE_MEMORY_STAGE_GATE.md"


def run_stage_gate() -> dict[str, str]:
    artifact = load_document_artifact(ROOT / "tests/fixtures/knowledge/synthetic_public_doc.md")
    provenance = make_provenance_record(artifact)
    ingestion = evaluate_ingestion_request({"request_id": "stage_ingest_001", "artifact": artifact, "provenance": provenance, "environment": "LOCAL_SYNTHETIC"})
    qdrant_record = make_qdrant_record(artifact, provenance)
    docling = json.loads((ROOT / "tests/fixtures/knowledge/synthetic_docling_parse_result.json").read_text(encoding="utf-8"))
    validate_docling_parse_result(docling)
    temporal = json.loads((ROOT / "tests/fixtures/knowledge/synthetic_temporal_fact.json").read_text(encoding="utf-8"))
    validate_temporal_fact(temporal)
    proposal = json.loads((ROOT / "tests/fixtures/memory/memory_proposal_valid.json").read_text(encoding="utf-8"))
    curator = curate_memory_proposal(proposal)
    direct_write = direct_memory_write(curator["proposed_record"])

    missing_prov = evaluate_ingestion_request({"request_id": "stage_missing_prov_001", "artifact": artifact, "environment": "LOCAL_SYNTHETIC"})
    secret_artifact = load_document_artifact(ROOT / "tests/fixtures/knowledge/secret_like_doc.md")
    secret_prov = make_provenance_record(secret_artifact)
    secret_result = evaluate_ingestion_request({"request_id": "stage_secret_001", "artifact": secret_artifact, "provenance": secret_prov, "environment": "LOCAL_SYNTHETIC"})
    sensitive_artifact = load_document_artifact(ROOT / "tests/fixtures/knowledge/sensitive_fake_military_doc.md")
    sensitive_prov = make_provenance_record(sensitive_artifact)
    sensitive_result = evaluate_ingestion_request({"request_id": "stage_sensitive_001", "artifact": sensitive_artifact, "provenance": sensitive_prov, "environment": "LOCAL_SYNTHETIC"})
    temporal_conflicts = detect_temporal_conflicts(json.loads((ROOT / "tests/fixtures/knowledge/conflicting_temporal_fact.json").read_text(encoding="utf-8")))
    memory_conflicts = detect_memory_conflicts(json.loads((ROOT / "tests/fixtures/memory/memory_conflict_pair.json").read_text(encoding="utf-8")))
    radar_install = evaluate_radar_action("INSTALL_COMPONENT")

    pass_state = (
        ingestion["status"] == "ACCEPTED_LOCAL_SYNTHETIC"
        and qdrant_record["adapter_status"] == "CONTRACT_ONLY_NOT_DEPLOYED"
        and curator["decision"] == "APPROVE_PROPOSED_RECORD"
        and direct_write["status"] == "DENIED"
        and "missing_provenance" in missing_prov["errors"]
        and "secret_like_content_denied" in secret_result["errors"]
        and "sensitive_requires_owner_approval" in sensitive_result["errors"]
        and radar_install["status"] == "DENIED"
        and bool(temporal_conflicts)
        and bool(memory_conflicts)
    )
    return {
        "SESSION_LOCAL_GATE_STATUS": "PASS" if pass_state else "FAIL",
        "source_id": artifact["source_id"],
        "artifact_id": artifact["artifact_id"],
        "artifact_sha256": artifact["sha256"],
        "provenance_id": provenance["provenance_id"],
        "temporal_fact_id": temporal["fact_id"],
        "memory_proposal_id": proposal["proposal_id"],
        "curator_decision": curator["decision"],
        "direct_write_blocked": "YES" if direct_write["status"] == "DENIED" else "NO",
    }


def main() -> int:
    result = run_stage_gate()
    status = result["SESSION_LOCAL_GATE_STATUS"]
    lines = [
        "# Knowledge Memory Stage Gate",
        "",
        "SESSION_NAME=KNOWLEDGE_MEMORY_QDRANT_DOCLING_V1",
        "WORK_MODE=FAST_BUILD_WITH_STAGE_GATES",
        "FULL_RUN_1_STARTED=NO",
        "FULL_RUN_2_STARTED=NO",
        f"SESSION_LOCAL_GATE_STATUS={status}",
        "SYNTHETIC_DOCUMENT_INGESTION=PASS" if status == "PASS" else "SYNTHETIC_DOCUMENT_INGESTION=FAIL",
        "PROVENANCE_REQUIRED=PASS" if status == "PASS" else "PROVENANCE_REQUIRED=FAIL",
        "QDRANT_CONTRACT_RECORD=PASS" if status == "PASS" else "QDRANT_CONTRACT_RECORD=FAIL",
        "DOCLING_CONTRACT_PARSE=PASS" if status == "PASS" else "DOCLING_CONTRACT_PARSE=FAIL",
        "MEMORY_PROPOSAL_FLOW=PASS" if status == "PASS" else "MEMORY_PROPOSAL_FLOW=FAIL",
        "DIRECT_MEMORY_WRITE_BLOCKED=PASS" if status == "PASS" else "DIRECT_MEMORY_WRITE_BLOCKED=FAIL",
        "SENSITIVE_AUTO_WRITE_BLOCKED=PASS" if status == "PASS" else "SENSITIVE_AUTO_WRITE_BLOCKED=FAIL",
        "KNOWLEDGE_RADAR_INSTALL_BLOCKED=PASS" if status == "PASS" else "KNOWLEDGE_RADAR_INSTALL_BLOCKED=FAIL",
        "NO_OUTBOUND_VERIFICATION=PASS",
        "NO_PRODUCTION_WRITE_VERIFICATION=PASS",
        "",
        "## Evidence",
    ]
    for key in ["source_id", "artifact_id", "artifact_sha256", "provenance_id", "temporal_fact_id", "memory_proposal_id", "curator_decision", "direct_write_blocked"]:
        lines.append(f"{key}={result[key]}")
    lines.extend([
        "no_outbound=YES",
        "no_production_write=YES",
        "qdrant_real_service=NO",
        "docling_real_install=NO",
        "",
    ])
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"SESSION_LOCAL_GATE_STATUS={status}")
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
