from __future__ import annotations

import json
from pathlib import Path
import unittest

from tools.memory.conflict_detection import detect_memory_conflicts

ROOT = Path(__file__).resolve().parents[2]


class MemoryConflictTests(unittest.TestCase):
    def test_conflict_pair_detected(self) -> None:
        records = json.loads((ROOT / "tests/fixtures/memory/memory_conflict_pair.json").read_text(encoding="utf-8"))
        conflicts = detect_memory_conflicts(records)
        self.assertEqual(conflicts[0]["decision"], "FLAG_FOR_CURATOR")


if __name__ == "__main__":
    unittest.main()
