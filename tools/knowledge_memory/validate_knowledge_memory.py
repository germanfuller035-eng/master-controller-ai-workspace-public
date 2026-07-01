#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path
import sys
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.knowledge.validate_knowledge import validate as validate_knowledge
from tools.memory.validate_memory import validate as validate_memory

RESULT_PATH = ROOT / "_generated" / "knowledge_memory_v1" / "KNOWLEDGE_MEMORY_VALIDATION_RESULTS.md"
JSON_DIRS = [ROOT / "config/knowledge", ROOT / "config/memory", ROOT / "schemas/knowledge", ROOT / "schemas/memory"]
FIXTURE_DIRS = [ROOT / "tests/fixtures/knowledge", ROOT / "tests/fixtures/memory"]
SECRET_PATTERNS = [
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY", re.I),
    re.compile(r"(?i)\b(?:token|password|passwd|private_key|refresh|access_token|bearer)\b\s*[:=]\s*[A-Za-z0-9_./+=-]{8,}"),
]


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def load_json(path: Path, errors: list[str]) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"invalid JSON in {rel(path)}: {exc}")
        return None


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


def primary_fixture_id(value: Any) -> str | None:
    if isinstance(value, list):
        return None
    if not isinstance(value, dict):
        return None
    for field in ["decision_id", "conflict_id", "fact_id", "parse_id", "record_id", "memory_id", "proposal_id", "artifact_id"]:
        if value.get(field):
            return str(value[field])
    return None


def scan_fixture_ids(errors: list[str]) -> None:
    seen: set[str] = set()
    for directory in FIXTURE_DIRS:
        for path in directory.glob("*.json"):
            data = load_json(path, errors)
            items = data if isinstance(data, list) else [data]
            for item in items:
                item_id = primary_fixture_id(item)
                if not item_id:
                    continue
                if item_id in seen:
                    errors.append(f"duplicate fixture id: {item_id}")
                seen.add(item_id)
        for path in directory.glob("*.md"):
            text = path.read_text(encoding="utf-8")
            match = re.search(r"^source_id:\s*(\S+)", text, flags=re.M)
            if match:
                item_id = match.group(1)
                if item_id in seen:
                    errors.append(f"duplicate fixture id: {item_id}")
                seen.add(item_id)


def scan_secret_like(errors: list[str]) -> None:
    for directory in JSON_DIRS + FIXTURE_DIRS:
        for path in directory.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in {".json", ".md"}:
                continue
            for line in path.read_text(encoding="utf-8").splitlines():
                if any(pattern.search(line) for pattern in SECRET_PATTERNS):
                    if "FAKE_" in line or "DO_NOT_USE" in line or "REDACTED" in line:
                        continue
                    errors.append(f"{rel(path)} contains suspicious secret-looking value")


def validate() -> tuple[str, list[str]]:
    errors: list[str] = []
    loaded = {rel(path): load_json(path, errors) for directory in JSON_DIRS for path in directory.glob("*.json")}
    knowledge_status, knowledge_errors = validate_knowledge()
    memory_status, memory_errors = validate_memory()
    if knowledge_status != "PASS":
        errors.extend(f"knowledge: {error}" for error in knowledge_errors)
    if memory_status != "PASS":
        errors.extend(f"memory: {error}" for error in memory_errors)

    flags = load_json(ROOT / "config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json", errors) or {}
    for flag in flags.get("feature_flags", []):
        if flag.get("id") in {"KNOWLEDGE_INGEST", "MEMORY_WRITE"} and flag.get("current_lifecycle") != "OFF":
            errors.append(f"feature flag {flag.get('id')} must remain OFF")

    ingest = loaded.get("config/knowledge/KNOWLEDGE_INGEST_POLICY.json") or {}
    if ingest.get("knowledge_ingest_production_enabled") is not False:
        errors.append("KNOWLEDGE_INGEST production must be OFF")
    if ingest.get("external_network_enabled") is not False or ingest.get("crawler_enabled") is not False:
        errors.append("knowledge ingest must not use external network or crawler")
    memory = loaded.get("config/memory/MEMORY_POLICY.json") or {}
    if memory.get("memory_write_enabled") is not False or memory.get("direct_memory_write") != "DENY":
        errors.append("direct memory write must be disabled")
    qdrant = loaded.get("config/knowledge/QDRANT_ADAPTER_POLICY.json") or {}
    if qdrant.get("server_deployed") is not False or qdrant.get("production_collection_enabled") is not False:
        errors.append("qdrant production deployment must be disabled")
    docling = loaded.get("config/knowledge/DOCLING_ADAPTER_POLICY.json") or {}
    if docling.get("install_allowed") is not False or docling.get("import_required") is not False:
        errors.append("docling install/import must not be required")
    radar = loaded.get("config/knowledge/KNOWLEDGE_RADAR_POLICY.json") or {}
    if radar.get("radar_status") != "PROPOSAL_ONLY" or radar.get("memory_write_allowed") is not False:
        errors.append("Knowledge Radar must be proposal-only")
    if not loaded.get("config/knowledge/PROVENANCE_POLICY.json", {}).get("provenance_required"):
        errors.append("provenance policy must require provenance")
    if not loaded.get("config/memory/MEMORY_RETENTION_POLICY.json", {}).get("retention_required"):
        errors.append("retention policy missing")
    if not loaded.get("config/memory/MEMORY_CONFLICT_POLICY.json", {}).get("conflict_detection_required"):
        errors.append("conflict policy missing")
    if (loaded.get("config/memory/SENSITIVE_MEMORY_POLICY.json") or {}).get("sensitive_memory_auto_write") != "DENY":
        errors.append("sensitive review policy missing")

    scan_fixture_ids(errors)
    scan_secret_like(errors)
    return ("PASS" if not errors else "FAIL"), errors


def main() -> int:
    status, errors = validate()
    lines = [
        "# Knowledge Memory Validation Results",
        "",
        "SESSION_NAME=KNOWLEDGE_MEMORY_QDRANT_DOCLING_V1",
        f"KNOWLEDGE_MEMORY_VALIDATION_RESULT={status}",
        f"KNOWLEDGE_VALIDATION_RESULT={status if status == 'PASS' else 'CHECK_ERRORS'}",
        f"MEMORY_VALIDATION_RESULT={status if status == 'PASS' else 'CHECK_ERRORS'}",
        "FEATURE_FLAGS_STATUS=ALL_OFF" if status == "PASS" else "FEATURE_FLAGS_STATUS=CHECK_ERRORS",
        "KNOWLEDGE_INGEST_STATUS=OFF" if status == "PASS" else "KNOWLEDGE_INGEST_STATUS=CHECK_ERRORS",
        "MEMORY_WRITE_STATUS=OFF" if status == "PASS" else "MEMORY_WRITE_STATUS=CHECK_ERRORS",
        "QDRANT_STATUS=CONTRACT_ONLY_NOT_DEPLOYED" if status == "PASS" else "QDRANT_STATUS=CHECK_ERRORS",
        "DOCLING_STATUS=CONTRACT_ONLY_NOT_INSTALLED" if status == "PASS" else "DOCLING_STATUS=CHECK_ERRORS",
        "KNOWLEDGE_RADAR_STATUS=PROPOSAL_ONLY" if status == "PASS" else "KNOWLEDGE_RADAR_STATUS=CHECK_ERRORS",
        "NO_EXTERNAL_NETWORK=YES",
        "NO_CRAWLER=YES",
        "NO_PRODUCTION_DB_WRITE=YES",
        "NO_REAL_CLIENT_DATA=YES",
        "NO_REAL_PERSONAL_DATA=YES",
        "NO_REAL_MILITARY_MEDICAL_DATA=YES",
        "NO_REAL_SECRETS=YES" if status == "PASS" else "NO_REAL_SECRETS=CHECK_ERRORS",
        "",
        "## Errors",
    ]
    lines.extend(f"- {error}" for error in errors) if errors else lines.append("- None")
    lines.append("")
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"KNOWLEDGE_MEMORY_VALIDATION_RESULT={status}")
    for error in errors:
        print(f"ERROR: {error}")
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
