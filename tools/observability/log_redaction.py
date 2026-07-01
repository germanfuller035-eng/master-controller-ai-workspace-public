
from __future__ import annotations
import re
from typing import Any
PLACEHOLDER = "[REDACTED]"
SENSITIVE_KEY_PARTS = ("credential", "api_key", "private_material", "auth_header", "provider_key")
PATTERNS = [re.compile(r"\bsk-[A-Za-z0-9_-]{8,}\b"), re.compile(r"(?i)\b(?:token|password|passwd|private_key|access_token|refresh_token|bearer)\b\s*[:=]\s*[A-Za-z0-9_./+=-]{8,}")]
def redact_text(text: str) -> str:
    for pattern in PATTERNS: text = pattern.sub(PLACEHOLDER, text)
    return text
def redact_value(key: str, value: Any) -> Any:
    if any(part in key.lower() for part in SENSITIVE_KEY_PARTS): return PLACEHOLDER
    if isinstance(value, str): return redact_text(value)
    if isinstance(value, dict): return {k: redact_value(k, v) for k, v in value.items()}
    if isinstance(value, list): return [redact_value(key, item) for item in value]
    return value
def redact_event(event: dict[str, Any]) -> dict[str, Any]: return {k: redact_value(k, v) for k, v in event.items()}
