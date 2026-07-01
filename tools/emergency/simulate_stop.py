#!/usr/bin/env python3
"""Deterministic synthetic STOP simulator."""

from __future__ import annotations

import argparse
import copy
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SECRET_VALUE_PATTERNS = [
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I),
    re.compile(r"(?i)\b(?:token|password|secret|private_key|refresh|access_token|bearer)\b\s*[:=]\s*\S{6,}"),
]
STOP_BLOCKED_RISKS = {"R4", "R5"}


def redact(value: Any) -> Any:
    if isinstance(value, str):
        for pattern in SECRET_VALUE_PATTERNS:
            if pattern.search(value):
                return "REDACTED"
        return value
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, dict):
        return {key: redact(item) for key, item in value.items()}
    return value


def disable_queue(queue: dict[str, Any]) -> dict[str, Any]:
    output = copy.deepcopy(queue)
    output["enabled"] = False
    output["status"] = "DISABLED_BY_STOP"
    return output


def simulate_stop(state: dict[str, Any], stopped_at: str | None = None) -> dict[str, Any]:
    stopped_at = stopped_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    output = copy.deepcopy(state)
    output["stop_state"] = "ACTIVE"
    output["stopped_at"] = stopped_at

    workflows = []
    for workflow in output.get("workflows", []):
        item = copy.deepcopy(workflow)
        if item.get("risk") in STOP_BLOCKED_RISKS:
            item["status"] = "CANCELLED_BY_STOP"
        else:
            item["status"] = "CHECKPOINTED_BY_STOP"
        workflows.append(item)
    output["workflows"] = workflows

    approvals = []
    for approval in output.get("approvals", []):
        item = copy.deepcopy(approval)
        item["revoked"] = True
        item["status"] = "REVOKED_BY_STOP"
        approvals.append(item)
    output["approvals"] = approvals

    queues = output.setdefault("queues", {})
    for queue_name in ("outbound", "production_write", "payment", "browser_action"):
        queues[queue_name] = disable_queue(queues.get(queue_name, {"enabled": False, "items": []}))

    output["feature_flags"] = {
        key: "OFF" if key in {"OUTBOUND_EMAIL", "OUTBOUND_SOCIAL", "PRODUCTION_DEPLOY", "PRODUCTION_DB_WRITE", "PAYMENTS", "MCP_WRITE"} else value
        for key, value in output.get("feature_flags", {}).items()
    }
    output["checkpoint"] = {
        "generated": True,
        "path": "_generated/policy_security_v1/synthetic_stop_checkpoint.json",
        "stopped_at": stopped_at,
    }
    output["report"] = {
        "workflows_stopped": len(workflows),
        "approvals_revoked": len(approvals),
        "queues_disabled": ["outbound", "production_write", "payment", "browser_action"],
    }
    return redact(output)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run synthetic STOP simulation.")
    parser.add_argument("input")
    parser.add_argument("--output")
    parser.add_argument("--stopped-at", default="2026-06-26T00:00:00Z")
    args = parser.parse_args(argv)
    state = json.loads(Path(args.input).read_text(encoding="utf-8"))
    result = simulate_stop(state, stopped_at=args.stopped_at)
    text = json.dumps(result, sort_keys=True, indent=2) + "\n"
    if args.output:
        Path(args.output).write_text(text, encoding="utf-8", newline="\n")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
