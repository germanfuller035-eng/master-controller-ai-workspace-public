#!/usr/bin/env python3
"""Deterministic approval payload hashing.

The utility is intentionally local and standard-library only. It emits only a
SHA-256 digest and keeps secret-looking values out of errors.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Iterable


REQUIRED_FIELDS = ("actor", "action", "target", "payload", "risk", "expiry", "task_id")
ALLOWED_VOLATILE_FIELDS = frozenset({"requested_at", "request_id", "display_nonce"})


class PayloadHashError(ValueError):
    """Raised when payload hashing must fail closed."""


def _canonical_json(value: Any) -> str:
    try:
        return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    except (TypeError, ValueError) as exc:
        raise PayloadHashError("payload is not canonical-json serializable") from exc


def canonicalize_payload(payload: dict[str, Any], exclude_fields: Iterable[str] | None = None) -> dict[str, Any]:
    """Return the canonical payload subset used for hashing.

    Exclusions are only allowed for explicitly allowlisted volatile top-level
    fields. Unknown exclusions fail closed so callers cannot silently remove
    payload material.
    """

    if not isinstance(payload, dict):
        raise PayloadHashError("approval payload must be a JSON object")

    excludes = set(exclude_fields or [])
    unknown = sorted(excludes - ALLOWED_VOLATILE_FIELDS)
    if unknown:
        raise PayloadHashError("volatile field is not allowlisted")

    excluded_required = sorted(excludes & set(REQUIRED_FIELDS))
    if excluded_required:
        raise PayloadHashError("required field cannot be excluded")

    material = {key: value for key, value in payload.items() if key not in excludes}
    missing = [field for field in REQUIRED_FIELDS if field not in material]
    if missing:
        raise PayloadHashError(f"missing required field: {missing[0]}")

    return {field: material[field] for field in REQUIRED_FIELDS}


def calculate_payload_hash(payload: dict[str, Any], exclude_fields: Iterable[str] | None = None) -> str:
    material = canonicalize_payload(payload, exclude_fields=exclude_fields)
    encoded = _canonical_json(material).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def read_payload(path: str | None) -> dict[str, Any]:
    try:
        raw = sys.stdin.read() if not path or path == "-" else Path(path).read_text(encoding="utf-8")
        data = json.loads(raw)
    except Exception as exc:  # noqa: BLE001 - CLI must not leak input material in errors.
        raise PayloadHashError("failed to read JSON payload") from exc
    if not isinstance(data, dict):
        raise PayloadHashError("approval payload must be a JSON object")
    return data


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Print deterministic SHA-256 hash for an approval payload.")
    parser.add_argument("path", nargs="?", help="JSON payload path, or stdin when omitted")
    parser.add_argument("--exclude", action="append", default=[], help="Allowlisted volatile top-level field to exclude")
    args = parser.parse_args(argv)

    try:
        print(calculate_payload_hash(read_payload(args.path), exclude_fields=args.exclude))
    except PayloadHashError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
