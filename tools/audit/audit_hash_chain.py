#!/usr/bin/env python3
"""Synthetic high-risk audit hash chain utilities."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any


SECRET_VALUE_PATTERNS = [
    re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I),
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"(?i)\b(?:token|password|passwd|secret|private_key|refresh|access_token|bearer)\b\s*[:=]\s*\S{6,}"),
    re.compile(r"(?i)\bvless://"),
]
REQUIRED_EVENT_FIELDS = {
    "sequence",
    "timestamp",
    "actor",
    "task_id",
    "action",
    "resource",
    "risk",
    "payload_hash",
    "result",
    "previous_hash",
    "current_hash",
}


class AuditChainError(ValueError):
    """Raised when the audit chain fails closed."""


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def iter_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            out.extend(iter_strings(item))
        return out
    if isinstance(value, dict):
        out = []
        for item in value.values():
            out.extend(iter_strings(item))
        return out
    return []


def assert_no_secret_values(event: dict[str, Any]) -> None:
    for text in iter_strings(event):
        for pattern in SECRET_VALUE_PATTERNS:
            if pattern.search(text):
                raise AuditChainError("event contains secret-looking value")


def event_hash(event: dict[str, Any]) -> str:
    material = {key: value for key, value in event.items() if key != "current_hash"}
    return hashlib.sha256(canonical_json(material).encode("utf-8")).hexdigest()


def signed_event(event: dict[str, Any]) -> dict[str, Any]:
    material = dict(event)
    material["current_hash"] = event_hash(material)
    return material


def verify_events(events: list[dict[str, Any]]) -> None:
    if not events:
        raise AuditChainError("audit chain is empty")
    previous_hash = "GENESIS"
    expected_sequence = 1
    used_approvals: set[str] = set()
    for event in events:
        missing = sorted(REQUIRED_EVENT_FIELDS - set(event))
        if missing:
            raise AuditChainError(f"missing event field: {missing[0]}")
        if event["sequence"] != expected_sequence:
            raise AuditChainError("sequence gap")
        if event["previous_hash"] != previous_hash:
            raise AuditChainError("previous hash mismatch")
        if not event.get("payload_hash"):
            raise AuditChainError("missing payload hash")
        assert_no_secret_values(event)
        approval_id = event.get("approval_id")
        if approval_id:
            if approval_id in used_approvals:
                raise AuditChainError("replayed approval")
            used_approvals.add(approval_id)
        expected_hash = event_hash(event)
        if event.get("current_hash") != expected_hash:
            raise AuditChainError("event hash mismatch")
        previous_hash = expected_hash
        expected_sequence += 1


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    events = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            events.append(json.loads(line))
    return events


def write_jsonl(path: Path, events: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(canonical_json(event) for event in events) + "\n", encoding="utf-8", newline="\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify a synthetic audit hash chain JSONL file.")
    parser.add_argument("path")
    args = parser.parse_args(argv)
    try:
        verify_events(load_jsonl(Path(args.path)))
    except (AuditChainError, json.JSONDecodeError) as exc:
        print(f"AUDIT_CHAIN_RESULT=FAIL {exc}", file=sys.stderr)
        return 1
    print("AUDIT_CHAIN_RESULT=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
