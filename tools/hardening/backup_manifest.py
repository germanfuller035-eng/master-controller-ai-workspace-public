#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

ROOT_FOR_IMPORT = Path(__file__).resolve().parents[2]
if str(ROOT_FOR_IMPORT) not in sys.path:
    sys.path.insert(0, str(ROOT_FOR_IMPORT))

from tools.hardening.common import GENERATED_DIR, ROOT, read_json, rel, sha256_file, write_json, write_text


RESULT_PATH = GENERATED_DIR / "BACKUP_MANIFEST_RESULTS.md"
MANIFEST_PATH = GENERATED_DIR / "backup_manifest" / "synthetic_backup_manifest.validated.json"


def build_backup_manifest(fixture_path: Path | None = None) -> dict[str, Any]:
    fixture_path = fixture_path or ROOT / "tests" / "fixtures" / "hardening" / "synthetic_backup_manifest.json"
    fixture = read_json(rel(fixture_path))
    errors: list[str] = []
    entries: list[dict[str, Any]] = []

    if fixture.get("synthetic") is not True:
        errors.append("fixture must declare synthetic=true")

    for item in fixture.get("items", []):
        rel_path = item.get("path", "")
        source = ROOT / rel_path
        if not source.exists() or not source.is_file():
            errors.append(f"missing backup source {rel_path}")
            continue
        if rel_path.startswith((".env", "runtime_data/", "logs/")) or "devices.json" in rel_path or "pairing.json" in rel_path:
            errors.append(f"forbidden backup source {rel_path}")
            continue
        entries.append(
            {
                "path": rel_path,
                "sha256": sha256_file(source),
                "bytes": source.stat().st_size,
                "required": bool(item.get("required", True)),
            }
        )

    manifest = {
        "synthetic": True,
        "backup_set_id": fixture.get("backup_set_id", "synthetic-hardening-v1"),
        "result": "PASS" if not errors else "FAIL",
        "items": entries,
        "errors": errors,
        "production_data_touched": False,
    }
    write_json(MANIFEST_PATH, manifest)

    lines = [
        "# Backup Manifest Results",
        "",
        f"BACKUP_MANIFEST_RESULT={manifest['result']}",
        "SYNTHETIC_ONLY=YES",
        "PRODUCTION_DATA_TOUCHED=NO",
        f"ITEMS={len(entries)}",
        f"MANIFEST={rel(MANIFEST_PATH)}",
        "",
        "## Errors",
    ]
    lines.extend(["- None"] if not errors else [f"- {error}" for error in errors])
    write_text(RESULT_PATH, "\n".join(lines))
    return manifest


def main() -> int:
    manifest = build_backup_manifest()
    print(f"BACKUP_MANIFEST_RESULT={manifest['result']}")
    return 0 if manifest["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
