from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ALLOWED_DATA_CLASSES = {"PUBLIC", "BUSINESS_INTERNAL", "SYNTHETIC_PUBLIC", "SYNTHETIC_SENSITIVE"}
REQUIRED_FIELDS = {"artifact_id", "source_id", "source_uri", "source_type", "data_class", "sha256", "created_at"}


class ArtifactValidationError(ValueError):
    pass


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def parse_markdown_metadata(text: str) -> dict[str, str]:
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---", 4)
    if end == -1:
        return {}
    metadata: dict[str, str] = {}
    for line in text[4:end].splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        metadata[key.strip()] = value.strip()
    return metadata


def load_document_artifact(path: str | Path) -> dict[str, Any]:
    source_path = Path(path)
    text = source_path.read_text(encoding="utf-8")
    metadata = parse_markdown_metadata(text)
    digest = sha256_text(text)
    artifact_id = metadata.get("artifact_id") or f"artifact_{digest[:16]}"
    artifact = {
        "artifact_id": artifact_id,
        "source_id": metadata.get("source_id", ""),
        "source_uri": metadata.get("source_uri", source_path.as_posix()),
        "source_type": metadata.get("source_type", "markdown"),
        "data_class": metadata.get("data_class", ""),
        "source_date": metadata.get("source_date", ""),
        "created_at": metadata.get("created_at") or datetime.now(timezone.utc).date().isoformat(),
        "sha256": digest,
        "synthetic": metadata.get("synthetic", "false").lower() == "true",
        "text": text,
    }
    validate_artifact_metadata(artifact)
    return artifact


def validate_artifact_metadata(artifact: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    for field in REQUIRED_FIELDS:
        if not artifact.get(field):
            errors.append(f"missing {field}")
    if not artifact.get("source_date") and not artifact.get("created_at"):
        errors.append("missing source_date_or_created_at")
    if artifact.get("data_class") not in ALLOWED_DATA_CLASSES:
        errors.append("unknown data_class")
    digest = artifact.get("sha256")
    if not isinstance(digest, str) or len(digest) != 64:
        errors.append("invalid sha256")
    if artifact.get("data_class", "").startswith("SYNTHETIC") and artifact.get("synthetic") is not True:
        errors.append("synthetic data class requires synthetic marker")
    if errors:
        raise ArtifactValidationError("; ".join(errors))
    return {"status": "PASS", "artifact_id": artifact["artifact_id"], "sha256": artifact["sha256"]}
