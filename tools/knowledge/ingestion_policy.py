from __future__ import annotations

import re
from typing import Any

from tools.knowledge.artifact_metadata import validate_artifact_metadata
from tools.knowledge.provenance import validate_provenance

SECRET_PATTERNS = [
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I),
    re.compile(r"(?i)\b(?:token|password|passwd|private_key|refresh|access_token|bearer)\b\s*[:=]\s*[A-Za-z0-9_./+=-]{8,}"),
]
SENSITIVE_CLASSES = {"SYNTHETIC_SENSITIVE", "CLIENT_CONFIDENTIAL", "PERSONAL_CONFIDENTIAL", "MILITARY_MEDICAL"}


def contains_secret_like(text: str) -> bool:
    return any(pattern.search(text) for pattern in SECRET_PATTERNS)


def evaluate_ingestion_request(request: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    artifact = request.get("artifact") or {}
    provenance = request.get("provenance")
    if request.get("environment") != "LOCAL_SYNTHETIC":
        errors.append("production_ingest_off")
    if not provenance:
        errors.append("missing_provenance")
    try:
        validate_artifact_metadata(artifact)
    except Exception as exc:  # noqa: BLE001 - deterministic validation result
        errors.append(str(exc))
    if provenance:
        try:
            validate_provenance(provenance)
        except Exception as exc:  # noqa: BLE001
            errors.append(str(exc))
    text = str(artifact.get("text", ""))
    if contains_secret_like(text):
        errors.append("secret_like_content_denied")
    data_class = artifact.get("data_class")
    if data_class in SENSITIVE_CLASSES and not request.get("owner_approval"):
        errors.append("sensitive_requires_owner_approval")
    status = "DENIED" if errors else "ACCEPTED_LOCAL_SYNTHETIC"
    return {
        "status": status,
        "decision": "DENY" if errors else "ALLOW_LOCAL_SYNTHETIC",
        "artifact_id": artifact.get("artifact_id", ""),
        "provenance_required": True,
        "errors": errors,
        "production_write": False,
        "outbound": False,
    }
