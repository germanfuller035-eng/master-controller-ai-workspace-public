from __future__ import annotations

import json
from pathlib import Path

from tools.mcp_gateway.models import GatewayError


ROOT = Path(__file__).resolve().parents[2]
TIMEOUTS_PATH = ROOT / "config" / "mcp" / "GATEWAY_TIMEOUTS.json"


def load_timeout_config() -> dict:
    return json.loads(TIMEOUTS_PATH.read_text(encoding="utf-8"))


def resolve_timeout_ms(adapter_id: str, requested_timeout_ms: int) -> int:
    config = load_timeout_config()
    adapter_default = int(config.get("adapter_timeouts_ms", {}).get(adapter_id, config["defaults"]["gateway_request_ms"]))
    max_timeout = int(config.get("max", {}).get("gateway_request_ms", 300000))
    requested = int(requested_timeout_ms or adapter_default)
    if requested <= 0:
        raise GatewayError("INVALID_TIMEOUT", "timeout must be positive", status="DENIED")
    return min(requested, adapter_default, max_timeout)
