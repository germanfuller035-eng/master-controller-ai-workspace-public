from __future__ import annotations

import unittest

from tools.knowledge.validate_knowledge import validate


class ValidateKnowledgeTests(unittest.TestCase):
    def test_knowledge_validator_passes_contract_only_state(self) -> None:
        status, errors = validate()
        self.assertEqual(errors, [])
        self.assertEqual(status, "PASS")


if __name__ == "__main__":
    unittest.main()
