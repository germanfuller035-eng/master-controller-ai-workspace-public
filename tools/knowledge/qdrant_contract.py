from __future__ import annotations

import hashlib
from typing import Any


class QdrantContractError(ValueError):
    pass


def make_qdrant_record(artifact: dict[str, Any], provenance: dict[str, Any]) -> dict[str, Any]:
    if not artifact.get("artifact_id") or not artifact.get("sha256"):
        raise QdrantContractError("artifact_id_and_sha256_required")
    if not provenance.get("provenance_id"):
        raise QdrantContractError("provenance_required")
    seed = f"{artifact['artifact_id']}|{artifact['sha256']}"
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    record = {
        "record_id": f"qdrant_contract_{digest[:16]}",
        "artifact_id": artifact["artifact_id"],
        "payload": {
            "source_id": artifact.get("source_id"),
            "data_class": artifact.get("data_class"),
            "provenance_id": provenance.get("provenance_id"),
            "sha256": artifact.get("sha256"),
        },
        "embedding_id": f"fake_embedding_{digest[:16]}",
        "adapter_status": "CONTRACT_ONLY_NOT_DEPLOYED",
        "network_connection_attempted": False,
        "real_embedding_used": False,
    }
    validate_qdrant_record(record)
    return record


def validate_qdrant_record(record: dict[str, Any]) -> dict[str, str]:
    required = ["record_id", "artifact_id", "payload", "embedding_id", "adapter_status"]
    missing = [field for field in required if not record.get(field)]
    if missing:
        raise QdrantContractError(f"missing {missing[0]}")
    if record.get("adapter_status") != "CONTRACT_ONLY_NOT_DEPLOYED":
        raise QdrantContractError("qdrant_must_be_contract_only")
    if record.get("network_connection_attempted") is not False or record.get("real_embedding_used") is not False:
        raise QdrantContractError("qdrant_real_runtime_denied")
    return {"status": "PASS", "record_id": record["record_id"]}
