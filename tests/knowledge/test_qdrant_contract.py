from __future__ import annotations

from pathlib import Path
import unittest

from tools.knowledge.artifact_metadata import load_document_artifact
from tools.knowledge.provenance import make_provenance_record
from tools.knowledge.qdrant_contract import make_qdrant_record, validate_qdrant_record

ROOT = Path(__file__).resolve().parents[2]


class QdrantContractTests(unittest.TestCase):
    def test_qdrant_contract_creates_deterministic_record_without_real_qdrant(self) -> None:
        artifact = load_document_artifact(ROOT / "tests/fixtures/knowledge/synthetic_public_doc.md")
        provenance = make_provenance_record(artifact)
        first = make_qdrant_record(artifact, provenance)
        second = make_qdrant_record(artifact, provenance)
        self.assertEqual(first["record_id"], second["record_id"])
        self.assertEqual(first["adapter_status"], "CONTRACT_ONLY_NOT_DEPLOYED")
        self.assertFalse(first["network_connection_attempted"])
        self.assertEqual(validate_qdrant_record(first)["status"], "PASS")


if __name__ == "__main__":
    unittest.main()
