
from __future__ import annotations
import json
from pathlib import Path
def load_jsonl(path: str | Path) -> list[dict]:
    records = []
    for line_number, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if line.strip():
            try: records.append(json.loads(line))
            except json.JSONDecodeError as exc: raise ValueError(f"invalid JSONL at line {line_number}: {exc}") from exc
    return records
def validate_golden_dataset(path: str | Path) -> dict:
    seen = set(); records = load_jsonl(path)
    for record in records:
        for field in ["case_id", "purpose", "input", "expected_output", "pass_criteria"]:
            if field not in record: return {"valid": False, "reason": f"MISSING_{field.upper()}"}
        if record["case_id"] in seen: return {"valid": False, "reason": "DUPLICATE_CASE_ID"}
        seen.add(record["case_id"])
    return {"valid": True, "reason": "GOLDEN_DATASET_OK", "count": len(records)}
