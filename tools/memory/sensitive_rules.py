from __future__ import annotations

import re
from typing import Any

SECRET_PATTERNS = [
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I),
    re.compile(r"(?i)\b(?:token|password|passwd|private_key|refresh|access_token|bearer)\b\s*[:=]\s*[A-Za-z0-9_./+=-]{8,}"),
]
SENSITIVE_CLASSES = {"PERSONAL_CONFIDENTIAL", "CLIENT_CONFIDENTIAL", "MILITARY_MEDICAL", "SYNTHETIC_SENSITIVE"}
ALLOWED_CLASSES = {"PUBLIC", "BUSINESS_INTERNAL", "SYNTHETIC_PUBLIC", "SYNTHETIC_SENSITIVE", "PERSONAL_CONFIDENTIAL", "CLIENT_CONFIDENTIAL", "MILITARY_MEDICAL"}


def has_secret_like_value(text: str) -> bool:
    return any(pattern.search(text) for pattern in SECRET_PATTERNS)


def review_sensitive_memory(proposal: dict[str, Any], owner_approval: bool = False) -> dict[str, Any]:
    classification = proposal.get("classification")
    if classification not in ALLOWED_CLASSES:
        return {"status": "DENIED", "decision": "UNKNOWN_CLASSIFICATION"}
    if has_secret_like_value(str(proposal.get("claim", ""))):
        return {"status": "DENIED", "decision": "SECRET_LIKE_CONTENT_DENIED"}
    if classification in SENSITIVE_CLASSES and not owner_approval:
        return {"status": "NEEDS_OWNER_APPROVAL", "decision": "OWNER_APPROVAL_REQUIRED"}
    return {"status": "PASS", "decision": "ALLOW_CURATOR_REVIEW"}
