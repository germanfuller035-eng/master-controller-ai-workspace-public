#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
RESULT_PATH = ROOT / "_generated" / "knowledge_memory_v1" / "KNOWLEDGE_VALIDATION_RESULTS.md"
CONFIG_DIR = ROOT / "config" / "knowledge"
SCHEMA_DIR = ROOT / "schemas" / "knowledge"


def _load(path: Path, errors: list[str]) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"invalid JSON in {path.relative_to(ROOT)}: {exc}")
        return None


def validate() -> tuple[str, list[str]]:
    errors: list[str] = []
    config = {path.name: _load(path, errors) for path in CONFIG_DIR.glob("*.json")}
    for path in SCHEMA_DIR.glob("*.json"):
        _load(path, errors)
    ingest = config.get("KNOWLEDGE_INGEST_POLICY.json") or {}
    if ingest.get("knowledge_ingest_production_enabled") is not False:
        errors.append("knowledge ingest production must remain OFF")
    if ingest.get("external_network_enabled") is not False:
        errors.append("external network must remain disabled")
    if ingest.get("crawler_enabled") is not False:
        errors.append("crawler must remain disabled")
    if ingest.get("production_db_write_enabled") is not False:
        errors.append("production DB write must remain disabled")
    if (config.get("QDRANT_ADAPTER_POLICY.json") or {}).get("server_deployed") is not False:
        errors.append("Qdrant server must not be deployed")
    if (config.get("DOCLING_ADAPTER_POLICY.json") or {}).get("install_allowed") is not False:
        errors.append("Docling install must not be allowed")
    radar = config.get("KNOWLEDGE_RADAR_POLICY.json") or {}
    if radar.get("radar_status") != "PROPOSAL_ONLY" or radar.get("install_components_allowed") is not False:
        errors.append("Knowledge Radar must remain proposal-only")
    return ("PASS" if not errors else "FAIL"), errors


def main() -> int:
    status, errors = validate()
    lines = [
        "# Knowledge Validation Results",
        "",
        "SESSION_NAME=KNOWLEDGE_MEMORY_QDRANT_DOCLING_V1",
        f"KNOWLEDGE_VALIDATION_RESULT={status}",
        "KNOWLEDGE_INGEST_STATUS=OFF" if status == "PASS" else "KNOWLEDGE_INGEST_STATUS=CHECK_ERRORS",
        "QDRANT_STATUS=CONTRACT_ONLY_NOT_DEPLOYED" if status == "PASS" else "QDRANT_STATUS=CHECK_ERRORS",
        "DOCLING_STATUS=CONTRACT_ONLY_NOT_INSTALLED" if status == "PASS" else "DOCLING_STATUS=CHECK_ERRORS",
        "KNOWLEDGE_RADAR_STATUS=PROPOSAL_ONLY" if status == "PASS" else "KNOWLEDGE_RADAR_STATUS=CHECK_ERRORS",
        "",
        "## Errors",
    ]
    lines.extend(f"- {error}" for error in errors) if errors else lines.append("- None")
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")
    print(f"KNOWLEDGE_VALIDATION_RESULT={status}")
    for error in errors:
        print(f"ERROR: {error}")
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
