from __future__ import annotations

import json
from pathlib import Path
import unittest

from tools.memory.sensitive_rules import review_sensitive_memory

ROOT = Path(__file__).resolve().parents[2]


class SensitiveRulesTests(unittest.TestCase):
    def test_secret_like_memory_denied(self) -> None:
        proposal = json.loads((ROOT / "tests/fixtures/memory/memory_proposal_secret_like.json").read_text(encoding="utf-8"))
        decision = review_sensitive_memory(proposal)
        self.assertEqual(decision["status"], "DENIED")

    def test_sensitive_memory_requires_owner_approval_fixture(self) -> None:
        proposal = json.loads((ROOT / "tests/fixtures/memory/memory_proposal_valid.json").read_text(encoding="utf-8"))
        proposal["classification"] = "SYNTHETIC_SENSITIVE"
        decision = review_sensitive_memory(proposal, owner_approval=False)
        self.assertEqual(decision["status"], "NEEDS_OWNER_APPROVAL")
        approved = review_sensitive_memory(proposal, owner_approval=True)
        self.assertEqual(approved["status"], "PASS")


if __name__ == "__main__":
    unittest.main()
