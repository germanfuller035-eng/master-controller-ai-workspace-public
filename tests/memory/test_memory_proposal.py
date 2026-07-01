from __future__ import annotations

import json
from pathlib import Path
import unittest

from tools.memory.memory_proposal import MemoryProposalError, direct_memory_write, validate_memory_proposal

ROOT = Path(__file__).resolve().parents[2]


class MemoryProposalTests(unittest.TestCase):
    def test_valid_memory_proposal_accepted(self) -> None:
        proposal = json.loads((ROOT / "tests/fixtures/memory/memory_proposal_valid.json").read_text(encoding="utf-8"))
        self.assertEqual(validate_memory_proposal(proposal)["status"], "PASS")

    def test_missing_source_denied(self) -> None:
        proposal = json.loads((ROOT / "tests/fixtures/memory/memory_proposal_missing_source.json").read_text(encoding="utf-8"))
        with self.assertRaises(MemoryProposalError):
            validate_memory_proposal(proposal)

    def test_low_confidence_requires_review(self) -> None:
        proposal = json.loads((ROOT / "tests/fixtures/memory/memory_proposal_valid.json").read_text(encoding="utf-8"))
        proposal["confidence"] = 0.6
        with self.assertRaisesRegex(MemoryProposalError, "low_confidence_requires_review"):
            validate_memory_proposal(proposal)

    def test_direct_memory_write_denied(self) -> None:
        decision = direct_memory_write({"memory_id": "memory_direct_001"})
        self.assertEqual(decision["status"], "DENIED")
        self.assertFalse(decision["memory_write"])


if __name__ == "__main__":
    unittest.main()
