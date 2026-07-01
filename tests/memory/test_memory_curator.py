from __future__ import annotations

import json
from pathlib import Path
import unittest

from tools.memory.memory_curator import curate_memory_proposal

ROOT = Path(__file__).resolve().parents[2]


class MemoryCuratorTests(unittest.TestCase):
    def test_curator_approval_creates_proposed_record_only(self) -> None:
        proposal = json.loads((ROOT / "tests/fixtures/memory/memory_proposal_valid.json").read_text(encoding="utf-8"))
        decision = curate_memory_proposal(proposal)
        self.assertEqual(decision["decision"], "APPROVE_PROPOSED_RECORD")
        self.assertEqual(decision["proposed_record"]["record_status"], "PROPOSED_NOT_WRITTEN")
        self.assertFalse(decision["proposed_record"]["memory_write"])

    def test_curator_rejection_blocks_write(self) -> None:
        proposal = json.loads((ROOT / "tests/fixtures/memory/memory_proposal_valid.json").read_text(encoding="utf-8"))
        decision = curate_memory_proposal(proposal, approve=False)
        self.assertEqual(decision["decision"], "REJECT")
        self.assertFalse(decision["memory_write"])


if __name__ == "__main__":
    unittest.main()
