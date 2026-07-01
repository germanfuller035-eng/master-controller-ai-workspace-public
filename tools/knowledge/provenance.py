from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any


class ProvenanceValidationError(ValueError):
    pass


REQUIRED_FIELDS = {"provenance_id", "artifact_id", "source_id", "source_uri", "retrieved_at", "retrieval_method", "confidence"}
ALLOWED_METHODS = {"local_synthetic_fixture", "owner_supplied_future", "approved_read_only_future"}


def make_provenance_record(artifact: dict[str, Any], retrieval_method: str = "local_synthetic_fixture", confidence: float = 0.9) -> dict[str, Any]:
    seed = f"{artifact.get('artifact_id')}|{artifact.get('source_id')}|{artifact.get('sha256')}"
    provenance_id = f"prov_{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:16]}"
    record = {
        "provenance_id": provenance_id,
        "artifact_id": artifact.get("artifact_id", ""),
        "source_id": artifact.get("source_id", ""),
        "source_uri": artifact.get("source_uri", ""),
        "retrieved_at": datetime.now(timezone.utc).date().isoformat(),
        "retrieval_method": retrieval_method,
        "confidence": confidence,
        "source_sha256": artifact.get("sha256", ""),
    }
    validate_provenance(record)
    return record


def validate_provenance(record: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    for field in REQUIRED_FIELDS:
        if record.get(field) in (None, ""):
            errors.append(f"missing {field}")
    if record.get("retrieval_method") not in ALLOWED_METHODS:
        errors.append("retrieval_method_not_allowed")
    try:
        if float(record.get("confidence", 0)) < 0.5:
            errors.append("confidence_below_threshold")
    except (TypeError, ValueError):
        errors.append("invalid_confidence")
    if errors:
        raise ProvenanceValidationError("; ".join(errors))
    return {"status": "PASS", "provenance_id": record["provenance_id"]}
