from __future__ import annotations

import json
from pathlib import Path
import unittest

from tools.knowledge.temporal_facts import TemporalFactValidationError, detect_temporal_conflicts, validate_temporal_fact

ROOT = Path(__file__).resolve().parents[2]


class TemporalFactTests(unittest.TestCase):
    def test_temporal_fact_validates_source_date_confidence(self) -> None:
        fact = json.loads((ROOT / "tests/fixtures/knowledge/synthetic_temporal_fact.json").read_text(encoding="utf-8"))
        self.assertEqual(validate_temporal_fact(fact)["status"], "PASS")

    def test_invalid_date_denied(self) -> None:
        fact = json.loads((ROOT / "tests/fixtures/knowledge/synthetic_temporal_fact.json").read_text(encoding="utf-8"))
        fact["valid_from"] = "not-a-date"
        with self.assertRaises(TemporalFactValidationError):
            validate_temporal_fact(fact)

    def test_conflicting_temporal_fact_detected(self) -> None:
        facts = json.loads((ROOT / "tests/fixtures/knowledge/conflicting_temporal_fact.json").read_text(encoding="utf-8"))
        conflicts = detect_temporal_conflicts(facts)
        self.assertEqual(conflicts[0]["decision"], "FLAG_FOR_CURATOR")


if __name__ == "__main__":
    unittest.main()
