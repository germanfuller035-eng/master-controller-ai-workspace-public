from __future__ import annotations

import re
from typing import Any


PLACEHOLDER_WORDS = ("FAKE_", "EXAMPLE_", "DUMMY_", "REDACTED", "DO_NOT_USE", "PLACEHOLDER")
SECRET_KEY_PARTS = ("token", "password", "passwd", "private_key", "access_token", "refresh_token", "bearer")
SECRET_VALUE_PATTERNS = [
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I),
    re.compile(r"(?i)\b(?:token|password|passwd|private_key|access_token|refresh_token|bearer)\b\s*[:=]\s*[\"']?[A-Za-z0-9_./+=-]{8,}"),
    re.compile(r"(?i)\bvless://"),
]


def _is_placeholder(text: str) -> bool:
    return any(word in text for word in PLACEHOLDER_WORDS)


def redact_text(text: str) -> str:
    redacted = text
    for pattern in SECRET_VALUE_PATTERNS:
        redacted = pattern.sub("[REDACTED]", redacted)
    return redacted


def redact_data(value: Any) -> Any:
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, item in value.items():
            if any(part in str(key).lower() for part in SECRET_KEY_PARTS):
                out[str(key)] = "[REDACTED]"
            else:
                out[str(key)] = redact_data(item)
        return out
    if isinstance(value, list):
        return [redact_data(item) for item in value]
    if isinstance(value, str):
        return redact_text(value)
    return value


def contains_secret_like_content(value: Any) -> bool:
    if isinstance(value, dict):
        return any(contains_secret_like_content(item) for item in value.values())
    if isinstance(value, list):
        return any(contains_secret_like_content(item) for item in value)
    if not isinstance(value, str):
        return False
    return any(pattern.search(value) for pattern in SECRET_VALUE_PATTERNS)


def secret_like_path(name: str) -> bool:
    lowered = name.lower().replace("\\", "/")
    parts = [part for part in lowered.split("/") if part]
    blocked_names = {".env", "devices.json", "pairing.json"}
    if any(part in blocked_names for part in parts):
        return True
    if lowered.endswith((".pem", ".key", ".p12", ".pfx")):
        return True
    return any(fragment in lowered for fragment in ("private_key", "access_token", "refresh_token"))
