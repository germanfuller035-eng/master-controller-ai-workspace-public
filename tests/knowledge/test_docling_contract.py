from __future__ import annotations

import json
from pathlib import Path
import unittest

from tools.knowledge.docling_contract import validate_docling_parse_result

ROOT = Path(__file__).resolve().parents[2]


class DoclingContractTests(unittest.TestCase):
    def test_docling_contract_accepts_synthetic_parse_without_real_docling(self) -> None:
        parse_result = json.loads((ROOT / "tests/fixtures/knowledge/synthetic_docling_parse_result.json").read_text(encoding="utf-8"))
        self.assertFalse(parse_result["docling_imported"])
        self.assertEqual(validate_docling_parse_result(parse_result)["status"], "PASS")


if __name__ == "__main__":
    unittest.main()
