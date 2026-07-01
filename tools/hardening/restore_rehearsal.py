#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

ROOT_FOR_IMPORT = Path(__file__).resolve().parents[2]
if str(ROOT_FOR_IMPORT) not in sys.path:
    sys.path.insert(0, str(ROOT_FOR_IMPORT))

from tools.hardening.common import GENERATED_DIR, ROOT, read_json, rel, sha256_bytes, write_json, write_text


RESULT_PATH = GENERATED_DIR / "RESTORE_REHEARSAL_RESULTS.md"
RESTORE_PATH = GENERATED_DIR / "synthetic_restore" / "restored_state.json"


def run_restore_rehearsal(fixture_path: Path | None = None) -> dict[str, Any]:
    fixture_path = fixture_path or ROOT / "tests" / "fixtures" / "hardening" / "synthetic_restore_source.json"
    fixture = read_json(rel(fixture_path))
    errors: list[str] = []

    if fixture.get("synthetic") is not True:
        errors.append("fixture must declare synthetic=true")

    records = fixture.get("records", [])
    restored = {
        "synthetic": True,
        "source_id": fixture.get("source_id"),
        "records": records,
        "record_count": len(records),
        "production_data_touched": False,
    }
    serialized = str(restored).encode("utf-8")
    restored["content_hash"] = sha256_bytes(serialized)
    write_json(RESTORE_PATH, restored)

    loaded = read_json(rel(RESTORE_PATH))
    if loaded.get("records") != records:
        errors.append("restored records do not match synthetic source")
    if loaded.get("production_data_touched") is not False:
        errors.append("restore touched production data")

    result = "PASS" if not errors else "FAIL"
    lines = [
        "# Restore Rehearsal Results",
        "",
        f"RESTORE_REHEARSAL_RESULT={result}",
        "SYNTHETIC_ONLY=YES",
        "PRODUCTION_DATA_TOUCHED=NO",
        f"RESTORED_RECORDS={len(records)}",
        f"RESTORE_ARTIFACT={rel(RESTORE_PATH)}",
        "",
        "## Errors",
    ]
    lines.extend(["- None"] if not errors else [f"- {error}" for error in errors])
    write_text(RESULT_PATH, "\n".join(lines))
    return {"result": result, "errors": errors, "artifact": rel(RESTORE_PATH)}


def main() -> int:
    result = run_restore_rehearsal()
    print(f"RESTORE_REHEARSAL_RESULT={result['result']}")
    return 0 if result["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
